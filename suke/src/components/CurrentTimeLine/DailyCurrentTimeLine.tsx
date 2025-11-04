import React, { useState, useEffect } from 'react';
import './CurrentTimeLine.css';
import { isCurrentTimeInDate } from '../../utils/dateUtils';

interface DailyCurrentTimeLineProps {
  selectedDate: Date;
  employees: { id: number; name: string }[];
  gridContainerRef: React.RefObject<HTMLElement>;
  startHour?: number;
  endHour?: number;
  // Optional: override the vertical row index for positioning the line
  rowIndexOverride?: number;
  // Optional: override vertical layout for different grids (e.g., monthly)
  rowTopBasePx?: number; // top offset for the first row
  rowHeightPx?: number; // each row height
  // スケール対応
  scale?: number;
  employeeColumnWidth?: number;
  slotWidth?: number;
}

const DailyCurrentTimeLine: React.FC<DailyCurrentTimeLineProps> = ({
  selectedDate,
  employees,
  gridContainerRef,
  startHour = 8,
  endHour = 20,
  rowIndexOverride,
  rowTopBasePx = 42,
  rowHeightPx = 40,
  scale = 1.0,
  employeeColumnWidth = 120,
  slotWidth = 20
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

  // 今日かどうかチェック
  const isToday = isCurrentTimeInDate(selectedDate);

  if (!isToday) {
    return null;
  }

  // 現在時刻の取得
  const now = currentTime;
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();

  // 時間スロットの計算（96スロット = 24時間 × 4）
  const timeSlot = currentHour * 4 + Math.floor(currentMinutes / 15);
  
  // 位置の計算（スケール対応）
  const scaledEmployeeColumnWidth = Math.round(employeeColumnWidth * scale);
  const scaledSlotWidth = Math.round(slotWidth * scale);
  const minutesInSlot = currentMinutes % 15; // 15分以内の分数
  const subSlotOffset = (minutesInSlot / 15) * scaledSlotWidth; // 15分以内のオフセット
  
  // 最終的な左位置
  const leftPosition = scaledEmployeeColumnWidth + (timeSlot * scaledSlotWidth) + subSlotOffset;



  return (
    <>


      {/* 各社員の行に現在時刻の赤い線を表示 */}
      {employees.map((employee, index) => {
        // 社員の行の位置を計算（スケール対応）
        const rowIndex = typeof rowIndexOverride === 'number' ? rowIndexOverride : index;
        // rowTopBasePxとrowHeightPxは既にスケール済みの値として受け取る
        const employeeRowTop = rowTopBasePx + (rowIndex * rowHeightPx);
        const employeeRowHeight = rowHeightPx;



        return (
          <div
            key={`timeline-${employee.id}`}
            style={{
              position: 'absolute',
              left: `${leftPosition}px`,
              top: `${employeeRowTop}px`,
              width: `${Math.max(2, Math.round(2 * scale))}px`,
              height: `${employeeRowHeight - Math.round(1 * scale)}px`,
              backgroundColor: '#ff0000', // 赤い線
              zIndex: 1000,
              pointerEvents: 'none',
              boxShadow: `0 0 ${Math.round(4 * scale)}px rgba(255, 0, 0, 0.6)`,
              borderRadius: `${Math.round(1 * scale)}px`
            }}
          />
        );
      })}
    </>
  );
};

export default DailyCurrentTimeLine;