import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { createBaseMap, createSpotIcon } from './map-core';
import { CATEGORIES, CATEGORY_KEYS } from './categories';
import { REGIONS } from './regions';
import { REGION_BLOCKS, REGION_BLOCK_KEYS, REGION_TO_BLOCK } from './region-blocks';
import { escapeHtml, escapeAttr, linkifyText } from './format';
import type { Category, Spot } from './types';
import type { RegionBlock } from './region-blocks';

interface MarkerEntry {
  spot: Spot;
  marker: L.Marker;
  block: RegionBlock | null;
}

async function main() {
  const map = createBaseMap('map');
  const markersLayer = L.layerGroup().addTo(map);
  const menu = setupMenuToggle(map);

  const spots = await loadSpots();
  const entries: MarkerEntry[] = spots.map((spot) => ({
    spot,
    marker: L.marker([spot.lat, spot.lng], { icon: createSpotIcon(spot.category) }).bindPopup(
      renderPopup(spot)
    ),
    block: spot.region ? (REGION_TO_BLOCK[spot.region] ?? null) : null
  }));

  const visibleCategories = new Set<Category>(CATEGORY_KEYS);
  let currentBlock: RegionBlock | null = null;

  function refreshVisibility() {
    markersLayer.clearLayers();
    for (const { spot, marker, block } of entries) {
      const categoryOk = visibleCategories.has(spot.category);
      const blockOk = !currentBlock || block === currentBlock;
      if (categoryOk && blockOk) {
        markersLayer.addLayer(marker);
      }
    }
  }
  refreshVisibility();

  // B: カテゴリの表示/非表示は右上に独立して常に表示
  renderCategoryPanel(entries, visibleCategories, refreshVisibility);

  // A-2: 地域から探す
  renderRegionNav(map, entries, (block) => {
    currentBlock = block;
    refreshVisibility();
    menu.close();
  });

  // A-3: 最近の更新
  renderRecentUpdates(entries, (entry) => {
    map.flyTo([entry.spot.lat, entry.spot.lng], 14);
    entry.marker.openPopup();
    menu.close();
  });
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

/** ハンバーガーボタンで左メニューの開閉を切り替える */
function setupMenuToggle(map: L.Map): { close: () => void } {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('side-menu');
  const icon = toggle?.querySelector('.menu-toggle__icon');

  function setOpen(open: boolean) {
    menu?.classList.toggle('side-menu--open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    if (icon) icon.textContent = open ? '✕' : '☰';
  }

  toggle?.addEventListener('click', () => {
    setOpen(!menu?.classList.contains('side-menu--open'));
  });

  // 地図をクリックしたらメニューを閉じる（メニューを開いたまま地図を操作しやすくする）
  map.on('click', () => setOpen(false));

  return { close: () => setOpen(false) };
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

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`;

  el.innerHTML = `
    <div class="popup-header">
      <span class="category-badge" style="background:${meta.color}">${meta.label}${regionLabel ? ` / ${escapeHtml(regionLabel)}` : ''}</span>
      <a class="gmaps-link" href="${escapeAttr(googleMapsUrl)}" target="_blank" rel="noopener noreferrer" title="Googleマップで見る" aria-label="Googleマップで見る"><img src="/assets/icons/google-maps.png" alt="" width="20" height="20" /></a>
    </div>
    <h3>${escapeHtml(spot.name)}</h3>
    ${photo}
    ${spot.description ? `<p class="desc">${linkifyText(spot.description)}</p>` : ''}
    ${spot.address ? `<p class="address">${escapeHtml(spot.address)}</p>` : ''}
    ${tags}
    ${link}
  `;
  return el;
}

/** B: 右上に常時表示するカテゴリの表示/非表示パネル。開閉できるようにする */
function renderCategoryPanel(
  entries: MarkerEntry[],
  visibleCategories: Set<Category>,
  onChange: () => void
) {
  const panel = document.getElementById('category-panel');
  if (!panel) return;

  const counts = new Map<Category, number>();
  for (const { spot } of entries) {
    counts.set(spot.category, (counts.get(spot.category) ?? 0) + 1);
  }

  // 開閉ヘッダー（タップで開閉）
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'category-panel__header';

  const title = document.createElement('span');
  title.className = 'category-panel__title';
  title.textContent = `カテゴリ (全${entries.length}件)`;

  const chevron = document.createElement('span');
  chevron.className = 'category-panel__chevron';
  chevron.textContent = '▾';

  header.append(title, chevron);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'category-panel__body';
  panel.appendChild(body);

  // 画面が狭い(スマホ幅)場合は最初から閉じておく
  const collapsedByDefault = window.innerWidth <= 600;
  panel.classList.toggle('category-panel--collapsed', collapsedByDefault);
  chevron.textContent = collapsedByDefault ? '▸' : '▾';

  header.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('category-panel--collapsed');
    chevron.textContent = collapsed ? '▸' : '▾';
  });

  for (const key of CATEGORY_KEYS) {
    const count = counts.get(key) ?? 0;
    if (count === 0) continue; // データが無いカテゴリは表示しない

    const meta = CATEGORIES[key];
    const label = document.createElement('label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        visibleCategories.add(key);
      } else {
        visibleCategories.delete(key);
      }
      onChange();
    });

    const swatch = document.createElement('span');
    swatch.className = 'swatch swatch--icon';
    swatch.style.borderColor = meta.color;
    swatch.textContent = meta.icon;

    const text = document.createElement('span');
    text.textContent = meta.label;

    const countEl = document.createElement('span');
    countEl.className = 'count';
    countEl.textContent = String(count);

    label.append(checkbox, swatch, text, countEl);
    body.appendChild(label);
  }
}

/** A-2: 地域（地方区分）から探すナビゲーション */
function renderRegionNav(
  map: L.Map,
  entries: MarkerEntry[],
  onSelect: (block: RegionBlock | null) => void
) {
  const nav = document.getElementById('region-nav');
  if (!nav) return;

  const counts = new Map<RegionBlock, number>();
  for (const { block } of entries) {
    if (block) counts.set(block, (counts.get(block) ?? 0) + 1);
  }

  function setActive(button: HTMLButtonElement) {
    nav?.querySelectorAll('button').forEach((b) => b.classList.remove('region-nav__btn--active'));
    button.classList.add('region-nav__btn--active');
  }

  const allButton = document.createElement('button');
  allButton.type = 'button';
  allButton.className = 'region-nav__btn region-nav__btn--all region-nav__btn--active';
  allButton.textContent = `全国 (${entries.length})`;
  allButton.addEventListener('click', () => {
    setActive(allButton);
    map.flyTo([36.5, 138], 6);
    onSelect(null);
  });
  nav.appendChild(allButton);

  const grid = document.createElement('div');
  grid.className = 'region-nav__grid';
  nav.appendChild(grid);

  for (const key of REGION_BLOCK_KEYS) {
    const meta = REGION_BLOCKS[key];
    const count = counts.get(key) ?? 0;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'region-nav__btn';
    button.textContent = `${meta.label} (${count})`;
    button.addEventListener('click', () => {
      setActive(button);
      map.flyTo(meta.center, meta.zoom);
      onSelect(key);
    });
    grid.appendChild(button);
  }
}

/** A-3: 最近の更新（最新20件） */
function renderRecentUpdates(entries: MarkerEntry[], onSelect: (entry: MarkerEntry) => void) {
  const list = document.getElementById('recent-updates');
  if (!list) return;

  const sorted = [...entries].sort(
    (a, b) => new Date(b.spot.updatedAt).getTime() - new Date(a.spot.updatedAt).getTime()
  );

  for (const entry of sorted.slice(0, 20)) {
    const meta = CATEGORIES[entry.spot.category] ?? CATEGORIES.other;
    const li = document.createElement('li');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recent-updates__item';
    button.addEventListener('click', () => onSelect(entry));

    const icon = document.createElement('span');
    icon.className = 'swatch swatch--icon';
    icon.style.borderColor = meta.color;
    icon.textContent = meta.icon;

    const name = document.createElement('span');
    name.className = 'recent-updates__name';
    name.textContent = entry.spot.name;

    const date = document.createElement('span');
    date.className = 'recent-updates__date';
    date.textContent = formatDate(entry.spot.updatedAt);

    button.append(icon, name, date);
    li.appendChild(button);
    list.appendChild(li);
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

main();
