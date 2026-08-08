import type { Category } from './types';

interface CategoryMeta {
  label: string;
  color: string;
}

/** カテゴリごとの表示名とピンの色。新しいカテゴリを増やしたい時はここと types.ts の Category に追加する */
export const CATEGORIES: Record<Category, CategoryMeta> = {
  shrine: { label: '神社', color: '#e63946' },
  temple: { label: '寺', color: '#6a4c93' },
  onsen: { label: '温泉・銭湯', color: '#118ab2' },
  gourmet: { label: 'グルメ', color: '#f4a261' },
  sightseeing: { label: '観光名所', color: '#2a9d8f' },
  lodging: { label: '宿泊施設', color: '#8d99ae' },
  church: { label: '教会', color: '#9d4edd' },
  shop: { label: 'ショップ', color: '#ffb703' },
  other: { label: 'その他', color: '#6c757d' }
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];
