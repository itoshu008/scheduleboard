// API レスポンス共通型
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// 部署型
export interface Department {
  id: number;
  name: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// 社員型
export interface Employee {
  id: number;
  employee_number: string;
  name: string;
  department_id: number;
  department_name?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// スケジュール型
export interface Schedule {
  id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  title: string; // purposeからtitleに変更
  purpose?: string; // 後方互換性のため残す
  start_datetime: string;
  end_datetime: string;
  color?: string | null;
  created_at: string;
  updated_at: string;
  hasOverlap?: boolean; // 重複フラグ
  assignee_id?: number; // 担当者ID
  assignee_name?: string; // 担当者名
  participants?: ScheduleParticipant[]; // 参加者リスト
  participant_ids?: number[]; // 参加者IDリスト（登録時用）
  equipment_ids?: number[]; // 設備IDリスト（登録時用）
}

// スケジュール参加者型
export interface ScheduleParticipant {
  id: number;
  schedule_id: number;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  created_at: string;
  updated_at: string;
}

// 設備型
export interface Equipment {
  id: number;
  name: string;
  description?: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// 設備予約型
export interface EquipmentReservation {
  id: number;
  equipment_id: number;
  equipment_name?: string;
  employee_id: number;
  employee_name?: string;
  employee_number?: string;
  purpose: string;
  title: string; // Scheduleとの互換性のため必須に変更
  start_datetime: string;
  end_datetime: string;
  color?: string | null;
  created_at: string;
  updated_at: string;
  hasOverlap?: boolean; // 重複フラグ
}

// フォーム用型
export interface CreateDepartmentForm {
  name: string;
  display_order?: number;
}

export interface CreateEmployeeForm {
  employee_number: string;
  name: string;
  department_id: number;
  display_order?: number;
}

export interface CreateScheduleForm {
  employee_id: number;
  title: string; // purposeからtitleに変更
  start_datetime: Date;
  end_datetime: Date;
  color?: string;
}

export interface CreateEquipmentForm {
  name: string;
  description?: string;
  display_order?: number;
}

// テンプレート型
export interface Template {
  id: number;
  name: string;
  title: string;
  color?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateForm {
  name: string;
  title: string;
  color?: string | null;
}

export interface CreateEquipmentReservationForm {
  equipment_id: number;
  employee_id: number;
  purpose: string;
  start_datetime: Date;
  end_datetime: Date;
  color?: string;
}

// カレンダー関連型
export interface CalendarCell {
  date: Date;
  timeSlot: number; // 15分刻みのスロット番号 (0-95)
  hour: number;
  minute: number;
}

export interface CalendarBar {
  schedule: Schedule | EquipmentReservation;
  startSlot: number;
  endSlot: number;
  width: number;
  top: number;
  left: number;
}

export interface GridPosition {
  row: number;
  col: number;
  startSlot: number;
  endSlot: number;
}

// コピー・移動関連型
export interface ClipboardData {
  type: 'schedule' | 'equipment-reservation';
  data: Schedule | EquipmentReservation;
}

export interface DragData {
  type: 'move' | 'resize-start' | 'resize-end';
  scheduleId: number;
  originalPosition: GridPosition;
}

// カラーパレット
export const SCHEDULE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3',
  '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43', '#F368E0', '#FF3838',
  '#FFA502', '#FF6348', '#7BED9F', '#70A1FF', '#5352ED', '#A4B0BE',
  '#6C5CE7', '#FDCB6E', '#6C7CE7', '#FD79A8', '#E17055', '#00B894',
  '#0984E3', '#F5F6FA', '#74B9FF', '#81ECEC', '#A29BFE', '#DDA0DD',
  '#98FB98', '#F0E68C', '#87CEEB', '#DEB887', '#F4A460', '#BC8F8F'
];

export type ScheduleColor = typeof SCHEDULE_COLORS[number];

// 祝日型
export interface Holiday {
  date: string; // YYYY-MM-DD形式
  name: string;
}

// ページ種別
export type PageType = 'monthly' | 'daily' | 'all-employees' | 'equipment';

// ナビゲーション情報
export interface NavigationState {
  currentPage: PageType;
  selectedDate: Date;
  selectedDepartment?: Department;
  selectedEmployee?: Employee;
  selectedEquipment?: Equipment;
}