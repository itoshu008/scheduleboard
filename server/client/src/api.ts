// src/api/api.ts
import axios from "axios";

const baseURL = "http://localhost:4001/api"; // 強制的にローカル開発サーバーに固定

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

// baseURLをエクスポート（既存コードとの互換性のため）
export const API_BASE = baseURL;

// 共通型
export type CreateReservationPayload = {
  equipment_id: number;
  employee_id: number;
  title: string;
  purpose?: string;
  start_datetime: string; // TZ付き
  end_datetime: string;   // TZ付き
  color?: string | null;
};

export type UpdateReservationPayload = Partial<CreateReservationPayload>;

// タイムゾーン付きISO文字列変換ユーティリティ
const pad = (n: number) => String(n).padStart(2, "0");
export const toOffsetISOString = (d: Date) => {
  const tz = -d.getTimezoneOffset(); // 分
  const sign = tz >= 0 ? "+" : "-";
  const hh = pad(Math.trunc(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hh}:${mm}`;
};

// エンドポイント群
export const getDepartments = () => api.get("/departments");
export const getEmployees = () => api.get("/employees");
export const getEquipment = () => api.get("/equipment");
export const getSchedules = (params?: Record<string, string>) =>
  api.get("/schedules", { params });

// 予約
export const createEquipmentReservation = (body: CreateReservationPayload) =>
  api.post("/equipment-reservations", body);

export const updateEquipmentReservation = (
  id: number,
  body: UpdateReservationPayload
) => api.put(`/equipment-reservations/${id}`, body);

// 既存の互換性のためのエクスポート
export const Health = { get: () => api.get('/health').then(r => r.data) };
export const Departments = { getAll: () => api.get('/departments').then(r => r.data) };
export const Employees = { getAll: () => api.get('/employees').then(r => r.data) };
export const Equipment = { getAll: () => api.get('/equipment').then(r => r.data) };
export const Schedules = {
  getAll: (params?: any) => api.get('/schedules', { params }).then(r => r.data),
  getDailyAll: (date: string) => api.get('/schedules/daily-all', { params: { date } }).then(r => r.data),
};
export const EquipmentReservations = {
  getAll: (params: { start_date: string; end_date: string; equipment_id?: number }) =>
    api.get('/equipment-reservations', { params }).then(r => r.data),
};

// 既存apiクライアントにこれを追加（URLは既存に合わせる）
export async function createEvent(payload: any) {
  const res = await api.post('/equipment-reservations', payload); // 設備予約用
  return res.data; // created event object (id含む)
}

// スケジュール作成用の変換関数
export async function createSchedule(input: {
  employee_id: number;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  color?: string;
  participants?: { employee_id: number }[];
  equipment_ids?: number[];
}) {
  const body = {
    employee_id: input.employee_id,
    title: input.title,
    description: input.description ?? '',
    start_datetime: toOffsetISOString(input.start),
    end_datetime: toOffsetISOString(input.end),
    color: input.color ?? '#3498db',
    participants: input.participants ?? [],
    equipment_ids: input.equipment_ids ?? [],
  };

  return api.post('/schedules', body);
}

// スケジュール更新用の変換関数
export async function updateSchedule(id: number, input: {
  employee_id?: number;
  title?: string;
  description?: string;
  start?: Date;
  end?: Date;
  color?: string;
  participants?: { employee_id: number }[];
  equipment_ids?: number[];
}) {
  const body: any = {};
  
  if (input.employee_id !== undefined) body.employee_id = input.employee_id;
  if (input.title !== undefined) body.title = input.title;
  if (input.description !== undefined) body.description = input.description;
  if (input.start !== undefined) body.start_datetime = toOffsetISOString(input.start);
  if (input.end !== undefined) body.end_datetime = toOffsetISOString(input.end);
  if (input.color !== undefined) body.color = input.color;
  if (input.participants !== undefined) body.participants = input.participants;
  if (input.equipment_ids !== undefined) body.equipment_ids = input.equipment_ids;

  return api.put(`/schedules/${id}`, body);
}