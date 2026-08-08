/** スポットのカテゴリ。増やしたくなったら categories.ts と合わせて追加する */
export type Category =
  | 'shrine'
  | 'temple'
  | 'onsen'
  | 'gourmet'
  | 'sightseeing'
  | 'shop'
  | 'other';

/** 1つの「おすすめ場所」 */
export interface Spot {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  /** 説明文。改行や簡単な記述OK（HTMLタグは入れない想定） */
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
