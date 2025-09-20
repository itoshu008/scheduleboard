import axios from 'axios';

/**
 * 統一されたaxiosクライアント
 * 開発時: /api (Viteプロキシ経由で本番APIに接続)
 * 本番時: 環境変数で指定されたURL
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: false, // 認証がなければ false。必要なら true に
  timeout: 30000,
});

// エラーハンドリング
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export default api;
