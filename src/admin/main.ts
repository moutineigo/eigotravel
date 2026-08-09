import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { createBaseMap, createSpotIcon, createNewSpotIcon } from '../map-core';
import { CATEGORIES, CATEGORY_KEYS } from '../categories';
import { REGIONS, REGION_KEYS } from '../regions';
import type { Spot, Category, Region } from '../types';

// 開発時(vite dev)はローカルのAPIサーバー(admin-server/)、
// 本番ビルド時は同じディレクトリ配下の api/ (さくらのCGI)を相対パスで叩く
const API_BASE = import.meta.env.DEV ? 'http://localhost:5175' : '.';

const map = createBaseMap('admin-map');
let pinMarker: L.Marker | null = null;
let existingLayer = L.layerGroup().addTo(map);

const el = {
  lat: document.getElementById('f-lat') as HTMLInputElement,
  lng: document.getElementById('f-lng') as HTMLInputElement,
  latlngDisplay: document.getElementById('f-latlng') as HTMLElement,
  name: document.getElementById('f-name') as HTMLInputElement,
  category: document.getElementById('f-category') as HTMLSelectElement,
  region: document.getElementById('f-region') as HTMLSelectElement,
  description: document.getElementById('f-description') as HTMLTextAreaElement,
  address: document.getElementById('f-address') as HTMLInputElement,
  url: document.getElementById('f-url') as HTMLInputElement,
  tags: document.getElementById('f-tags') as HTMLInputElement,
  photos: document.getElementById('f-photos') as HTMLInputElement,
  photoPreview: document.getElementById('photo-preview') as HTMLElement,
  form: document.getElementById('spot-form') as HTMLFormElement,
  message: document.getElementById('form-message') as HTMLElement,
  list: document.getElementById('spot-list') as HTMLElement,
  count: document.getElementById('spot-count') as HTMLElement,
  locate: document.getElementById('f-locate') as HTMLInputElement,
  locateBtn: document.getElementById('f-locate-btn') as HTMLButtonElement
};

let previewUrls: string[] = [];
/** 変換後（JPEG化後）の実際にアップロードするファイル一覧 */
let preparedFiles: File[] = [];

function clearPhotoPreview() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  preparedFiles = [];
  el.photoPreview.innerHTML = '';
}

/**
 * iPhoneの写真はHEIC形式で選ばれることが多く、そのままアップロードすると
 * Windows/Chromeなどで画像が表示できない。ここでJPEGに変換してから使う。
 * 変換に失敗した場合は元のファイルのまま返す（最低限アップロード自体は通す）。
 */
async function convertToJpeg(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('画像のJPEG変換に失敗。元ファイルのまま送信します:', file.name, err);
    return file;
  }
}

/** 選択した写真をJPEGに変換しつつ、サムネイル表示する */
async function handlePhotoSelection(files: FileList | null) {
  clearPhotoPreview();
  if (!files || files.length === 0) return;

  const count = document.createElement('div');
  count.className = 'photo-preview__count';
  count.textContent = `${files.length}枚を処理中...`;
  el.photoPreview.appendChild(count);

  const converted = await Promise.all(Array.from(files).map(convertToJpeg));
  preparedFiles = converted;

  el.photoPreview.innerHTML = '';
  for (const file of converted) {
    const url = URL.createObjectURL(file);
    previewUrls.push(url);

    const item = document.createElement('div');
    item.className = 'photo-preview__item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = file.name;
    item.appendChild(img);
    el.photoPreview.appendChild(item);
  }

  const countEl = document.createElement('div');
  countEl.className = 'photo-preview__count';
  countEl.textContent = `${converted.length}枚選択中`;
  el.photoPreview.appendChild(countEl);
}

el.photos.addEventListener('change', () => {
  handlePhotoSelection(el.photos.files).catch((err) => {
    console.error(err);
    setMessage('写真の処理に失敗しました', 'error');
  });
});

function initCategorySelect() {
  for (const key of CATEGORY_KEYS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = CATEGORIES[key].label;
    el.category.appendChild(opt);
  }
}

function initRegionSelect() {
  for (const key of REGION_KEYS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = REGIONS[key].label;
    el.region.appendChild(opt);
  }
}

/** ピンの位置（新規スポットの座標）を更新する。地図クリック・ドラッグ・現在地取得のどこからでも呼ぶ */
function setPin(latlng: L.LatLng) {
  el.lat.value = String(latlng.lat);
  el.lng.value = String(latlng.lng);
  el.latlngDisplay.textContent = `選択中の位置: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}（ドラッグでも移動可）`;

  if (pinMarker) {
    pinMarker.setLatLng(latlng);
  } else {
    pinMarker = L.marker(latlng, { draggable: true, icon: createNewSpotIcon() }).addTo(map);
    pinMarker.on('drag', (ev) => {
      setPin((ev.target as L.Marker).getLatLng());
    });
  }
}

