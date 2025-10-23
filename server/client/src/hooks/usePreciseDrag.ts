import { useState, useCallback, useRef, useEffect } from 'react';
import { Schedule } from '../types';
import { 
  DragState, 
  ResizeState, 
  DragGhost, 
  ResizeGhost,
  calculateGhostPosition,
  calculateResizeGhost,
  timeToSlot,
  slotToTime
} from '../utils/dragUtils';

export const usePreciseDrag = (
  cellWidth: number,
  rowHeight: number,
  onDragComplete: (schedule: Schedule, newStart: Date, newEnd: Date) => Promise<void>,
  onResizeComplete: (schedule: Schedule, newStart: Date, newEnd: Date) => Promise<void>
) => {
  // ドラッグ状態
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  
  // リサイズ状態
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [resizeGhost, setResizeGhost] = useState<ResizeGhost | null>(null);
  
  // マウス位置
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // アニメーションフレーム
  const animationFrameRef = useRef<number | null>(null);

  // ドラッグ開始
  const startDrag = useCallback((schedule: Schedule, startX: number, startY: number) => {
    const originalStart = new Date(schedule.start_datetime);
    const originalEnd = new Date(schedule.end_datetime);
    const startSlot = timeToSlot(originalStart);
    const startDate = new Date(originalStart.getFullYear(), originalStart.getMonth(), originalStart.getDate());
    
    setDragState({
      schedule,
      startX,
      startY,
      originalStart,
      originalEnd,
      startSlot,
      startDate
    });
  }, []);

  // リサイズ開始
  const startResize = useCallback((schedule: Schedule, edge: 'start' | 'end', startX: number) => {
    const originalStart = new Date(schedule.start_datetime);
    const originalEnd = new Date(schedule.end_datetime);
    
    setResizeState({
      schedule,
      edge,
      startX,
      originalStart,
      originalEnd
    });
    
    setResizeGhost({
      schedule,
      newStart: originalStart,
      newEnd: originalEnd,
      edge
    });
  }, []);

  // ドラッグ・リサイズ終了
  const endDrag = useCallback(async () => {
    if (dragState && dragGhost) {
      try {
        await onDragComplete(dragState.schedule, dragGhost.newStart, dragGhost.newEnd);
      } catch (error) {
        console.error('Drag complete failed:', error);
      }
    }
    
    if (resizeState && resizeGhost) {
      try {
        await onResizeComplete(resizeState.schedule, resizeGhost.newStart, resizeGhost.newEnd);
      } catch (error) {
        console.error('Resize complete failed:', error);
      }
    }
    
    // 状態をクリア
    setDragState(null);
    setDragGhost(null);
    setResizeState(null);
    setResizeGhost(null);
    setMousePosition(null);
  }, [dragState, dragGhost, resizeState, resizeGhost, onDragComplete, onResizeComplete]);

  // マウス移動処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(() => {
        setMousePosition({ x: e.clientX, y: e.clientY });
        
        // ドラッグ処理
        if (dragState) {
          const ghost = calculateGhostPosition(dragState, e.clientX, e.clientY, cellWidth, rowHeight);
          setDragGhost(ghost);
        }
        
        // リサイズ処理
        if (resizeState) {
          const ghost = calculateResizeGhost(resizeState, e.clientX, cellWidth);
          setResizeGhost(ghost);
        }
      });
    };

    const handleMouseUp = () => {
      if (dragState || resizeState) {
        endDrag();
      }
    };

    if (dragState || resizeState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = dragState ? 'grabbing' : 'ew-resize';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'auto';
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dragState, resizeState, cellWidth, rowHeight, endDrag]);

  return {
    dragState,
    dragGhost,
    resizeState,
    resizeGhost,
    mousePosition,
    isDragging: !!dragState,
    isResizing: !!resizeState,
    startDrag,
    startResize,
    endDrag
  };
};
