import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // 本番ビルドには公開サイト（index.html）とお問い合わせページ（contact/）を含める。
  // 管理画面（admin/）は `npm run dev` のときだけ配信され、本番には含まれない
  // （専用の vite.admin.config.ts で別ビルドする）。
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        contact: resolve(__dirname, 'contact/index.html')
      }
    }
  }
});
