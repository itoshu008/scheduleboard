import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 既存のポートを使いたければ VITE_DEV_PORT を .env に入れてください（無ければ 3000）
const DEV_PORT = Number(process.env.VITE_DEV_PORT || 3000);

// proxy の転送先（ローカルAPI）
const API_TARGET = process.env.VITE_PROXY_TARGET || "http://localhost:4001";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@stores': path.resolve(__dirname, './src/stores'),
    },
  },
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: true,
    hmr: {
      port: DEV_PORT,
    },
    proxy: {
      // フロント→/api は backend(4001)へ
      "^/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            console.log('❌ Proxy error:', err.message, req.url);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('🔄 Proxying:', req.method, req.url);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('✅ Response:', proxyRes.statusCode, req.url);
          });
        },
      },

      // Socket.IO を使う場合（使っていれば有効化）
      '/socket.io': {
        target: 'https://zatint1991.com',
        changeOrigin: true,
        secure: true,
        ws: true,
        headers: { Host: 'zatint1991.com', 'X-Forwarded-Proto': 'https' },
      },
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: ['@headlessui/react', '@heroicons/react', 'framer-motion'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
})
