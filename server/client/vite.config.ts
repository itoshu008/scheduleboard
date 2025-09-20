import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,        // ← あなたの環境に合わせて。今は 3000 が使われています
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://zatint1991.com',
        changeOrigin: true,     // Host ヘッダを zatint1991.com に書き換え
        secure: false,          // 証明書検証を一旦無効化（通るのを確認後 true に戻してOK）
        ws: false,              // WebSocket不要なら明示的に切る（ノイズ低減）
        // パス書き換えは無し。/api をそのまま送る
        // rewrite: (p) => p,

        // デバッグ用ログ（起動時コンソールに出ます）
        configure: (proxy /*, options*/) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('[proxyReq]', req.method, req.url, '→', 'zatint1991.com');
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('[proxyRes]', req.method, req.url, '→', proxyRes.statusCode);
          });
          proxy.on('error', (err, req) => {
            console.error('[proxyError]', req?.method, req?.url, err?.message);
          });
        },
      } as ProxyOptions,
    },
  },
});
