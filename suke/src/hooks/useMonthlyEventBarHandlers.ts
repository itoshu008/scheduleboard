import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Schedule } from '../types';
import { getTimeSlot, getTimeFromSlot } from '../utils/dateUtils';
import { toApiColor } from '../utils/color';
import { scheduleApi } from '../utils/api';

// getTimeSlotとgetTimeFromSlotはdateUtilsからインポート済み

interface InteractionState {
  dragData: {
    schedule: Schedule;
    startX: number;
    startY: number;
    startSlot: number;
    startDate: Date;
    offsetX: number; // カーソル位置とイベントバー中心のXオフセット
    offsetY: number; // カーソル位置とイベントバー中心のYオフセット
  } | null;
  resizeData: {
    schedule: Schedule;
    edge: 'start' | 'end';
    startX: number;
    originalStart: Date;
    originalEnd: Date;
  } | null;
  isEventBarInteracting: boolean;
  isModalClosing: boolean;
  showEditModal: boolean;
  dragGhost: {
    schedule: Schedule;
    newSlot: number;
    newDate: Date;
    deltaX: number;
    deltaY: number;
    newEmployeeId?: number; // 日別・全社員ビューでの社員間移動用
    centerX: number; // イベントバー中心のX座標（カーソル位置）
    centerY: number; // イベントバー中心のY座標（カーソル位置）
  } | null;
  resizeGhost: {
    schedule: Schedule;
    edge: 'start' | 'end';
    newStart: Date;
    newEnd: Date;
  } | null;
}

interface UseMonthlyEventBarHandlersProps {
  scaledCellWidth: number;
  scaledRowHeight: number;
  reloadSchedules: () => Promise<void>;
  setSelectedSchedule?: (schedule: Schedule | null) => void;
  setSelectedCells?: (cells: Set<string>) => void;
  // 日別・全社員ビューでの社員間移動をサポート
  getEmployeeIdFromDelta?: (originalEmployeeId: number, delta: number) => number;
  enableVerticalMovement?: boolean; // 縦方向移動を有効化（日別・全社員ビュー用）
}

