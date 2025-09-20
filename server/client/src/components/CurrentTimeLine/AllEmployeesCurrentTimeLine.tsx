import React, { useState, useEffect } from 'react';
import './CurrentTimeLine.css';
import { isCurrentTimeInDate } from '../../utils/dateUtils';

interface AllEmployeesCurrentTimeLineProps {
  selectedDate: Date;
  employees: { id: number; name: string }[];
  gridContainerRef: React.RefObject<HTMLElement>;
  startHour?: number;
  endHour?: number;
}

const AllEmployeesCurrentTimeLine: React.FC<AllEmployeesCurrentTimeLineProps> = ({
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
  
  // 位置の計算
  const employeeColumnWidth = 150; // 社員列の幅
  const slotWidth = 20; // 各スロットの幅（AllEmployeesScheduleも20px）
  const minutesInSlot = currentMinutes % 15; // 15分以内の分数
  const subSlotOffset = (minutesInSlot / 15) * slotWidth; // 15分以内のオフセット
  
  // 最終的な左位置
  const leftPosition = employeeColumnWidth + (timeSlot * slotWidth) + subSlotOffset;

  return (
    <>
      {/* 各社員の行に現在時刻の赤い線を表示 */}
      {employees.map((employee, index) => {
        // 社員の行の位置を計算（最終調整値: -114px）
        const employeeRowTop = 156 + (index * 40) - 114; // 156pxから始めて、各社員を40px間隔で配置、114px上に移動
        const employeeRowHeight = 40;

        return (
          <div
            key={`all-employees-timeline-${employee.id}`}
            className="all-employees-current-time-line"
            style={{
              position: 'absolute',
              left: `${leftPosition}px`,
              top: `${employeeRowTop}px`,
              width: '2px',
              height: `${employeeRowHeight - 1}px`,
              backgroundColor: '#ff4444', // 少し明るい赤
              pointerEvents: 'none',
              boxShadow: '0 0 3px rgba(255, 68, 68, 0.7)',
              borderRadius: '1px',
              opacity: 0.8
            }}
          />
        );
      })}
    </>
  );
};

export default AllEmployeesCurrentTimeLine;
