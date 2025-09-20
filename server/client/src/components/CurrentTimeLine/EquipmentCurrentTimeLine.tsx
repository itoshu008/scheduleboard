import React, { useState, useEffect } from 'react';
import './CurrentTimeLine.css';
import { isCurrentTimeInDate } from '../../utils/dateUtils';

interface EquipmentCurrentTimeLineProps {
  selectedDate: Date;
  equipment: { id: number; name: string }[];
  gridContainerRef: React.RefObject<HTMLElement>;
  startHour?: number;
  endHour?: number;
}

const EquipmentCurrentTimeLine: React.FC<EquipmentCurrentTimeLineProps> = ({
  selectedDate,
  equipment,
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
  const equipmentColumnWidth = 150; // 設備列の幅（CSS: equipment-column width: 150px）
  const slotWidth = 20; // 各スロットの幅（CSS: grid-template-columns: 150px repeat(96, 20px)）
  const minutesInSlot = currentMinutes % 15; // 15分以内の分数
  const subSlotOffset = (minutesInSlot / 15) * slotWidth; // 15分以内のオフセット
  
  // 最終的な左位置
  const leftPosition = equipmentColumnWidth + (timeSlot * slotWidth) + subSlotOffset;

  return (
    <>
      {/* 各設備の行に現在時刻の赤い線を表示 */}
      {equipment.map((equip, index) => {
        // 設備の行の位置を計算（3マス上に移動）
        const equipmentRowTop = 156 + (index * 40) - 114 - 120; // 3マス（120px）上に移動
        const equipmentRowHeight = 40;

        return (
          <div
            key={`equipment-timeline-${equip.id}`}
            className="equipment-current-time-line"
            style={{
              position: 'absolute',
              left: `${leftPosition}px`,
              top: `${equipmentRowTop}px`,
              width: '2px',
              height: `${equipmentRowHeight - 1}px`,
              backgroundColor: '#ff0000', // 全社員と同じ赤色
              pointerEvents: 'none',
              boxShadow: '0 0 4px rgba(255, 0, 0, 0.6)', // 全社員と同じ影
              borderRadius: '1px',
              opacity: 1 // 全社員と同じ透明度
            }}
          />
        );
      })}
    </>
  );
};

export default EquipmentCurrentTimeLine;
