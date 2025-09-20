/**
 * 色操作のユーティリティ関数
 */

/**
 * 色を明るくする関数
 * @param color - 16進数カラーコード（例: "#FF0000"）
 * @param percent - 明るくする割合（0-100）
 * @returns 明るくされた色の16進数カラーコード
 */
export const lightenColor = (color: string, percent: number): string => {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
};

/**
 * 色を暗くする関数
 * @param color - 16進数カラーコード（例: "#FF0000"）
 * @param percent - 暗くする割合（0-100）
 * @returns 暗くされた色の16進数カラーコード
 */
export const darkenColor = (color: string, percent: number): string => {
  const num = parseInt(color.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, (num >> 16) - amt);
  const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
  const B = Math.max(0, (num & 0x0000FF) - amt);
  return "#" + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
};

/**
 * RGB値をHex値に変換
 * @param r - 赤（0-255）
 * @param g - 緑（0-255）
 * @param b - 青（0-255）
 * @returns 16進数カラーコード
 */
export const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

/**
 * Hex値をRGB値に変換
 * @param hex - 16進数カラーコード（例: "#FF0000"）
 * @returns RGB値のオブジェクト
 */
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

/**
 * 色の明度を計算（0-255）
 * @param color - 16進数カラーコード
 * @returns 明度値（0-255）
 */
export const getLuminance = (color: string): number => {
  const rgb = hexToRgb(color);
  if (!rgb) return 0;
  return Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
};

/**
 * 背景色に対して適切なテキスト色を決定
 * @param backgroundColor - 背景色の16進数カラーコード
 * @returns 適切なテキスト色（"#FFFFFF" または "#000000"）
 */
export const getContrastTextColor = (backgroundColor: string): string => {
  const luminance = getLuminance(backgroundColor);
  return luminance > 128 ? "#000000" : "#FFFFFF";
};


