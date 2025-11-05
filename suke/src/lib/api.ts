export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ||
  (typeof window !== 'undefined' ? '/api' : '/api');

type FetchOptions = { method?: 'GET'|'POST'|'PUT'|'DELETE'; body?: any; signal?: AbortSignal; headers?: Record<string,string> };
export async function api<T=any>(path: string, opts: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const signal = opts.signal ?? controller.signal;
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers||{}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = (data && (data.error||data.message)) || res.statusText;
      throw new Error(`API ${res.status} ${path}: ${msg}`);
    }
    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

