import axios from "axios";
export const api = axios.create({
  baseURL: "/api/scheduleboard",
  withCredentials: true,
});
if (import.meta.env.DEV) console.log("🔗 api.baseURL =", api.defaults.baseURL);