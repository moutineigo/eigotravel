# -*- coding: utf-8 -*-
"""
本番（さくらインターネット）向けの管理API。CGI(index.cgi)経由でこのFlaskアプリが起動する。
ローカルの admin-server/server.mjs (Node/Express) と同じAPI仕様（GET/POST /spots, DELETE /spots/<id>）。

このファイルの置き場所: www/<秘密のパス>/api/app.py
データの置き場所:      www/data/spots.json  （公開サイトが読む本体そのもの。直接書き換える）
写真の置き場所:        www/photos/<id>/1.jpg ...
"""
import json
import os
import re
import shutil
import time
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, request

try:
    from PIL import Image
    HAS_PILLOW = True
except ImportError:
    HAS_PILLOW = False

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 300 * 1024 * 1024  # 動画込みで大きくなり得るため上限を緩めに設定（300MB）

# api/app.py から見て www/ は2階層上（www/<secret>/api/app.py）。
# OSUSUME_WWW_DIR を設定すればローカル検証時に任意のフォルダへ差し替えられる。
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WWW_DIR = os.environ.get('OSUSUME_WWW_DIR') or os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
DATA_FILE = os.path.join(WWW_DIR, 'data', 'spots.json')
PHOTOS_DIR = os.path.join(WWW_DIR, 'photos')

ALLOWED_PHOTO_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'}
ALLOWED_VIDEO_EXTENSIONS = {'.mp4', '.mov', '.m4v', '.webm'}


@app.errorhandler(413)
def handle_too_large(_e):
    return jsonify({'error': 'アップロードのサイズが大きすぎます（動画込みで300MBまで）'}), 413


def read_spots():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_spots(spots):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    tmp_path = DATA_FILE + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(spots, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp_path, DATA_FILE)


def make_id():
    return f'{int(time.time() * 1000):x}-{uuid.uuid4().hex[:8]}'


def parse_tags(raw):
    if not raw:
        return []
    return [t.strip() for t in raw.split(',') if t.strip()]


def safe_ext(filename, allowed=ALLOWED_PHOTO_EXTENSIONS, fallback='.jpg'):
    ext = os.path.splitext(filename or '')[1].lower()
    return ext if ext in allowed else fallback


def save_files(spot_id, files, name_prefix='', suffix='', start_index=1,
                allowed=ALLOWED_PHOTO_EXTENSIONS, fallback_ext='.jpg'):
    """
    アップロードされたファイルを保存する。戻り値は (公開URLのリスト, 保存先絶対パスのリスト)。
    start_index: ファイル名の連番の開始値。編集で追加するときは、
    既存ファイルの続きの番号から採番しないと同名ファイルを上書きしてしまう（実際に事故った）。
    name_prefix: 写真('')と動画('v')でファイル名の採番を別系統にするための接頭辞。
    """
    urls, abs_paths = [], []
    valid_files = [f for f in files if f and f.filename]
    if not valid_files:
        return urls, abs_paths
    dir_path = os.path.join(PHOTOS_DIR, spot_id)
    os.makedirs(dir_path, exist_ok=True)
    for offset, file in enumerate(valid_files):
        i = start_index + offset
        filename = f'{name_prefix}{i}{suffix}{safe_ext(file.filename, allowed, fallback_ext)}'
        abs_path = os.path.join(dir_path, filename)
        file.save(abs_path)
        urls.append(f'/photos/{spot_id}/{filename}')
        abs_paths.append(abs_path)
    return urls, abs_paths


def save_photos(spot_id, files, suffix='', start_index=1):
    return save_files(spot_id, files, suffix=suffix, start_index=start_index)


def save_videos(spot_id, files, start_index=1):
    return save_files(
        spot_id, files, name_prefix='v', start_index=start_index,
        allowed=ALLOWED_VIDEO_EXTENSIONS, fallback_ext='.mp4'
    )


def _delete_photo_file(url):
    """`/photos/<id>/<file>` 形式のURLから実ファイルを削除する（存在しなくてもエラーにしない）"""
    if not url or not url.startswith('/photos/'):
        return
    rel = url[len('/photos/'):]
    abs_path = os.path.normpath(os.path.join(PHOTOS_DIR, rel))
    # PHOTOS_DIR配下から外れるパス（../等）は無視する
    if not abs_path.startswith(os.path.normpath(PHOTOS_DIR) + os.sep):
        return
    try:
        os.remove(abs_path)
    except OSError:
        pass


THUMB_MAX_SIZE = 320


def generate_thumbnail(src_path, dst_path):
    """Pillowでサムネイルを生成する。Pillow未導入や失敗時はFalseを返すだけで例外は投げない"""
    if not HAS_PILLOW:
        return False
    try:
        with Image.open(src_path) as img:
            img = img.convert('RGB')
            img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE))
            img.save(dst_path, 'JPEG', quality=70)
        return True
    except Exception:
        return False


