/** スポットのカテゴリ。増やしたくなったら categories.ts と合わせて追加する */
export type Category =
  | 'shrine'
  | 'temple'
  | 'onsen'
  | 'water'
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
  | 'france'
  | 'malaysia';

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
  /** public/photos/ 以下への相対パス（例: "/photos/xxxx/1.jpg"）。フルサイズ画像 */
  photos?: string[];
  /**
   * サムネイル（軽量版）。photosと同じ並び順・同じ件数を想定。
   * 一覧のグリッド表示で使い、拡大表示(ライトボックス)ではphotosの方を使う。
   * 無い場合はフロント側でphotosにフォールバックする（旧データ互換）
   */
  photoThumbs?: string[];
  /**
   * public/photos/ 以下への相対パス（例: "/photos/xxxx/v1.mp4"）。動画本体。
   * ファイル名は photos とは別の連番("vN.ext")なので、同じディレクトリ内で衝突しない。
   * サムネイルは生成しない（グリッド上は再生アイコンのプレースホルダー表示、拡大表示で実際に再生する）
   */
  videos?: string[];
  tags?: string[];
  createdAt: string;
  updatedAt: string;
}
