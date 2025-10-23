import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SmartEventBarProps<TId = number> {
  id: TId;
  startPx: number;
  widthPx: number;
  topPx?: number;
  laneIndex: number;
  laneHeight: number;
  maxTimelinePx: number;
  maxLaneIndex: number;
  snapSizeX: number;
  fontSize?: number;
  color: string;
  isSelected?: boolean;
  title?: string;
  subtitle?: string;
  // For positioning ghost relative to the grid container
  containerSelector: string;
  headerHeightPx: number;
  dateColumnWidthPx: number;

  // Commit callbacks (called on mouseup)
  onMoveCommit: (id: TId, newStartPx: number, newLaneIndex: number) => void;
  onResizeCommit: (id: TId, newWidthPx: number, newStartPx: number) => void;
}

type DragMode = 'idle' | 'move' | 'resize-start' | 'resize-end';

const HANDLE_WIDTH = 8;

function snapToGrid(value: number, grid: number): number {
  if (grid <= 1) return Math.round(value);
  return Math.round(value / grid) * grid;
}

const SmartEventBar: React.FC<SmartEventBarProps> = ({
  id,
  startPx,
  widthPx,
  topPx = 0,
  laneIndex,
  laneHeight,
  maxTimelinePx,
  maxLaneIndex,
  snapSizeX,
  fontSize = 11,
  color,
  isSelected,
  title,
  subtitle,
  containerSelector,
  headerHeightPx,
  dateColumnWidthPx,
  onMoveCommit,
  onResizeCommit
}) => {
  const [dragMode, setDragMode] = useState<DragMode>('idle');
  const [ghost, setGhost] = useState<{
    startPx: number;
    widthPx: number;
    laneIndex: number;
  } | null>(null);
  const originRef = useRef<{ x: number; y: number; startPx: number; widthPx: number; laneIndex: number } | null>(null);

  const containerRect = useRef<DOMRect | null>(null);
  const getContainerRect = () => {
    if (!containerRect.current) {
      const el = document.querySelector(containerSelector) as HTMLElement | null;
      if (el) containerRect.current = el.getBoundingClientRect();
    }
    return containerRect.current;
  };

  useEffect(() => {
    // Reset cached rect on resize/scroll
    const onWin = () => {
      containerRect.current = null;
    };
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, []);

  const barStyle: React.CSSProperties = useMemo(() => ({
    position: 'absolute',
    left: `${startPx}px`,
    top: `${topPx}px`,
    width: `${widthPx}px`,
    height: `${laneHeight - 2}px`,
    background: color,
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: `${fontSize}px`,
    fontWeight: 700,
    textAlign: 'center',
    overflow: 'hidden',
    userSelect: 'none',
    pointerEvents: 'auto',
    zIndex: isSelected ? 50000 : 40000,
    boxShadow: isSelected ? '0 2px 10px rgba(37,99,235,0.35)' : '0 1px 3px rgba(0,0,0,0.25)',
    cursor: dragMode === 'move' ? 'grabbing' : 'grab',
  }), [startPx, topPx, widthPx, laneHeight, color, fontSize, isSelected, dragMode]);

  const ghostStyle: React.CSSProperties | undefined = useMemo(() => {
    if (!ghost) return undefined;
    const rect = getContainerRect();
    if (!rect) return undefined;
    return {
      position: 'fixed',
      left: `${rect.left + dateColumnWidthPx + ghost.startPx}px`,
      top: `${rect.top + headerHeightPx + ghost.laneIndex * laneHeight + 1}px`,
      width: `${ghost.widthPx}px`,
      height: `${laneHeight - 2}px`,
      background: color,
      border: '1px dashed rgba(255,255,255,0.7)',
      borderRadius: 6,
      pointerEvents: 'none',
      opacity: 0.6,
      zIndex: 2000,
    } as React.CSSProperties;
  }, [ghost, laneHeight, color, headerHeightPx, dateColumnWidthPx]);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    console.log('🎯 SmartEventBar onMouseDown:', { id, startPx, widthPx });

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = e.clientX - rect.left;

    let mode: DragMode = 'move';
    if (offsetX <= HANDLE_WIDTH) {
      mode = 'resize-start';
      console.log('🔧 左リサイズ開始');
    } else if (offsetX >= rect.width - HANDLE_WIDTH) {
      mode = 'resize-end';
      console.log('🔧 右リサイズ開始');
    } else {
      console.log('🚚 移動開始');
    }

    setDragMode(mode);
    originRef.current = {
      x: e.clientX,
      y: e.clientY,
      startPx,
      widthPx,
      laneIndex
    };

    // Create initial ghost at current position
    setGhost({ startPx, widthPx, laneIndex });

    const onMove = (me: MouseEvent) => {
      if (!originRef.current) return;
      const { x, y, startPx: oStart, widthPx: oWidth, laneIndex: oLane } = originRef.current;
      const dx = me.clientX - x;
      const dy = me.clientY - y;

      console.log('🎯 マウス移動:', { mode, dx, dy, dragMode });

      if (dragMode === 'move') {
        const snapped = snapToGrid(oStart + dx, snapSizeX);
        const clampedStart = Math.max(0, Math.min(snapped, Math.max(0, maxTimelinePx - oWidth)));
        const laneDelta = Math.round(dy / laneHeight);
        const newLane = Math.max(0, Math.min(oLane + laneDelta, maxLaneIndex));
        console.log('🚚 移動更新:', { clampedStart, newLane });
        setGhost({ startPx: clampedStart, widthPx: oWidth, laneIndex: newLane });
      } else if (dragMode === 'resize-start') {
        const rightEdge = oStart + oWidth; // keep right edge fixed
        const snappedStart = Math.max(0, Math.min(snapToGrid(oStart + dx, snapSizeX), rightEdge - snapSizeX));
        const newWidth = rightEdge - snappedStart;
        console.log('🔧 左リサイズ更新:', { snappedStart, newWidth });
        setGhost({ startPx: snappedStart, widthPx: Math.max(snapSizeX, newWidth), laneIndex: oLane });
      } else if (dragMode === 'resize-end') {
        const rawEnd = oStart + oWidth + dx;
        const snappedEnd = snapToGrid(rawEnd, snapSizeX);
        const clampedEnd = Math.max(oStart + snapSizeX, Math.min(snappedEnd, maxTimelinePx));
        const newWidth = clampedEnd - oStart;
        console.log('🔧 右リサイズ更新:', { clampedEnd, newWidth });
        setGhost({ startPx: oStart, widthPx: Math.max(snapSizeX, newWidth), laneIndex: oLane });
      }
    };

    const onUp = () => {
      console.log('🎯 マウスアップ:', { dragMode, ghost });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      if (originRef.current && ghost) {
        if (dragMode === 'move') {
          console.log('🚚 移動確定:', { newStartPx: ghost.startPx, newLaneIndex: ghost.laneIndex });
          onMoveCommit(id, ghost.startPx, ghost.laneIndex);
        } else if (dragMode === 'resize-start' || dragMode === 'resize-end') {
          console.log('🔧 リサイズ確定:', { newWidthPx: ghost.widthPx, newStartPx: ghost.startPx });
          onResizeCommit(id, ghost.widthPx, ghost.startPx);
        }
      }

      setDragMode('idle');
      setGhost(null);
      originRef.current = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <>
      {ghost && <div style={ghostStyle} />}
      <div
        className="smart-event-bar"
        style={barStyle}
        onMouseDown={onMouseDown}
        title={isSelected ? '選択中' : ''}
      >
        {/* left handle */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: HANDLE_WIDTH,
            height: '100%',
            cursor: 'ew-resize',
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'auto',
            zIndex: 1
          }}
          onMouseDown={(e) => {
            console.log('🔧 左ハンドル直接クリック');
            onMouseDown(e);
          }}
        />
        {/* content */}
        {(title || subtitle) && (
          <div style={{
            pointerEvents: 'none',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            color: 'white',
            textAlign: 'center'
          }}>
            {title && <div style={{ fontWeight: 700 }}>{title}</div>}
            {subtitle && <div style={{ fontSize: Math.max(9, fontSize - 1), opacity: 0.9 }}>{subtitle}</div>}
          </div>
        )}
        {/* right handle */}
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: HANDLE_WIDTH,
            height: '100%',
            cursor: 'ew-resize',
            background: 'rgba(255,255,255,0.1)',
            pointerEvents: 'auto',
            zIndex: 1
          }}
          onMouseDown={(e) => {
            console.log('🔧 右ハンドル直接クリック');
            onMouseDown(e);
          }}
        />
      </div>
    </>
  );
};

export default SmartEventBar;


