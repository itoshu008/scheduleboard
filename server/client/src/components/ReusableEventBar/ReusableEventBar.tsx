import React, { useState, useEffect, useRef } from 'react';
import { Schedule } from '../../types';
import { formatTime, getTimeSlot, getEndTimeSlot } from '../../utils/dateUtils';
import { lightenColor, safeHexColor } from '../../utils/color';

interface ReusableEventBarProps {
  schedule: Schedule;
  isSelected: boolean;
  isResizing: boolean;
  resizeGhost: {
    schedule: Schedule;
    newStart: Date;
    newEnd: Date;
    edge: 'start' | 'end';
  } | null;
  scaledCellWidth: number;
  slot: number;
  originalStartSlot: number;
  onMouseDown: (schedule: Schedule, e: React.MouseEvent) => void;
  onDoubleClick: (schedule: Schedule, e: React.MouseEvent) => void;
  onContextMenu: (schedule: Schedule, e: React.MouseEvent) => void;
  onResizeMouseDown: (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => void;
}

const ReusableEventBar: React.FC<ReusableEventBarProps> = ({
  schedule,
  isSelected,
  isResizing,
  resizeGhost,
  scaledCellWidth,
  slot,
  originalStartSlot,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onResizeMouseDown
}) => {
  // 時間計算
  let startTime = new Date(schedule.start_datetime);
  let endTime = new Date(schedule.end_datetime);
  
  if (isResizing && resizeGhost && resizeGhost.schedule.id === schedule.id) {
    startTime = resizeGhost.newStart;
    endTime = resizeGhost.newEnd;
  }
  
  const startSlot = getTimeSlot(startTime);
  const endSlot = getEndTimeSlot(endTime);
  const width = (endSlot - startSlot) * scaledCellWidth;
  
  // 位置計算
  const scheduleStartSlot = getTimeSlot(startTime);
  const cellStartSlot = slot;
  const slotOffset = scheduleStartSlot - cellStartSlot;
  
  // 左ハンドルリサイズ時は新しい開始位置を使用
  let leftOffset = slotOffset * scaledCellWidth;
  if (isResizing && resizeGhost && resizeGhost.schedule.id === schedule.id) {
    if (resizeGhost.edge === 'start') {
      // 左ハンドルリサイズ時：新しい開始時刻の位置を計算
      const newStartSlot = getTimeSlot(resizeGhost.newStart);
      leftOffset = (newStartSlot - cellStartSlot) * scaledCellWidth;
    } else {
      // 右ハンドルリサイズ時：元の位置を維持
      leftOffset = slotOffset * scaledCellWidth;
    }
  }

  // 開始スロットでない場合は表示しない
  if (originalStartSlot !== slot) return null;

  return (
    <div
      key={schedule.id}
      className={`schedule-item ${isSelected ? 'selected' : ''}`}
      style={{
        background: `linear-gradient(180deg, ${lightenColor(safeHexColor(schedule.color), 25)} 0%, ${safeHexColor(schedule.color)} 100%)`,
        border: `1px solid ${lightenColor(safeHexColor(schedule.color), -10)}`,
        width: `${width}px`,
        left: `${leftOffset}px`,
        position: 'absolute',
        height: '100%',
        borderRadius: 4,
        padding: '2px 4px',
        fontSize: 11,
        color: 'white',
        overflow: 'hidden',
        cursor: 'pointer',
        zIndex: isSelected ? 1100 : 1000
      }}
      onMouseDown={(e) => onMouseDown(schedule, e)}
      onDoubleClick={(e) => onDoubleClick(schedule, e)}
      onContextMenu={(e) => onContextMenu(schedule, e)}
      title={`${schedule.title}\n${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`}
    >
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        width: '100%', 
        height: '100%', 
        textAlign: 'center', 
        color: 'white' 
      }}>
        <div className="schedule-title" style={{ fontWeight: 700, color: 'white' }}>
          {schedule.title || '無題'}
        </div>
        <div className="schedule-time" style={{ fontSize: 10, opacity: 0.9, color: 'white' }}>
          {`${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`}
        </div>
      </div>
      
      {/* 改良されたリサイズハンドル */}
      <div
        className="resize-handle resize-start"
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeMouseDown(schedule, 'start', e);
        }}
        style={{ 
          position: 'absolute', 
          left: -2, 
          top: 0, 
          width: 8, 
          height: '100%', 
          cursor: 'ew-resize', 
          zIndex: 1200,
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '2px 0 0 2px',
          transition: 'all 0.2s ease',
          opacity: isSelected ? 1 : 0
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
          e.currentTarget.style.opacity = isSelected ? '1' : '0';
        }}
      />
      <div
        className="resize-handle resize-end"
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeMouseDown(schedule, 'end', e);
        }}
        style={{ 
          position: 'absolute', 
          right: -2, 
          top: 0, 
          width: 8, 
          height: '100%', 
          cursor: 'ew-resize', 
          zIndex: 1200,
          backgroundColor: 'rgba(255, 255, 255, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '0 2px 2px 0',
          transition: 'all 0.2s ease',
          opacity: isSelected ? 1 : 0
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
          e.currentTarget.style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
          e.currentTarget.style.opacity = isSelected ? '1' : '0';
        }}
      />
    </div>
  );
};

export default ReusableEventBar;
