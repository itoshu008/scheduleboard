import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: '/shuke-b/', // ← デプロイ時のベースパス
  plugins: [react()],
  server: {
    port: 5173,         // ← 開発ポート
    open: true,         // ← 自動でブラウザを開く
    proxy: {
      "/api": {
        target: "http://localhost:8000", // ← あなたのサーバーのポート
        changeOrigin: true,
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
