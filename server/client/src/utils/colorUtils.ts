/**
 * 色操作のユーティリティ関数（後方互換性のため残す）
 * 新しいコードでは src/utils/color.ts の安全な関数を使用してください
 */

import { safeHexColor, lightenColor as safeLightenColor, darkenColor as safeDarkenColor } from './color';

/**
 * 色を明るくする関数（安全版）
 * @param color - 16進数カラーコード（例: "#FF0000"）
 * @param percent - 明るくする割合（0-100）
 * @returns 明るくされた色の16進数カラーコード
 */
export const lightenColor = (color: string, percent: number): string => {
  return safeLightenColor(color, percent / 100);
};

/**
 * 色を暗くする関数（安全版）
 * @param color - 16進数カラーコード（例: "#FF0000"）
 * @param percent - 暗くする割合（0-100）
 * @returns 暗くされた色の16進数カラーコード
 */
export const darkenColor = (color: string, percent: number): string => {
  return safeDarkenColor(color, percent / 100);
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


