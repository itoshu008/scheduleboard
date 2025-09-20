import { Holiday } from '../types';

// 祝日データのキャッシュ
let holidayCache: Map<string, string> = new Map();
let cacheExpiry: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24時間

/**
 * 外部APIから祝日データを取得
 * 
 * 使用可能なAPI:
 * 1. holidays-jp.github.io (無料、推奨)
 *    - URL: https://holidays-jp.github.io/api/v1/{year}/date.json
 *    - 形式: { "2024-01-01": "元日", "2024-01-08": "成人の日", ... }
 * 
 * 2. その他の選択肢:
 *    - Google Calendar API (APIキー必要)
 *    - 内閣府の祝日データ (CSV形式)
 *    - 独自の祝日APIサーバー
 * 
 * フォールバック機能:
 * - APIが利用できない場合は、ハードコードされた祝日データを使用
 * - キャッシュ機能により24時間はAPIリクエストを抑制
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
 * 複数年の祝日データを一括取得
 */
export const fetchHolidaysForYears = async (startYear: number, endYear: number): Promise<Map<string, string>> => {
  const holidays = new Map<string, string>();
  
  for (let year = startYear; year <= endYear; year++) {
    try {
      const yearHolidays = await fetchHolidaysFromAPI(year);
      yearHolidays.forEach(holiday => {
        holidays.set(holiday.date, holiday.name);
      });
    } catch (error) {
      console.warn(`${year}年の祝日データ取得に失敗:`, error);
    }
  }
  
  return holidays;
};

/**
 * 祝日データを初期化（API + フォールバック）
 */
export const initializeHolidayData = async (): Promise<void> => {
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 1;
  const endYear = currentYear + 10;
  
  try {
    // APIから祝日データを取得
    const apiHolidays = await fetchHolidaysForYears(startYear, endYear);
    
    if (apiHolidays.size > 0) {
      holidayCache = apiHolidays;
      cacheExpiry = Date.now() + CACHE_DURATION;
      // console.log(`APIから${apiHolidays.size}件の祝日データを取得しました`);
      return;
    }
  } catch (error) {
    console.warn('APIからの祝日データ取得に失敗、フォールバックデータを使用:', error);
  }
  
  // フォールバック: ハードコードされた祝日データ
  initializeFallbackHolidayData();
};

/**
 * フォールバック用の祝日データを初期化
 */
const initializeFallbackHolidayData = (): void => {
  // 日本の祝日データ（2024年）
  const HOLIDAYS_2024: Holiday[] = [
    { date: '2024-01-01', name: '元日' },
    { date: '2024-01-08', name: '成人の日' },
    { date: '2024-02-11', name: '建国記念の日' },
    { date: '2024-02-12', name: '振替休日' },
    { date: '2024-02-23', name: '天皇誕生日' },
    { date: '2024-03-20', name: '春分の日' },
    { date: '2024-04-29', name: '昭和の日' },
    { date: '2024-05-03', name: '憲法記念日' },
    { date: '2024-05-04', name: 'みどりの日' },
    { date: '2024-05-05', name: 'こどもの日' },
    { date: '2024-05-06', name: '振替休日' },
    { date: '2024-07-15', name: '海の日' },
    { date: '2024-08-11', name: '山の日' },
    { date: '2024-08-12', name: '振替休日' },
    { date: '2024-09-16', name: '敬老の日' },
    { date: '2024-09-22', name: '秋分の日' },
    { date: '2024-09-23', name: '振替休日' },
    { date: '2024-10-14', name: 'スポーツの日' },
    { date: '2024-11-03', name: '文化の日' },
    { date: '2024-11-04', name: '振替休日' },
    { date: '2024-11-23', name: '勤労感謝の日' },
  ];

  // 日本の祝日データ（2025年）
  const HOLIDAYS_2025: Holiday[] = [
    { date: '2025-01-01', name: '元日' },
    { date: '2025-01-13', name: '成人の日' },
    { date: '2025-02-11', name: '建国記念の日' },
    { date: '2025-02-23', name: '天皇誕生日' },
    { date: '2025-02-24', name: '振替休日' },
    { date: '2025-03-21', name: '春分の日' },
    { date: '2025-04-29', name: '昭和の日' },
    { date: '2025-05-03', name: '憲法記念日' },
    { date: '2025-05-04', name: 'みどりの日' },
    { date: '2025-05-05', name: 'こどもの日' },
    { date: '2025-05-06', name: '振替休日' },
    { date: '2025-07-21', name: '海の日' },
    { date: '2025-08-11', name: '山の日' },
    { date: '2025-09-15', name: '敬老の日' },
    { date: '2025-09-23', name: '秋分の日' },
    { date: '2025-10-13', name: 'スポーツの日' },
    { date: '2025-11-03', name: '文化の日' },
    { date: '2025-11-23', name: '勤労感謝の日' },
    { date: '2025-11-24', name: '振替休日' },
  ];

  // フォールバックデータをマップに追加
  [...HOLIDAYS_2024, ...HOLIDAYS_2025].forEach(holiday => {
    holidayCache.set(holiday.date, holiday.name);
  });
  
  cacheExpiry = Date.now() + CACHE_DURATION;
  // console.log('フォールバック祝日データを使用しました');
};

/**
 * 祝日データを更新
 */
export const refreshHolidayData = async (): Promise<void> => {
  // キャッシュが有効期限切れの場合のみ更新
  if (Date.now() > cacheExpiry) {
    await initializeHolidayData();
  }
};

/**
 * 指定した日付を YYYY-MM-DD 形式の文字列に変換
 */
export const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * 時刻を HH:MM 形式の文字列に変換
 */
export const formatTime = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

/**
 * 日付と時刻を YYYY-MM-DD HH:MM 形式の文字列に変換
 */
