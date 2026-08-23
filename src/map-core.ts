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

/**
 * 管理画面で「新しく登録する場所」の位置決めに使うピン。
 * Leafletのデフォルトアイコンはバンドラー環境だと画像パスが解決できず
 * 壊れて表示されることがあるため、必ずこちらの自前アイコンを使う。
 */
export function createNewSpotIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="spot-marker spot-marker--new" style="border-color:#e63946"><span>📍</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
}

/** 「現在地」を示す青い丸ドット（Googleマップ等でおなじみの見た目） */
export function createCurrentLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="current-location-dot"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

/**
 * 「現在地へ移動」ボタンをLeafletコントロールとして地図に追加する。
 * GPSで現在地を取得し、地図をその位置へズームする。
 * onLocate を渡すと、取得できた緯度経度をコールバックで受け取れる
 * （呼び出し側で「現在地マーカー」の表示などに使う）。
 */
export function addGeolocateControl(
  map: L.Map,
  opts: { position?: L.ControlPosition; zoom?: number; onLocate?: (latlng: L.LatLng) => void } = {}
) {
  const control = new L.Control({ position: opts.position ?? 'bottomright' });
  control.onAdd = () => {
    const btn = L.DomUtil.create('button', 'geolocate-btn');
    btn.type = 'button';
    btn.title = '現在地に移動';
    btn.setAttribute('aria-label', '現在地に移動');
    btn.textContent = '🎯';
    L.DomEvent.disableClickPropagation(btn);

    btn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('この端末・ブラウザでは現在地を取得できません');
        return;
      }
      btn.classList.add('geolocate-btn--loading');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          btn.classList.remove('geolocate-btn--loading');
          const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
          map.flyTo(latlng, opts.zoom ?? 16);
          opts.onLocate?.(latlng);
        },
        (err) => {
          btn.classList.remove('geolocate-btn--loading');
          console.error(err);
          alert('現在地を取得できませんでした。位置情報の利用を許可しているか確認してください。');
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });

    return btn;
  };
  control.addTo(map);
}
