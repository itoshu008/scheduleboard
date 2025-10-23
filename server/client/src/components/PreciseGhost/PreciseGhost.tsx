import React from 'react';
import { DragGhost, ResizeGhost } from '../../utils/dragUtils';
import { Schedule } from '../../types';

interface PreciseGhostProps {
  dragGhost?: DragGhost | null;
  resizeGhost?: ResizeGhost | null;
  mousePosition: { x: number; y: number } | null;
  cellWidth: number;
  rowHeight: number;
  scheduleScale: number;
}

const PreciseGhost: React.FC<PreciseGhostProps> = ({
  dragGhost,
  resizeGhost,
  mousePosition,
  cellWidth,
  rowHeight,
  scheduleScale
}) => {
  if (!mousePosition) return null;

  const scaledCellWidth = cellWidth * (scheduleScale / 100);
  const scaledRowHeight = rowHeight * (scheduleScale / 100);

  // ドラッグゴーストの描画
  if (dragGhost) {
    const width = (timeToSlot(dragGhost.newEnd) - timeToSlot(dragGhost.newStart)) * scaledCellWidth;
    const left = timeToSlot(dragGhost.newStart) * scaledCellWidth;
    
    return (
      <div
        className="precise-drag-ghost"
        style={{
          position: 'fixed',
          left: mousePosition.x - 50,
          top: mousePosition.y - 20,
          width: Math.max(width, 60),
          height: 40,
          background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.2) 0%, rgba(33, 150, 243, 0.4) 100%)',
          border: '2px dashed #2196f3',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(33, 150, 243, 0.3)',
          zIndex: 1000,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#2196f3',
          fontWeight: 'bold',
          fontSize: '12px',
          textAlign: 'center',
          padding: '4px 8px'
        }}
      >
        <div>
          <div>{dragGhost.schedule.title || '無題'}</div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>
            {formatTime(dragGhost.newStart)} - {formatTime(dragGhost.newEnd)}
          </div>
        </div>
      </div>
    );
  }

  // リサイズゴーストの描画
  if (resizeGhost) {
    const width = (timeToSlot(resizeGhost.newEnd) - timeToSlot(resizeGhost.newStart)) * scaledCellWidth;
    const left = timeToSlot(resizeGhost.newStart) * scaledCellWidth;
    
    return (
      <div
        className="precise-resize-ghost"
        style={{
          position: 'fixed',
          left: mousePosition.x - 50,
          top: mousePosition.y - 20,
          width: Math.max(width, 60),
          height: 40,
          background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(255, 152, 0, 0.4) 100%)',
          border: '2px dashed #ff9800',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(255, 152, 0, 0.3)',
          zIndex: 1000,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff9800',
          fontWeight: 'bold',
          fontSize: '12px',
          textAlign: 'center',
          padding: '4px 8px'
        }}
      >
        <div>
          <div>{resizeGhost.schedule.title || '無題'}</div>
          <div style={{ fontSize: '10px', opacity: 0.8 }}>
            {formatTime(resizeGhost.newStart)} - {formatTime(resizeGhost.newEnd)}
          </div>
        </div>
      </div>
    );
  }

  return null;
};

// 時刻フォーマット関数
const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

// スロット計算関数（簡易版）
const timeToSlot = (date: Date): number => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours * 60 + minutes;
};

export default PreciseGhost;
