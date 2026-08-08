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
import shutil
import time
import uuid
from datetime import datetime, timezone

from flask import Flask, jsonify, request

app = Flask(__name__)

# api/app.py から見て www/ は2階層上（www/<secret>/api/app.py）。
# OSUSUME_WWW_DIR を設定すればローカル検証時に任意のフォルダへ差し替えられる。
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WWW_DIR = os.environ.get('OSUSUME_WWW_DIR') or os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
DATA_FILE = os.path.join(WWW_DIR, 'data', 'spots.json')
PHOTOS_DIR = os.path.join(WWW_DIR, 'photos')

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'}


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


def safe_ext(filename):
    ext = os.path.splitext(filename or '')[1].lower()
    return ext if ext in ALLOWED_EXTENSIONS else '.jpg'


def save_photos(spot_id, files):
    paths = []
    valid_files = [f for f in files if f and f.filename]
    if not valid_files:
        return paths
    dir_path = os.path.join(PHOTOS_DIR, spot_id)
    os.makedirs(dir_path, exist_ok=True)
    for i, file in enumerate(valid_files, start=1):
        filename = f'{i}{safe_ext(file.filename)}'
        file.save(os.path.join(dir_path, filename))
        paths.append(f'/photos/{spot_id}/{filename}')
    return paths


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


@app.after_request
def add_headers(resp):
    # 認証は無し（推測されにくいURLだけで保護する運用のため）。CORSはローカル検証用に緩め。
    resp.headers['Access-Control-Allow-Origin'] = '*'
    resp.headers['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS'
    resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return resp


@app.route('/spots', methods=['OPTIONS'])
@app.route('/spots/<spot_id>', methods=['OPTIONS'])
def options_handler(spot_id=None):
    return ('', 204)


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
    photos = save_photos(spot_id, request.files.getlist('photos'))
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
    if region:
        spot['region'] = region

    spots = read_spots()
    spots.append(spot)
    write_spots(spots)
    return jsonify(spot), 201


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