def save_photos_with_thumbs(spot_id, photo_files, thumb_files, start_index=1):
    """
    フルサイズ写真と、（あれば）ブラウザ生成済みサムネイルを保存する。
    サムネイルが提供されていない写真は、Pillowが使えればサーバー側で生成してフォールバックする。
    start_index: 新規作成時は1。編集で追加するときは呼び出し側が
    「既存の写真の枚数+1」を渡し、既存ファイルを上書きしないようにする。
    """
    photo_urls, photo_abs_paths = save_photos(spot_id, photo_files, start_index=start_index)
    thumb_urls, _ = save_photos(spot_id, thumb_files, suffix='.thumb', start_index=start_index)

    # ブラウザがサムネイルを送ってこなかった分(=写真の枚数の方が多い分)を、Pillowで補う
    for offset in range(len(thumb_urls), len(photo_urls)):
        i = start_index + offset
        dst_path = os.path.join(PHOTOS_DIR, spot_id, f'{i}.thumb.jpg')
        if generate_thumbnail(photo_abs_paths[offset], dst_path):
            thumb_urls.append(f'/photos/{spot_id}/{i}.thumb.jpg')

    return photo_urls, thumb_urls if thumb_urls else None


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


@app.after_request
def add_headers(resp):
    # 認証は無し（推測されにくいURLだけで保護する運用のため）。CORSはローカル検証用に緩め。
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


@app.route('/spots', methods=['OPTIONS'])
@app.route('/spots/<spot_id>', methods=['OPTIONS'])
@app.route('/resolve', methods=['OPTIONS'])
def options_handler(spot_id=None):
    return ('', 204)


def resolve_from_url(url):
    """GoogleマップのURL（短縮リンク含む）から緯度経度を取り出す。
    リダイレクト先のURLに含まれる !3d..!4d.. (正確なピン位置) または @lat,lng (表示中心) を探す。

    iOSアプリの「共有」から作られるリンクは、リダイレクト先が
    `?q=住所+施設名&ftid=...` という座標を含まない形式になることがある
    （JS実行しないと座標が取れないページ）。その場合は q= の住所テキストを
    OpenStreetMap検索にかけるフォールバックを試す。
    """
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        final_url = resp.geturl()

    m = re.search(r'!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)', final_url)
    if not m:
        m = re.search(r'@(-?\d+\.\d+),(-?\d+\.\d+)', final_url)

    if m:
        lat, lng = float(m.group(1)), float(m.group(2))
        name = None
        nm = re.search(r'/place/([^/@]+)/', final_url)
        if nm:
            name = urllib.parse.unquote(nm.group(1)).replace('+', ' ')
        return {'lat': lat, 'lng': lng, 'name': name}

    # フォールバック: q= に入っている住所/施設名でテキスト検索してみる
    q_param = urllib.parse.parse_qs(urllib.parse.urlparse(final_url).query).get('q', [None])[0]
    if q_param:
        try:
            return resolve_from_search(q_param)
        except Exception:
            pass  # このあと共通のエラーメッセージを投げる

    raise ValueError(
        'このリンクからは位置を自動取得できませんでした'
        '（GoogleマップのiOS共有リンクなど、座標を含まない形式の可能性があります）。'
        '地図を直接タップして位置を指定してください。'
    )


def resolve_from_search(query):
    """地名・施設名のテキスト検索（OpenStreetMapのNominatimを利用、APIキー不要）"""
    params = urllib.parse.urlencode({'q': query, 'format': 'json', 'limit': 1, 'accept-language': 'ja'})
    url = f'https://nominatim.openstreetmap.org/search?{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'osusume-map-admin/1.0'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        results = json.loads(resp.read().decode('utf-8'))

    if not results:
        raise ValueError('見つかりませんでした')

    r = results[0]
    return {'lat': float(r['lat']), 'lng': float(r['lon']), 'name': r.get('display_name')}


@app.route('/resolve', methods=['GET'])
def resolve_location():
    raw = (request.args.get('q') or '').strip()
    if not raw:
        return jsonify({'error': 'q は必須です'}), 400
    try:
        result = resolve_from_url(raw) if raw.startswith(('http://', 'https://')) else resolve_from_search(raw)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/spots', methods=['GET'])
def list_spots():
    return jsonify(read_spots())


@app.route('/spots', methods=['POST'])
def create_spot():
    name = request.form.get('name')
    category = request.form.get('category')
    lat = request.form.get('lat')
    lng = request.form.get('lng')
    if not name or not category or lat is None or lng is None:
        return jsonify({'error': 'name, category, lat, lng は必須です'}), 400

    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except ValueError:
        return jsonify({'error': 'lat, lng は数値で指定してください'}), 400

    spot_id = make_id()
    photos, photo_thumbs = save_photos_with_thumbs(
        spot_id, request.files.getlist('photos'), request.files.getlist('thumbnails')
    )
    videos, _ = save_videos(spot_id, request.files.getlist('videos'))
    now = now_iso()
    region = (request.form.get('region') or '').strip()

    spot = {
        'id': spot_id,
        'name': name,
        'category': category,
        'lat': lat_f,
        'lng': lng_f,
        'description': request.form.get('description', ''),
        'address': request.form.get('address', ''),
        'url': request.form.get('url', ''),
        'photos': photos,
        'tags': parse_tags(request.form.get('tags')),
        'createdAt': now,
        'updatedAt': now,
    }
    if photo_thumbs:
        spot['photoThumbs'] = photo_thumbs
    if videos:
        spot['videos'] = videos
    if region:
        spot['region'] = region

    spots = read_spots()
    spots.append(spot)
    write_spots(spots)
    return jsonify(spot), 201