map.on('click', (e: L.LeafletMouseEvent) => setPin(e.latlng));

/** 右下に「現在地に移動」ボタンを追加。GPSで現在地を取得し、地図をズームイン＋ピンを配置する */
function setupGeolocateControl() {
  const control = new L.Control({ position: 'bottomleft' });
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
          map.flyTo(latlng, 18);
          setPin(latlng);
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

setupGeolocateControl();

/**
 * GoogleマップのURL（短縮リンク含む）or 場所名のテキストから位置を調べ、
 * 地図をその場所にズームイン＋ピンを配置する。
 */
async function locateFromInput() {
  const query = el.locate.value.trim();
  if (!query) return;

  el.locateBtn.disabled = true;
  el.locateBtn.textContent = '検索中…';
  try {
    const res = await fetch(`${API_BASE}/api/resolve?q=${encodeURIComponent(query)}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);

    const latlng = L.latLng(body.lat, body.lng);
    map.flyTo(latlng, 18);
    setPin(latlng);
    if (body.name && !el.name.value) {
      el.name.value = body.name;
    }
    setMessage('位置を見つけました。内容を確認して登録してください', 'ok');
  } catch (err) {
    console.error(err);
    setMessage(`場所を特定できませんでした: ${(err as Error).message}`, 'error');
  } finally {
    el.locateBtn.disabled = false;
    el.locateBtn.textContent = '移動';
  }
}

el.locateBtn.addEventListener('click', () => {
  locateFromInput().catch((err) => console.error(err));
});
el.locate.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    locateFromInput().catch((err) => console.error(err));
  }
});

async function loadSpots(): Promise<Spot[]> {
  const res = await fetch(`${API_BASE}/api/spots`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderExisting(spots: Spot[]) {
  existingLayer.clearLayers();
  el.list.innerHTML = '';
  el.count.textContent = String(spots.length);

  for (const spot of spots) {
    const marker = L.marker([spot.lat, spot.lng], { icon: createSpotIcon(spot.category) });
    marker.bindPopup(`<b>${escapeHtml(spot.name)}</b>`);
    existingLayer.addLayer(marker);

    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    const regionLabel = spot.region ? REGIONS[spot.region as Region]?.label : '';
    nameSpan.textContent = `[${CATEGORIES[spot.category as Category]?.label ?? spot.category}${regionLabel ? '/' + regionLabel : ''}] ${spot.name}`;
    const delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', () => deleteSpot(spot.id));
    li.append(nameSpan, delBtn);
    el.list.appendChild(li);
  }
}

async function deleteSpot(id: string) {
  if (!confirm('このスポットを削除しますか？（写真も削除されます）')) return;
  const res = await fetch(`${API_BASE}/api/spots/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    alert('削除に失敗しました');
    return;
  }
  await refresh();
}

async function refresh() {
  try {
    const spots = await loadSpots();
    renderExisting(spots);
  } catch (err) {
    console.error(err);
    const hint = import.meta.env.DEV ? '`npm run admin` を起動してください。' : 'しばらくしてから再度お試しください。';
    setMessage(`管理APIサーバーに接続できません。${hint}`, 'error');
  }
}

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!el.lat.value || !el.lng.value) {
    setMessage('先に地図をクリックして位置を選んでください', 'error');
    return;
  }

  const fd = new FormData();
  fd.set('name', el.name.value);
  fd.set('category', el.category.value);
  fd.set('region', el.region.value);
  fd.set('lat', el.lat.value);
  fd.set('lng', el.lng.value);
  fd.set('description', el.description.value);
  fd.set('address', el.address.value);
  fd.set('url', el.url.value);
  fd.set('tags', el.tags.value);
  for (const file of preparedFiles) {
    fd.append('photos', file);
  }

  setMessage('送信中...', 'ok');
  try {
    const res = await fetch(`${API_BASE}/api/spots`, { method: 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    setMessage('追加しました！', 'ok');
    el.form.reset();
    el.lat.value = '';
    el.lng.value = '';
    el.latlngDisplay.textContent = '📍 地図をタップして位置を選択してください';
    clearPhotoPreview();
    if (pinMarker) {
      map.removeLayer(pinMarker);
      pinMarker = null;
    }
    await refresh();
  } catch (err) {
    console.error(err);
    setMessage(`追加に失敗しました: ${(err as Error).message}`, 'error');
  }
});

function setMessage(text: string, kind: 'ok' | 'error') {
  el.message.textContent = text;
  el.message.className = `form-message ${kind}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

initCategorySelect();
initRegionSelect();
refresh();
