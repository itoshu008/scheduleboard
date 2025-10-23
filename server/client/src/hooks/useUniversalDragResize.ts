import { useState, useEffect, useRef, useCallback } from 'react';
import { Schedule } from '../types';
import { getTimeSlot, getTimeFromSlot } from '../utils/dateUtils';
import { toApiColor } from '../utils/color';

interface DragData {
  schedule: Schedule;
  startX: number;
  startY: number;
  startSlot: number;
  startDate: Date;
  originalEmployeeId: number; // 元の社員ID
  originalEquipmentId?: number; // 元の設備ID（設備予約の場合）
}

interface DragGhost {
  schedule: Schedule;
  newSlot: number;
  newDate: Date;
  newEmployeeDelta?: number; // 社員移動量（日別スケジュール用）
  newEquipmentDelta?: number; // 設備移動量（設備予約用）
  deltaX: number;
  deltaY: number;
}

interface ResizeData {
  schedule: Schedule;
  edge: 'start' | 'end';
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

interface ResizeGhost {
  schedule: Schedule;
  newStart: Date;
  newEnd: Date;
  edge: 'start' | 'end';
}

interface UseUniversalDragResizeProps {
  scaledCellWidth: number;
  scaledRowHeight: number;
  onUpdateSchedule: (scheduleId: number, updateData: any) => Promise<void>;
  onReloadSchedules: () => Promise<void>;
  // オプショナルプロパティ
  employees?: Array<{ id: number; name: string }>; // 社員リスト（日別・全社員用）
  equipments?: Array<{ id: number; name: string }>; // 設備リスト（設備予約用）
  getEmployeeIdFromDelta?: (originalEmployeeId: number, delta: number) => number; // 社員ID計算関数
  getEquipmentIdFromDelta?: (originalEquipmentId: number, delta: number) => number; // 設備ID計算関数
  enableVerticalMovement?: boolean; // 縦移動を有効にするか（デフォルト: false）
  scheduleType?: 'daily' | 'allEmployees' | 'equipment'; // スケジュールタイプ
}

// スロット番号から日時を作成する関数
const createTimeFromSlot = (date: Date, slot: number): Date => {
  const { hour, minute } = getTimeFromSlot(slot);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
};

export const useUniversalDragResize = ({
  scaledCellWidth,
  scaledRowHeight,
  onUpdateSchedule,
  onReloadSchedules,
  employees,
  equipments,
  getEmployeeIdFromDelta,
  getEquipmentIdFromDelta,
  enableVerticalMovement = false,
  scheduleType = 'daily'
}: UseUniversalDragResizeProps) => {
  // ドラッグ関連の状態
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  
  // リサイズ関連の状態
  const [resizeData, setResizeData] = useState<ResizeData | null>(null);
  const [resizeGhost, setResizeGhost] = useState<ResizeGhost | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  
  // マウス位置
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // ref
  const animationFrameRef = useRef<number | null>(null);

  // スケジュールドラッグ開始
  const handleScheduleMouseDown = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は無効化
    if ((e as any).detail && (e as any).detail > 1) return; // ダブルクリック時は無効化
    
    // リサイズハンドル上ではドラッグ操作を無効
    const target = e.target as HTMLElement;
    if (target && target.classList && target.classList.contains('resize-handle')) {
      return;
    }
    
    // リサイズ中はドラッグ操作を無効
    if (isResizing || resizeData) {
      return;
    }
    
    e.stopPropagation();
    
    console.log('🚚 ドラッグ開始:', { scheduleId: schedule.id, title: schedule.title, scheduleType });
    
    // ドラッグ開始
    const startTime = new Date(schedule.start_datetime);
    const startSlot = getTimeSlot(startTime);
    const startDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
    
    console.log('🚚 ドラッグ初期データ:', {
      startTime: startTime.toISOString(),
      startSlot,
      startDate: startDate.toDateString(),
      scheduleType
    });
    
    setDragData({
      schedule,
      startX: e.clientX,
      startY: e.clientY,
      startSlot,
      startDate,
      originalEmployeeId: schedule.employee_id,
      originalEquipmentId: schedule.equipment_ids?.[0] // 設備IDsの最初の要素
    });

    // 初期ドラッグゴーストを設定
    setDragGhost({
      schedule,
      newSlot: startSlot,
      newDate: startDate,
      newEmployeeDelta: 0,
      newEquipmentDelta: 0,
      deltaX: 0,
      deltaY: 0
    });

    // 初期マウス位置を設定
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, [isResizing, resizeData, scheduleType]);

