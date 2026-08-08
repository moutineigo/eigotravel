#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
旧サイト（eigo55-website）のさくらサーバー上のSQLite DB（production-app.db）から
実データだけを抽出し、新サイトの public/data/spots.json 形式に変換する。

一度きりの移行用スクリプト。実行方法:
    python3 migration/migrate.py

前提:
    - migration/production-app.db が置かれていること（本番サーバーから scp 済み）
"""
import html as htmllib
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / 'production-app.db'
OUTPUT_PATH = BASE_DIR.parent / 'public' / 'data' / 'spots.json'

# 「位置番号(locnum)」上位桁 → 都道府県 or 国。
# ユーザーからのヒアリングで判明した対応表（実データに存在した値のみ）。
LOCNUM_TO_REGION = {
    10001: 'hokkaido',
    65000: 'france',
    300001: 'wakayama',
    380001: 'ehime',
    450001: 'miyazaki',
    460001: 'kagoshima',
}

# 旧サイトの type カラム → 新サイトの category
TYPE_TO_CATEGORY = {
    0: 'other',
    1: 'shrine',
    2: 'temple',
    3: 'onsen',
    4: 'gourmet',
    5: 'sightseeing',
    6: 'lodging',
    7: 'church',
}


def html_to_text(raw: str) -> str:
    """旧サイトのdescription（簡易HTML）をプレーンテキストに変換する。
    URLはそのまま残し、公開サイト側で自動リンク化する。
    """
    if not raw:
        return ''
    s = raw

    s = re.sub(r'<br\s*/?>', '\n', s, flags=re.IGNORECASE)
    s = re.sub(r'<li[^>]*>', '- ', s, flags=re.IGNORECASE)
    s = re.sub(r'</li>', '\n', s, flags=re.IGNORECASE)
    s = re.sub(r'</?(ul|ol)[^>]*>', '\n', s, flags=re.IGNORECASE)
    s = re.sub(r'<(p|h[1-6])[^>]*>', '', s, flags=re.IGNORECASE)
    s = re.sub(r'</(p|h[1-6])>', '\n\n', s, flags=re.IGNORECASE)
    # <a href="URL" ...>LABEL</a> -> URL （ラベルは「画像はこちら」等の定型文が多いため捨てる）
    s = re.sub(r'<a\s+[^>]*href="([^"]*)"[^>]*>.*?</a>', r'\1', s, flags=re.IGNORECASE | re.DOTALL)
    # 残った未知タグは除去
    s = re.sub(r'<[^>]+>', '', s)

    s = htmllib.unescape(s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


def to_iso8601(raw: str) -> str:
    """'2022-11-20 15:46:33.558242' 形式 → ISO8601(ミリ秒, Z付き)"""
    dt = datetime.fromisoformat(raw)
    dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def main():
    con = sqlite3.connect(DB_PATH)
    con.text_factory = lambda b: b.decode('utf-8', errors='replace')
    cur = con.cursor()

    placeholders = ','.join('?' for _ in LOCNUM_TO_REGION)
    cur.execute(
        f'''
        SELECT id, name, type, latitude, longitude, description, created_at, updated_at, locnum
        FROM spot
        WHERE locnum IN ({placeholders}) AND status = 0
        ORDER BY id
        ''',
        list(LOCNUM_TO_REGION.keys()),
    )
    rows = cur.fetchall()

    spots = []
    skipped_unknown_type = []
    for (id_, name, type_, lat, lng, description, created_at, updated_at, locnum) in rows:
        category = TYPE_TO_CATEGORY.get(type_)
        if category is None:
            skipped_unknown_type.append((id_, name, type_))
            category = 'other'

        spots.append({
            'id': id_,
            'name': name,
            'category': category,
            'region': LOCNUM_TO_REGION[locnum],
            'lat': lat,
            'lng': lng,
            'description': html_to_text(description),
            'address': '',
            'url': '',
            'photos': [],
            'tags': [],
            'createdAt': to_iso8601(created_at),
            'updatedAt': to_iso8601(updated_at),
        })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(spots, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'✅ {len(spots)}件を {OUTPUT_PATH} に書き出しました')

    by_region = {}
    by_category = {}
    for s in spots:
        by_region[s['region']] = by_region.get(s['region'], 0) + 1
        by_category[s['category']] = by_category.get(s['category'], 0) + 1
    print('地域別:', by_region)
    print('カテゴリ別:', by_category)
    if skipped_unknown_type:
        print('⚠️ 未知のtype値（otherとして扱った）:', skipped_unknown_type)


if __name__ == '__main__':
    main()
