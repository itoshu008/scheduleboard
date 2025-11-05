export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE || '/api';

type FetchOptions = { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: any; signal?: AbortSignal; headers?: Record<string,string> };

async function call<T=any>(path: string, opts: FetchOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.error||data.message)) || res.statusText;
    throw new Error(`API ${res.status} ${path}: ${msg}`);
  }
  return data as T;
}

// Try sequence until one succeeds; returns {source, data}
export async function callFirst<T=any>(paths: string[]): Promise<{source:string; data:T}> {
  let lastErr: any;
  for (const p of paths) {
    try {
      const data = await call<T>(p);
      return { source: p, data };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export { call as api };
