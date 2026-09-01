import type { Category } from './types';

interface CategoryMeta {
  label: string;
  color: string;
  /** 地図上のピンに表示する絵文字。色だけでなく形でも一目でカテゴリが分かるようにする */
  icon: string;
}

/** カテゴリごとの表示名・ピンの色・アイコン。新しいカテゴリを増やしたい時はここと types.ts の Category に追加する */
export const CATEGORIES: Record<Category, CategoryMeta> = {
  shrine: { label: '神社', color: '#e63946', icon: '⛩️' },
  temple: { label: '寺', color: '#6a4c93', icon: '🛕' },
  onsen: { label: '温泉・銭湯', color: '#118ab2', icon: '♨️' },
  water: { label: '水', color: '#48cae4', icon: '💧' },
  gourmet: { label: 'グルメ', color: '#f4a261', icon: '🍴' },
  sightseeing: { label: '観光名所', color: '#2a9d8f', icon: '🏞️' },
  lodging: { label: '宿泊施設', color: '#8d99ae', icon: '🏨' },
  church: { label: '教会', color: '#9d4edd', icon: '⛪' },
  shop: { label: 'ショップ', color: '#ffb703', icon: '🛍️' },
  other: { label: 'その他', color: '#6c757d', icon: '📍' }
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];
