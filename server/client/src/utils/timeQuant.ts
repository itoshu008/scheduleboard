export type TimeEvent = {
  id: number;
  title?: string;
  color?: string | null;
  start?: string;
  end?: string;
  start_datetime?: string;
  end_datetime?: string;
  employee_id?: number | null;
  equipment_id?: number | null;
  group_id?: number | null;
  updated_at?: string | null;
  created_at?: string;
};

// イベントを正規化（参照安定のため）
export const normalizeEvent = (e: TimeEvent): TimeEvent => ({
  id: e.id,
  title: e.title || '',
  color: e.color || '#3498db',
  start: e.start || e.start_datetime || '',
  end: e.end || e.end_datetime || '',
  start_datetime: e.start_datetime || e.start || '',
  end_datetime: e.end_datetime || e.end || '',
  employee_id: e.employee_id || null,
  equipment_id: e.equipment_id || null,
  group_id: e.group_id || null,
  updated_at: e.updated_at || null,
  created_at: e.created_at || ''
});

// イベントの内容署名を作成
export const eventSig = (e: TimeEvent): string => {
  const start = e.start || e.start_datetime || '';
  const end = e.end || e.end_datetime || '';
  return `${e.id}|${start}|${end}|${e.title || ''}|${e.color || ''}|${e.employee_id || ''}|${e.equipment_id || ''}|${e.group_id || ''}|${e.updated_at || ''}|${e.created_at || ''}`;
};

// 時間が近いかチェック（15分以内）
export const isCloseTime = (time1: string, time2: string): boolean => {
  const d1 = new Date(time1);
  const d2 = new Date(time2);
  return Math.abs(d1.getTime() - d2.getTime()) <= 15 * 60 * 1000; // 15分
};
