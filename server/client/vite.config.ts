import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://zatint1991.com',
        changeOrigin: true,
        secure: true, // Let's Encrypt 証明書なので true
      },
    },
  },
});
