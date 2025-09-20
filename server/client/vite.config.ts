import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://zatint1991.com',
        changeOrigin: true,   // Host ヘッダをターゲットに合わせる
        secure: false,        // ← まずは false で 502 を回避（通ったら true に戻す）
        rewrite: (p) => p,    // /api をそのまま維持（Nginx 側も /api 前提）
      },
    },
  },
});
