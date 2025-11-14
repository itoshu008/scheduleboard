import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Equipment, Employee, SCHEDULE_COLORS } from '../../types';
import { api } from '../../api';
import dayjs from 'dayjs';
import { formatDate, getTimeSlot, getTimeFromSlot, getEndTimeSlot, parseLocalDateTimeString, toLocalISODateTime } from '../../utils/dateUtils';
import { CELL_WIDTH_PX } from '../../utils/uiConstants';
import ScheduleRegistrationModal from '../ScheduleRegistrationModal/ScheduleRegistrationModal';
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
// 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
import { useMonthlyEventBarHandlers } from '../../hooks/useMonthlyEventBarHandlers';
import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';
import { vehicleReservationApi } from '../../utils/api';
import ContextMenu, { ContextMenuItem } from '../ContextMenu/ContextMenu';
import ManagementTabs from '../ManagementTabs/ManagementTabs';
import DepartmentRegistration from '../DepartmentRegistration/DepartmentRegistration';
import EmployeeRegistration from '../EmployeeRegistration/EmployeeRegistration';
import EquipmentRegistration from '../EquipmentRegistration/EquipmentRegistration';
import './SimpleVehicleReservation.css';

interface SimpleVehicleReservationProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  vehicles: Equipment[];
}

interface Reservation {
  id: number;
  title: string;
  vehicle_id: number;
  employee_id: number;
  start_datetime: string;
  end_datetime: string;
  color?: string;
  vehicle_name?: string;
  employee_name?: string;
}

