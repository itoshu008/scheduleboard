import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: '/scheduleboard/',
  server: { port: 5173, proxy: { '/api/scheduleboard': 'http://localhost:3000' } },
  build: { outDir: 'dist' }
});
