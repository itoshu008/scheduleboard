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
  grabOffsetPx: number; // バー左端からの掴み位置（px）
  startScrollLeft: number; // ドラッグ開始時の横スクロール位置
}

interface DragGhost {
  schedule: Schedule;
  newSlot: number;
  newDate: Date;
  newEmployeeDelta?: number; // 社員移動量（日別スケジュール用）
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

interface UseScheduleDragResizeProps {
  scaledCellWidth: number;
  scaledRowHeight: number;
  onUpdateSchedule: (scheduleId: number, updateData: any) => Promise<void>;
  onReloadSchedules: () => Promise<void>;
  employees?: Array<{ id: number; name: string }>; // 社員リスト（日別スケジュール用）
  getEmployeeIdFromDelta?: (originalEmployeeId: number, delta: number) => number; // 社員ID計算関数
}

// スロット番号から日時を作成する関数
const createTimeFromSlot = (date: Date, slot: number): Date => {
  const { hour, minute } = getTimeFromSlot(slot);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
};

export const useScheduleDragResize = ({
  scaledCellWidth,
  scaledRowHeight,
  onUpdateSchedule,
  onReloadSchedules,
  employees,
  getEmployeeIdFromDelta
}: UseScheduleDragResizeProps) => {
  // ドラッグ関連の状態
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  
  // リサイズ関連の状態
  const [resizeData, setResizeData] = useState<ResizeData | null>(null);
  const [resizeGhost, setResizeGhost] = useState<ResizeGhost | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  
  // マウス位置（パフォーマンス最適化のため未使用）
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
    
    console.log('🚚 ドラッグ開始:', { scheduleId: schedule.id, title: schedule.title });
    
    // ドラッグ開始
    const startTime = new Date(schedule.start_datetime);
    const startSlot = getTimeSlot(startTime);
    const startDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
    
    console.log('🚚 ドラッグ初期データ:', {
      startTime: startTime.toISOString(),
      startSlot,
      startDate: startDate.toDateString()
    });
    
    const barRect = (e.currentTarget as HTMLElement)?.getBoundingClientRect?.();
    const container = document.querySelector('.equipment-reservation .schedule-grid-container') as HTMLElement | null;
    const startScrollLeft = container?.scrollLeft || 0;
    const grabOffsetPx = barRect ? Math.max(0, Math.min(barRect.width, e.clientX - barRect.left)) : 0;

    setDragData({
      schedule,
      startX: e.clientX,
      startY: e.clientY,
      startSlot,
      startDate,
      originalEmployeeId: schedule.employee_id,
      grabOffsetPx,
      startScrollLeft
    });

    // 初期ドラッグゴーストを設定
    setDragGhost({
      schedule,
      newSlot: startSlot,
      newDate: startDate,
      newEmployeeDelta: 0, // 初期は移動なし
      deltaX: 0,
      deltaY: 0
    });

    // setMousePosition({ x: e.clientX, y: e.clientY }); // 不要な再レンダリングを回避
  }, [isResizing, resizeData]);

  // リサイズハンドルマウスダウン
  const handleResizeMouseDown = useCallback((schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は無効化
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setResizeData({
      schedule,
      edge,
      startX: e.clientX,
      originalStart: new Date(schedule.start_datetime),
      originalEnd: new Date(schedule.end_datetime)
    });
    
    setResizeGhost({
      schedule,
      newStart: new Date(schedule.start_datetime),
      newEnd: new Date(schedule.end_datetime),
      edge
    });

    // setMousePosition({ x: e.clientX, y: e.clientY }); // 不要な再レンダリングを回避
  }, []);

  // グローバルマウス移動とマウスアップ処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(() => {
        // ドラッグ処理
        if (dragData && dragGhost) {
          const container = document.querySelector('.equipment-reservation .schedule-grid-container') as HTMLElement | null;
          const currentScrollLeft = container?.scrollLeft || 0;
          const deltaX = (e.clientX - dragData.startX) + (currentScrollLeft - dragData.startScrollLeft);
          const deltaY = e.clientY - dragData.startY;
          
          // 時間軸の移動（横方向）- より精密な計算
          const exactSlotDelta = deltaX / scaledCellWidth;
          const slotDelta = Math.round(exactSlotDelta);
          const newStartSlot = Math.max(0, Math.min(95, dragData.startSlot + slotDelta));
          
          // 社員軸の移動（縦方向）- より精密な計算
          const exactEmployeeDelta = deltaY / scaledRowHeight;
          const employeeDelta = Math.round(exactEmployeeDelta);
          
          // 日付は変更しない（同じ日付を維持）
          const newDate = new Date(dragData.startDate);
          
          setDragGhost({
            schedule: dragData.schedule,
            newSlot: newStartSlot,
            newDate: newDate,
            newEmployeeDelta: employeeDelta,
            deltaX: deltaX, // 実際のマウス移動量を保持
            deltaY: deltaY  // 実際のマウス移動量を保持
          });

          // setMousePosition({ x: e.clientX, y: e.clientY }); // 不要な再レンダリングを回避
        }

        // リサイズ処理（縦方向移動を無効化）
        if (resizeData && resizeGhost) {
          const deltaX = e.clientX - resizeData.startX;
          // 縦方向の移動は完全に無視（リサイズ時は行変更なし）
          const exactSlotDelta = deltaX / scaledCellWidth;
          const slotDelta = Math.round(exactSlotDelta);

          let newStart = new Date(resizeData.originalStart);
          let newEnd = new Date(resizeData.originalEnd);
          
          console.log('🔧 リサイズ処理:', {
            edge: resizeData.edge,
            deltaX: deltaX.toFixed(2),
            slotDelta,
            originalStart: resizeData.originalStart.toISOString(),
            originalEnd: resizeData.originalEnd.toISOString()
          });
          
          if (resizeData.edge === 'start') {
            // 左ハンドル：開始時刻を変更、終了時刻は固定（行は変更しない）
            newEnd = new Date(resizeData.originalEnd); // 終了時刻は固定
            
            // 新しい開始時刻を計算（より精密に）
            const originalStartSlot = getTimeSlot(resizeData.originalStart);
            let newStartSlot = originalStartSlot + slotDelta;
            
            // 境界チェック：0以上、終了時刻より前
            const endSlot = getTimeSlot(resizeData.originalEnd);
            newStartSlot = Math.max(0, Math.min(newStartSlot, endSlot - 1)); // 最低1スロット分の幅を確保
            
            const startDate = new Date(resizeData.originalStart);
            startDate.setHours(0, 0, 0, 0);
            newStart = createTimeFromSlot(startDate, newStartSlot);
            
            console.log('🔧 左リサイズ:', {
              originalStartSlot,
              newStartSlot,
              newStart: newStart.toISOString()
            });
          } else {
            // 右ハンドル：終了時刻を変更、開始時刻は固定（行は変更しない）
            newStart = new Date(resizeData.originalStart); // 開始時刻は固定
            
            // 新しい終了時刻を計算（より精密に）
            const originalEndSlot = getTimeSlot(resizeData.originalEnd);
            let newEndSlot = originalEndSlot + slotDelta;
            
            // 境界チェック：開始時刻より後、95以下
            const startSlot = getTimeSlot(resizeData.originalStart);
            newEndSlot = Math.max(startSlot + 1, Math.min(newEndSlot, 95)); // 最低1スロット分の幅を確保
            
            const endDate = new Date(resizeData.originalEnd);
            endDate.setHours(0, 0, 0, 0);
            newEnd = createTimeFromSlot(endDate, newEndSlot);
            
            console.log('🔧 右リサイズ:', {
              originalEndSlot,
              newEndSlot,
              newEnd: newEnd.toISOString()
            });
          }
            
          setResizeGhost({
            schedule: resizeData.schedule,
            newStart,
            newEnd,
            edge: resizeData.edge
          });

          // setMousePosition({ x: e.clientX, y: e.clientY }); // 不要な再レンダリングを回避
        }
      });
    };

    const handleMouseUp = async () => {
      console.log('🎯 マウスアップ処理開始:', { dragData: !!dragData, resizeData: !!resizeData });
      
      // ドラッグ終了処理
      if (dragData && dragGhost) {
        try {
          console.log('🚚 ドラッグ確定処理:', {
            scheduleId: dragData.schedule.id,
            originalStart: dragData.schedule.start_datetime,
            originalEnd: dragData.schedule.end_datetime,
            newSlot: dragGhost.newSlot,
            newDate: dragGhost.newDate.toDateString()
          });
          
          // 新しい開始・終了時刻を計算
          const originalStart = new Date(dragData.schedule.start_datetime);
          const originalEnd = new Date(dragData.schedule.end_datetime);
          const originalDuration = originalEnd.getTime() - originalStart.getTime();
          const newStart = createTimeFromSlot(dragGhost.newDate, dragGhost.newSlot);
          const newEnd = new Date(newStart.getTime() + originalDuration);
          
          // 社員IDの計算（縦移動がある場合）
          let newEmployeeId = dragData.originalEmployeeId;
          if (dragGhost.newEmployeeDelta && dragGhost.newEmployeeDelta !== 0 && getEmployeeIdFromDelta) {
            newEmployeeId = getEmployeeIdFromDelta(dragData.originalEmployeeId, dragGhost.newEmployeeDelta);
          }
          
          console.log('🚚 計算結果:', {
            originalDuration,
            newStart: newStart.toISOString(),
            newEnd: newEnd.toISOString(),
            originalEmployeeId: dragData.originalEmployeeId,
            newEmployeeId,
            employeeDelta: dragGhost.newEmployeeDelta
          });
          
          const updateData = {
            title: dragData.schedule.title || '無題',
            color: toApiColor(dragData.schedule.color),
            // 設備ページ: newEmployeeId は設備IDとして扱う
            equipment_id: newEmployeeId,
            start_datetime: newStart,
            end_datetime: newEnd
          };
          
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
      
      // リサイズ終了処理（行変更を完全に防止）
      if (resizeData && resizeGhost) {
        try {
          console.log('🔧 リサイズ確定（行変更なし）:', {
            scheduleId: resizeData.schedule.id,
            edge: resizeGhost.edge,
            newStart: resizeGhost.newStart.toISOString(),
            newEnd: resizeGhost.newEnd.toISOString(),
            originalEmployeeId: resizeData.schedule.employee_id // 元の行IDを保持
          });
          
          const updateData = {
            title: resizeData.schedule.title || '無題',
            color: toApiColor(resizeData.schedule.color),
            // 設備ページ: 行変更なし → 元の設備IDを保持
            equipment_id: (resizeData.schedule as any).equipment_id || (resizeData.schedule as any).equipment_ids?.[0],
            start_datetime: resizeGhost.newStart,
            end_datetime: resizeGhost.newEnd
          };
          
          console.log('🔧 リサイズ更新データ:', updateData);
          await onUpdateSchedule(resizeData.schedule.id, updateData);
          console.log('✅ リサイズ更新成功（行変更なし）');
          await onReloadSchedules();
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
      // setMousePosition(null); // 不要
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
  }, [dragData, dragGhost, resizeData, resizeGhost, scaledCellWidth, scaledRowHeight, onUpdateSchedule, onReloadSchedules]);

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
