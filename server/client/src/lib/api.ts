import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // 🔒 ここは絶対に変えない
  timeout: 10000,
  withCredentials: true,
});

export { api };
export default api;
