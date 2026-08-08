import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // 本番ビルドには公開サイト（index.html）だけを含める。
  // 管理画面（admin/）は `npm run dev` のときだけ配信され、本番には含まれない。
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'index.html')
    }
  }
});
