import type { Region } from './types';

/**
 * 日本の地方区分＋フランス。メニューの「地域から探す」ナビゲーションで使う。
 * スポット個別の都道府県/国（Region, regions.ts）とは別の、もう1段階大きいくくり。
 */
export type RegionBlock =
  | 'hokkaido'
  | 'tohoku'
  | 'kanto'
  | 'hokuriku'
  | 'tokai'
  | 'kinki'
  | 'chugoku'
  | 'shikoku'
  | 'kyushu'
  | 'nansei'
  | 'france';

interface RegionBlockMeta {
  label: string;
  /** ボタンを押したときに地図をフォーカスさせる中心座標とズームレベル */
  center: [number, number];
  zoom: number;
}

export const REGION_BLOCKS: Record<RegionBlock, RegionBlockMeta> = {
  hokkaido: { label: '北海道', center: [43.5, 142.5], zoom: 7 },
  tohoku: { label: '東北', center: [39.0, 140.8], zoom: 8 },
  kanto: { label: '関東', center: [36.0, 139.7], zoom: 9 },
  hokuriku: { label: '北陸', center: [36.7, 137.2], zoom: 9 },
  tokai: { label: '東海', center: [35.2, 137.3], zoom: 9 },
  kinki: { label: '近畿', center: [34.7, 135.6], zoom: 9 },
  chugoku: { label: '中国', center: [34.5, 132.8], zoom: 8 },
  shikoku: { label: '四国', center: [33.8, 133.5], zoom: 9 },
  kyushu: { label: '九州', center: [32.8, 130.7], zoom: 8 },
  nansei: { label: '南西諸島', center: [26.5, 128.0], zoom: 8 },
  france: { label: 'フランス', center: [44.8, 3.3], zoom: 8 }
};

export const REGION_BLOCK_KEYS = Object.keys(REGION_BLOCKS) as RegionBlock[];

/** スポットの都道府県/国（Region）から、どの地方区分（RegionBlock）に属すかを引く */
export const REGION_TO_BLOCK: Record<Region, RegionBlock> = {
  hokkaido: 'hokkaido',
  wakayama: 'kinki',
  ehime: 'shikoku',
  miyazaki: 'kyushu',
  kagoshima: 'kyushu',
  france: 'france'
};
