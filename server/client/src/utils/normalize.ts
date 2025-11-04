import { toLocalYMD } from './date';

export const normalizeSchedule = (r: any) => {
  const start = new Date(r.start_datetime);
  const end   = new Date(r.end_datetime);
  return { ...r, _start: start, _end: end, _dayKey: toLocalYMD(start) };
};
