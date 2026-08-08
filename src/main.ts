import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { createBaseMap, createSpotIcon } from './map-core';
import { CATEGORIES, CATEGORY_KEYS } from './categories';
import { REGIONS, REGION_KEYS } from './regions';
import { escapeHtml, escapeAttr, linkifyText } from './format';
import type { Category, Region, Spot } from './types';

interface MarkerEntry {
  spot: Spot;
  marker: L.Marker;
}

async function main() {
  const map = createBaseMap('map');
  const markersLayer = L.layerGroup().addTo(map);

  const spots = await loadSpots();
  const entries: MarkerEntry[] = spots.map((spot) => ({
    spot,
    marker: L.marker([spot.lat, spot.lng], { icon: createSpotIcon(spot.category) }).bindPopup(
      renderPopup(spot)
    )
  }));

  const visibleCategories = new Set<Category>(CATEGORY_KEYS);
  const visibleRegions = new Set<Region>(REGION_KEYS);

  function refreshVisibility() {
    markersLayer.clearLayers();
    for (const { spot, marker } of entries) {
      const categoryOk = visibleCategories.has(spot.category);
      const regionOk = !spot.region || visibleRegions.has(spot.region);
      if (categoryOk && regionOk) {
        markersLayer.addLayer(marker);
      }
    }
  }
  refreshVisibility();

  renderFilterPanel(entries, visibleCategories, visibleRegions, refreshVisibility);
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

  const regionLabel = spot.region ? REGIONS[spot.region]?.label : '';

  const tags = spot.tags?.length
    ? `<div class="tags">${spot.tags
        .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
        .join('')}</div>`
    : '';

  const link = spot.url
    ? `<a class="link" href="${escapeAttr(spot.url)}" target="_blank" rel="noopener noreferrer">公式サイト・詳細を見る →</a>`
    : '';

  el.innerHTML = `
    <span class="category-badge" style="background:${meta.color}">${meta.label}${regionLabel ? ` / ${escapeHtml(regionLabel)}` : ''}</span>
    <h3>${escapeHtml(spot.name)}</h3>
    ${photo}
    ${spot.description ? `<p class="desc">${linkifyText(spot.description)}</p>` : ''}
    ${spot.address ? `<p class="address">${escapeHtml(spot.address)}</p>` : ''}
    ${tags}
    ${link}
  `;
  return el;
}

function renderFilterPanel(
  entries: MarkerEntry[],
  visibleCategories: Set<Category>,
  visibleRegions: Set<Region>,
  onChange: () => void
) {
  const panel = document.getElementById('filter-panel');
  if (!panel) return;

  const categoryCounts = new Map<Category, number>();
  const regionCounts = new Map<Region, number>();
  for (const { spot } of entries) {
    categoryCounts.set(spot.category, (categoryCounts.get(spot.category) ?? 0) + 1);
    if (spot.region) {
      regionCounts.set(spot.region, (regionCounts.get(spot.region) ?? 0) + 1);
    }
  }

  const title = document.createElement('div');
  title.className = 'filter-panel__title';
  title.textContent = `全${entries.length}件`;
  panel.appendChild(title);

  appendFilterGroup(
    panel,
    'カテゴリ',
    CATEGORY_KEYS.map((key) => ({
      key,
      label: CATEGORIES[key].label,
      color: CATEGORIES[key].color,
      icon: CATEGORIES[key].icon,
      count: categoryCounts.get(key) ?? 0
    })),
    visibleCategories,
    onChange
  );

  if (regionCounts.size > 0) {
    appendFilterGroup(
      panel,
      '地域',
      REGION_KEYS.map((key) => ({
        key,
        label: REGIONS[key].label,
        color: '#adb5bd',
        count: regionCounts.get(key) ?? 0
      })),
      visibleRegions,
      onChange
    );
  }
}

function appendFilterGroup<T extends string>(
  panel: HTMLElement,
  groupLabel: string,
  items: { key: T; label: string; color: string; icon?: string; count: number }[],
  visibleSet: Set<T>,
  onChange: () => void
) {
  const groupTitle = document.createElement('div');
  groupTitle.className = 'filter-panel__group-title';
  groupTitle.textContent = groupLabel;
  panel.appendChild(groupTitle);

  for (const item of items) {
    if (item.count === 0) continue; // データが無いものは表示しない

    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        visibleSet.add(item.key);
      } else {
        visibleSet.delete(item.key);
      }
      onChange();
    });

    const swatch = document.createElement('span');
    if (item.icon) {
      swatch.className = 'swatch swatch--icon';
      swatch.style.borderColor = item.color;
      swatch.textContent = item.icon;
    } else {
      swatch.className = 'swatch';
      swatch.style.background = item.color;
    }

    const text = document.createElement('span');
    text.textContent = item.label;

    const countEl = document.createElement('span');
    countEl.className = 'count';
    countEl.textContent = String(item.count);

    label.append(checkbox, swatch, text, countEl);
    panel.appendChild(label);
  }
}

main();
