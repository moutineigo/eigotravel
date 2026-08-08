import L from 'leaflet';
import type { Category } from './types';
import { CATEGORIES } from './categories';

/** OSMタイルを使ったベース地図を作る。管理画面(admin)とも共有する */
export function createBaseMap(
  el: HTMLElement | string,
  opts: { center?: L.LatLngExpression; zoom?: number } = {}
): L.Map {
  const map = L.map(el, {
    center: opts.center ?? [36.5, 138],
    zoom: opts.zoom ?? 6,
    // デフォルトの左上ズームボタンはハンバーガーボタンと重なるため無効化し、右下に置き直す
    zoomControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  return map;
}

/** カテゴリごとに絵文字アイコン＋色枠の丸バッジピンを作る。色だけでなく形(絵文字)でも見分けられる */
export function createSpotIcon(category: Category): L.DivIcon {
  const meta = CATEGORIES[category] ?? CATEGORIES.other;
  return L.divIcon({
    className: '',
    html: `<div class="spot-marker" style="border-color:${meta.color}"><span>${meta.icon}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15]
  });
}
