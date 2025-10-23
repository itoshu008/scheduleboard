export function normalizeToISOWithOffset(s: string, fallback = '+09:00') {
  if (!s) return s;
  if (/[Zz]$/.test(s) || /\+\d{2}:\d{2}$/.test(s)) return s;
  return s + fallback;
}
