import React, { useMemo, useState, useCallback } from 'react';
import './SimpleCalendar.css';

type Props = {
  value?: Date;
  onChange?: (date: Date) => void;
  startWeekOnMonday?: boolean;
};

const getStartOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const getEndOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const isSameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const addMonths = (date: Date, delta: number): Date => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + delta);
  return d;
};

const getMonthMatrix = (anchor: Date, startWeekOnMonday: boolean): Date[][] => {
  const first = getStartOfMonth(anchor);
  const last = getEndOfMonth(anchor);
  const firstWeekday = first.getDay(); // 0=Sun
  const offset = startWeekOnMonday ? (firstWeekday === 0 ? 6 : firstWeekday - 1) : firstWeekday;

  const days: Date[] = [];
  // days before first day to fill the first week
  for (let i = offset - 1; i >= 0; i--) {
    const d = new Date(first);
    d.setDate(first.getDate() - (i + 1 - 1)); // keep exact backward steps
  }
  // Ensure proper pre-fill
  for (let i = offset - 1; i >= 0; i--) {
    const d = new Date(first);
    d.setDate(first.getDate() - (i + 1));
    days.push(d);
  }
  // month days
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(anchor.getFullYear(), anchor.getMonth(), d));
  }
  // post-fill to complete weeks to 42 cells (6 rows)
  while (days.length % 7 !== 0) {
    const tail = days[days.length - 1];
    const next = new Date(tail);
    next.setDate(tail.getDate() + 1);
    days.push(next);
  }
  while (days.length < 42) {
    const tail = days[days.length - 1];
    const next = new Date(tail);
    next.setDate(tail.getDate() + 1);
    days.push(next);
  }
  // chunk by week
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
};

const weekdayLabels = (startMonday: boolean): string[] => {
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (startMonday) {
    return [...labels.slice(1), labels[0]];
  }
  return labels;
};

const SimpleCalendar: React.FC<Props> = ({ value, onChange, startWeekOnMonday = false }) => {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState<Date>(value ? new Date(value) : new Date());

  const matrix = useMemo(() => getMonthMatrix(viewDate, startWeekOnMonday), [viewDate, startWeekOnMonday]);
  const labels = useMemo(() => weekdayLabels(startWeekOnMonday), [startWeekOnMonday]);

  const handlePrev = useCallback(() => setViewDate(d => addMonths(d, -1)), []);
  const handleNext = useCallback(() => setViewDate(d => addMonths(d, 1)), []);
  const handleToday = useCallback(() => setViewDate(new Date()), []);

  const first = getStartOfMonth(viewDate);
  const isCurrentMonth = (d: Date) => d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();

  return (
    <div className="simple-calendar">
      <div className="sc-header">
        <button className="sc-nav" onClick={handlePrev} aria-label="Previous month">‹</button>
        <div className="sc-title">{first.getFullYear()}年 {first.getMonth() + 1}月</div>
        <button className="sc-nav" onClick={handleNext} aria-label="Next month">›</button>
        <button className="sc-today" onClick={handleToday}>今日</button>
      </div>
      <div className="sc-grid">
        {labels.map(l => (
          <div key={l} className="sc-cell sc-dow">{l}</div>
        ))}
        {matrix.flat().map((d, idx) => {
          const selected = value ? isSameDay(d, value) : false;
          const isToday = isSameDay(d, today);
          const inMonth = isCurrentMonth(d);
          return (
            <button
              key={idx}
              type="button"
              className={
                'sc-cell sc-day' +
                (inMonth ? '' : ' sc-out') +
                (selected ? ' sc-selected' : '') +
                (isToday ? ' sc-today-dot' : '')
              }
              onClick={() => onChange && onChange(new Date(d))}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SimpleCalendar;














