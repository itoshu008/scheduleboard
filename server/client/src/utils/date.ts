export const toLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`; // ← ローカル日付
};

export const minutesBetween = (a: Date, b: Date) =>
  Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

export const slotIndexFromDate = (d: Date, slotMinutes: number) => {
  const mins = d.getHours() * 60 + d.getMinutes();
  return Math.floor(mins / slotMinutes);
};
