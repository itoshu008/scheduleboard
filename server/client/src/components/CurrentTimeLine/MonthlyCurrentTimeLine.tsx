import React, { useState, useEffect } from 'react';
import './CurrentTimeLine.css';
import { isCurrentTimeInDate, getTimeSlot } from '../../utils/dateUtils';
import { CELL_WIDTH_PX, MONTH_CELL_HEIGHT_PX } from '../../utils/uiConstants';

// 月別スケジュール用の日付配列を生成する関数
const getMonthDates = (date: Date): Date[] => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const dates: Date[] = [];
  const currentDate = new Date(firstDay);
  
  while (currentDate <= lastDay) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
};

interface MonthlyCurrentTimeLineProps {
  selectedDate: Date;
  employees: { id: number; name: string }[];
  gridContainerRef: React.RefObject<HTMLElement>;
  startHour?: number;
  endHour?: number;
}

const MonthlyCurrentTimeLine: React.FC<MonthlyCurrentTimeLineProps> = ({
  selectedDate,
  employees,
  gridContainerRef,
  startHour = 0,
  endHour = 23
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentTime(new Date());
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 60000); // 1分ごとに更新

    return () => clearInterval(interval);
  }, []);

  // 月別スケジュールの日付配列を取得
  const monthDates = getMonthDates(selectedDate);
  
  // 今日の日付が月別スケジュールに含まれているかチェック
  const today = new Date();
  const todayIndex = monthDates.findIndex(date => 
    date.getDate() === today.getDate() && 
    date.getMonth() === today.getMonth() && 
    date.getFullYear() === today.getFullYear()
  );
  
  // デバッグ情報（コメントアウト）
  // console.log('MonthlyCurrentTimeLine Debug - Date Check:', {
  //   selectedMonth: selectedDate.getMonth(),
  //   selectedYear: selectedDate.getFullYear(),
  //   todayMonth: today.getMonth(),
  //   todayYear: today.getFullYear(),
  //   todayIndex,
  //   monthDatesLength: monthDates.length,
  //   today: today.toDateString()
  // });
  
  // 開発中は常に表示（今日が選択された月にない場合でも）
  const forceShow = true;
  
  if (todayIndex === -1 && !forceShow) {
    console.log('MonthlyCurrentTimeLine: Today is not in selected month, hiding line');
    return null;
  }

  // 現在時刻の取得とスロット計算
  const now = currentTime;
  const timeSlot = getTimeSlot(now);
  
  // 位置の計算（月別スケジュールのdata-cell-leftと全く同じ計算方法）
  const currentMinutes = now.getMinutes();
  const minutesInSlot = currentMinutes % 15; // 15分以内の分数
  const subSlotOffset = (minutesInSlot / 15) * CELL_WIDTH_PX; // 15分以内のオフセット
  
  // 月別スケジュールと同じ計算: data-cell-left={120 + slot * CELL_WIDTH_PX}
  const leftPosition = 120 + (timeSlot * CELL_WIDTH_PX) + subSlotOffset;
  
  // デバッグ情報（コメントアウト）
  // console.log('MonthlyCurrentTimeLine Debug:', {
  //   currentTime: now.toLocaleTimeString(),
  //   timeSlot,
  //   todayIndex,
  //   leftPosition,
  //   subSlotOffset
  // });

  // 月別スケジュールでは1つのセルと同じ高さの線を表示
  const dayIndex = todayIndex === -1 ? 0 : todayIndex;
  // data-cell-topと同じ計算: 32 + dateIndex * MONTH_CELL_HEIGHT_PX + 7px下に移動
  const lineTop = 32 + (dayIndex * MONTH_CELL_HEIGHT_PX) + 7;
  const lineHeight = MONTH_CELL_HEIGHT_PX; // 1セル分の高さ

  return (
    <div
      className="monthly-current-time-line"
      style={{
        position: 'absolute',
        left: `${leftPosition}px`,
        top: `${lineTop}px`,
        width: '2px',
        height: `${lineHeight}px`,
        backgroundColor: '#ff4444', // 少し明るい赤
        pointerEvents: 'none',
        boxShadow: '0 0 3px rgba(255, 68, 68, 0.7)',
        borderRadius: '1px',
        opacity: 0.8
      }}
    />
  );
};

export default MonthlyCurrentTimeLine;
