// src/utils/dateUtils.ts
// すべてローカルタイムで扱うユーティリティ（Zは付けない）

import { Holiday } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalISODateTime(d: Date): string {
  // YYYY-MM-DDTHH:mm:ss（Zなし）
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`;
}

export function parseLocalDateTimeString(s: string): Date {
  // "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss"
  if (!s) return new Date(NaN);
  const t = s.includes('T') ? s.replace('T', ' ') : s;
  const [date, time = '00:00:00'] = t.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, ss || 0);
}

export function formatLocal(d: Date, withSeconds = false): string {
  if (isNaN(+d)) return '';
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return withSeconds
    ? `${y}/${m}/${day} ${hh}:${mm}:${ss}`
    : `${y}/${m}/${day} ${hh}:${mm}`;
}

// セルからローカルDateを組み立てるヘルパ
export function buildLocalDateTime(baseDate: Date, hour: number, minute = 0) {
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0
  );
}

// 祝日データのキャッシュ
let holidayCache: Map<string, string> = new Map();
let cacheExpiry: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24時間

/**
 * 外部APIから祝日データを取得
 */
export const fetchHolidaysFromAPI = async (year: number): Promise<Holiday[]> => {
  try {
    // サーバー側の祝日APIを使用（相対パスで統一）
    const response = await fetch(`/api/holidays/${year}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    const holidays: Holiday[] = [];
    
    // APIレスポンスを変換
    data.forEach((holiday: any) => {
      holidays.push({
        date: holiday.date,
        name: holiday.name
      });
    });
    
    return holidays;
  } catch (error) {
    console.warn(`祝日API取得エラー (${year}年):`, error);
    return [];
  }
};

/**
 * 複数年分の祝日データを一括取得
 */
export const fetchHolidaysForYears = async (years: number[]): Promise<Holiday[]> => {
  const allHolidays: Holiday[] = [];
  
  for (const year of years) {
    const holidays = await fetchHolidaysFromAPI(year);
    allHolidays.push(...holidays);
  }
  
  return allHolidays;
};

/**
 * 祝日データを初期化（キャッシュ付き）
 */
export const initializeHolidayData = async (): Promise<void> => {
  const now = Date.now();
  
  // キャッシュが有効な場合はスキップ
  if (holidayCache.size > 0 && now < cacheExpiry) {
    return;
  }
  
  try {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];
    
    const holidays = await fetchHolidaysForYears(years);
    
    // キャッシュを更新
    holidayCache.clear();
    holidays.forEach(holiday => {
      holidayCache.set(holiday.date, holiday.name);
    });
    
    cacheExpiry = now + CACHE_DURATION;
    
    console.log(`祝日データを更新しました (${holidays.length}件)`);
  } catch (error) {
    console.error('祝日データの初期化に失敗しました:', error);
  }
};

/**
 * 祝日データを強制更新
 */
export const refreshHolidayData = async (): Promise<void> => {
  holidayCache.clear();
  cacheExpiry = 0;
  await initializeHolidayData();
};

/**
 * 指定した日付が祝日かどうかを判定（非同期）
 */
export const isHoliday = async (date: Date): Promise<boolean> => {
  await initializeHolidayData();
  const dateStr = formatDate(date);
  return holidayCache.has(dateStr);
};

/**
 * 指定した日付が祝日かどうかを判定（同期・キャッシュのみ）
 */
export const isHolidaySync = (date: Date): boolean => {
  const dateStr = formatDate(date);
  return holidayCache.has(dateStr);
};

/**
 * 指定した日付の祝日名を取得（非同期）
 */
export const getHolidayName = async (date: Date): Promise<string | null> => {
  await initializeHolidayData();
  const dateStr = formatDate(date);
  return holidayCache.get(dateStr) || null;
};

/**
 * 指定した日付の祝日名を取得（同期・キャッシュのみ）
 */
export const getHolidayNameSync = (date: Date): string | null => {
  const dateStr = formatDate(date);
  return holidayCache.get(dateStr) || null;
};

/**
 * 祝日認識のデバッグ情報を出力
 */
export const debugHolidayRecognition = (): void => {
  console.log('=== 祝日認識デバッグ情報 ===');
  console.log(`キャッシュサイズ: ${holidayCache.size}`);
  console.log(`キャッシュ有効期限: ${new Date(cacheExpiry).toLocaleString()}`);
  console.log('キャッシュ内容:');
  
  const sortedHolidays = Array.from(holidayCache.entries()).sort();
  sortedHolidays.forEach(([date, name]) => {
    console.log(`  ${date}: ${name}`);
  });
  
  // 今日の判定テスト
  const today = new Date();
  const todayStr = formatDate(today);
  const isHolidayToday = isHolidaySync(today);
  const holidayName = getHolidayNameSync(today);
  
  console.log(`今日 (${todayStr}) の判定:`);
  console.log(`  祝日判定: ${isHolidayToday}`);
  console.log(`  祝日名: ${holidayName || 'なし'}`);
  console.log('========================');
};

