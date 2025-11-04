import React, { memo } from 'react';
import { Schedule, Employee } from '../../types';

interface ScheduleItemProps {
  schedule: Schedule;
  employees: Employee[];
  selectedSchedule: Schedule | null;
  showEditModal: boolean;
  isEventBarInteracting: boolean;
  isModalClosing: boolean;
  width: number;
  leftOffset: number;
  onMouseDown: (e: React.MouseEvent) => void;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onResizeMouseDown: (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => void;
  lightenColor: (color: string, amount: number) => string;
  formatTime: (date: Date) => string;
}

const ScheduleItem = memo<ScheduleItemProps>(({
  schedule,
  employees,
  selectedSchedule,
  showEditModal,
  isEventBarInteracting,
  isModalClosing,
  width,
  leftOffset,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onResizeMouseDown,
  lightenColor,
  formatTime
}) => {
  // レンダリング回数をカウント（デバッグ用）
  const renderKey = `schedule-${schedule.id}`;
  if ((window as any)[renderKey]) {
    (window as any)[renderKey]++;
  } else {
    (window as any)[renderKey] = 1;
  }
  
  // 過剰なレンダリングを検出（より厳格な条件）
  if ((window as any)[renderKey] > 20) {
    console.warn('⚠️ ScheduleItem: Excessive re-rendering detected!', {
      count: (window as any)[renderKey],
      scheduleId: schedule.id,
      title: schedule.title,
      showEditModal,
      isEventBarInteracting,
      isModalClosing
    });
  }

  return (
    <div
      key={`schedule-${schedule.id}`}
      className={`schedule-item ${selectedSchedule?.id === schedule.id ? 'selected' : ''}`}
      style={{
        background: `linear-gradient(180deg, ${lightenColor(schedule.color || '#3498db', 25)} 0%, ${schedule.color || '#3498db'} 100%)`,
        border: `1px solid ${lightenColor(schedule.color || '#3498db', -10)}`,
        width: `${width}px`,
        left: `${leftOffset}px`,
        position: 'absolute',
        height: '100%',
        borderRadius: 4,
        padding: '2px 4px',
        fontSize: 11,
        color: 'white',
        overflow: 'hidden',
        cursor: (showEditModal || isModalClosing) ? 'not-allowed' : 'pointer',
        zIndex: selectedSchedule?.id === schedule.id ? 1100 : 1000,
        opacity: (showEditModal || isModalClosing) ? 0.7 : 1
      }}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      title={(() => {
        const employee = employees.find(emp => emp.id === schedule.employee_id);
        const employeeName = employee ? `${employee.name}` : `社員ID: ${schedule.employee_id}`;
        const timeRange = `${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`;
        return `${schedule.title}\n担当者: ${employeeName}\n時間: ${timeRange}`;
      })()}
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
      
      {/* リサイズハンドル */}
      <div
        className="resize-handle resize-start"
        onMouseDown={(e) => {
          // 編集モーダルが開いている場合または閉じた後はリサイズを無効化
          if (showEditModal || isModalClosing) {
            console.log('🚫 ScheduleItem: Resize disabled - edit modal is open or closing', {
              showEditModal,
              isModalClosing,
              scheduleId: schedule.id,
              edge: 'start'
            });
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          // ダブルクリックイベントの伝播を防ぐ
          e.preventDefault();
          e.stopPropagation();
          console.log('🎯 ScheduleItem: Resize handle mouse down - setting interaction state');
          onResizeMouseDown(schedule, 'start', e);
        }}
        onMouseEnter={(e) => {
          if (!showEditModal && !isModalClosing) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
            e.currentTarget.style.opacity = '1';
          }
        }}
        onMouseLeave={(e) => {
          if (!showEditModal && !isModalClosing) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
            e.currentTarget.style.opacity = selectedSchedule?.id === schedule.id ? '1' : '0';
          }
        }}
        onDoubleClick={(e) => {
          // リサイズハンドルのダブルクリックは無効化
          console.log('🚫 ScheduleItem: Resize handle double-click disabled');
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{ 
          position: 'absolute', 
          left: -2, 
          top: 0, 
          width: 8, 
          height: '100%', 
          cursor: (showEditModal || isModalClosing) ? 'not-allowed' : 'ew-resize', 
          zIndex: 999,
          backgroundColor: (showEditModal || isModalClosing) ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.4)',
          border: (showEditModal || isModalClosing) ? '1px solid rgba(255, 0, 0, 0.6)' : '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '2px 0 0 2px',
          transition: 'all 0.2s ease',
          opacity: (showEditModal || isModalClosing) ? 0.5 : (selectedSchedule?.id === schedule.id ? 1 : 0)
        }}
      />
      <div
        className="resize-handle resize-end"
        onMouseDown={(e) => {
          // 編集モーダルが開いている場合または閉じた後はリサイズを無効化
          if (showEditModal || isModalClosing) {
            console.log('🚫 ScheduleItem: Resize disabled - edit modal is open or closing', {
              showEditModal,
              isModalClosing,
              scheduleId: schedule.id,
              edge: 'end'
            });
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          
          // ダブルクリックイベントの伝播を防ぐ
          e.preventDefault();
          e.stopPropagation();
          console.log('🎯 ScheduleItem: Resize handle mouse down - setting interaction state');
          onResizeMouseDown(schedule, 'end', e);
        }}
        onMouseEnter={(e) => {
          if (!showEditModal && !isModalClosing) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
            e.currentTarget.style.opacity = '1';
          }
        }}
        onMouseLeave={(e) => {
          if (!showEditModal && !isModalClosing) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
            e.currentTarget.style.opacity = selectedSchedule?.id === schedule.id ? '1' : '0';
          }
        }}
        onDoubleClick={(e) => {
          // リサイズハンドルのダブルクリックは無効化
          console.log('🚫 ScheduleItem: Resize handle double-click disabled');
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{ 
          position: 'absolute', 
          right: -2, 
          top: 0, 
          width: 8, 
          height: '100%', 
          cursor: (showEditModal || isModalClosing) ? 'not-allowed' : 'ew-resize', 
          zIndex: 999,
          backgroundColor: (showEditModal || isModalClosing) ? 'rgba(255, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.4)',
          border: (showEditModal || isModalClosing) ? '1px solid rgba(255, 0, 0, 0.6)' : '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '0 2px 2px 0',
          transition: 'all 0.2s ease',
          opacity: (showEditModal || isModalClosing) ? 0.5 : (selectedSchedule?.id === schedule.id ? 1 : 0)
        }}
      />
    </div>
  );
}, (prevProps, nextProps) => {
  // メモ化比較関数：重要なプロパティのみを比較
  return (
    prevProps.schedule.id === nextProps.schedule.id &&
    prevProps.schedule.title === nextProps.schedule.title &&
    prevProps.schedule.start_datetime === nextProps.schedule.start_datetime &&
    prevProps.schedule.end_datetime === nextProps.schedule.end_datetime &&
    prevProps.schedule.color === nextProps.schedule.color &&
    prevProps.selectedSchedule?.id === nextProps.selectedSchedule?.id &&
    prevProps.showEditModal === nextProps.showEditModal &&
    prevProps.isEventBarInteracting === nextProps.isEventBarInteracting &&
    prevProps.isModalClosing === nextProps.isModalClosing &&
    prevProps.width === nextProps.width &&
    prevProps.leftOffset === nextProps.leftOffset
  );
});

ScheduleItem.displayName = 'ScheduleItem';

export default ScheduleItem;
