import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://zatint1991.com', // サーバのNginxへ中継
        changeOrigin: true,
        secure: true,                      // Let's Encrypt なので true
        headers: { Host: 'zatint1991.com' },
        // rewrite は不要（そのまま転送）
      },
    },
  },
});
