import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { createBaseMap, createSpotIcon } from '../map-core';
import { CATEGORIES, CATEGORY_KEYS } from '../categories';
import type { Spot, Category } from '../types';

const API_BASE = 'http://localhost:5175';

const map = createBaseMap('admin-map');
let pinMarker: L.Marker | null = null;
let existingLayer = L.layerGroup().addTo(map);

const el = {
  lat: document.getElementById('f-lat') as HTMLInputElement,
  lng: document.getElementById('f-lng') as HTMLInputElement,
  latlngDisplay: document.getElementById('f-latlng') as HTMLElement,
  name: document.getElementById('f-name') as HTMLInputElement,
  category: document.getElementById('f-category') as HTMLSelectElement,
  description: document.getElementById('f-description') as HTMLTextAreaElement,
  address: document.getElementById('f-address') as HTMLInputElement,
  url: document.getElementById('f-url') as HTMLInputElement,
  tags: document.getElementById('f-tags') as HTMLInputElement,
  photos: document.getElementById('f-photos') as HTMLInputElement,
  form: document.getElementById('spot-form') as HTMLFormElement,
  message: document.getElementById('form-message') as HTMLElement,
  list: document.getElementById('spot-list') as HTMLElement,
  count: document.getElementById('spot-count') as HTMLElement
};

function initCategorySelect() {
  for (const key of CATEGORY_KEYS) {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = CATEGORIES[key].label;
    el.category.appendChild(opt);
  }
}

map.on('click', (e: L.LeafletMouseEvent) => {
  const { lat, lng } = e.latlng;
  el.lat.value = String(lat);
  el.lng.value = String(lng);
  el.latlngDisplay.textContent = `選択中の位置: ${lat.toFixed(5)}, ${lng.toFixed(5)}（ドラッグでも移動可）`;

  if (pinMarker) {
    pinMarker.setLatLng(e.latlng);
  } else {
    pinMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
    pinMarker.on('drag', (ev) => {
      const pos = (ev.target as L.Marker).getLatLng();
      el.lat.value = String(pos.lat);
      el.lng.value = String(pos.lng);
      el.latlngDisplay.textContent = `選択中の位置: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}（ドラッグでも移動可）`;
    });
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
    nameSpan.textContent = `[${CATEGORIES[spot.category as Category]?.label ?? spot.category}] ${spot.name}`;
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
    setMessage('管理APIサーバーに接続できません。`npm run admin` を起動してください。', 'error');
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
  fd.set('lat', el.lat.value);
  fd.set('lng', el.lng.value);
  fd.set('description', el.description.value);
  fd.set('address', el.address.value);
  fd.set('url', el.url.value);
  fd.set('tags', el.tags.value);
  for (const file of el.photos.files ?? []) {
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
    el.latlngDisplay.textContent = '地図をクリックして位置を選択してください';
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
refresh();