export const formatDateTime = (date: Date): string => {
  return `${formatDate(date)} ${formatTime(date)}`;
};

/**
 * 15分刻みのタイムスロット番号を取得（0-95）
 * 0:00 = 0, 0:15 = 1, ..., 23:45 = 95
 */
export const getTimeSlot = (date: Date): number => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours * 4 + Math.floor(minutes / 15);
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
 * タイムスロット番号から時刻文字列を取得
 */
export const getTimeStringFromSlot = (slot: number): string => {
  const { hour, minute } = getTimeFromSlot(slot);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/**
 * 指定した日付の曜日を取得（0=日曜日）
 */
export const getDayOfWeek = (date: Date): number => {
  return date.getDay();
};

/**
 * 指定した日付が土曜日かどうか
 */
export const isSaturday = (date: Date): boolean => {
  return getDayOfWeek(date) === 6;
};

/**
 * 指定した日付が日曜日かどうか
 */
export const isSunday = (date: Date): boolean => {
  return getDayOfWeek(date) === 0;
};

/**
 * 指定した日付が週末かどうか
 */
export const isWeekend = (date: Date): boolean => {
  return isSaturday(date) || isSunday(date);
};

/**
 * 指定した日付が祝日かどうか
 */
export const isHoliday = async (date: Date): Promise<boolean> => {
  await refreshHolidayData();
  const dateStr = formatDate(date);
  return holidayCache.has(dateStr);
};

/**
 * 指定した日付の祝日名を取得
 */
export const getHolidayName = async (date: Date): Promise<string | null> => {
  await refreshHolidayData();
  const dateStr = formatDate(date);
  return holidayCache.get(dateStr) || null;
};

/**
 * 同期版の祝日判定（既存のコードとの互換性のため）
 */
export const isHolidaySync = (date: Date): boolean => {
  const dateStr = formatDate(date);
  return holidayCache.has(dateStr);
};

/**
 * 同期版の祝日名取得（既存のコードとの互換性のため）
 */
export const getHolidayNameSync = (date: Date): string | null => {
  const dateStr = formatDate(date);
  return holidayCache.get(dateStr) || null;
};

/**
 * 祝日認識のデバッグ用関数
 */
export const debugHolidayRecognition = (date: Date): void => {
  const dateStr = formatDate(date);
  const isHolidayResult = isHolidaySync(date);
  const holidayName = getHolidayNameSync(date);
  
  console.log(`日付: ${dateStr}`);
  console.log(`祝日判定: ${isHolidayResult}`);
  console.log(`祝日名: ${holidayName}`);
  console.log(`holidayCache の内容:`, Array.from(holidayCache.entries()));
};

/**
 * 指定した日付の日本語曜日名を取得
 */
export const getJapaneseDayName = (date: Date): string => {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  return dayNames[getDayOfWeek(date)];
};

/**
 * 指定した日付の月の日数を取得
 */
export const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

/**
 * 指定した日付の月の最初の日を取得
 */
export const getFirstDayOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

/**
 * 指定した日付の月の最後の日を取得
 */
export const getLastDayOfMonth = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
};

/**
 * 指定した年月の日付配列を取得
 */
export const getMonthDates = (year: number, month: number): Date[] => {
  const dates: Date[] = [];
  // monthは0ベース（0-11）で渡される
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(new Date(year, month, day));
  }
  
  return dates;
};

/**
 * 2つの日付が同じ日かどうか
 */
export const isSameDate = (date1: Date, date2: Date): boolean => {
  return formatDate(date1) === formatDate(date2);
};

/**
 * 2つの日付が同じ月かどうか
 */
export const isSameMonth = (date1: Date, date2: Date): boolean => {
  return date1.getFullYear() === date2.getFullYear() && 
         date1.getMonth() === date2.getMonth();
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
  return start1 < end2 && end1 > start2;
};

/**
 * 日付を15分単位に丸める
 */
export const roundToNearestQuarter = (date: Date): Date => {
  const rounded = new Date(date);
  const minutes = rounded.getMinutes();
  const roundedMinutes = Math.round(minutes / 15) * 15;
  
  if (roundedMinutes === 60) {
    rounded.setHours(rounded.getHours() + 1);
    rounded.setMinutes(0);
  } else {
    rounded.setMinutes(roundedMinutes);
  }
  
  rounded.setSeconds(0);
  rounded.setMilliseconds(0);
  
  return rounded;
};

/**
 * 指定した日付の次の15分刻みの時刻を取得
 */
export const getNextQuarterHour = (date: Date): Date => {
  const next = new Date(date);
  const minutes = next.getMinutes();
  const nextQuarter = Math.ceil(minutes / 15) * 15;
  
  if (nextQuarter === 60) {
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
  } else {
    next.setMinutes(nextQuarter);
  }
  
  next.setSeconds(0);
  next.setMilliseconds(0);
  
  return next;
};

/**
 * 日付の文字列表現を日本語形式で取得
 */
export const getJapaneseDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayName = getJapaneseDayName(date);
  
  let result = `${year}年${month}月${day}日(${dayName})`;
  
  const holidayName = getHolidayNameSync(date);
  if (holidayName) {
    result += ` ${holidayName}`;
  }
  
  return result;
};

/**
 * 現在の時刻を取得
 */
export const getCurrentTime = (): Date => {
  return new Date();
};

/**
 * 現在の時刻のタイムスロット番号を取得
 */
export const getCurrentTimeSlot = (): number => {
  return getTimeSlot(getCurrentTime());
};

/**
 * 現在の時刻が指定した日付の範囲内かどうか
 */
export const isCurrentTimeInDate = (date: Date): boolean => {
  const now = getCurrentTime();
  return isSameDate(now, date);
};