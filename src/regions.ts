import type { Region } from './types';

/**
 * 地域（都道府県 or 国）ごとの表示名。増やしたい時はここと types.ts の Region に追加する。
 * 並び順は全国地方公共団体コード順（北→南）。国は末尾。
 */
export const REGIONS: Record<Region, { label: string }> = {
  hokkaido: { label: '北海道' },
  aomori: { label: '青森' },
  iwate: { label: '岩手' },
  miyagi: { label: '宮城' },
  akita: { label: '秋田' },
  yamagata: { label: '山形' },
  fukushima: { label: '福島' },
  ibaraki: { label: '茨城' },
  tochigi: { label: '栃木' },
  gunma: { label: '群馬' },
  saitama: { label: '埼玉' },
  chiba: { label: '千葉' },
  tokyo: { label: '東京' },
  kanagawa: { label: '神奈川' },
  niigata: { label: '新潟' },
  toyama: { label: '富山' },
  ishikawa: { label: '石川' },
  fukui: { label: '福井' },
  yamanashi: { label: '山梨' },
  nagano: { label: '長野' },
  gifu: { label: '岐阜' },
  shizuoka: { label: '静岡' },
  aichi: { label: '愛知' },
  mie: { label: '三重' },
  shiga: { label: '滋賀' },
  kyoto: { label: '京都' },
  osaka: { label: '大阪' },
  hyogo: { label: '兵庫' },
  nara: { label: '奈良' },
  wakayama: { label: '和歌山' },
  tottori: { label: '鳥取' },
  shimane: { label: '島根' },
  okayama: { label: '岡山' },
  hiroshima: { label: '広島' },
  yamaguchi: { label: '山口' },
  tokushima: { label: '徳島' },
  kagawa: { label: '香川' },
  ehime: { label: '愛媛' },
  kochi: { label: '高知' },
  fukuoka: { label: '福岡' },
  saga: { label: '佐賀' },
  nagasaki: { label: '長崎' },
  kumamoto: { label: '熊本' },
  oita: { label: '大分' },
  miyazaki: { label: '宮崎' },
  kagoshima: { label: '鹿児島' },
  okinawa: { label: '沖縄' },
  france: { label: 'フランス' },
  malaysia: { label: 'マレーシア' }
};

export const REGION_KEYS = Object.keys(REGIONS) as Region[];

/** 新規スポット登録フォームの「地域」の初期選択（滞在地に合わせて随時変える運用上の都合） */
export const DEFAULT_REGION: Region = 'iwate';
