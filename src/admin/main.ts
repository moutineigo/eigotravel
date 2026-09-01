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
  existingPhotosSection: document.getElementById('existing-photos-section') as HTMLElement,
  existingPhotos: document.getElementById('existing-photos') as HTMLElement,
  form: document.getElementById('spot-form') as HTMLFormElement,
  submitBtn: document.getElementById('f-submit-btn') as HTMLButtonElement,
  message: document.getElementById('form-message') as HTMLElement,
  list: document.getElementById('spot-list') as HTMLElement,
  count: document.getElementById('spot-count') as HTMLElement,
  pagination: document.getElementById('spot-pagination') as HTMLElement,
  filterRegion: document.getElementById('f-filter-region') as HTMLSelectElement,
  editBanner: document.getElementById('f-edit-banner') as HTMLElement,
  editName: document.getElementById('f-edit-name') as HTMLElement,
  editCancel: document.getElementById('f-edit-cancel') as HTMLButtonElement,
  locate: document.getElementById('f-locate') as HTMLInputElement,
  locateBtn: document.getElementById('f-locate-btn') as HTMLButtonElement
};

const PAGE_SIZE = 20;
/** 直近取得した全スポット（一覧のフィルタ切り替え時に再取得しなくて済むようキャッシュしておく） */
let allSpotsCache: Spot[] = [];
/** 一覧の地域フィルタ（空文字=すべて） */
let regionFilter = '';
/** 一覧の現在のページ（1始まり） */
let currentPage = 1;
/** 編集中のスポットID。nullなら新規追加モード */
let editingId: string | null = null;
/** 編集中に「削除予約」した既存写真のURL（保存時にまとめてサーバーへ送る） */
let removedPhotoUrls = new Set<string>();

let previewUrls: string[] = [];
/** 変換後（JPEG化後）の実際にアップロードするファイル一覧（フルサイズ） */
let preparedFiles: File[] = [];
/** 上と同じ並び順の軽量サムネイル（一覧表示を高速化するため） */
let preparedThumbs: File[] = [];

const THUMB_MAX_SIZE = 320;

function clearPhotoPreview() {
  for (const url of previewUrls) URL.revokeObjectURL(url);
  previewUrls = [];
  preparedFiles = [];
  preparedThumbs = [];
  el.photoPreview.innerHTML = '';
}

