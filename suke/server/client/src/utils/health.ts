import { api } from "./api";
export async function checkApiHealth() {
  console.log("🔍 health via", api.defaults.baseURL);
  const res = await api.get("/health");
  console.log("✅", res.data);
  return true;
}