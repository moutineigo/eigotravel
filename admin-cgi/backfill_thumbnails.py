# -*- coding: utf-8 -*-
"""
既存スポットの写真（サムネイル生成機能を追加する前にアップロードされたもの）に、
後からサムネイルを一括生成して spots.json に追記する、一度きり（再実行しても安全）のスクリプト。

実行方法（サーバー上、venvのPythonで）:
    /home/eigo55/venv/bin/python /home/eigo55/www/<秘密のパス>/api/backfill_thumbnails.py

前提: Pillowがvenvにインストール済みであること（pip install Pillow）
"""
import json
import os
import sys

from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WWW_DIR = os.environ.get('OSUSUME_WWW_DIR') or os.path.abspath(os.path.join(BASE_DIR, '..', '..'))
DATA_FILE = os.path.join(WWW_DIR, 'data', 'spots.json')
PHOTOS_DIR = os.path.join(WWW_DIR, 'photos')

THUMB_MAX_SIZE = 320


def generate_thumbnail(src_path, dst_path):
    with Image.open(src_path) as img:
        img = img.convert('RGB')
        img.thumbnail((THUMB_MAX_SIZE, THUMB_MAX_SIZE))
        img.save(dst_path, 'JPEG', quality=70)


def main():
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        spots = json.load(f)

    updated_count = 0
    photo_count = 0

    for spot in spots:
        photos = spot.get('photos') or []
        if not photos:
            continue

        existing_thumbs = spot.get('photoThumbs') or []
        if len(existing_thumbs) >= len(photos):
            continue  # もうサムネイル揃ってる

        thumbs = list(existing_thumbs)
        for i, photo_url in enumerate(photos):
            if i < len(thumbs):
                continue  # このインデックスはすでにサムネイルあり

            # photo_url は "/photos/<id>/1.jpg" の形。拡張子の手前に .thumb を挟んでファイル名を作る
            rel_path = photo_url.lstrip('/')  # "photos/<id>/1.jpg"
            src_path = os.path.join(WWW_DIR, *rel_path.split('/'))
            if not os.path.exists(src_path):
                print(f'  ⚠️ ファイルが見つかりません: {src_path}')
                continue

            base, ext = os.path.splitext(rel_path)
            thumb_rel = f'{base}.thumb.jpg'
            dst_path = os.path.join(WWW_DIR, *thumb_rel.split('/'))

            try:
                generate_thumbnail(src_path, dst_path)
                thumbs.append('/' + thumb_rel)
                photo_count += 1
            except Exception as e:
                print(f'  ⚠️ 生成失敗 {src_path}: {e}')

        if thumbs and thumbs != existing_thumbs:
            spot['photoThumbs'] = thumbs
            updated_count += 1
            print(f'✅ {spot.get("name")} ({len(thumbs)}枚)')

    if updated_count == 0:
        print('対象なし（すべてのスポットに既にサムネイルがあります）')
        return

    tmp_path = DATA_FILE + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(spots, f, ensure_ascii=False, indent=2)
        f.write('\n')
    os.replace(tmp_path, DATA_FILE)

    print(f'\n完了: {updated_count}件のスポット、{photo_count}枚の写真にサムネイルを生成しました')


if __name__ == '__main__':
    main()