export const useMonthlyEventBarHandlers = ({
  scaledCellWidth,
  scaledRowHeight,
  reloadSchedules,
  setSelectedSchedule,
  setSelectedCells,
  getEmployeeIdFromDelta,
  enableVerticalMovement = false
}: UseMonthlyEventBarHandlersProps) => {
  // タイムスロットから日時を作成する関数
  const createTimeFromSlot = useCallback((date: Date, slot: number): Date => {
    const { hour, minute } = getTimeFromSlot(slot);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  }, []);

  // 時刻からスロット番号を取得
  const getTimeSlot = useCallback((date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return hours * 4 + Math.floor(minutes / 15);
  }, []);
  // 統合されたinteractionState（同値ガード化）
  const [interactionState, _setInteractionState] = useState<InteractionState>({
    dragData: null,
    resizeData: null,
    isEventBarInteracting: false,
    isModalClosing: false,
    showEditModal: false,
    dragGhost: null,
    resizeGhost: null
  });

  // 同値ガード付きのsetState
  const setInteractionState = useMemo(() => {
    return (next: any) => {
      _setInteractionState((prev: any) => {
        const v = typeof next === 'function' ? next(prev) : next;
        // 浅い比較で同値チェック
        if (Object.is(prev, v)) return prev;
        if (!prev || !v || typeof prev !== 'object' || typeof v !== 'object') return v;
        const ka = Object.keys(prev), kb = Object.keys(v);
        if (ka.length !== kb.length) return v;
        for (const k of ka) {
          if (!Object.prototype.hasOwnProperty.call(v, k) || !Object.is(prev[k], v[k])) {
            return v;
          }
        }
        return prev; // 同値なら同じ参照を返す
      });
    };
  }, []);

  // リサイズ状態
  const [isResizing, setIsResizing] = useState(false);
  
  // マウス位置
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  // interactionStateの最新値を保持するref
  const interactionStateRef = useRef(interactionState);
  useEffect(() => {
    interactionStateRef.current = interactionState;
  }, [interactionState]);

  // スケジュール位置更新（日付と時間の両方対応、社員間移動もサポート）
  const updateSchedulePosition = useCallback(async (schedule: Schedule, newDate: Date, newSlot: number, newEmployeeId?: number) => {
    try {
      const originalStart = new Date(schedule.start_datetime);
      const originalEnd = new Date(schedule.end_datetime);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newStart = createTimeFromSlot(newDate, newSlot);
      const newEnd = new Date(newStart.getTime() + duration);
      
      // 社員IDの更新（日別・全社員ビューでの社員間移動）
      const finalEmployeeId = newEmployeeId !== undefined ? newEmployeeId : schedule.employee_id;
      
      const updateData = {
        title: schedule.title || '無題',
        employee_id: finalEmployeeId,
        start_datetime: newStart,
        end_datetime: newEnd,
        color: toApiColor(schedule.color)
      };

      console.log('Updating schedule position:', {
        id: schedule.id,
        oldDate: originalStart.toDateString(),
        newDate: newDate.toDateString(),
        oldSlot: getTimeSlot(originalStart),
        newSlot,
        oldEmployeeId: schedule.employee_id,
        newEmployeeId: finalEmployeeId,
        newStart: newStart.toISOString(),
        newEnd: newEnd.toISOString(),
        updateData: {
          ...updateData,
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString()
        }
      });

      await scheduleApi.update(schedule.id, updateData);

      // WebSocketの更新を待つ（サーバーがブロードキャストするまで少し待つ）
      console.log('📡 Waiting for WebSocket update after move...');
      await new Promise(resolve => setTimeout(resolve, 300)); // 300ms待つ

      // スケジュール一覧を再読み込み
      await reloadSchedules();
      console.log('✅ Schedule moved successfully with fine precision');
    } catch (error) {
      console.error('Schedule move failed:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        console.error('Error response:', (error as any).response?.data);
        console.error('Error status:', (error as any).response?.status);
      }
      alert('スケジュールの移動に失敗しました。');
    }
  }, [createTimeFromSlot, getTimeSlot, reloadSchedules]);

  // スケジュールドラッグ開始
  const handleScheduleMouseDown = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は選択/ドラッグを無効化（右クリックスクロール用）
    if ((e as any).detail && (e as any).detail > 1) return; // ダブルクリック時はドラッグ無効化
    
    // リサイズハンドル上ではドラッグ操作を無効
    const target = e.target as HTMLElement;
    if (target && target.classList && target.classList.contains('resize-handle')) {
      return;
    }
    
    // リサイズ中はドラッグ操作を無効
    if (isResizing || interactionState.resizeData) {
      console.log('🚫 リサイズ中のためドラッグを無効化');
      return;
    }
    
    // 背景クリックでの選択解除を防ぐ
    e.stopPropagation();
    
    console.log('Schedule mouse down started for:', schedule.title, schedule.id);
    
    // 即座に選択状態を設定
    if (setSelectedSchedule) {
      setSelectedSchedule(schedule);
    }
    
    // セル選択状態をクリア（スケジュール選択のみ）
    if (setSelectedCells) {
      setSelectedCells(new Set());
    }

    // イベントバーの中央を基準点として計算
    const scheduleElement = e.currentTarget as HTMLElement;
    const rect = scheduleElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // カーソル位置とイベントバー中心のオフセットを計算
    const offsetX = e.clientX - centerX;
    const offsetY = e.clientY - centerY;
    
    // ドラッグ開始
    const startTime = new Date(schedule.start_datetime);
    const startSlot = getTimeSlot(startTime);
    const startDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
    
    setInteractionState((prev: any) => ({
      ...prev,
      dragData: {
        schedule,
        startX: e.clientX,
        startY: e.clientY,
        startSlot,
        startDate,
        offsetX, // カーソル位置とイベントバー中心のXオフセット
        offsetY  // カーソル位置とイベントバー中心のYオフセット
      }
    }));
    
    // ドラッグ開始の閾値
    const DRAG_THRESHOLD = 5;
    
    const startX = e.clientX; // カーソル位置を基準に
    const startY = e.clientY; // カーソル位置を基準に
    let dragInitiated = false;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragInitiated) return;
      
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      
      // 閾値を超えたらドラッグ開始
      if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
        dragInitiated = true;
        
        console.log('Drag initiated for:', schedule.title);
        
        // ドラッグ開始時にセル選択をクリア
        if (setSelectedCells) {
          setSelectedCells(new Set());
        }
        
        const startTime = new Date(schedule.start_datetime);
        const startDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
        
        setInteractionState((prev: any) => ({
          ...prev,
          dragData: {
            schedule,
            startX: moveEvent.clientX, // 現在のカーソル位置
            startY: moveEvent.clientY, // 現在のカーソル位置
            startSlot: getTimeSlot(startTime),
            startDate,
            offsetX, // カーソル位置とイベントバー中心のXオフセット
            offsetY  // カーソル位置とイベントバー中心のYオフセット
          },
          dragGhost: {
            schedule,
            newSlot: getTimeSlot(startTime),
            newDate: new Date(startTime),
            deltaX: 0,
            deltaY: 0,
            centerX: moveEvent.clientX, // カーソル位置（イベントバー中心）
            centerY: moveEvent.clientY  // カーソル位置（イベントバー中心）
          }
        }));

        // 初期マウス位置をカーソル位置に設定
        setMousePosition({ x: moveEvent.clientX, y: moveEvent.clientY });
        
        console.log('Drag data set:', {
          schedule: schedule.id,
          startX: moveEvent.clientX,
          startY: moveEvent.clientY,
          offsetX,
          offsetY,
          startSlot: getTimeSlot(startTime),
          startDate: startDate.toDateString()
        });
        
        // クリーンアップ
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };
    
    const handleMouseUp = () => {
      // クリーンアップ
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (!dragInitiated) {
        console.log('Click completed for schedule:', schedule.id);
      }
    };
    
    // イベントリスナー登録
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isResizing, interactionState.resizeData, getTimeSlot, setSelectedSchedule, setSelectedCells]);

  // リサイズハンドルのマウスダウン
  const handleResizeMouseDown = useCallback((schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時はリサイズを無効化（右クリックスクロール用）
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🔧 リサイズ開始:', { scheduleId: schedule.id, edge, mouseX: e.clientX, mouseY: e.clientY });
    
    setIsResizing(true);
    setInteractionState((prev: any) => ({
      ...prev,
      resizeData: {
        schedule,
        edge,
        startX: e.clientX,
        originalStart: new Date(schedule.start_datetime),
        originalEnd: new Date(schedule.end_datetime)
      }
    }));
    
    setInteractionState((prev: any) => ({
      ...prev,
      resizeGhost: {
        schedule,
        newStart: new Date(schedule.start_datetime),
        newEnd: new Date(schedule.end_datetime),
        edge
      }
    }));

    // 初期マウス位置を設定（リサイズゴースト表示用）
    setMousePosition({ x: e.clientX, y: e.clientY });
  }, []);

  // グローバルマウス移動処理（最適化版）
  useEffect(() => {
    let rafId: number | null = null;
    let lastUpdateTime = 0;
    const UPDATE_THROTTLE = 16; // 約60fps（16ms間隔）
    
    const handleMouseMove = (e: MouseEvent) => {
      const state = interactionStateRef.current;
      const now = Date.now();
      if (now - lastUpdateTime < UPDATE_THROTTLE) {
        return; // スロットリング
      }
      
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      
      rafId = requestAnimationFrame(() => {
        lastUpdateTime = now;
        const currentState = interactionStateRef.current;
        
        // ドラッグ処理
        if (currentState.dragData && currentState.dragGhost) {
          // カーソル位置からイベントバー中心位置を計算
          const centerX = e.clientX - currentState.dragData.offsetX;
          const centerY = e.clientY - currentState.dragData.offsetY;
          
          // イベントバー中心位置からの移動量を計算
          const originalStart = new Date(currentState.dragData.schedule.start_datetime);
          const originalEnd = new Date(currentState.dragData.schedule.end_datetime);
          const originalDuration = originalEnd.getTime() - originalStart.getTime();
          
          // 元のイベントバーの中心位置を計算（グリッド座標系）
          // これは実際のグリッドコンテナの位置を取得する必要がある
          // とりあえず、カーソル位置を基準にスロットを計算
          // グリッドコンテナの左端からの相対位置を取得する必要がある
          // ここでは、カーソル位置から直接スロットを計算するのではなく、
          // イベントバー中心位置を基準にスロットを計算する
          
          // 時間軸の移動（横方向）- カーソル位置からオフセットを引いた位置を基準に
          // 実際のグリッドコンテナの位置を取得する必要があるが、ここでは簡易的に
          // カーソル位置から直接計算する（後でグリッドコンテナの位置を考慮する必要がある）
          const deltaX = centerX - (currentState.dragData.startX - currentState.dragData.offsetX);
          const deltaY = centerY - (currentState.dragData.startY - currentState.dragData.offsetY);
          
          // 時間軸の移動（横方向）
          const slotDelta = Math.round(deltaX / scaledCellWidth);
          const newStartSlot = Math.max(0, Math.min(95, currentState.dragData.startSlot + slotDelta));
          
          let newDate: Date;
          let newEmployeeId: number | undefined;
          
          if (enableVerticalMovement && getEmployeeIdFromDelta) {
            // 日別・全社員ビュー：縦方向移動は社員間移動として処理
            const employeeDelta = Math.round(deltaY / scaledRowHeight);
            newEmployeeId = getEmployeeIdFromDelta(currentState.dragData.schedule.employee_id, employeeDelta);
            // 日付は変更しない（同じ日付内での社員間移動）
            newDate = new Date(currentState.dragData.startDate);
          } else {
            // 月別ビュー：縦方向移動は日付変更として処理
            const dateDelta = Math.round(deltaY / scaledRowHeight);
            newDate = new Date(currentState.dragData.startDate);
            newDate.setDate(newDate.getDate() + dateDelta);
          }
          
          // 新しい開始・終了時刻を計算
          const newStart = createTimeFromSlot(newDate, newStartSlot);
          const newEnd = new Date(newStart.getTime() + originalDuration);
          
          // 変更があった場合のみ更新
          const currentGhost = currentState.dragGhost;
          if (currentGhost.newSlot !== newStartSlot || 
              currentGhost.newDate.getTime() !== newDate.getTime() ||
              (enableVerticalMovement && currentGhost.newEmployeeId !== newEmployeeId)) {
            setInteractionState((prev: any) => ({
              ...prev,
              dragGhost: {
                schedule: currentState.dragData!.schedule,
                newSlot: newStartSlot,
                newDate: newDate,
                deltaX: e.clientX - currentState.dragData!.startX,
                deltaY: e.clientY - currentState.dragData!.startY,
                newEmployeeId: enableVerticalMovement ? newEmployeeId : undefined,
                centerX: e.clientX, // カーソル位置（イベントバー中心）
                centerY: e.clientY  // カーソル位置（イベントバー中心）
              }
            }));
          }
        }

        // リサイズ処理
        if (currentState.resizeData && currentState.resizeGhost) {
          const deltaX = e.clientX - currentState.resizeData.startX;
          const slotDelta = Math.round(deltaX / scaledCellWidth);

          let newStart = new Date(currentState.resizeData.originalStart);
          let newEnd = new Date(currentState.resizeData.originalEnd);
          
          if (currentState.resizeData.edge === 'start') {
            // 左ハンドル：開始時刻を変更、終了時刻は固定
            newEnd = currentState.resizeData.originalEnd; // 終了時刻は固定
            
            // 新しい開始時刻を計算（左に伸ばすことができるように）
            const originalStartSlot = getTimeSlot(currentState.resizeData.originalStart);
            let newStartSlot = originalStartSlot + slotDelta;
            
            // 境界チェック：0以上、終了時刻より前
            const endSlot = getTimeSlot(currentState.resizeData.originalEnd);
            newStartSlot = Math.max(0, Math.min(newStartSlot, endSlot - 1)); // 最低1スロット分の幅を確保
            
            const startDate = new Date(currentState.resizeData.originalStart);
            startDate.setHours(0, 0, 0, 0);
            newStart = createTimeFromSlot(startDate, newStartSlot);
            
          } else {
            // 右ハンドル：終了時刻を変更、開始時刻は固定
            newStart = currentState.resizeData.originalStart; // 開始時刻は固定
            
            const originalEndSlot = getTimeSlot(currentState.resizeData.originalEnd);
            let newEndSlot = originalEndSlot + slotDelta;
            
            // 境界チェック：開始時刻より後、95以下
            const startSlot = getTimeSlot(currentState.resizeData.originalStart);
            newEndSlot = Math.max(startSlot + 1, Math.min(newEndSlot, 95)); // 最低1スロット分の幅を確保
            
            const endDate = new Date(currentState.resizeData.originalEnd);
            endDate.setHours(0, 0, 0, 0);
            newEnd = createTimeFromSlot(endDate, newEndSlot);
            
          }
          
          // 変更があった場合のみ更新
          const currentGhost = currentState.resizeGhost;
          if (currentGhost.newStart.getTime() !== newStart.getTime() || 
              currentGhost.newEnd.getTime() !== newEnd.getTime()) {
            setInteractionState((prev: any) => ({
              ...prev,
              resizeGhost: {
                schedule: currentState.resizeData!.schedule,
                newStart,
                newEnd,
                edge: currentState.resizeData!.edge
              }
            }));
          }
        }
      });
    };

    // イベントリスナー登録（ドラッグまたはリサイズ中のみ、かつ編集モーダルが閉じている時のみ）
    const hasActiveOperation = interactionState.dragData || interactionState.resizeData;
    if (hasActiveOperation && !interactionState.showEditModal) {
      document.addEventListener('mousemove', handleMouseMove, { passive: true });
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [!!interactionState.dragData, !!interactionState.resizeData, interactionState.showEditModal, scaledCellWidth, scaledRowHeight, getTimeSlot, createTimeFromSlot]);

  // グローバルマウスアップ処理
  useEffect(() => {
    const handleMouseUp = async () => {
      const state = interactionStateRef.current;
      console.log('🎯 グローバルマウスアップ:', { dragData: !!state.dragData, resizeData: !!state.resizeData });
      
      // イベントバー操作状態をリセット
      if (state.isEventBarInteracting) {
        console.log('🔄 Resetting event bar interaction state');
        setInteractionState((prev: any) => ({ ...prev, isEventBarInteracting: false }));
      }
      
      // ドラッグ終了処理
      if (state.dragData && state.dragGhost) {
        try {
          console.log('🚚 ドラッグ確定:', {
            scheduleId: state.dragData.schedule.id,
            newDate: state.dragGhost.newDate,
            newSlot: state.dragGhost.newSlot,
            newEmployeeId: state.dragGhost.newEmployeeId
          });
          
          // ドラッグ終了 - スケジュール更新（社員間移動も考慮）
          await updateSchedulePosition(
            state.dragData.schedule, 
            state.dragGhost.newDate, 
            state.dragGhost.newSlot,
            state.dragGhost.newEmployeeId
          );
          
          console.log('Drag update completed successfully');
        } catch (error) {
          console.error('Drag update failed:', error);
          alert('スケジュールの移動に失敗しました: ' + (error as any)?.message);
        }
      }
      
      // リサイズ終了処理
      if (state.resizeData && state.resizeGhost) {
        try {
          console.log('🔧 リサイズ確定:', {
            scheduleId: state.resizeData.schedule.id,
            edge: state.resizeData.edge,
            newStart: state.resizeGhost.newStart.toISOString(),
            newEnd: state.resizeGhost.newEnd.toISOString()
          });
          
          const updateData = {
            title: state.resizeData.schedule.title || '無題',
            color: toApiColor(state.resizeData.schedule.color),
            employee_id: state.resizeData.schedule.employee_id,
            start_datetime: state.resizeGhost.newStart,
            end_datetime: state.resizeGhost.newEnd
          };
          
          await scheduleApi.update(state.resizeData.schedule.id, updateData);
          
          // WebSocketの更新を待つ（サーバーがブロードキャストするまで少し待つ）
          console.log('📡 Waiting for WebSocket update after resize...');
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms待つ
          
          await reloadSchedules();
          
          console.log('Resize update completed successfully');
        } catch (error) {
          console.error('Resize update failed:', error);
          alert('スケジュールのリサイズに失敗しました: ' + (error as any)?.message);
        }
      }
      
      // 状態をクリア
      setInteractionState((prev: any) => ({
        ...prev,
        dragData: null,
        dragGhost: null,
        resizeData: null,
        resizeGhost: null
      }));
      setMousePosition(null);
      setIsResizing(false);
    };

    // イベントリスナー登録（ドラッグまたはリサイズ中のみ、かつ編集モーダルが閉じている時のみ）
    const hasActiveOperation = interactionState.dragData || interactionState.resizeData;
    if (hasActiveOperation && !interactionState.showEditModal) {
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [!!interactionState.dragData, !!interactionState.resizeData, interactionState.showEditModal, updateSchedulePosition, reloadSchedules]);

  return {
    interactionState,
    setInteractionState,
    isResizing,
    mousePosition,
    handleScheduleMouseDown,
    handleResizeMouseDown,
    updateSchedulePosition
  };
};

