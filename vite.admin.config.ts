import { defineConfig } from 'vite';

// 管理画面だけを、どのディレクトリに置いても動くように相対パスでビルドする設定。
// 本番では推測されにくいURL（例: /xxxxxxxx/）に配置するため、
// 通常の vite.config.ts（絶対パス "/assets/..."）とは別にこちらを使う。
//   npm run build:admin
export default defineConfig({
  root: 'admin',
  base: './',
  // public/data/spots.json や public/.htaccess は管理画面には不要（本番のwww/.htaccessを継承する）
  publicDir: false,
  build: {
    outDir: '../dist-admin',
    emptyOutDir: true
  }
});
