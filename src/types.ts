/** スポットのカテゴリ。増やしたくなったら categories.ts と合わせて追加する */
export type Category =
  | 'shrine'
  | 'temple'
  | 'onsen'
  | 'gourmet'
  | 'sightseeing'
  | 'lodging'
  | 'church'
  | 'shop'
  | 'other';

/** 都道府県 or 国。増やしたくなったら regions.ts と合わせて追加する */
export type Region =
  | 'hokkaido'
  | 'wakayama'
  | 'ehime'
  | 'miyazaki'
  | 'kagoshima'
  | 'france';

/** 1つの「おすすめ場所」 */
export interface Spot {
  id: string;
  name: string;
  category: Category;
  /** 都道府県 or 国。未分類の場合は省略可 */
  region?: Region;
  lat: number;
  lng: number;
  /**
   * 説明文。改行はそのまま表示される。文中の http(s):// で始まるURLは
   * 表示時に自動でリンク化されるので、HTMLタグは書かず生のURLを書けばよい
   */
  description?: string;
  address?: string;
  /** 公式サイトや参考URL */
  url?: string;
  /** public/photos/ 以下への相対パス（例: "/photos/xxxx/1.jpg"） */
  photos?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
