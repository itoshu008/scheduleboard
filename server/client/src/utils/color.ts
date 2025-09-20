export type Hex = `#${string}`;
const DEFAULT_HEX = '#81ECEC' as const as Hex;

const clamp = (n: number, min = 0, max = 255) =>
  Math.min(max, Math.max(min, Math.round(n)));

export function safeHexColor(input: unknown, fallback: Hex = DEFAULT_HEX): Hex {
  if (typeof input !== 'string') return fallback;
  const s = input.trim();
  if (!s) return fallback;

  // rgb/rgba(...)
  const m = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const [r, g, b] = m.slice(1, 4).map(Number).map(clamp);
    return ('#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')) as Hex;
  }

  // #RGB / #RRGGBB
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (/^[0-9a-fA-F]{6}$/.test(h)) return ('#' + h.toLowerCase()) as Hex;
  }

  return fallback;
}

/** 量: -1.0(暗く) ～ +1.0(明るく) */
export function shiftColor(color: unknown, amount = 0.15): Hex {
  const hex = safeHexColor(color);
  const num = parseInt(hex.slice(1), 16);
  const r = clamp(((num >> 16) & 0xff) + 255 * amount);
  const g = clamp(((num >> 8) & 0xff) + 255 * amount);
  const b = clamp((num & 0xff) + 255 * amount);
  return ('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)) as Hex;
}

// 既存コード互換
export const lightenColor = (c: unknown, amt = 0.15): Hex => shiftColor(c, amt);
export const darkenColor  = (c: unknown, amt = 0.15): Hex => shiftColor(c, -Math.abs(amt));

/** APIに渡す用: null/'' は undefined にする */
export function toApiColor(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input === 'string' && input.trim() === '') return undefined;
  return safeHexColor(input);
}