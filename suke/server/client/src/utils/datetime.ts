export const dayRangeLocal = (yyyyMmDd: string) => {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
};

export const toServerISO = (d: Date) => {
  return new Date(d).toISOString();
};

export const overlaps = (ev: { start_datetime: string; end_datetime: string }, start: Date, end: Date) =>
  new Date(ev.start_datetime) < end && new Date(ev.end_datetime) > start;