/**
 * 日付を YYYY-MM-DD 形式でフォーマット
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 日付と時刻を YYYY-MM-DD HH:MM 形式でフォーマット
 */
export const formatDateTime = (date: Date): string => {
  const dateStr = formatDate(date);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
};

/**
 * 時刻を HH:MM 形式でフォーマット
 */
export const formatTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * 現在の時刻を取得（HH:MM形式）
 */
export const getCurrentTime = (): string => {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};

/** YYYY-MM-DD（ローカル） */
export function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date を "YYYY-MM-DD"（ローカル）に */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → Date（ローカル 00:00）*/
export function fromYMDLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/**
 * 日付の日本語文字列を取得
 */
export const getJapaneseDateString = (date: Date): string => {
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
};

/**
 * 曜日の日本語名を取得
 */
export const getJapaneseDayName = (date: Date): string => {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  return dayNames[date.getDay()];
};

/**
 * 指定した日付の曜日を取得（0=日曜日）
 */
export const getDayOfWeek = (date: Date): number => {
  return date.getDay();
};

/**
 * 土曜日かどうかを判定
 */
export const isSaturday = (date: Date): boolean => {
  return date.getDay() === 6;
};

/**
 * 日曜日かどうかを判定
 */
export const isSunday = (date: Date): boolean => {
  return date.getDay() === 0;
};

/**
 * 週末（土日）かどうかを判定
 */
export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * 同じ日付かどうかを判定
 */
export const isSameDate = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

/**
 * 同じ月かどうかを判定
 */
export const isSameMonth = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth()
  );
};

/**
 * 月の最初の日を取得
 */
export const getFirstDayOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

/**
 * 月の最後の日を取得
 */
export const getLastDayOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

/**
 * 月の日数を取得
 */
export const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

/**
 * 月の日付一覧を取得
 */
export const getMonthDates = (date: Date): Date[] => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = getDaysInMonth(date);
  
  const dates: Date[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(new Date(year, month, day));
  }
  
  return dates;
};

/**
 * 時間の重複をチェック
 */
export const hasTimeOverlap = (
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean => {
  return start1 < end2 && start2 < end1;
};

/**
 * 現在の時刻が指定した日付の範囲内かどうか
 */
export const isCurrentTimeInDate = (date: Date): boolean => {
  const now = new Date();
  return isSameDate(now, date);
};

/**
 * タイムスロット番号から時刻を取得
 */
export const getTimeFromSlot = (slot: number): { hour: number; minute: number } => {
  const hour = Math.floor(slot / 4);
  const minute = (slot % 4) * 15;
  return { hour, minute };
};

/**
 * 終了時刻のタイムスロット番号を取得（1-96）
 * 0:00 = 0, 0:15 = 1, ..., 24:00 = 96
 */
export const getEndTimeSlot = (date: Date): number => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours * 4 + Math.ceil(minutes / 15);
};

/**
 * 時刻からタイムスロット番号を取得（0-95）
 */
export const getTimeSlot = (time: string | Date): number => {
  let hours: number, minutes: number;
  
  if (typeof time === 'string') {
    const [h, m] = time.split(':').map(Number);
    hours = h;
    minutes = m;
  } else {
    hours = time.getHours();
    minutes = time.getMinutes();
  }
  
  return hours * 4 + Math.floor(minutes / 15);
};

/**
 * タイムスロット番号から時刻文字列を取得
 */
export const getTimeStringFromSlot = (slot: number): string => {
  const { hour, minute } = getTimeFromSlot(slot);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/**
 * 日付とタイムスロット番号から完全なDateオブジェクトを作成
 */
export const createTimeFromSlot = (baseDate: Date, slot: number): Date => {
  const { hour, minute } = getTimeFromSlot(slot);
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hour, minute, 0, 0);
};

/**
 * 現在の時刻のタイムスロット番号を取得
 */
export const getCurrentTimeSlot = (): number => {
  return getTimeSlot(getCurrentTime());
};

/**
 * 15分単位に丸める（次の15分区切り）
 */
export const getNextQuarterHour = (date: Date): Date => {
  const minutes = date.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;
  
  const result = new Date(date);
  if (roundedMinutes >= 60) {
    result.setHours(result.getHours() + 1, 0, 0, 0);
  } else {
    result.setMinutes(roundedMinutes, 0, 0);
  }
  
  return result;
};

/**
 * 15分単位に丸める（最も近い15分区切り）
 */
export const roundToNearestQuarter = (date: Date): Date => {
  const minutes = date.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  
  const result = new Date(date);
  if (roundedMinutes >= 60) {
    result.setHours(result.getHours() + 1, 0, 0, 0);
  } else {
    result.setMinutes(roundedMinutes, 0, 0);
  }
  
  return result;
};