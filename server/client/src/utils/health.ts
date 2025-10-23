import { Health, api, API_BASE } from "../api";

export async function healthCheck() {
  return await Health.get();
}

export async function logHealthCheck() {
  console.log("🔍 API Health Check starting...");
  console.log("📍 Base URL:", API_BASE);
  console.log("🔧 Environment: Vite");
  try {
    const data = await healthCheck();
    console.log("✅ API Health Check ok:", data);
  } catch (err: any) {
    const status = err?.response?.status;
    console.error(`❌ API Health Check failed: ${status ?? "—"} - ${err?.message}`);
    console.info("💡 Check vite.config.ts proxy or VITE_API_BASE");
  }
}