import type { Region } from './types';

/** 地域（都道府県 or 国）ごとの表示名。増やしたい時はここと types.ts の Region に追加する */
export const REGIONS: Record<Region, { label: string }> = {
  hokkaido: { label: '北海道' },
  wakayama: { label: '和歌山' },
  ehime: { label: '愛媛' },
  miyazaki: { label: '宮崎' },
  kagoshima: { label: '鹿児島' },
  france: { label: 'フランス' }
};

export const REGION_KEYS = Object.keys(REGIONS) as Region[];