  // リサイズハンドルマウスダウン
  const handleResizeMouseDown = useCallback((schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は無効化
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🔧 リサイズ開始:', { scheduleId: schedule.id, edge, scheduleType });
    
    const originalStart = new Date(schedule.start_datetime);
    const originalEnd = new Date(schedule.end_datetime);
    
    setIsResizing(true);
    setResizeData({
      schedule,
      edge,
      startX: e.clientX,
      originalStart,
      originalEnd
    });
    
    setResizeGhost({
      schedule,
      newStart: originalStart,
      newEnd: originalEnd,
      edge
    });
    
    // 初期マウス位置を設定
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, [scheduleType]);

  // グローバルマウス移動とマウスアップ処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(() => {
        // ドラッグ処理
        if (dragData && dragGhost) {
          const deltaX = e.clientX - dragData.startX;
          const deltaY = e.clientY - dragData.startY;
          
          // 時間軸の移動（横方向）
          const slotDelta = Math.round(deltaX / scaledCellWidth);
          const newStartSlot = Math.max(0, Math.min(95, dragData.startSlot + slotDelta));
          
          // 縦移動の処理（有効な場合のみ）
          let newEmployeeDelta = 0;
          let newEquipmentDelta = 0;
          let newDate = new Date(dragData.startDate);
          
          if (enableVerticalMovement) {
            if (scheduleType === 'daily' || scheduleType === 'allEmployees') {
              // 社員間移動
              newEmployeeDelta = Math.round(deltaY / scaledRowHeight);
            } else if (scheduleType === 'equipment') {
              // 設備間移動
              newEquipmentDelta = Math.round(deltaY / scaledRowHeight);
            }
            // 日付は変更しない（同じ日付を維持）
          } else {
            // 縦移動無効の場合は月別スケジュールのような日付移動
            const dateDelta = Math.round(deltaY / scaledRowHeight);
            newDate = new Date(dragData.startDate);
            newDate.setDate(newDate.getDate() + dateDelta);
          }
          
          setDragGhost({
            schedule: dragData.schedule,
            newSlot: newStartSlot,
            newDate: newDate,
            newEmployeeDelta,
            newEquipmentDelta,
            deltaX: e.clientX - dragData.startX,
            deltaY: e.clientY - dragData.startY
          });

          // マウス位置を更新
          setMousePosition({ x: e.clientX, y: e.clientY });
        }

        // リサイズ処理
        if (resizeData && resizeGhost) {
          const deltaX = e.clientX - resizeData.startX;
          const slotDelta = Math.round(deltaX / scaledCellWidth);
          
          let newStart = new Date(resizeData.originalStart);
          let newEnd = new Date(resizeData.originalEnd);
          
          if (resizeData.edge === 'start') {
            // 開始時刻をリサイズ
            const newStartSlot = Math.max(0, Math.min(95, getTimeSlot(resizeData.originalStart) + slotDelta));
            newStart = createTimeFromSlot(resizeData.originalStart, newStartSlot);
            
            // 開始時刻が終了時刻を超えないようにする
            if (newStart >= newEnd) {
              newStart = new Date(newEnd.getTime() - 15 * 60 * 1000); // 15分前に設定
            }
          } else {
            // 終了時刻をリサイズ
            const newEndSlot = Math.max(0, Math.min(95, getTimeSlot(resizeData.originalEnd) + slotDelta));
            newEnd = createTimeFromSlot(resizeData.originalEnd, newEndSlot);
            
            // 終了時刻が開始時刻を超えないようにする
            if (newEnd <= newStart) {
              newEnd = new Date(newStart.getTime() + 15 * 60 * 1000); // 15分後に設定
            }
          }
          
          setResizeGhost({
            schedule: resizeData.schedule,
            newStart,
            newEnd,
            edge: resizeData.edge
          });

          // マウス位置を更新
          setMousePosition({ x: e.clientX, y: e.clientY });
        }
      });
    };

    const handleMouseUp = async () => {
      console.log('🎯 マウスアップ処理開始:', { dragData: !!dragData, resizeData: !!resizeData, scheduleType });
      
      // ドラッグ終了処理
      if (dragData && dragGhost) {
        try {
          console.log('🚚 ドラッグ確定処理:', {
            scheduleId: dragData.schedule.id,
            originalStart: dragData.schedule.start_datetime,
            originalEnd: dragData.schedule.end_datetime,
            newSlot: dragGhost.newSlot,
            newDate: dragGhost.newDate.toDateString(),
            scheduleType
          });
          
          // 新しい開始・終了時刻を計算
          const originalStart = new Date(dragData.schedule.start_datetime);
          const originalEnd = new Date(dragData.schedule.end_datetime);
          const originalDuration = originalEnd.getTime() - originalStart.getTime();
          const newStart = createTimeFromSlot(dragGhost.newDate, dragGhost.newSlot);
          const newEnd = new Date(newStart.getTime() + originalDuration);
          
          // 社員ID・設備IDの計算
          let newEmployeeId = dragData.originalEmployeeId;
          let newEquipmentId = dragData.originalEquipmentId;
          
          if (enableVerticalMovement) {
            if (scheduleType === 'daily' || scheduleType === 'allEmployees') {
              // 社員間移動
              if (dragGhost.newEmployeeDelta && dragGhost.newEmployeeDelta !== 0 && getEmployeeIdFromDelta) {
                newEmployeeId = getEmployeeIdFromDelta(dragData.originalEmployeeId, dragGhost.newEmployeeDelta);
              }
            } else if (scheduleType === 'equipment') {
              // 設備間移動
              if (dragGhost.newEquipmentDelta && dragGhost.newEquipmentDelta !== 0 && getEquipmentIdFromDelta && dragData.originalEquipmentId) {
                newEquipmentId = getEquipmentIdFromDelta(dragData.originalEquipmentId, dragGhost.newEquipmentDelta);
              }
            }
          }
          
          console.log('🚚 計算結果:', {
            originalDuration,
            newStart: newStart.toISOString(),
            newEnd: newEnd.toISOString(),
            originalEmployeeId: dragData.originalEmployeeId,
            newEmployeeId,
            originalEquipmentId: dragData.originalEquipmentId,
            newEquipmentId,
            employeeDelta: dragGhost.newEmployeeDelta,
            equipmentDelta: dragGhost.newEquipmentDelta
          });
          
          const updateData: any = {
            title: dragData.schedule.title || '無題',
            color: toApiColor(dragData.schedule.color),
            employee_id: newEmployeeId,
            start_datetime: newStart,
            end_datetime: newEnd
          };
          
          // 設備IDがある場合は追加
          if (newEquipmentId !== undefined) {
            updateData.equipment_ids = [newEquipmentId];
          } else if (dragData.schedule.equipment_ids && dragData.schedule.equipment_ids.length > 0) {
            updateData.equipment_ids = dragData.schedule.equipment_ids;
          }
          
          console.log('🚚 API更新データ:', updateData);
          await onUpdateSchedule(dragData.schedule.id, updateData);
          console.log('🚚 API更新完了、リロード開始');
          await onReloadSchedules();
          console.log('🚚 リロード完了');
        } catch (error) {
          console.error('❌ ドラッグ更新失敗:', error);
          alert('スケジュールの移動に失敗しました: ' + (error as any)?.message);
        }
      }
      
      // リサイズ終了処理
      if (resizeData && resizeGhost) {
        try {
          const updateData: any = {
            title: resizeData.schedule.title || '無題',
            color: toApiColor(resizeData.schedule.color),
            employee_id: resizeData.schedule.employee_id,
            start_datetime: resizeGhost.newStart,
            end_datetime: resizeGhost.newEnd
          };
          
          // 設備IDがある場合は追加
          if (resizeData.schedule.equipment_ids && resizeData.schedule.equipment_ids.length > 0) {
            updateData.equipment_ids = resizeData.schedule.equipment_ids;
          }
          
          console.log('🔧 リサイズAPI更新データ:', updateData);
          await onUpdateSchedule(resizeData.schedule.id, updateData);
          console.log('🔧 リサイズ更新完了、リロード開始');
          await onReloadSchedules();
          console.log('🔧 リサイズリロード完了');
        } catch (error) {
          console.error('❌ リサイズ更新失敗:', error);
          alert('スケジュールのリサイズに失敗しました: ' + (error as any)?.message);
        }
      }
      
      // 状態をクリア
      setDragData(null);
      setDragGhost(null);
      setResizeData(null);
      setResizeGhost(null);
      setMousePosition(null);
      setIsResizing(false);
    };

    // イベントリスナー登録（ドラッグまたはリサイズ中のみ）
    if (dragData || resizeData) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dragData, dragGhost, resizeData, resizeGhost, scaledCellWidth, scaledRowHeight, onUpdateSchedule, onReloadSchedules, enableVerticalMovement, scheduleType, getEmployeeIdFromDelta, getEquipmentIdFromDelta]);

  return {
    // 状態
    dragData,
    dragGhost,
    resizeData,
    resizeGhost,
    isResizing,
    mousePosition,
    
    // ハンドラー
    handleScheduleMouseDown,
    handleResizeMouseDown
  };
};
