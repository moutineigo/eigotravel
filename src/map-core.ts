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
    zoom: opts.zoom ?? 6
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  return map;
}

/** カテゴリごとに色分けした涙形ピンアイコンを作る */
export function createSpotIcon(category: Category): L.DivIcon {
  const color = CATEGORIES[category]?.color ?? CATEGORIES.other.color;
  return L.divIcon({
    className: '',
    html: `<div class="spot-marker" style="background:${color}"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 19],
    popupAnchor: [0, -18]
  });
}
