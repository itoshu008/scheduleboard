import { api } from "./api";
export async function checkApiHealth() {
  await api.get("/health");
  return true;
}