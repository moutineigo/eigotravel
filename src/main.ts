import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { createBaseMap, createSpotIcon } from './map-core';
import { CATEGORIES, CATEGORY_KEYS } from './categories';
import type { Category, Spot } from './types';

async function main() {
  const map = createBaseMap('map');

  const spots = await loadSpots();

  // カテゴリごとにレイヤーグループを分けておき、フィルタパネルで表示/非表示を切り替える
  const layersByCategory = new Map<Category, L.LayerGroup>();
  for (const key of CATEGORY_KEYS) {
    const group = L.layerGroup().addTo(map);
    layersByCategory.set(key, group);
  }

  for (const spot of spots) {
    const marker = L.marker([spot.lat, spot.lng], {
      icon: createSpotIcon(spot.category)
    });
    marker.bindPopup(renderPopup(spot));
    layersByCategory.get(spot.category)?.addLayer(marker);
  }

  renderFilterPanel(spots, layersByCategory, map);
}

async function loadSpots(): Promise<Spot[]> {
  try {
    const res = await fetch('/data/spots.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Spot[];
  } catch (err) {
    console.error('スポットデータの読み込みに失敗しました', err);
    return [];
  }
}

function renderPopup(spot: Spot): HTMLElement {
  const meta = CATEGORIES[spot.category] ?? CATEGORIES.other;
  const el = document.createElement('div');
  el.className = 'spot-popup';

  const photo = spot.photos?.[0]
    ? `<img class="photo" src="${escapeAttr(spot.photos[0])}" alt="">`
    : '';

  const tags = spot.tags?.length
    ? `<div class="tags">${spot.tags
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join('')}</div>`
    : '';

  const link = spot.url
    ? `<a class="link" href="${escapeAttr(spot.url)}" target="_blank" rel="noopener noreferrer">公式サイト・詳細を見る →</a>`
    : '';

  el.innerHTML = `
    <span class="category-badge" style="background:${meta.color}">${meta.label}</span>
    <h3>${escapeHtml(spot.name)}</h3>
    ${photo}
    ${spot.description ? `<p class="desc">${escapeHtml(spot.description)}</p>` : ''}
    ${spot.address ? `<p class="address">${escapeHtml(spot.address)}</p>` : ''}
    ${tags}
    ${link}
  `;
  return el;
}

function renderFilterPanel(
  spots: Spot[],
  layersByCategory: Map<Category, L.LayerGroup>,
  map: L.Map
) {
  const panel = document.getElementById('filter-panel');
  if (!panel) return;

  const counts = new Map<Category, number>();
  for (const s of spots) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  const title = document.createElement('div');
  title.className = 'filter-panel__title';
  title.textContent = `カテゴリ (全${spots.length}件)`;
  panel.appendChild(title);

  for (const key of CATEGORY_KEYS) {
    const count = counts.get(key) ?? 0;
    if (count === 0) continue; // データが無いカテゴリは表示しない

    const meta = CATEGORIES[key];
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      const group = layersByCategory.get(key);
      if (!group) return;
      if (checkbox.checked) {
        group.addTo(map);
      } else {
        map.removeLayer(group);
      }
    });

    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.background = meta.color;

    const text = document.createElement('span');
    text.textContent = meta.label;

    const countEl = document.createElement('span');
    countEl.className = 'count';
    countEl.textContent = String(count);

    label.append(checkbox, swatch, text, countEl);
    panel.appendChild(label);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

main();