@app.route('/spots/<spot_id>', methods=['PUT'])
def update_spot(spot_id):
    spots = read_spots()
    idx = next((i for i, s in enumerate(spots) if s.get('id') == spot_id), None)
    if idx is None:
        return jsonify({'error': 'not found'}), 404

    existing = spots[idx]

    lat_raw = request.form.get('lat')
    lng_raw = request.form.get('lng')
    lat_f = existing.get('lat')
    lng_f = existing.get('lng')
    try:
        if lat_raw is not None:
            lat_f = float(lat_raw)
        if lng_raw is not None:
            lng_f = float(lng_raw)
    except ValueError:
        return jsonify({'error': 'lat, lng は数値で指定してください'}), 400

    # 既存の写真の続き番号から採番する（1から採番し直すと既存ファイルを上書きしてしまう）。
    # 削除予約があっても、採番は「削除前の元の枚数」基準のままにする
    # （削除した番号を新規ファイルが再利用すると、キャッシュ等と衝突するリスクがあるため）。
    existing_photo_count = len(existing.get('photos') or [])
    new_photos, new_thumbs = save_photos_with_thumbs(
        spot_id,
        request.files.getlist('photos'),
        request.files.getlist('thumbnails'),
        start_index=existing_photo_count + 1
    )

    existing_video_count = len(existing.get('videos') or [])
    new_videos, _ = save_videos(
        spot_id, request.files.getlist('videos'), start_index=existing_video_count + 1
    )

    current_photos = list(existing.get('photos') or [])
    current_thumbs = list(existing.get('photoThumbs') or [])
    remove_raw = request.form.get('removePhotos')
    if remove_raw:
        try:
            remove_urls = set(json.loads(remove_raw))
        except (ValueError, TypeError):
            remove_urls = set()
        if remove_urls:
            keep_photos = []
            keep_thumbs = []
            for i, url in enumerate(current_photos):
                thumb_url = current_thumbs[i] if i < len(current_thumbs) else None
                if url in remove_urls:
                    _delete_photo_file(url)
                    if thumb_url:
                        _delete_photo_file(thumb_url)
                else:
                    keep_photos.append(url)
                    if current_thumbs:
                        keep_thumbs.append(thumb_url)
            current_photos = keep_photos
            current_thumbs = keep_thumbs

    current_videos = list(existing.get('videos') or [])
    remove_videos_raw = request.form.get('removeVideos')
    if remove_videos_raw:
        try:
            remove_video_urls = set(json.loads(remove_videos_raw))
        except (ValueError, TypeError):
            remove_video_urls = set()
        if remove_video_urls:
            keep_videos = []
            for url in current_videos:
                if url in remove_video_urls:
                    _delete_photo_file(url)
                else:
                    keep_videos.append(url)
            current_videos = keep_videos

    updated = dict(existing)
    name = request.form.get('name')
    if name is not None:
        updated['name'] = name
    category = request.form.get('category')
    if category is not None:
        updated['category'] = category
    updated['lat'] = lat_f
    updated['lng'] = lng_f
    if request.form.get('description') is not None:
        updated['description'] = request.form.get('description')
    if request.form.get('address') is not None:
        updated['address'] = request.form.get('address')
    if request.form.get('url') is not None:
        updated['url'] = request.form.get('url')
    if request.form.get('tags') is not None:
        updated['tags'] = parse_tags(request.form.get('tags'))

    region_raw = request.form.get('region')
    if region_raw is not None:
        region = region_raw.strip()
        if region:
            updated['region'] = region
        else:
            updated.pop('region', None)

    final_photos = current_photos + (new_photos or [])
    final_thumbs = current_thumbs + (new_thumbs or [])
    final_videos = current_videos + (new_videos or [])
    updated['photos'] = final_photos
    if final_thumbs:
        updated['photoThumbs'] = final_thumbs
    else:
        updated.pop('photoThumbs', None)
    if final_videos:
        updated['videos'] = final_videos
    else:
        updated.pop('videos', None)

    updated['updatedAt'] = now_iso()

    spots[idx] = updated
    write_spots(spots)
    return jsonify(updated)


@app.route('/spots/<spot_id>', methods=['DELETE'])
def delete_spot(spot_id):
    spots = read_spots()
    idx = next((i for i, s in enumerate(spots) if s.get('id') == spot_id), None)
    if idx is None:
        return jsonify({'error': 'not found'}), 404

    removed = spots.pop(idx)
    write_spots(spots)
    shutil.rmtree(os.path.join(PHOTOS_DIR, removed['id']), ignore_errors=True)
    return jsonify({'ok': True})


if __name__ == '__main__':
    # ローカル検証専用（本番はCGI経由で動く）
    app.run(port=5176, debug=True)
