import React from 'react';
import { Schedule } from '../../types';
import { safeHexColor, lightenColor } from '../../utils/color';
import { getTimeSlot, getEndTimeSlot, formatTime, parseLocalDateTimeString } from '../../utils/dateUtils';

interface UniversalEventBarProps {
  schedule: Schedule;
  isSelected: boolean;
  isResizing?: boolean;
  resizeData?: any;
  scaledCellWidth: number;
  scheduleScale: number;
  onMouseDown: (schedule: Schedule, e: React.MouseEvent) => void;
  onDoubleClick: (schedule: Schedule, e: React.MouseEvent) => void;
  onContextMenu: (schedule: Schedule, e: React.MouseEvent) => void;
  onResizeMouseDown: (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => void;
  // 位置計算用のプロパティ
  startSlot: number;
  width: number;
  left: number;
  top?: number; // 縦位置（オプション）
  height?: number; // 高さ（オプション、デフォルト36px）
}

const UniversalEventBar: React.FC<UniversalEventBarProps> = ({
  schedule,
  isSelected,
  isResizing,
  resizeData,
  scaledCellWidth,
  scheduleScale,
  onMouseDown,
  onDoubleClick,
  onContextMenu,
  onResizeMouseDown,
  startSlot,
  width,
  left,
  top = 2,
  height = 36
}) => {
  console.log(`🎨 UniversalEventBar rendering:`, {
    scheduleId: schedule.id,
    title: schedule.title,
    color: schedule.color,
    position: { left, top, width, height },
    isSelected,
    isResizing,
    finalStyle: {
      position: 'absolute',
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backgroundColor: schedule.color
    }
  });
  
  return (
    <div
      key={`universal-event-bar-${schedule.id}`}
      className={`schedule-item ${isSelected ? 'selected' : ''}`}
      style={{
        background: isResizing && resizeData?.schedule.id === schedule.id
          ? `linear-gradient(180deg, ${lightenColor(safeHexColor(schedule.color || '#3498db'), 0.25)} 0%, ${lightenColor(safeHexColor(schedule.color || '#3498db'), 0.05)} 100%)`
          : `linear-gradient(180deg, ${lightenColor(safeHexColor(schedule.color || '#3498db'), 0.15)} 0%, ${safeHexColor(schedule.color || '#3498db')} 100%)`,
        border: `1px solid ${lightenColor(safeHexColor(schedule.color || '#3498db'), -0.10)}`,
        width: `${Math.max(width, 50)}px`, // 最小幅を50pxに設定
        left: `${left}px`,
        position: 'absolute',
        height: `${Math.max(height, 30)}px`, // 最小高さを30pxに設定
        top: `${top}px`,
        borderRadius: 4,
        padding: '2px 4px',
        fontSize: 11,
        color: 'white',
        overflow: 'hidden',
        cursor: isResizing && resizeData?.schedule.id === schedule.id ? 'ew-resize' : 'pointer',
        zIndex: isResizing && resizeData?.schedule.id === schedule.id ? 20000 : 1000,
        pointerEvents: 'auto',
        transform: isResizing && resizeData?.schedule.id === schedule.id ? 'scale(1.02)' : 'scale(1)',
        transition: isResizing && resizeData?.schedule.id === schedule.id ? 'none' : 'all 0.2s ease',
        boxShadow: isResizing && resizeData?.schedule.id === schedule.id 
          ? '0 4px 12px rgba(0, 0, 0, 0.4)'
          : '0 2px 4px rgba(0, 0, 0, 0.2)'
      }}
      onMouseDown={(e) => {
        console.log('🎯 UniversalEventBar クリック:', schedule.id, schedule.title);
        
        // リサイズ中は選択を無効化
        if (isResizing || resizeData) {
          console.log('🚫 リサイズ中のため選択を無効化');
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        onMouseDown(schedule, e);
      }}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDoubleClick(schedule, e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(schedule, e);
      }}
      title={`${schedule.title}\n${formatTime(parseLocalDateTimeString(schedule.start_datetime.replace('Z', '').replace('T', ' ')))} - ${formatTime(parseLocalDateTimeString(schedule.end_datetime.replace('Z', '').replace('T', ' ')))}`}
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
          {`${formatTime(parseLocalDateTimeString(schedule.start_datetime.replace('Z', '').replace('T', ' ')))} - ${formatTime(parseLocalDateTimeString(schedule.end_datetime.replace('Z', '').replace('T', ' ')))}`}
        </div>
      </div>
      
      {/* 左リサイズハンドル */}
      <div
        className="resize-handle resize-start"
        onMouseDown={(e) => {
          console.log('🔧 左リサイズハンドル クリック:', schedule.id);
          e.preventDefault();
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
          zIndex: 10001,
          pointerEvents: 'auto',
          backgroundColor: '#c62828', // 開始時刻ハンドル=赤
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '2px 0 0 2px',
          transition: 'all 0.2s ease',
          opacity: isSelected ? 0.9 : 0,
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white',
          fontWeight: 'bold',
          transform: 'scaleX(1)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'scaleX(1.2)';
          e.currentTarget.style.backgroundColor = '#d32f2f'; // ホバー時は少し明るい赤
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = isSelected ? '0.9' : '0';
          e.currentTarget.style.transform = 'scaleX(1)';
          e.currentTarget.style.backgroundColor = '#c62828';
        }}
        title="開始時刻をリサイズ"
      >
        ◀
      </div>
      
      {/* 右リサイズハンドル */}
      <div
        className="resize-handle resize-end"
        onMouseDown={(e) => {
          console.log('🔧 右リサイズハンドル クリック:', schedule.id);
          e.preventDefault();
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
          zIndex: 10001,
          pointerEvents: 'auto',
          backgroundColor: '#2e7d32', // 終了時刻ハンドル=緑
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '0 2px 2px 0',
          transition: 'all 0.2s ease',
          opacity: isSelected ? 0.9 : 0,
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          color: 'white',
          fontWeight: 'bold',
          transform: 'scaleX(1)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'scaleX(1.2)';
          e.currentTarget.style.backgroundColor = '#388e3c'; // ホバー時は少し明るい緑
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = isSelected ? '0.9' : '0';
          e.currentTarget.style.transform = 'scaleX(1)';
          e.currentTarget.style.backgroundColor = '#2e7d32';
        }}
        title="終了時刻をリサイズ"
      >
        ▶
      </div>
    </div>
  );
};

export default UniversalEventBar;