function canvasToJpegFile(canvas: HTMLCanvasElement, name: string, quality: number): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(new File([blob], name, { type: 'image/jpeg' })) : reject(new Error('toBlob失敗'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * iPhoneの写真はHEIC形式で選ばれることが多く、そのままアップロードすると
 * Windows/Chromeなどで画像が表示できない。ここでJPEGに変換する。
 * 同時に、一覧表示をすぐ読み込めるよう軽量なサムネイルも生成する。
 * 変換に失敗した場合は元のファイルをフルサイズ・サムネイル両方に使う（最低限アップロード自体は通す）。
 */
async function convertToJpeg(file: File): Promise<{ full: File; thumb: File }> {
  const baseName = file.name.replace(/\.[^.]+$/, '');
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d contextを取得できません');
    ctx.drawImage(bitmap, 0, 0);

    const scale = Math.min(1, THUMB_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = Math.round(bitmap.width * scale);
    thumbCanvas.height = Math.round(bitmap.height * scale);
    const thumbCtx = thumbCanvas.getContext('2d');
    if (!thumbCtx) throw new Error('canvas 2d contextを取得できません');
    thumbCtx.drawImage(bitmap, 0, 0, thumbCanvas.width, thumbCanvas.height);
    bitmap.close();

    const [full, thumb] = await Promise.all([
      canvasToJpegFile(canvas, `${baseName}.jpg`, 0.9),
      canvasToJpegFile(thumbCanvas, `${baseName}.thumb.jpg`, 0.7)
    ]);
    return { full, thumb };
  } catch (err) {
    console.warn('画像のJPEG変換に失敗。元ファイルのまま送信します:', file.name, err);
    return { full: file, thumb: file };
  }
}

/** 選択した写真をJPEGに変換（フルサイズ＋サムネイル）しつつ、サムネイルをプレビュー表示する */
async function handlePhotoSelection(files: FileList | null) {
  clearPhotoPreview();
  if (!files || files.length === 0) return;

  const count = document.createElement('div');
  count.className = 'photo-preview__count';
  count.textContent = `${files.length}枚を処理中...`;
  el.photoPreview.appendChild(count);

  const converted = await Promise.all(Array.from(files).map(convertToJpeg));
  preparedFiles = converted.map((c) => c.full);
  preparedThumbs = converted.map((c) => c.thumb);

  el.photoPreview.innerHTML = '';
  for (const { thumb } of converted) {
    const url = URL.createObjectURL(thumb);
    previewUrls.push(url);

    const item = document.createElement('div');
    item.className = 'photo-preview__item';
    const img = document.createElement('img');
    img.src = url;
    img.alt = thumb.name;
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

function initFilterRegionSelect() {
  for (const key of REGION_KEYS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = REGIONS[key].label;
    el.filterRegion.appendChild(opt);
  }
  el.filterRegion.addEventListener('change', () => {
    regionFilter = el.filterRegion.value;
    currentPage = 1; // フィルタを変えたら1ページ目に戻す
    renderExisting(allSpotsCache);
  });
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

/** 「(42.2327958, 140.2978500)」のような緯度経度の直接入力を受け付ける（括弧・スペースは有無どちらでも可） */
const LATLNG_PATTERN = /^\(?\s*(-?\d{1,3}(?:\.\d+)?)\s*[,、]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/;

function parseLatLng(text: string): L.LatLng | null {
  const m = text.match(LATLNG_PATTERN);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return L.latLng(lat, lng);
}

/**
 * 緯度経度の直接入力・GoogleマップのURL（短縮リンク含む）・場所名のテキストのいずれかから
 * 位置を調べ、地図をその場所にズームイン＋ピンを配置する。
 */
async function locateFromInput() {
  const query = el.locate.value.trim();
  if (!query) return;

  // 緯度経度の直接入力ならサーバーに問い合わせず即座に移動できる
  const direct = parseLatLng(query);
  if (direct) {
    map.flyTo(direct, 18);
    setPin(direct);
    setMessage('入力された緯度経度に移動しました', 'ok');
    return;
  }

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
  allSpotsCache = spots;

  // 地図上のピンは常に全件表示（フィルタは一覧表示だけに効かせる）
  existingLayer.clearLayers();
  for (const spot of spots) {
    const marker = L.marker([spot.lat, spot.lng], { icon: createSpotIcon(spot.category) });
    const popupBtn = document.createElement('button');
    popupBtn.type = 'button';
    popupBtn.className = 'popup-edit-btn';
    popupBtn.textContent = spot.name;
    popupBtn.title = 'クリックして編集';
    popupBtn.addEventListener('click', () => {
      marker.closePopup();
      startEdit(spot);
    });
    marker.bindPopup(popupBtn);
    existingLayer.addLayer(marker);
  }

  el.count.textContent = String(spots.length);

  const filtered = regionFilter ? spots.filter((s) => s.region === regionFilter) : spots;
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const shown = sorted.slice(start, start + PAGE_SIZE);

  renderPagination(sorted.length, totalPages);

  el.list.innerHTML = '';
  for (const spot of shown) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'name';
    const regionLabel = spot.region ? REGIONS[spot.region as Region]?.label : '';
    nameSpan.textContent = `[${CATEGORIES[spot.category as Category]?.label ?? spot.category}${regionLabel ? '/' + regionLabel : ''}] ${spot.name}`;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'edit-btn';
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => startEdit(spot));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', () => deleteSpot(spot.id));

    li.append(nameSpan, editBtn, delBtn);
    el.list.appendChild(li);
  }
}

/** 一覧下部のページネーション（« 前へ / 1 / 2 / 3 ... / 次へ »）を描画する */
function renderPagination(totalCount: number, totalPages: number) {
  el.pagination.innerHTML = '';
  if (totalCount === 0) {
    el.pagination.textContent = '該当するスポットがありません';
    return;
  }

  const goTo = (page: number) => {
    currentPage = page;
    renderExisting(allSpotsCache);
    el.list.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.textContent = '‹ 前へ';
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener('click', () => goTo(currentPage - 1));
  el.pagination.appendChild(prevBtn);

  const info = document.createElement('span');
  info.className = 'spot-pagination__info';
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalCount);
  info.textContent = `${start}-${end} / ${totalCount}件（${currentPage} / ${totalPages}ページ）`;
  el.pagination.appendChild(info);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = '次へ ›';
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener('click', () => goTo(currentPage + 1));
  el.pagination.appendChild(nextBtn);
}

/** 編集中の既存写真ギャラリーを表示する。✕で削除予約、もう一度押すと予約解除できる */
function renderExistingPhotos(spot: Spot) {
  removedPhotoUrls = new Set();
  el.existingPhotos.innerHTML = '';

  const photos = spot.photos ?? [];
  if (photos.length === 0) {
    el.existingPhotosSection.hidden = true;
    return;
  }
  el.existingPhotosSection.hidden = false;

  const thumbs = spot.photoThumbs ?? [];
  for (let i = 0; i < photos.length; i++) {
    const url = photos[i];
    const thumbUrl = thumbs[i] ?? url;

    const item = document.createElement('div');
    item.className = 'photo-preview__item photo-preview__item--existing';

    const img = document.createElement('img');
    // 本番/ローカルどちらでも正しく表示できるよう、相対パス基準を合わせる
    img.src = import.meta.env.DEV ? `${API_BASE}${thumbUrl}` : thumbUrl;
    img.alt = '';
    item.appendChild(img);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'photo-preview__remove';
    toggleBtn.textContent = '✕';
    toggleBtn.title = 'この写真を削除予約する';
    toggleBtn.addEventListener('click', () => {
      if (removedPhotoUrls.has(url)) {
        removedPhotoUrls.delete(url);
        item.classList.remove('photo-preview__item--removed');
        toggleBtn.textContent = '✕';
        toggleBtn.title = 'この写真を削除予約する';
      } else {
        removedPhotoUrls.add(url);
        item.classList.add('photo-preview__item--removed');
        toggleBtn.textContent = '↺';
        toggleBtn.title = '削除予約を取り消す';
      }
    });
    item.appendChild(toggleBtn);

    el.existingPhotos.appendChild(item);
  }
}

/** 一覧の「編集」から呼ばれる。フォームに既存の内容を読み込み、更新モードに切り替える */
function startEdit(spot: Spot) {
  editingId = spot.id;

  el.name.value = spot.name;
  el.category.value = spot.category;
  el.region.value = spot.region ?? '';
  el.description.value = spot.description ?? '';
  el.address.value = spot.address ?? '';
  el.url.value = spot.url ?? '';
  el.tags.value = (spot.tags ?? []).join(', ');
  clearPhotoPreview();
  renderExistingPhotos(spot);

  const latlng = L.latLng(spot.lat, spot.lng);
  setPin(latlng);
  map.flyTo(latlng, Math.max(map.getZoom(), 16));

  el.editBanner.hidden = false;
  el.editName.textContent = spot.name;
  el.submitBtn.textContent = 'この内容で更新する';
  setMessage('', 'ok');

  el.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 編集モードを終了して、新規追加モードに戻す */
function cancelEdit() {
  editingId = null;
  el.form.reset();
  el.lat.value = '';
  el.lng.value = '';
  el.latlngDisplay.textContent = '📍 地図をタップして位置を選択してください';
  clearPhotoPreview();
  removedPhotoUrls = new Set();
  el.existingPhotos.innerHTML = '';
  el.existingPhotosSection.hidden = true;
  if (pinMarker) {
    map.removeLayer(pinMarker);
    pinMarker = null;
  }
  el.editBanner.hidden = true;
  el.submitBtn.textContent = 'この内容で登録する';
}

el.editCancel.addEventListener('click', cancelEdit);

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
  for (const file of preparedThumbs) {
    fd.append('thumbnails', file);
  }
  if (removedPhotoUrls.size > 0) {
    fd.set('removePhotos', JSON.stringify([...removedPhotoUrls]));
  }

  const isEditing = editingId !== null;
  setMessage('送信中...', 'ok');
  try {
    const url = isEditing ? `${API_BASE}/api/spots/${editingId}` : `${API_BASE}/api/spots`;
    const res = await fetch(url, { method: isEditing ? 'PUT' : 'POST', body: fd });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    cancelEdit();
    setMessage(isEditing ? '更新しました！' : '追加しました！', 'ok');
    await refresh();
  } catch (err) {
    console.error(err);
    setMessage(`${isEditing ? '更新' : '追加'}に失敗しました: ${(err as Error).message}`, 'error');
  }
});

function setMessage(text: string, kind: 'ok' | 'error') {
  el.message.textContent = text;
  el.message.className = `form-message ${kind}`;
}

initCategorySelect();
initRegionSelect();
initFilterRegionSelect();
refresh();
