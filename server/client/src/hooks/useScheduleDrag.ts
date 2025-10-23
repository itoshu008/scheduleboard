import { useState, useCallback, useRef, useEffect } from 'react';
import { Schedule, Employee } from '../types';
import { getTimeSlot, getEndTimeSlot, getTimeFromSlot } from '../utils/dateUtils';
import { safeHexColor, toApiColor } from '../utils/color';
import { api } from '../api';

export interface DragState {
  isDragging: boolean;
  dragData: {
    schedule: Schedule;
    startX: number;
    startY: number;
    originalStart: Date;
    originalEnd: Date;
  } | null;
  dragGhost: {
    schedule: Schedule;
    start: Date;
    end: Date;
  } | null;
  mousePosition: { x: number; y: number } | null;
}

export interface DragActions {
  setDragData: (data: DragState['dragData']) => void;
  setDragGhost: (ghost: DragState['dragGhost']) => void;
  setMousePosition: (position: { x: number; y: number } | null) => void;
  handleScheduleMouseDown: (schedule: Schedule, e: React.MouseEvent) => void;
  handleMouseMove: (e: MouseEvent, employees: Employee[], selectedDate: Date, pageType: 'daily' | 'monthly' | 'all') => void;
  handleMouseUp: (onScheduleUpdate: (scheduleId: number, updateData: any) => Promise<void>) => Promise<void>;
  clearDrag: () => void;
}

export const useScheduleDrag = (): DragState & DragActions => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState<{
    schedule: Schedule;
    startX: number;
    startY: number;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    schedule: Schedule;
    start: Date;
    end: Date;
  } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  const animationFrameRef = useRef<number | null>(null);

  // スケジュールマウスダウン（ドラッグ開始）
  const handleScheduleMouseDown = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    if (e.button !== 0) return; // 左クリック以外は無効

    e.preventDefault();
    e.stopPropagation();

    console.log('🎯 DRAG_START - ドラッグ開始', {
      scheduleId: schedule.id,
      title: schedule.title,
      start: schedule.start_datetime,
      end: schedule.end_datetime
    });

    const startTime = new Date(schedule.start_datetime);
    const endTime = new Date(schedule.end_datetime);

    setDragData({
      schedule,
      startX: e.clientX,
      startY: e.clientY,
      originalStart: startTime,
      originalEnd: endTime
    });

    setIsDragging(true);
  }, []);

  // マウス移動処理
  const handleMouseMove = useCallback((e: MouseEvent, employees: Employee[], selectedDate: Date, pageType: 'daily' | 'monthly' | 'all') => {
    if (!isDragging || !dragData) return;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      // ドラッグ処理
      if (dragData) {
        const deltaX = e.clientX - dragData.startX;
        const deltaY = e.clientY - dragData.startY;

        // 時間軸の移動計算
        const timeSlotDelta = Math.round(deltaX / 20); // 20px = 1スロット（15分）
        const newStartSlot = getTimeSlot(dragData.originalStart) + timeSlotDelta;
        const duration = getEndTimeSlot(dragData.originalEnd) - getTimeSlot(dragData.originalStart);

        // 新しい時間を計算
        const newStart = new Date(selectedDate);
        const startTime = getTimeFromSlot(newStartSlot);
        newStart.setHours(startTime.hour, startTime.minute, 0, 0);

        const newEnd = new Date(newStart.getTime() + (getEndTimeSlot(dragData.originalEnd) - getTimeSlot(dragData.originalStart)) * 15 * 60 * 1000);

        // 社員軸の移動計算（日別・全社員の場合）
        let newEmployeeId = dragData.schedule.employee_id;
        if (pageType === 'daily' || pageType === 'all') {
          const rowHeight = 40; // 社員行の高さ
          const employeeRows = Math.round(deltaY / rowHeight);
          
          const originalEmployee = employees.find(emp => emp.id === dragData.schedule.employee_id);
          if (originalEmployee) {
            const originalIndex = employees.findIndex(emp => emp.id === originalEmployee.id);
            const newIndex = Math.max(0, Math.min(employees.length - 1, originalIndex + employeeRows));
            newEmployeeId = employees[newIndex].id;
          }
        }

        // ゴースト更新
        setDragGhost({
          schedule: { ...dragData.schedule, employee_id: newEmployeeId },
          start: newStart,
          end: newEnd
        });

        setMousePosition({ x: e.clientX, y: e.clientY });
      }
    });
  }, [isDragging, dragData]);

  // マウスアップ（ドラッグ終了）
  const handleMouseUp = useCallback(async (onScheduleUpdate: (scheduleId: number, updateData: any) => Promise<void>) => {
    if (!isDragging || !dragData || !dragGhost) {
      setIsDragging(false);
      setDragData(null);
      setDragGhost(null);
      setMousePosition(null);
      return;
    }

    console.log('🎯 DRAG_END - ドラッグ終了', {
      scheduleId: dragData.schedule.id,
      newStart: dragGhost.start.toISOString(),
      newEnd: dragGhost.end.toISOString(),
      newEmployeeId: dragGhost.schedule.employee_id
    });

    try {
      const updateData = {
        employee_id: dragGhost.schedule.employee_id,
        title: dragData.schedule.title,
        color: toApiColor(dragData.schedule.color),
        start_datetime: dragGhost.start,
        end_datetime: dragGhost.end
      };

      await onScheduleUpdate(dragData.schedule.id, updateData);
      console.log('✅ DRAG_END - スケジュール更新完了');
    } catch (error) {
      console.error('❌ DRAG_END - スケジュール更新失敗:', error);
    } finally {
      setIsDragging(false);
      setDragData(null);
      setDragGhost(null);
      setMousePosition(null);
    }
  }, [isDragging, dragData, dragGhost]);

  // ドラッグクリア
  const clearDrag = useCallback(() => {
    setIsDragging(false);
    setDragData(null);
    setDragGhost(null);
    setMousePosition(null);
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    // 状態
    isDragging,
    dragData,
    dragGhost,
    mousePosition,
    // アクション
    setDragData,
    setDragGhost,
    setMousePosition,
    handleScheduleMouseDown,
    handleMouseMove,
    handleMouseUp,
    clearDrag
  };
};
