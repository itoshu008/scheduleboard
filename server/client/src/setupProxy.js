// src/setupProxy.js
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  console.log('🔧 Setting up proxy middleware...');
  
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:4001',
      changeOrigin: true,
      secure: false,         // 開発環境では証明書検証を無効化
      logLevel: 'info',
      onProxyReq: (proxyReq, req, res) => {
        console.log('🔄 Proxying:', req.method, req.url, '→', proxyReq.getHeader('host'));
      },
      onProxyRes: (proxyRes, req, res) => {
        console.log('✅ Response:', proxyRes.statusCode, req.url);
      },
      onError: (err, req, res) => {
        console.log('❌ Proxy error:', err.message, req.url);
        res.writeHead(500, {
          'Content-Type': 'text/plain',
        });
        res.end('Proxy error: ' + err.message);
      },
    })
  );
};