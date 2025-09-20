import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // 🔒 ここは絶対に変えない
  timeout: 15000,
  withCredentials: false,
});

export { api };
export default api;
