/**
 * 安全なカラー処理ユーティリティ
 * null/undefined/空文字/rgb()形式でも安全に処理
 */

export function safeHexColor(input: unknown, fallback = '#81ECEC'): `#${string}` {
  if (typeof input !== 'string') return fallback;
  const s = input.trim();
  if (!s) return fallback;

  // rgb/rgba(…)
  const m = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) {
    const [r, g, b] = m.slice(1, 4).map(n => Math.max(0, Math.min(255, Number(n))));
    return ('#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')) as `#${string}`;
  }

  // #RGB / #RRGGBB
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (/^[0-9a-fA-F]{6}$/.test(h)) return ('#' + h.toLowerCase()) as `#${string}`;
  }

  return fallback;
}

export function lightenColor(color: unknown, amount = 0.15): `#${string}` {
  const hex = safeHexColor(color);
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return ('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)) as `#${string}`;
}

export function darkenColor(color: unknown, amount = 0.15): `#${string}` {
  const hex = safeHexColor(color);
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
  return ('#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1))) as `#${string}`;
}

/**
 * 背景色に対して適切なテキスト色を決定
 */
export function getContrastTextColor(backgroundColor: unknown): string {
  const hex = safeHexColor(backgroundColor);
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 128 ? '#000000' : '#FFFFFF';
}
