import React from 'react';
import { Schedule } from '../../types';

interface PreciseResizeHandleProps {
  schedule: Schedule;
  edge: 'start' | 'end';
  onMouseDown: (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => void;
  scheduleScale: number;
}

const PreciseResizeHandle: React.FC<PreciseResizeHandleProps> = ({
  schedule,
  edge,
  onMouseDown,
  scheduleScale
}) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMouseDown(schedule, edge, e);
  };

  const scaledWidth = 20 * (scheduleScale / 100);
  const scaledHeight = 40 * (scheduleScale / 100);

  return (
    <div
      className={`precise-resize-handle precise-resize-handle-${edge}`}
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        width: scaledWidth,
        height: '100%',
        cursor: 'ew-resize',
        zIndex: 20,
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.8) 100%)',
        border: `2px solid rgba(33, 150, 243, 0.8)`,
        borderRadius: 4,
        transition: 'all 0.15s ease',
        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#2196f3',
        fontSize: '10px',
        fontWeight: 'bold',
        opacity: 0.9
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(33, 150, 243, 0.8) 0%, rgba(33, 150, 243, 1) 100%)';
        e.currentTarget.style.borderColor = '#2196f3';
        e.currentTarget.style.transform = 'scaleY(1.1)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
        e.currentTarget.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.8) 100%)';
        e.currentTarget.style.borderColor = 'rgba(33, 150, 243, 0.8)';
        e.currentTarget.style.transform = 'scaleY(1)';
        e.currentTarget.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.opacity = '0.9';
      }}
    >
      {edge === 'start' ? '◀' : '▶'}
    </div>
  );
};

export default PreciseResizeHandle;