const SimpleVehicleReservation: React.FC<SimpleVehicleReservationProps> = ({
  selectedDate,
  onDateChange,
  vehicles
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Reservation | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [clipboard, setClipboard] = useState<Reservation | null>(null);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<Reservation | null>(null);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  // セル選択フック
  const {
    selectedCells,
    isSelecting,
    selectionAnchor,
    selectedSchedule: selectedScheduleFromHook,
    setSelectedCells,
    setIsSelecting,
    setSelectionAnchor,
    setSelectedSchedule: setSelectedScheduleFromHook,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellMouseUp,
    handleCellDoubleClick,
    getSelectedCellDateTime,
    clearSelection
  } = useScheduleCellSelection();

  // 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
  // 注意: loadReservationsを先に定義してからreloadSchedulesを定義する必要がある
  const scheduleScale = 1; // 車両ビューは固定スケール（セル幅は20px）

  // 初期データ読み込み
  useEffect(() => {
    loadEmployees();
    loadReservations();
  }, [selectedDate]);

  const loadEmployees = async () => {
    try {
      const response = await api.get('/admin/employees');
      setEmployees(response.data || []);
    } catch (error) {
      console.error('従業員データの読み込みに失敗:', error);
    }
  };

  const loadReservations = useCallback(async () => {
    try {
      setLoading(true);
      const dateStr = formatDate(selectedDate);
      console.log(`🔄 [車両予約] loadReservations called for date: ${dateStr}`);
      const response = await api.get(`/vehicle-reservations?date=${dateStr}`);
      const reservationsData = response.data || [];
      console.log(`🔄 [車両予約] Loaded ${reservationsData.length} reservations:`, reservationsData);
      setReservations(reservationsData);
      console.log(`✅ [車両予約] setReservations called with ${reservationsData.length} items`);
    } catch (error) {
      console.error('予約データの読み込みに失敗:', error);
      setError('予約データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // reloadSchedulesをloadReservationsの後に定義（初期化順序の問題を回避）
  const reloadSchedules = useCallback(async () => {
    await loadReservations();
  }, [loadReservations]);

  // 月別ビューのイベントバー処理ロジックを使用（車両予約用にカスタマイズ）
  const {
    interactionState,
    setInteractionState,
    isResizing,
    mousePosition,
    handleScheduleMouseDown,
    handleResizeMouseDown,
    setIsResizing
  } = useMonthlyEventBarHandlers({
    scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
    scaledRowHeight: 40 * scheduleScale,
    reloadSchedules,
    setSelectedSchedule: (schedule: any) => setSelectedSchedule(schedule),
    setSelectedCells,
    disableGlobalMouseup: true // 車両予約ページでは独自のmouseupハンドラーを使用
  });

  // 車両予約用のドラッグ＆リサイズ処理（vehicleReservationApiを使用）
  // interactionStateの最新値を保持するref
  const interactionStateRef = useRef(interactionState);
  useEffect(() => {
    interactionStateRef.current = interactionState;
  }, [interactionState]);

  useEffect(() => {
    const handleMouseUp = async (e: MouseEvent) => {
      const state = interactionStateRef.current;
      
      // 車両予約ページでは独自の処理を行う（useMonthlyEventBarHandlersのグローバルmouseupは無効化済み）
      const hasActiveOperation = state.dragData || state.resizeData;
      if (!hasActiveOperation) return;
      
      console.log('🎯 車両予約mouseup:', { dragData: !!state.dragData, resizeData: !!state.resizeData });
      
      // ドラッグ終了処理
      if (state.dragData && state.dragGhost) {
        try {
          console.log(`🔄 Drag ended for reservation ID=${state.dragData.schedule.id}`);
          
          // 新しい開始・終了時刻を計算
          const originalStart = new Date(state.dragData.schedule.start_datetime);
          const originalEnd = new Date(state.dragData.schedule.end_datetime);
          const originalDuration = originalEnd.getTime() - originalStart.getTime();
          
          const { hour, minute } = getTimeFromSlot(state.dragGhost.newSlot);
          const newStart = new Date(
            state.dragGhost.newDate.getFullYear(),
            state.dragGhost.newDate.getMonth(),
            state.dragGhost.newDate.getDate(),
            hour,
            minute
          );
          const newEnd = new Date(newStart.getTime() + originalDuration);
          
          console.log(`🔄 Updating reservation:`, {
            id: state.dragData.schedule.id,
            oldStart: originalStart.toLocaleString('ja-JP'),
            oldEnd: originalEnd.toLocaleString('ja-JP'),
            newStart: newStart.toLocaleString('ja-JP'),
            newEnd: newEnd.toLocaleString('ja-JP')
          });
          
          const updateData = {
            title: state.dragData.schedule.title || '予約',
            color: toApiColor(state.dragData.schedule.color),
            employee_id: state.dragData.schedule.employee_id,
            vehicle_id: state.dragData.schedule.vehicle_id || (state.dragData.schedule as any).vehicle_id,
            start_datetime: newStart, // Dateオブジェクトを直接渡す（vehicleReservationApi.updateが変換する）
            end_datetime: newEnd // Dateオブジェクトを直接渡す（vehicleReservationApi.updateが変換する）
          };
          
          console.log(`🔄 Update payload:`, updateData);
          
          await vehicleReservationApi.update(state.dragData.schedule.id, updateData);
          
          console.log(`✅ Update API call completed`);
          
          // WebSocketの更新を待つ（サーバーがブロードキャストするまで少し待つ）
          console.log('📡 Waiting for WebSocket update after drag...');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // WebSocketでデータが更新されるが、念のため手動でリロード
          await loadReservations();
          
          console.log('✅ Drag update completed successfully');
          
        } catch (error) {
          console.error('車両予約ドラッグ更新エラー:', error);
          alert('予約の移動に失敗しました: ' + (error as any)?.message);
        }
      }
      
      // リサイズ終了処理
      if (state.resizeData && state.resizeGhost) {
        try {
          console.log(`🔄 Resize ended for reservation ID=${state.resizeData.schedule.id}`);
          console.log(`🔄 Updating reservation:`, {
            id: state.resizeData.schedule.id,
            newStart: state.resizeGhost.newStart.toLocaleString('ja-JP'),
            newEnd: state.resizeGhost.newEnd.toLocaleString('ja-JP')
          });
          
          const updateData = {
            title: state.resizeData.schedule.title || '予約',
            color: toApiColor(state.resizeData.schedule.color),
            employee_id: state.resizeData.schedule.employee_id,
            vehicle_id: state.resizeData.schedule.vehicle_id || (state.resizeData.schedule as any).vehicle_id,
            start_datetime: state.resizeGhost.newStart, // Dateオブジェクトを直接渡す（vehicleReservationApi.updateが変換する）
            end_datetime: state.resizeGhost.newEnd // Dateオブジェクトを直接渡す（vehicleReservationApi.updateが変換する）
          };
          
          console.log(`🔄 Update payload:`, updateData);
          
          await vehicleReservationApi.update(state.resizeData.schedule.id, updateData);
          
          console.log(`✅ Update API call completed`);
          
          // WebSocketの更新を待つ（サーバーがブロードキャストするまで少し待つ）
          console.log('📡 Waiting for WebSocket update after resize...');
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // WebSocketでデータが更新されるが、念のため手動でリロード
          await loadReservations();
          
          console.log('✅ Resize update completed successfully');
          
        } catch (error) {
          console.error('車両予約リサイズ更新エラー:', error);
          alert('予約のリサイズに失敗しました: ' + (error as any)?.message);
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
      
      // isResizingもリセット
      if (setIsResizing) {
        setIsResizing(false);
      }
    };

    // イベントリスナー登録（ドラッグまたはリサイズ中のみ）
    const hasActiveOperation = interactionState.dragData || interactionState.resizeData;
    if (hasActiveOperation && !interactionState.showEditModal) {
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [!!interactionState.dragData, !!interactionState.resizeData, interactionState.showEditModal, loadReservations, setInteractionState]);

  // 月別ビューのロジックと互換性を保つため、既存の変数名をエイリアス
  const dragData = interactionState.dragData;
  const dragGhost = interactionState.dragGhost;
  const resizeData = interactionState.resizeData;
  const resizeGhost = interactionState.resizeGhost;

  // セル選択状態（直接管理 - 全社員ページと同様）
  const [localSelectedCells, setLocalSelectedCells] = useState<Set<string>>(new Set());
  const [localIsSelecting, setLocalIsSelecting] = useState(false);
  const [localSelectionAnchor, setLocalSelectionAnchor] = useState<{ vehicleId: number; slot: number } | null>(null);

  // 車両予約ページ用のセル選択ハンドラー（全社員ページと同様）
  const handleVehicleCellMouseDown = useCallback((vehicleId: number, slot: number, e?: React.MouseEvent) => {
    // 右クリック時はセル選択を無効化（右クリックドラッグスクロール用）
    if (e && e.button === 2) return;
    if (e && e.button !== 0) return; // 左クリック以外はセル選択無効化
    
    // セルIDに日付情報を含める（全社員ページと統一）
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const cellId = `${year}-${month}-${day}-vehicle-${vehicleId}-${slot}`;
    
    // スケジュール選択をクリア
    setSelectedSchedule(null);
    
    // セル選択開始
    setLocalSelectedCells(new Set([cellId]));
    setLocalIsSelecting(true);
    setLocalSelectionAnchor({ vehicleId, slot });
  }, [selectedDate]);

  const handleVehicleCellMouseEnter = useCallback((vehicleId: number, slot: number) => {
    if (!localIsSelecting || !localSelectionAnchor) return;
    
    const newSelectedCells = new Set<string>();
    const startVehicle = Math.min(localSelectionAnchor.vehicleId, vehicleId);
    const endVehicle = Math.max(localSelectionAnchor.vehicleId, vehicleId);
    const startSlot = Math.min(localSelectionAnchor.slot, slot);
    const endSlot = Math.max(localSelectionAnchor.slot, slot);

    // セルIDに日付情報を含める
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    
    // 設備リストから実際のvehicleIdを取得
    const vehicleList = vehicles;
    
    for (let vehIndex = 0; vehIndex < vehicleList.length; vehIndex++) {
      const veh = vehicleList[vehIndex];
      if (veh.id >= startVehicle && veh.id <= endVehicle) {
        for (let s = startSlot; s <= endSlot; s++) {
          newSelectedCells.add(`${year}-${month}-${day}-vehicle-${veh.id}-${s}`);
        }
      }
    }
    
    setLocalSelectedCells(newSelectedCells);
  }, [localIsSelecting, localSelectionAnchor, vehicles, selectedDate]);

  const handleVehicleCellMouseUp = useCallback(() => {
    setLocalIsSelecting(false);
    setLocalSelectionAnchor(null);
    
    // 選択されたセルをuseScheduleCellSelectionの形式に変換
    const convertedCells = new Set<string>();
    localSelectedCells.forEach(cellId => {
      // 形式: YYYY-MM-DD-vehicle-vehicleId-slot
      // これをvehicle-vehicleId-slot形式に変換（既存のコードとの互換性のため）
      const parts = cellId.split('-');
      if (parts.length >= 6 && parts[3] === 'equipment') {
        const vehicleId = parts[4];
        const slot = parts[5];
        convertedCells.add(`vehicle-${vehicleId}-${slot}`);
      }
    });
    setSelectedCells(convertedCells);
    
    // 2セル以上選択時は自動的にモーダルを開く
    if (convertedCells.size >= 2) {
      // 選択されたセルから設備IDを取得（最初のセルから）
      const firstCellId = Array.from(convertedCells)[0];
      const parts = firstCellId.split('-');
      if (parts.length >= 3 && parts[0] === 'equipment') {
        const vehicleId = parseInt(parts[1]);
        setSelectedVehicleId(vehicleId);
      }
      setSelectedSchedule(null);
      setShowRegistrationModal(true);
    }
  }, [localSelectedCells, setSelectedCells]);

  // グローバルなmouseupイベントリスナーでドラッグ終了を検知
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (localIsSelecting) {
        setLocalIsSelecting(false);
        setLocalSelectionAnchor(null);
        
        // 選択されたセルをuseScheduleCellSelectionの形式に変換
        const convertedCells = new Set<string>();
        localSelectedCells.forEach(cellId => {
          const parts = cellId.split('-');
          if (parts.length >= 6 && parts[3] === 'equipment') {
            const vehicleId = parts[4];
            const slot = parts[5];
            convertedCells.add(`vehicle-${vehicleId}-${slot}`);
          }
        });
        setSelectedCells(convertedCells);
        
        // 2セル以上選択時は自動的にモーダルを開く
        if (convertedCells.size >= 2) {
          // 選択されたセルから設備IDを取得（最初のセルから）
          const firstCellId = Array.from(convertedCells)[0];
          const parts = firstCellId.split('-');
          if (parts.length >= 3 && parts[0] === 'equipment') {
            const vehicleId = parseInt(parts[1]);
            setSelectedVehicleId(vehicleId);
          }
          setSelectedSchedule(null);
          setShowRegistrationModal(true);
        }
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [localIsSelecting, localSelectedCells, setSelectedCells]);

  // 予約保存（ScheduleRegistrationModalから呼ばれる）
  // ScheduleRegistrationModalが既に/vehicle-reservationsを呼び出しているので、
  // ここでは予約リストの再読み込みと状態のクリアのみを行う
  const handleReservationSave = async (createdData: any) => {
    try {
      // WebSocketの更新を待つ（サーバー側のbroadcastDataChangeが反映されるまで）
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // ScheduleRegistrationModalが既にAPIを呼び出しているので、予約リストを再読み込み
      await loadReservations();
      
      setShowRegistrationModal(false);
      setSelectedCells(new Set());
      setLocalSelectedCells(new Set());
      setLocalIsSelecting(false);
      setLocalSelectionAnchor(null);
      setSelectedSchedule(null);
      setSelectedVehicleId(null);
    } catch (error: any) {
      console.error('予約保存後の処理エラー:', error);
    }
  };

  // 予約削除
  const handleReservationDelete = useCallback(async (reservationId: number) => {
    try {
      await vehicleReservationApi.delete(reservationId);
      
      // WebSocketの更新を待つ
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await loadReservations();
      setSelectedSchedule(null);
      setContextMenuPosition(null);
      setContextMenuTarget(null);
    } catch (error: any) {
      console.error('予約削除エラー:', error);
      alert('予約の削除に失敗しました: ' + (error?.message || 'Unknown error'));
    }
  }, [loadReservations]);

  // 予約コピー
  const handleReservationCopy = useCallback((reservation: Reservation) => {
    setClipboard({ ...reservation });
    setContextMenuPosition(null);
    setContextMenuTarget(null);
  }, []);

  // 予約ペースト
  const handleReservationPaste = useCallback(async () => {
    if (!clipboard) return;
    
    const targetDate = selectedDate;
    let targetVehicleId = clipboard.vehicle_id;
    
    // セルが選択されている場合は、その位置にペースト
    if (selectedCells.size > 0) {
      const firstCellId = Array.from(selectedCells)[0];
      const parts = firstCellId.split('-');
      // 形式: vehicle-{vehicleId}-{slot} または YYYY-MM-DD-vehicle-{vehicleId}-{slot}
      if (parts.length >= 3) {
        const vehicleIdStr = parts[parts.length - 2];
        targetVehicleId = parseInt(vehicleIdStr);
      }
    }
    
    const duration = new Date(clipboard.end_datetime).getTime() - new Date(clipboard.start_datetime).getTime();
    const startTime = new Date(targetDate);
    startTime.setHours(9, 0, 0, 0); // デフォルト開始時間
    const endTime = new Date(startTime.getTime() + duration);
    
    try {
      const newReservation = {
        vehicle_id: targetVehicleId,
        employee_id: clipboard.employee_id,
        title: clipboard.title,
        start_datetime: toLocalISODateTime(startTime),
        end_datetime: toLocalISODateTime(endTime),
        color: clipboard.color || '#3174ad',
        note: clipboard.note || null
      };
      
      await vehicleReservationApi.create(newReservation);
      
      // WebSocketの更新を待つ
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await loadReservations();
      setContextMenuPosition(null);
      setContextMenuTarget(null);
    } catch (error: any) {
      console.error('予約ペーストエラー:', error);
      alert('予約のペーストに失敗しました: ' + (error?.message || 'Unknown error'));
    }
  }, [clipboard, selectedDate, selectedCells, loadReservations]);

  // コンテキストメニューを閉じる
  const handleContextMenuClose = useCallback(() => {
    setContextMenuPosition(null);
    setContextMenuTarget(null);
  }, []);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedSchedule) {
        handleReservationDelete(selectedSchedule.id);
      } else if (e.ctrlKey && e.key === 'c' && selectedSchedule) {
        handleReservationCopy(selectedSchedule);
      } else if (e.ctrlKey && e.key === 'v' && clipboard) {
        handleReservationPaste();
      } else if (e.key === 'Escape' && (interactionState.dragData || interactionState.resizeData)) {
        // ESCキーでドラッグ・リサイズ操作をキャンセル
        setInteractionState({
          ...interactionState,
          dragData: null,
          dragGhost: null,
          resizeData: null,
          resizeGhost: null
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSchedule, clipboard, interactionState, handleReservationDelete, handleReservationCopy, handleReservationPaste, setInteractionState]);

  // 予約をSchedule型に変換（月別ビューのロジックと互換性を保つため）
  const reservationToSchedule = useCallback((reservation: Reservation): any => {
    return {
      id: reservation.id,
      title: reservation.title,
      employee_id: reservation.employee_id,
      vehicle_id: reservation.vehicle_id, // 車両予約用にvehicle_idを追加
      start_datetime: reservation.start_datetime,
      end_datetime: reservation.end_datetime,
      color: reservation.color || '#dc3545'
    };
  }, []);

  // 予約の表示位置を計算（車両予約ページ専用）
  const getReservationStyle = (reservation: Reservation, vehicleIndex: number) => {
    const startTimeStr = reservation.start_datetime;
    const endTimeStr = reservation.end_datetime;
    
    if (!startTimeStr || !endTimeStr) {
      return { display: 'none' };
    }
    
    let startDate: Date;
    let endDate: Date;
    
    try {
      // ISO形式（Z付きまたはタイムゾーン付き）の場合は、UTCとして解釈してからローカル時間に変換
      if (startTimeStr.includes('T') && (startTimeStr.includes('Z') || startTimeStr.match(/[+-]\d{2}:\d{2}$/))) {
        // ISO形式（UTC）の場合、new Date()で自動的にローカル時間に変換される
        startDate = new Date(startTimeStr);
        endDate = new Date(endTimeStr);
      } else {
        // 既にローカル時間形式の場合
        startDate = parseLocalDateTimeString(startTimeStr);
        endDate = parseLocalDateTimeString(endTimeStr);
      }
      
      // 日付が無効な場合は非表示
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { display: 'none' };
      }
      
      // 選択日の00:00:00から23:59:59.999の範囲をローカル時間で作成
      const selectedDateStart = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        0, 0, 0, 0
      );
      const selectedDateEnd = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        23, 59, 59, 999
      );
      
      // 予約が選択日の範囲と重なるか確認（すべてローカル時間で比較）
      const overlaps = startDate < selectedDateEnd && endDate > selectedDateStart;
      
      if (!overlaps) {
        return { display: 'none' };
      }
      
      // 予約の開始・終了時刻を選択日のローカル時間として再計算
      let startSlot: number;
      let endSlot: number;
      
      // 予約の開始時刻が選択日の範囲内にある場合
      if (startDate >= selectedDateStart && startDate <= selectedDateEnd) {
        const diffMs = startDate.getTime() - selectedDateStart.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        startSlot = Math.floor(diffMinutes / 15);
      } else if (startDate < selectedDateStart) {
        // 前日から続く予約
        startSlot = 0;
      } else {
        return { display: 'none' };
      }
      
      // 予約の終了時刻が選択日の範囲内にある場合
      if (endDate >= selectedDateStart && endDate <= selectedDateEnd) {
        const diffMs = endDate.getTime() - selectedDateStart.getTime();
        const diffMinutes = Math.ceil(diffMs / (1000 * 60));
        endSlot = Math.ceil(diffMinutes / 15);
      } else if (endDate > selectedDateEnd) {
        // 翌日に続く予約
        endSlot = 96;
      } else {
        return { display: 'none' };
      }
      
      // スロットの範囲チェック（0-96の範囲内に収める）
      if (startSlot < 0) startSlot = 0;
      if (startSlot > 96) startSlot = 96;
      if (endSlot < 0) endSlot = 0;
      if (endSlot > 96) endSlot = 96;
      
      // startSlot >= endSlot の場合は最小1スロット分の高さを確保
      if (startSlot >= endSlot) {
        if (startSlot < 96) {
          endSlot = startSlot + 1;
        } else {
          startSlot = 95;
          endSlot = 96;
        }
      }
      
      // スロットが無効な場合は非表示
      if (startSlot < 0 || startSlot >= 96 || endSlot <= startSlot || endSlot > 96) {
        return { display: 'none' };
      }
      
      // 固定設備セルの幅は300px、時間セルは20px幅
      const left = 300 + startSlot * 20;
      const width = (endSlot - startSlot) * 20;
      const top = 2;
      
      return {
        position: 'absolute' as const,
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: '36px',
        background: `linear-gradient(180deg, ${lightenColor(safeHexColor(reservation.color || '#dc3545'), 0.15)} 0%, ${safeHexColor(reservation.color || '#dc3545')} 100%)`,
        border: `1px solid ${lightenColor(safeHexColor(reservation.color || '#dc3545'), -0.10)}`,
        borderRadius: '4px',
        padding: '2px 4px',
        fontSize: '11px',
        color: 'white',
        overflow: 'hidden',
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
      };
    } catch (error) {
      console.error(`Error calculating reservation style (ID=${reservation.id}):`, error);
      return { display: 'none' };
    }
  };

  if (loading) {
    return (
      <div className="loading-center">
        <div className="loading-spinner"></div>
        <p>データを読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="vehicle-schedule">
      {/* ヘッダー */}
      <div className="schedule-header" ref={headerRef}>
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
          <span style={{ fontSize: '18px', fontWeight: 'normal', color: '#666' }}>
            車両予約 - {selectedDate.toLocaleDateString('ja-JP', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'long'
            })}
          </span>
        </h2>
      </div>

      {/* ナビゲーションコントロール */}
      <div className="grid-top-controls" ref={controlsRef}>
        <div className="grid-controls-row">
          <div className="nav-btn-left" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {/* ナビゲーションボタン */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/monthly')}>月別</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/daily')}>日別</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/all-employees')}>全社員</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/equipment')}>設備</button>
              <button className="nav-btn active" onClick={() => (window.location.href = '/scheduleboard/vehicle')}>車両予約</button>
            </div>
          </div>
          <div className="nav-btn-right">
            <button 
              className="nav-btn management-btn" 
              onClick={() => setShowManagementTabs(true)}
              style={{ backgroundColor: 'red', color: 'white' }}
            >
              管理
            </button>
          </div>
        </div>
        <div className="grid-controls-row-second">
          <div className="date-section">
            <div className="date-controls">
              <button 
                className="date-nav-btn day-btn" 
                onClick={() => onDateChange(new Date(selectedDate.getTime() - 24 * 60 * 60 * 1000))}
                title="前日"
              >
                &lsaquo;
              </button>
              <input
                type="date"
                value={formatDate(selectedDate)}
                onChange={(e) => {
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  onDateChange(new Date(year, month - 1, day));
                }}
                className="date-input"
              />
              <button 
                className="date-nav-btn day-btn" 
                onClick={() => onDateChange(new Date(selectedDate.getTime() + 24 * 60 * 60 * 1000))}
                title="翌日"
              >
                &rsaquo;
              </button>
              <button 
                className="date-nav-btn today-btn" 
                onClick={() => onDateChange(new Date())}
                title="本日"
              >
                本日
              </button>
              <button 
                className="nav-btn registration-btn" 
                onClick={() => {
                  if (selectedCells.size === 0) {
                    alert('時間を選択してください');
                    return;
                  }
                  // 選択されたセルから設備IDを取得
                  const cellIds = Array.from(selectedCells);
                  const vehicleId = parseInt(cellIds[0].split('-')[1]);
                  setSelectedVehicleId(vehicleId);
                  setShowRegistrationModal(true);
                }}
                style={{ 
                  backgroundColor: '#dc3545', 
                  color: 'white',
                  fontSize: '16px',
                  padding: '12px 20px',
                  minWidth: 'auto',
                  border: 'none',
                  borderRadius: '25px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  boxShadow: '0 4px 8px rgba(220, 53, 69, 0.3)',
                  transition: 'all 0.3s ease',
                  marginLeft: '15px'
                }}
              >
                ✨ 予約新規登録 ({selectedCells.size}セル選択中)
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Excel風スケジュールコンテナ */}
      <div className="excel-schedule-container" style={{
        width: '100%',
        maxWidth: '100vw',
        height: 'calc(100vh - 180px)',
        overflow: 'auto',
        border: '1px solid #ccc',
        backgroundColor: '#fff',
        position: 'relative',
        boxSizing: 'border-box',
        margin: 0
      }}>
        <div 
          className="excel-schedule-container" 
          ref={tableContainerRef}
          style={{
            width: '100%',
            height: 'calc(100vh - 200px)',
            overflow: 'auto',
            border: '1px solid #ccc',
            backgroundColor: '#fff',
            position: 'relative',
            scrollbarWidth: 'thin',
            scrollbarColor: '#c0c0c0 #f5f5f5'
          }}
        >
          {/* 固定ヘッダー：時間軸 */}
          <div className="time-header-fixed" style={{
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 100,
            backgroundColor: '#f0f0f0',
            borderBottom: '2px solid #ccc',
            display: 'flex',
            minWidth: `${300 + 96 * 20}px`
          }}>
            {/* 左上の空白セル */}
            <div style={{
              width: '300px',
              height: '40px',
              backgroundColor: '#e0e0e0',
              border: '1px solid #ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '12px',
              position: 'sticky',
              left: 0,
              zIndex: 101,
              flexShrink: 0
            }}>
              車両/時間
            </div>
            
            {/* 時間ヘッダー（0:00～23:00の24マス） */}
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{
                  width: '80px',
                  height: '40px',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '11px',
                  color: '#333',
                  flexShrink: 0
                }}>
                  {`${hour.toString().padStart(2, '0')}:00`}
                </div>
              ))}
            </div>
          </div>

          {/* スクロール可能なコンテンツエリア */}
          <div 
            className="schedule-content-area" 
            style={{
              position: 'relative',
              minWidth: `${300 + 96 * 20}px`
            }}
          >
            {/* 設備行とスケジュールセル */}
            {vehicles.length === 0 ? (
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '300px',
                backgroundColor: '#f8f9fa',
                border: '2px dashed #dee2e6',
                margin: '20px',
                borderRadius: '8px'
              }}>
                <div style={{
                  textAlign: 'center',
                  color: '#6c757d',
                  fontSize: '18px'
                }}>
                  <div style={{ marginBottom: '10px', fontSize: '24px' }}>📋</div>
                  <div>車両が登録されていません</div>
                  <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.7 }}>
                    管理画面から車両を登録してください
                  </div>
                </div>
              </div>
            ) : (
              vehicles.map((vehicle, vehicleIndex) => (
                <div key={vehicle.id} className="excel-date-row" style={{
                  display: 'flex',
                  borderBottom: '1px solid #ccc',
                  minHeight: '40px',
                  position: 'relative',
                  overflow: 'visible'
                }}>
                  {/* 固定設備セル */}
                  <div className="date-cell-fixed" style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 50,
                    width: '300px',
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #ccc',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                    fontSize: '11px',
                    fontWeight: '500',
                    lineHeight: '1.1',
                    borderRight: '2px solid #999'
                  }}>
                    <div style={{ margin: 0 }}>{vehicle.name}</div>
                  </div>

                  {/* 時間セル（96マス：15分間隔） */}
                  {Array.from({ length: 96 }, (_, slot) => {
                    const hour = Math.floor(slot / 4);
                    const minute = (slot % 4) * 15;
                    // ローカル選択状態と既存の選択状態の両方をチェック
                    const year = selectedDate.getFullYear();
                    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(selectedDate.getDate()).padStart(2, '0');
                    const localCellId = `${year}-${month}-${day}-vehicle-${vehicle.id}-${slot}`;
                    const legacyCellId = `vehicle-${vehicle.id}-${slot}`;
                    const isSelected = localSelectedCells.has(localCellId) || selectedCells.has(legacyCellId);

                    return (
                      <div
                        key={slot}
                        className={`time-cell-15min ${isSelected ? 'selected' : ''}`}
                        style={{
                          width: '20px',
                          height: '40px',
                          border: isSelected ? '2px solid #2196f3' : '1px solid #ccc',
                          borderLeft: '1px solid #ccc',
                          backgroundColor: isSelected ? '#e3f2fd' : 'white',
                          cursor: 'pointer',
                          opacity: isSelected ? 1 : 1,
                          transition: 'background-color 0.2s ease',
                          boxShadow: isSelected ? '0 0 8px rgba(33, 150, 243, 0.3)' : 'none',
                          zIndex: isSelected ? 5 : 1
                        }}
                        data-vehicle-id={vehicle.id}
                        data-slot={slot}
                        data-time={`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                        draggable={false}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return; // 左クリック以外はセル選択無効化
                          
                          // 予約バーとの干渉チェック
                          const target = e.target as HTMLElement;
                          if (target.closest('.schedule-item') || target.closest('.resize-handle')) {
                            return; // 予約バー上ではセル選択を無効化
                          }
                          
                          e.preventDefault(); // テキスト選択を防ぐ
                          e.stopPropagation();
                          handleVehicleCellMouseDown(vehicle.id, slot, e);
                        }}
                        onMouseEnter={() => {
                          if (localIsSelecting) {
                            handleVehicleCellMouseEnter(vehicle.id, slot);
                          }
                        }}
                        onMouseUp={handleVehicleCellMouseUp}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          // 1セル選択時にモーダルを開く
                          const year = selectedDate.getFullYear();
                          const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                          const day = String(selectedDate.getDate()).padStart(2, '0');
                          const cellId = `${year}-${month}-${day}-vehicle-${vehicle.id}-${slot}`;
                          
                          // このセルだけを選択状態にする
                          const singleCellId = `vehicle-${vehicle.id}-${slot}`;
                          setSelectedCells(new Set([singleCellId]));
                          setSelectedVehicleId(vehicle.id);
                          setSelectedSchedule(null);
                          setShowRegistrationModal(true);
                        }}
                        onDragStart={(e) => {
                          e.preventDefault(); // ブラウザのドラッグ&ドロップを無効化
                        }}
                        onSelectStart={(e) => {
                          e.preventDefault(); // テキスト選択開始を防ぐ
                        }}
                        title={`${vehicle.name} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      />
                    );
                  })}

                  {/* 予約バー（月別ビューのロジックと統一） */}
                  {reservations
                    .filter(reservation => {
                      // 設備IDが一致するか
                      if (reservation.vehicle_id !== vehicle.id) {
                        return false;
                      }
                      
                      
                      // APIから取得したデータは既に選択した日付でフィルタリングされているため、
                      // フロントエンドでの追加フィルタリングは不要
                      // ただし、念のため日付の整合性を確認
                      try {
                        const startTimeStr = reservation.start_datetime;
                        if (!startTimeStr) {
                          return false;
                        }
                        
                        // 日付の形式を確認（エラーが発生しないように）
                        let startDate: Date;
                        
                        if (startTimeStr.includes('T') && (startTimeStr.includes('Z') || startTimeStr.match(/[+-]\d{2}:\d{2}$/))) {
                          // ISO形式（UTC）の場合、new Date()で自動的にローカル時間に変換される
                          startDate = new Date(startTimeStr);
                        } else {
                          // 既にローカル時間形式の場合
                          startDate = parseLocalDateTimeString(startTimeStr);
                        }
                        
                        // 日付が無効な場合は表示しない
                        if (isNaN(startDate.getTime())) {
                          return false;
                        }
                        
                        return true; // APIで既にフィルタリングされているため、常にtrueを返す
                      } catch (error) {
                        return false;
                      }
                    })
                    .map(reservation => {
                      const schedule = reservationToSchedule(reservation);
                      const isSelected = selectedSchedule?.id === reservation.id;
                      const isDragging = dragData?.schedule.id === reservation.id;
                      const isResizing = resizeData?.schedule.id === reservation.id;
                      const style = getReservationStyle(reservation, vehicleIndex);
                      
                      // 予約バーが非表示の場合はレンダリングしない
                      if (style.display === 'none') {
                        return null;
                      }
                      
                      // title属性用の日時計算（getReservationStyleと同じロジック）
                      const startTimeStr = reservation.start_datetime;
                      const endTimeStr = reservation.end_datetime;
                      let startDate: Date;
                      let endDate: Date;
                      
                      if (startTimeStr.includes('T') && (startTimeStr.includes('Z') || startTimeStr.match(/[+-]\d{2}:\d{2}$/))) {
                        startDate = new Date(startTimeStr);
                        endDate = new Date(endTimeStr);
                      } else {
                        startDate = parseLocalDateTimeString(startTimeStr);
                        endDate = parseLocalDateTimeString(endTimeStr);
                      }
                      
                      const startHour = startDate.getHours();
                      const startMinute = startDate.getMinutes();
                      const endHour = endDate.getHours();
                      const endMinute = endDate.getMinutes();
                      
                      return (
                        <div
                          key={reservation.id}
                          className={`vehicle-reservation-bar ${isSelected ? 'selected' : ''}`}
                          data-reservation-id={reservation.id}
                          style={{
                            ...style,
                            border: isSelected && !isDragging && !isResizing ? '2px solid #2196f3' : style.border,
                            boxShadow: isSelected && !isDragging && !isResizing ? '0 0 8px rgba(33, 150, 243, 0.5)' : style.boxShadow,
                            opacity: isDragging || isResizing ? 0.3 : 1
                          }}
                          onMouseDown={(e) => {
                            if (e.button === 0) { // 左クリック
                              // リサイズハンドルのクリックでない場合のみドラッグ開始とスケジュール選択
                              const target = e.target as HTMLElement;
                              if (!target.classList.contains('resize-handle') && !target.closest('.resize-handle')) {
                                setInteractionState((prev: any) => ({ ...prev, isEventBarInteracting: true }));
                                setSelectedSchedule(reservation);
                                handleScheduleMouseDown(schedule, e);
                              }
                            }
                          }}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedSchedule(reservation);
                            setShowRegistrationModal(true);
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedSchedule(reservation);
                            setContextMenuTarget(reservation);
                            setContextMenuPosition({ x: e.clientX, y: e.clientY });
                          }}
                          title={`${reservation.title} (${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}-${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}) ${reservation.employee_name || ''}`}
                        >
                          <div style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            width: '100%',
                            textAlign: 'center'
                          }}>
                            {reservation.title}
                          </div>
                          
                          {/* リサイズハンドル（月別ビューのロジックと統一） */}
                          {isSelected && (
                            <>
                              <div
                                className="resize-handle resize-start"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleResizeMouseDown(schedule, 'start', e);
                                }}
                                style={{ 
                                  position: 'absolute', 
                                  left: -2, 
                                  top: 0, 
                                  width: 8, 
                                  height: '100%', 
                                  cursor: 'ew-resize', 
                                  zIndex: 10001,
                                  pointerEvents: 'auto',
                                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                  border: '1px solid rgba(255, 255, 255, 0.8)',
                                  borderRadius: '2px 0 0 2px',
                                  transition: 'all 0.2s ease',
                                  opacity: 1
                                }}
                              />
                              <div
                                className="resize-handle resize-end"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleResizeMouseDown(schedule, 'end', e);
                                }}
                                style={{ 
                                  position: 'absolute', 
                                  right: -2, 
                                  top: 0, 
                                  width: 8, 
                                  height: '100%', 
                                  cursor: 'ew-resize', 
                                  zIndex: 10001,
                                  pointerEvents: 'auto',
                                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                  border: '1px solid rgba(255, 255, 255, 0.8)',
                                  borderRadius: '0 2px 2px 0',
                                  transition: 'all 0.2s ease',
                                  opacity: 1
                                }}
                              />
                            </>
                          )}
                        </div>
                      );
                    })}

                  {/* ドラッグゴースト表示 */}
                  {dragGhost && dragData && dragData.schedule.vehicle_id === vehicle.id && (
                    (() => {
                      // 新しい開始時刻を計算
                      const { hour, minute } = getTimeFromSlot(dragGhost.newSlot);
                      const newStart = new Date(
                        dragGhost.newDate.getFullYear(),
                        dragGhost.newDate.getMonth(),
                        dragGhost.newDate.getDate(),
                        hour,
                        minute
                      );
                      const originalStart = new Date(dragData.schedule.start_datetime);
                      const originalEnd = new Date(dragData.schedule.end_datetime);
                      const originalDuration = originalEnd.getTime() - originalStart.getTime();
                      const newEnd = new Date(newStart.getTime() + originalDuration);
                      
                      const ghostStyle = getReservationStyle({
                        ...reservationToSchedule(dragData.schedule),
                        start_datetime: newStart.toISOString(),
                        end_datetime: newEnd.toISOString()
                      } as Reservation, vehicleIndex);
                      if (ghostStyle.display === 'none') return null;
                      return (
                        <div
                          className="vehicle-reservation-bar drag-ghost"
                          style={{
                            ...ghostStyle,
                            opacity: 0.5,
                            border: '2px dashed #2196f3',
                            backgroundColor: 'rgba(33, 150, 243, 0.2)',
                            pointerEvents: 'none',
                            zIndex: 10000
                          }}
                        >
                          <div style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            width: '100%',
                            textAlign: 'center',
                            color: '#2196f3',
                            fontWeight: 'bold'
                          }}>
                            {dragData.schedule.title}
                          </div>
                        </div>
                      );
                    })()
                  )}

                  {/* リサイズゴースト表示 */}
                  {resizeGhost && resizeData && resizeData.schedule.vehicle_id === vehicle.id && (
                    (() => {
                      const ghostStyle = getReservationStyle({
                        ...reservationToSchedule(resizeData.schedule),
                        start_datetime: resizeGhost.newStart.toISOString(),
                        end_datetime: resizeGhost.newEnd.toISOString()
                      } as Reservation, vehicleIndex);
                      if (ghostStyle.display === 'none') return null;
                      return (
                        <div
                          className="vehicle-reservation-bar resize-ghost"
                          style={{
                            ...ghostStyle,
                            opacity: 0.5,
                            border: '2px dashed #4caf50',
                            backgroundColor: 'rgba(76, 175, 80, 0.2)',
                            pointerEvents: 'none',
                            zIndex: 10000
                          }}
                        >
                          <div style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            width: '100%',
                            textAlign: 'center',
                            color: '#4caf50',
                            fontWeight: 'bold'
                          }}>
                            {resizeData.schedule.title}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 予約登録モーダル */}
      {showRegistrationModal && (
        <ScheduleRegistrationModal
          isOpen={showRegistrationModal}
          onClose={() => {
            setShowRegistrationModal(false);
            setSelectedSchedule(null);
            setSelectedCells(new Set());
            setLocalSelectedCells(new Set());
            setLocalIsSelecting(false);
            setLocalSelectionAnchor(null);
            setSelectedVehicleId(null);
          }}
          defaultStart={(() => {
            if (selectedCells.size > 0) {
              const cellIds = Array.from(selectedCells);
              const slots = cellIds.map(id => parseInt(id.split('-')[2]));
              const minSlot = Math.min(...slots);
              const hour = Math.floor(minSlot / 4);
              const minute = (minSlot % 4) * 15;
              const date = new Date(selectedDate);
              date.setHours(hour, minute, 0, 0);
              return date;
            }
            const date = new Date(selectedDate);
            date.setHours(9, 0, 0, 0);
            return date;
          })()}
          defaultEnd={(() => {
            if (selectedCells.size > 0) {
              const cellIds = Array.from(selectedCells);
              const slots = cellIds.map(id => parseInt(id.split('-')[2]));
              const maxSlot = Math.max(...slots);
              const hour = Math.floor((maxSlot + 1) / 4);
              const minute = ((maxSlot + 1) % 4) * 15;
              const date = new Date(selectedDate);
              date.setHours(hour, minute, 0, 0);
              return date;
            }
            const date = new Date(selectedDate);
            date.setHours(10, 0, 0, 0);
            return date;
          })()}
          selectedDepartmentId={0}
          defaultEmployeeId={employees[0]?.id}
          employees={employees}
          equipments={vehicles}
          defaultEquipmentId={selectedVehicleId || vehicles[0]?.id}
          initialValues={selectedSchedule ? {
            title: selectedSchedule.title,
            scheduleId: selectedSchedule.id
          } : undefined}
          onCreated={handleReservationSave}
        />
      )}

      {/* コンテキストメニュー */}
      {contextMenuPosition && contextMenuTarget && (
        <ContextMenu
          position={contextMenuPosition}
          items={[
            {
              id: 'copy',
              label: 'コピー',
              icon: '📋',
              shortcut: 'Ctrl+C',
              action: () => handleReservationCopy(contextMenuTarget)
            },
            {
              id: 'paste',
              label: '貼り付け',
              icon: '📌',
              shortcut: 'Ctrl+V',
              action: handleReservationPaste,
              disabled: !clipboard
            },
            {
              id: 'separator1',
              separator: true
            },
            {
              id: 'delete',
              label: '削除',
              icon: '🗑️',
              shortcut: 'Del',
              action: () => handleReservationDelete(contextMenuTarget.id)
            }
          ]}
          onClose={handleContextMenuClose}
        />
      )}

      {/* 管理タブ */}
      <ManagementTabs
        isVisible={showManagementTabs}
        onClose={() => setShowManagementTabs(false)}
        onNavigate={(path) => {
          setShowManagementTabs(false);
          setCurrentRegistrationView(path);
        }}
        onScheduleRegister={() => {
          setShowManagementTabs(false);
          // 車両予約ページではスケジュール登録は別のモーダルを使用
        }}
        colors={SCHEDULE_COLORS}
      />

      {/* 登録画面 */}
      {currentRegistrationView === '/management/departments' && (
        <DepartmentRegistration
          onClose={() => setCurrentRegistrationView(null)}
        />
      )}

      {currentRegistrationView === '/management/employees' && (
        <EmployeeRegistration
          onClose={() => setCurrentRegistrationView(null)}
        />
      )}

      {currentRegistrationView === '/management/equipment' && (
        <EquipmentRegistration
          onClose={() => setCurrentRegistrationView(null)}
        />
      )}
    </div>
  );
};

export default SimpleVehicleReservation;
