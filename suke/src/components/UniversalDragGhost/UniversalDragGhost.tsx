import React from 'react';
import { Schedule } from '../../types';
import { safeHexColor, lightenColor } from '../../utils/color';
import { getTimeFromSlot } from '../../utils/dateUtils';
import { CELL_WIDTH_PX } from '../../utils/uiConstants';

interface UniversalDragGhostProps {
  dragData: any;
  dragGhost: any;
  mousePosition: { x: number; y: number };
  scheduleScale: number;
  scheduleType?: 'daily' | 'allEmployees' | 'equipment';
  // 追加情報表示用
  employees?: Array<{ id: number; name: string }>;
  equipments?: Array<{ id: number; name: string }>;
  getEmployeeIdFromDelta?: (originalEmployeeId: number, delta: number) => number;
  getEquipmentIdFromDelta?: (originalEquipmentId: number, delta: number) => number;
}

const UniversalDragGhost: React.FC<UniversalDragGhostProps> = ({
  dragData,
  dragGhost,
  mousePosition,
  scheduleScale,
  scheduleType = 'daily',
  employees,
  equipments,
  getEmployeeIdFromDelta,
  getEquipmentIdFromDelta
}) => {
  if (!dragData || !dragGhost) return null;

  // 幅の計算
  const originalStart = new Date(dragData.schedule.start_datetime);
  const originalEnd = new Date(dragData.schedule.end_datetime);
  const originalDuration = originalEnd.getTime() - originalStart.getTime();
  const durationInSlots = Math.ceil(originalDuration / (15 * 60 * 1000)); // 15分単位
  const width = durationInSlots * CELL_WIDTH_PX * scheduleScale;

  // 新しい時間の計算
  const { hour, minute } = getTimeFromSlot(dragGhost.newSlot);
  const newStart = new Date(originalStart);
  newStart.setHours(hour, minute, 0, 0);
  const newEnd = new Date(newStart.getTime() + originalDuration);

  // 移動先の名前を取得
  let targetName = '';
  if (scheduleType === 'daily' || scheduleType === 'allEmployees') {
    if (dragGhost.newEmployeeDelta !== 0 && getEmployeeIdFromDelta && employees) {
      const newEmployeeId = getEmployeeIdFromDelta(dragData.originalEmployeeId, dragGhost.newEmployeeDelta);
      const newEmployee = employees.find(emp => emp.id === newEmployeeId);
      targetName = newEmployee?.name || '不明';
    }
  } else if (scheduleType === 'equipment') {
    if (dragGhost.newEquipmentDelta !== 0 && getEquipmentIdFromDelta && equipments && dragData.originalEquipmentId) {
      const newEquipmentId = getEquipmentIdFromDelta(dragData.originalEquipmentId, dragGhost.newEquipmentDelta);
      const newEquipment = equipments.find(eq => eq.id === newEquipmentId);
      targetName = newEquipment?.name || '不明';
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: `${mousePosition.x - 50}px`,
        top: `${mousePosition.y - 18}px`,
        width: `${width}px`,
        height: '36px',
        background: `linear-gradient(180deg, ${lightenColor(safeHexColor(dragData.schedule.color), 25)} 0%, ${safeHexColor(dragData.schedule.color)} 100%)`,
        border: `2px solid ${lightenColor(safeHexColor(dragData.schedule.color), -10)}`,
        borderRadius: '4px',
        padding: '2px 4px',
        fontSize: '11px',
        color: 'white',
        overflow: 'hidden',
        pointerEvents: 'none',
        zIndex: 100000,
        opacity: 0.8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
      }}
    >
      <div style={{ fontWeight: 700, color: 'white' }}>
        {dragData.schedule.title || '無題'}
      </div>
      <div style={{ fontSize: 10, opacity: 0.9, color: 'white' }}>
        {newStart.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - {newEnd.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
      </div>
      {targetName && (
        <div style={{ fontSize: 9, opacity: 0.8, color: 'white' }}>
          {scheduleType === 'equipment' ? '🔧' : '👤'} {targetName}
        </div>
      )}
    </div>
  );
};

export default UniversalDragGhost;
