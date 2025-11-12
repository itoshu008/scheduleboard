import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { api, updateEquipmentReservation } from '../../api';
import {
  toLocalISODateTime,
  parseLocalDateTimeString,
  buildLocalDateTime,
  formatLocal,
  formatDate,
  getTimeFromSlot,
  getTimeSlot,
  getEndTimeSlot,
  createTimeFromSlot,
  formatTime
} from '../../utils/dateUtils';
import { CELL_WIDTH_PX, DAILY_BAR_HEIGHT_PX } from '../../utils/uiConstants';
import ScheduleFormModal from '../ScheduleFormModal/ScheduleFormModal';
import ScheduleActionModal from '../ScheduleActionModal/ScheduleActionModal';
import ScheduleRegistrationModal from '../ScheduleRegistrationModal/ScheduleRegistrationModal';
import TemplateRegistrationModal from '../TemplateRegistrationModal/TemplateRegistrationModal';
import ContextMenu, { ContextMenuItem } from '../ContextMenu/ContextMenu';
import ManagementTabs from '../ManagementTabs/ManagementTabs';
import DepartmentRegistration from '../DepartmentRegistration/DepartmentRegistration';
import EmployeeRegistration from '../EmployeeRegistration/EmployeeRegistration';
import EquipmentRegistration from '../EquipmentRegistration/EquipmentRegistration';
import ScaleControl from '../ScaleControl/ScaleControl';

// 共通フック（日別スケジュールと同じ）
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
// 月別ビューのイベントバー処理ロジックを使用（日別ビューと完全同一）
import { useMonthlyEventBarHandlers } from '../../hooks/useMonthlyEventBarHandlers';

import './EquipmentReservation.css';
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
import OverlapConfirmationDialog from '../OverlapConfirmationDialog/OverlapConfirmationDialog';
import { checkScheduleOverlap, markOverlappingSchedules } from '../../utils/overlapUtils';
import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';
import EquipmentScheduleForm from '../EquipmentScheduleForm/EquipmentScheduleForm';

interface EquipmentReservationProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  departments: Department[];
  employees: Employee[];
  equipments: Equipment[];
  schedules: Schedule[];
  onDepartmentChange: (department: Department) => Promise<void>;
  onEmployeeChange: (employee: Employee) => void;
  reloadSchedules: () => Promise<void>;
}

/**
 * 設備予約スケジュール - 日別スケジュール完全移植版
 * 
 * 日別スケジュールの構造を設備予約に完全適用：
 * - 同じレイアウト構造（社員→設備に置き換え）
 * - 同じフック使用（useScheduleCellSelection, useScheduleDragResize）
 * - 同じイベントバー描画方式
 * - 同じリサイズハンドル
 */
const EquipmentReservation: React.FC<EquipmentReservationProps> = ({
  selectedDate,
  onDateChange,
  departments,
  employees,
  equipments,
  schedules,
  onDepartmentChange,
  onEmployeeChange,
  reloadSchedules
}) => {
  // 基本状態（日別スケジュールと同じ）
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [forceShowToolbar, setForceShowToolbar] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('equipment-force-show-toolbar');
      return v === '1';
    } catch {}
    return true;
  });
  
  const [scheduleScale, setScheduleScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  
  // 共通フック（日別スケジュールと同じ）
  const {
    selectedCells,
    isSelecting,
    selectionAnchor,
    selectedSchedule,
    setSelectedCells,
    setIsSelecting,
    setSelectionAnchor,
    setSelectedSchedule,
    handleCellMouseDown: commonHandleCellMouseDown,
    handleCellMouseEnter: commonHandleCellMouseEnter,
    handleCellMouseUp: commonHandleCellMouseUp,
    handleCellDoubleClick: commonHandleCellDoubleClick,
    getSelectedCellDateTime: commonGetSelectedCellDateTime,
    clearSelection
  } = useScheduleCellSelection();

  // モーダル状態（日別スケジュールと同じ）
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleAction, setShowScheduleAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  // クリップボード（ローカル）
  const [clipboard, setClipboard] = useState<null | {
    type: 'equipment-reservation';
    data: any;
  }>(null);
  // 重複注意タブ用の状態
  const [conflictTab, setConflictTab] = useState<null | {
    message: string;
    details?: Array<{ id: number; purpose?: string; start: string; end: string }>
  }>(null);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);
  
  // 選択確定処理の安定化（日別スケジュールと同じ）
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectionSnapshot, setSelectionSnapshot] = useState<{
    startDateTime: Date;
    endDateTime: Date;
    equipmentId: number;
    equipmentName?: string;
  } | null>(null);

  // 設備ID計算関数（日別スケジュールの社員ID計算と同じ）
  const getEquipmentIdFromDelta = (originalEquipmentId: number, delta: number) => {
    const currentIndex = equipments.findIndex((eq: any) => eq.id === originalEquipmentId);
    if (currentIndex === -1) return originalEquipmentId;
    
    const newIndex = Math.max(0, Math.min(equipments.length - 1, currentIndex + delta));
    return equipments[newIndex].id;
  };
  
  // 設備予約データの読み込み（useMonthlyEventBarHandlersの前に定義）
  const loadReservations = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔍 設備予約読み込み開始:', selectedDate);
      
      const response = await api.get('/equipment-reservations', {
        params: {
          date: selectedDate.toISOString().split('T')[0]
        }
      });
      
      console.log('📊 設備予約読み込み完了:', response.data?.length || 0);
      
      // Schedule型に変換
      const convertedReservations = (response.data || []).map((reservation: any) => ({
        id: reservation.id,
        title: reservation.title || reservation.purpose || '予約',
        color: reservation.color || '#dc3545',
        start_datetime: reservation.start_datetime,
        end_datetime: reservation.end_datetime,
        employee_id: reservation.employee_id,
        equipment_ids: [reservation.equipment_id],
        equipment_id: reservation.equipment_id,
        created_at: reservation.created_at || new Date().toISOString(),
        updated_at: reservation.updated_at || new Date().toISOString()
      }));
      
      setReservations(convertedReservations);
      setError(null);
    } catch (error) {
      console.error('❌ 設備予約読み込みエラー:', error);
      setError('設備予約の読み込みに失敗しました');
      setReservations([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);
  
  // 月別ビューのイベントバー処理ロジックを使用（日別ビューと完全同一）
  const {
    interactionState,
    setInteractionState,
    isResizing,
    mousePosition,
    handleScheduleMouseDown,
    handleResizeMouseDown,
    updateSchedulePosition: originalUpdateSchedulePosition
  } = useMonthlyEventBarHandlers({
    scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
    scaledRowHeight: 40, // 設備ビューでは縦方向移動なし（日別と同じ）
    reloadSchedules: loadReservations,
    setSelectedSchedule,
    setSelectedCells,
    getEmployeeIdFromDelta: getEquipmentIdFromDelta,
    enableVerticalMovement: false // 設備ビューでは縦方向移動なし
  });

  // 月別ビューのロジックと互換性を保つため、既存の変数名をエイリアス（日別ビューと同じ）
  const dragData = interactionState.dragData;
  const dragGhost = interactionState.dragGhost;
  const resizeData = interactionState.resizeData;
  const resizeGhost = interactionState.resizeGhost;

  // 設備予約用のupdateSchedulePositionラッパー（日別ビューと同じ構造）
  const updateSchedulePosition = useCallback(async (schedule: Schedule, newDate: Date, newSlot: number, newEquipmentId?: number) => {
    try {
      // 元の予約データを取得
      const originalReservation = reservations.find(r => r.id === schedule.id);
      if (!originalReservation) {
        console.error('❌ 元の予約データが見つかりません:', schedule.id);
        throw new Error('元の予約データが見つかりません');
      }

      const originalStart = new Date(schedule.start_datetime);
      const originalEnd = new Date(schedule.end_datetime);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const { createTimeFromSlot } = await import('../../utils/dateUtils');
      const newStart = createTimeFromSlot(newDate, newSlot);
      const newEnd = new Date(newStart.getTime() + duration);
      
      // 設備IDの決定（newEquipmentIdは設備IDとして扱う）
      const finalEquipmentId = newEquipmentId !== undefined ? newEquipmentId : (originalReservation.equipment_id || originalReservation.equipment_ids?.[0]);

      // 設備予約用のデータ形式に変換
      const equipmentReservationData = {
        purpose: schedule.title || schedule.purpose || originalReservation.title || originalReservation.purpose || '予約',
        color: schedule.color || originalReservation.color,
        employee_id: originalReservation.employee_id, // 元の社員IDを保持
        equipment_id: finalEquipmentId,
        start_datetime: toLocalISODateTime(newStart),
        end_datetime: toLocalISODateTime(newEnd)
      };

      // 事前ローカル重複チェック（設備重複は絶対NG）
      try {
        const targetEquipId = equipmentReservationData.equipment_id;
        const checkStart = new Date(equipmentReservationData.start_datetime);
        const checkEnd = new Date(equipmentReservationData.end_datetime);
        const hasLocalConflict = dailyReservations.some(r => {
          if (r.id === schedule.id) return false;
          const rEquip = r.equipment_id || r.equipment_ids?.[0];
          if (rEquip !== targetEquipId) return false;
          const rStart = new Date(r.start_datetime);
          const rEnd = new Date(r.end_datetime);
          return !(rEnd <= checkStart || rStart >= checkEnd);
        });
        if (hasLocalConflict) {
          setConflictTab({
            message: '設備の重複予約はできません。同一設備・時間帯に既存の予約があります。'
          });
          setTimeout(() => setConflictTab(null), 4000);
          return;
        }
      } catch (e) {
        // フォールバック
      }

      // 楽観的更新
      try {
        const uiEquipId = equipmentReservationData.equipment_id as number;
        const uiEquipName = equipments.find(eq => eq.id === uiEquipId)?.name;
        setReservations((prev) => prev.map(r => r.id === schedule.id
          ? { ...r, start_datetime: equipmentReservationData.start_datetime, end_datetime: equipmentReservationData.end_datetime, equipment_id: uiEquipId, equipment_ids: [uiEquipId], equipment_name: uiEquipName }
          : r));
        if (selectedSchedule && selectedSchedule.id === schedule.id) {
          setSelectedSchedule({ ...(selectedSchedule as any), start_datetime: equipmentReservationData.start_datetime, end_datetime: equipmentReservationData.end_datetime, equipment_id: uiEquipId, equipment_ids: [uiEquipId], equipment_name: uiEquipName } as any);
        }
      } catch {}

      // API呼び出し
      setIsSaving(true);
      await updateEquipmentReservation(schedule.id, equipmentReservationData);
      console.log('✅ 設備予約更新成功:', schedule.id);

      // WebSocketの更新を待つ
      await new Promise(resolve => setTimeout(resolve, 300));

      // スケジュール一覧を再読み込み
      await loadReservations();
    } catch (error: any) {
      console.error('❌ 設備予約更新失敗:', error);
      try { await loadReservations(); } catch {}
      
      if (error?.response?.status === 409 && error?.response?.data?.error === 'EQUIPMENT_CONFLICT') {
        const conflictData = error.response.data;
        setConflictTab({
          message: conflictData.message,
          details: (conflictData.details?.conflictingReservations || []).map((c: any) => ({
            id: c.id,
            purpose: c.purpose,
            start: c.timeRange?.start,
            end: c.timeRange?.end
          }))
        });
        setTimeout(() => setConflictTab(null), 6000);
      } else {
        setConflictTab({ message: '設備予約の更新に失敗しました: ' + (error?.message || '不明なエラー') });
        setTimeout(() => setConflictTab(null), 4000);
      }
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [reservations, dailyReservations, equipments, selectedSchedule, setSelectedSchedule, setConflictTab, loadReservations]);

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  // セル選択（直接実装）- useMonthlyEventBarHandlersの後に定義（interactionStateにアクセスするため）（日別ビューと完全同一）
  const handleCellMouseDown = useCallback((equipmentId: number, slot: number, e?: React.MouseEvent) => {
    // 右クリック時はセル選択を無効化（右クリックドラッグスクロール用）
    if (e && e.button === 2) return;
    if (interactionState.dragData || interactionState.resizeData) return; // ドラッグ中は選択無効（月別ビューのロジックと統一）
    
    // イベントバー操作中または編集モーダル閉じた後はセル選択を無効化
    if (interactionState.isEventBarInteracting || interactionState.isModalClosing) {
      console.log('🚫 EquipmentReservation: Cell selection disabled - event bar is being interacted with or modal is closing');
      return;
    }

    const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${equipmentId}-${slot}`;
    console.log('🔍 EquipmentReservation: handleCellMouseDown', { 
      equipmentId, 
      slot, 
      cellId, 
      selectedDate,
      selectedDateString: selectedDate.toDateString(),
      year: selectedDate.getFullYear(),
      month: selectedDate.getMonth() + 1,
      day: selectedDate.getDate()
    });

    // スケジュール選択をクリア（日別ビューと同じ仕様）
    // ただし、編集モーダルが開いている場合はクリアしない
    // また、スケジュールアイテム上でのクリックの場合はクリアしない（ダブルクリックで編集モードに入るため）
    if (!showRegistrationTab) {
      // クリックされた要素がスケジュールアイテムかどうかをチェック
      const target = e?.target as HTMLElement;
      const isOnScheduleItem = target?.closest('.schedule-item') || target?.closest('.excel-schedule-item');
      
      if (!isOnScheduleItem) {
        console.log('EquipmentReservation: handleCellMouseDown - Clearing selectedSchedule (not on schedule item)');
        setSelectedSchedule(null);
      } else {
        console.log('EquipmentReservation: handleCellMouseDown - Keeping selectedSchedule (on schedule item)');
      }
    }

    // セル選択開始（isSelectingを先に設定して、イベントバーのpointerEventsをnoneにする）
    setIsSelecting(true);
    setSelectionAnchor({ employeeId: equipmentId, slot });
    setSelectedCells(new Set([cellId]));
  }, [interactionState.dragData, interactionState.resizeData, interactionState.isEventBarInteracting, interactionState.isModalClosing, selectedDate, showRegistrationTab, setSelectedSchedule, setSelectedCells, setIsSelecting, setSelectionAnchor]);

  // 初期データ読み込み
  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // キー操作（Delete / Ctrl+C）
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      // 入力中のフォームやテキストエリアでの操作は無視
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;
      if (isTyping) return;

      // 選択スケジュールが必須
      if (!selectedSchedule) return;
      // ドラッグ/リサイズ中は無視
      if (interactionState.dragData || interactionState.resizeData) return;

      // Delete: 予約削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const ok = window.confirm('選択中の設備予約を削除しますか？');
        if (!ok) return;
        try {
          await api.delete(`/equipment-reservations/${selectedSchedule.id}`);
          setSelectedSchedule(null);
      await loadReservations();
    } catch (err) {
          console.error('削除失敗', err);
          alert('削除に失敗しました');
        }
        return;
      }

      // Ctrl+C: クリップボードにコピー
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
        const copied = {
          type: 'equipment-reservation' as const,
          data: {
            id: selectedSchedule.id,
            title: selectedSchedule.title,
            purpose: (selectedSchedule as any).purpose || selectedSchedule.title,
            equipment_id: (selectedSchedule as any).equipment_id || (selectedSchedule as any).equipment_ids?.[0],
            employee_id: selectedSchedule.employee_id,
            start_datetime: selectedSchedule.start_datetime,
            end_datetime: selectedSchedule.end_datetime,
            color: selectedSchedule.color || '#2196f3'
          }
        };
        setClipboard(copied);
        try {
          await navigator.clipboard.writeText(JSON.stringify(copied));
        } catch {}
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedSchedule, interactionState.dragData, interactionState.resizeData, api, loadReservations]);

  // 初期表示で14:00が中央に来るように水平スクロールを調整（スケール/日付変更時も）
  useEffect(() => {
    const container = document.querySelector('.excel-schedule-container') as HTMLElement | null;
    if (!container) return;
    const cellWidth = CELL_WIDTH_PX * scheduleScale; // 15分セル幅
    const targetSlot = 14 * 4; // 14:00 は 14時間×4スロット
    const dateColumnWidth = 200; // 設備名カラム
    const targetX = dateColumnWidth + targetSlot * cellWidth;
    const desiredScrollLeft = Math.max(0, Math.min(container.scrollWidth - container.clientWidth, targetX - container.clientWidth / 2));
    // レイアウト反映後にスクロール
    requestAnimationFrame(() => {
      container.scrollLeft = desiredScrollLeft;
    });
  }, [scheduleScale, selectedDate]);

  // 選択確定時に1回だけモーダルを開く（日別ビューと同じ仕様）
  useEffect(() => {
    if (!isSelecting && selectedCells.size > 0) {
      console.log('🔍 EquipmentReservation: 選択確定、モーダルを開く', { selectedCellsSize: selectedCells.size });
      try {
        // フックのgetSelectedCellDateTimeを使用
        const equipmentsAsEmployees = equipments.map(eq => ({ 
          id: eq.id, 
          name: eq.name, 
          department_id: 1,
          employee_number: `EQ${eq.id}`,
          display_order: eq.display_order || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        const snap = commonGetSelectedCellDateTime(equipmentsAsEmployees, selectedDate);
        if (snap) {
          const selectedEquipment = equipments.find(eq => eq.id === snap.employeeId);
          setSelectionSnapshot({
            startDateTime: snap.startDateTime,
            endDateTime: snap.endDateTime,
            equipmentId: snap.employeeId,
            equipmentName: selectedEquipment?.name
          });
        }
      } catch (e) {
        console.warn('selection snapshot failed:', e);
      }
      setIsModalOpen(true);
    }
  }, [isSelecting, selectedCells.size, equipments, commonGetSelectedCellDateTime, selectedDate]);

  // 3) 選択セルから日時を算出（既存の getSelectedCellDateTime を利用）（日別ビューと同じ仕様）
  const selection = useMemo(() => {
    if (selectedCells.size === 0) return null;
    const equipmentsAsEmployees = equipments.map(eq => ({ 
      id: eq.id, 
      name: eq.name, 
      department_id: 1,
      employee_number: `EQ${eq.id}`,
      display_order: eq.display_order || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    const result = commonGetSelectedCellDateTime(equipmentsAsEmployees, selectedDate);
    console.log('🔍 EquipmentReservation selection useMemo:', {
      selectedCellsSize: selectedCells.size,
      selectedCells: Array.from(selectedCells),
      result
    });
    return result;
  }, [selectedCells, equipments, commonGetSelectedCellDateTime, selectedDate]);

  // handleCellMouseEnter（日別ビューと同じ）
  const handleCellMouseEnter = useCallback((equipmentId: number, slot: number) => {
    if (!isSelecting || !selectionAnchor) {
      console.log('🚫 EquipmentReservation: handleCellMouseEnter skipped', { isSelecting, selectionAnchor });
      return;
    }

    const newSelectedCells = new Set<string>();
    const startEquipment = Math.min(selectionAnchor.employeeId, equipmentId);
    const endEquipment = Math.max(selectionAnchor.employeeId, equipmentId);
    const startSlot = Math.min(selectionAnchor.slot, slot);
    const endSlot = Math.max(selectionAnchor.slot, slot);

    // 選択範囲のセルを生成
    for (let eqId = startEquipment; eqId <= endEquipment; eqId++) {
      for (let s = startSlot; s <= endSlot; s++) {
        const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${eqId}-${s}`;
        newSelectedCells.add(cellId);
      }
    }
    console.log('🔍 EquipmentReservation: handleCellMouseEnter', { 
      equipmentId,
      slot,
      startEquipment,
      endEquipment,
      startSlot,
      endSlot,
      newSelectedCells: Array.from(newSelectedCells),
      newSelectedCellsSize: newSelectedCells.size, 
      isSelecting, 
      selectionAnchor 
    });
    setSelectedCells(newSelectedCells);
  }, [isSelecting, selectionAnchor, selectedDate, setSelectedCells]);

  const handleCellMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionAnchor(null);
    
    // 2セル以上選択時は登録タブ表示
    if (selectedCells.size >= 2) {
      setShowRegistrationTab(true);
    }
  }, [selectedCells.size, setIsSelecting, setSelectionAnchor]);

  // 1) window mouseup で必ず選択終了（日別ビューと同じ）
  useEffect(() => {
    const onUp = () => setIsSelecting(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  // 2) 選択確定時に1回だけモーダルを開く（日別ビューと同じ）
  useEffect(() => {
    if (!isSelecting && selectedCells.size > 0) {
      console.log('🔍 EquipmentReservation: 選択確定、モーダルを開く', { selectedCellsSize: selectedCells.size });
      try {
        const equipmentsAsEmployees = equipments.map(eq => ({ 
          id: eq.id, 
          name: eq.name, 
          department_id: 1,
          employee_number: `EQ${eq.id}`,
          display_order: eq.display_order || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        const snap = commonGetSelectedCellDateTime(equipmentsAsEmployees, selectedDate);
        if (snap) {
          const selectedEquipment = equipments.find(eq => eq.id === snap.employeeId);
          setSelectionSnapshot({
            startDateTime: snap.startDateTime,
            endDateTime: snap.endDateTime,
            equipmentId: snap.employeeId,
            equipmentName: selectedEquipment?.name
          });
        }
      } catch (e) {
        console.warn('selection snapshot failed:', e);
      }
      setIsModalOpen(true);
    }
  }, [isSelecting, selectedCells.size, equipments, commonGetSelectedCellDateTime, selectedDate]);

  // セル選択のダブルクリック（新規登録）（日別ビューと同じ）
  const handleCellDoubleClick = useCallback((equipmentId: number, slot: number) => {
    const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${equipmentId}-${slot}`;
    setSelectedCells(new Set([cellId]));
    setSelectedSchedule(null);
    setShowRegistrationTab(true);
  }, [selectedDate, setSelectedCells, setSelectedSchedule]);

  // 背景クリックでセル選択解除（日別ビューと同じ）
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // スケジュールアイテムやセルのクリックでない場合のみ
    const target = e.target as HTMLElement;
    if (!target.closest('.excel-schedule-item') && !target.closest('.excel-time-cell')) {
      setSelectedCells(new Set());
      setSelectedSchedule(null);
      setIsSelecting(false);
      setSelectionAnchor(null);
    }
  }, [setSelectedCells, setSelectedSchedule, setIsSelecting, setSelectionAnchor]);

  // スケール変更処理
  const handleScaleChange = useCallback((newScale: number) => {
    setIsScaling(true);
    setScheduleScale(newScale);
    setTimeout(() => setIsScaling(false), 100);
  }, []);

  // スケール計算（日別ビューと同じ）
  const scaledCellWidth = CELL_WIDTH_PX * scheduleScale;
  const scaledRowHeight = DAILY_BAR_HEIGHT_PX * scheduleScale;

  // 設備予約用のデータフィルタリング（選択日の予約のみ）
  const dailyReservations = reservations.filter(reservation => {
    const reservationDate = new Date(reservation.start_datetime);
    return reservationDate.toDateString() === selectedDate.toDateString();
  });

  if (loading) {
    return (
      <div className="loading-center">
        <div className="loading-spinner"></div>
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </div>
    );
  }

  return (
    <>
      {/* ヘッダー（日別スケジュールと同じ） */}
      <div className="schedule-header" ref={headerRef}>
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
          設備予約スケジュール管理
          <span style={{ fontSize: '18px', fontWeight: 'normal', color: '#666' }}>
            {selectedDate.toLocaleDateString('ja-JP', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              weekday: 'long'
            })} {new Date().toLocaleTimeString('ja-JP', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </span>
        </h2>
      </div>

      {/* ナビゲーションコントロール（日別スケジュールと同じ） */}
      <div className="grid-top-controls" ref={controlsRef}>
        <div className="grid-controls-row">
          <div className="nav-btn-left" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            
            {/* ナビゲーションボタン */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/monthly')}>月別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/daily')}>日別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/all-employees')}>全社員</button>
            <button className="nav-btn active" onClick={() => (window.location.href = '/scheduleboard/equipment')}>設備</button>
            </div>

            {/* スケール制御 */}
            <div className="scale-control-container">
              <ScaleControl
                scale={scheduleScale}
                onScaleChange={handleScaleChange}
              />
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
            <span className="section-label">日付:</span>
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
                  // タイムゾーンオフセットを考慮して日付を正しく設定
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
                  // 予約ボタン: 設備予約の新規登録タブを表示
                  if (!selectionSnapshot) {
                    const defaultEquipId = equipments[0]?.id ?? 0;
                    const start = new Date(selectedDate);
                    start.setHours(14, 0, 0, 0);
                    const end = new Date(start.getTime() + 30 * 60 * 1000);
                    setSelectionSnapshot({
                      startDateTime: start,
                      endDateTime: end,
                      equipmentId: defaultEquipId,
                      equipmentName: equipments.find(eq => eq.id === defaultEquipId)?.name
                    });
                  }
                  setShowRegistrationTab(true);
                  setIsModalOpen(true);
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
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#c82333';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(220, 53, 69, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#dc3545';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 53, 69, 0.3)';
                }}
              >
                ✨ 設備予約新規登録
              </button>
            </div>
          </div>
        </div>
        <div className="grid-controls-row-third">
          <div className="department-section">
            <span className="section-label">設備一覧:</span>
            <div className="department-buttons">
              <span style={{ color: '#666', fontSize: '14px' }}>
                {equipments.length}台の設備が登録されています
              </span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="daily-schedule equipment-reservation" ref={gridRef}>
        {/* 日別スケジュールと同じ構造のコンテナ */}
        <div
          className="excel-schedule-container"
          style={{
            width: '100%',
        maxWidth: '98vw',
        height: 'calc(100vh - 180px)',
            overflow: 'auto',
            position: 'relative',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            scrollbarWidth: 'thin',
            scrollbarColor: '#c0c0c0 #f5f5f5'
      }}
      onContextMenu={(e) => {
        if (e.button !== 2) return; // 右クリックのみ
        e.preventDefault();
        e.stopPropagation();
            const container = (document.querySelector('.excel-schedule-container') as HTMLElement) || (e.currentTarget.parentElement as HTMLElement);
        if (!container) return;
        const startX = e.clientX;
        const startY = e.clientY;
        const startScrollLeft = container.scrollLeft;
        const startScrollTop = container.scrollTop;
        const handleMove = (moveEvent: MouseEvent) => {
          moveEvent.preventDefault();
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          container.scrollLeft = startScrollLeft - dx;
          container.scrollTop = startScrollTop - dy;
        };
        const handleUp = () => {
          document.removeEventListener('mousemove', handleMove);
          document.removeEventListener('mouseup', handleUp);
        };
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
          }}
        >
          {/* 固定ヘッダー：時間軸（日別スケジュールと同じ） */}
          <div className="time-header-fixed" style={{
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 100,
            backgroundColor: '#f0f0f0',
            borderBottom: '2px solid #ccc',
            display: 'flex',
            minWidth: `${200 + 96 * 20 * scheduleScale}px` // 設備列200px + 96セル×20px×スケール
          }}>
            {/* 左上の空白セル（設備名列） */}
            <div style={{
              width: '200px',
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
              設備/時間
                </div>
            
            {/* 時間ヘッダー（0:00～23:00の24マス：1時間間隔） */}
            <div style={{ display: 'flex', flexShrink: 0 }}>
              {Array.from({ length: 24 }, (_, hour) => {
                return (
                  <div key={hour} style={{
                    width: `${80 * scheduleScale}px`, // 1時間間隔でスケール対応
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
                  }}
                  title={`時間ヘッダー: ${80 * scheduleScale}px × 40px（${hour.toString().padStart(2, '0')}:00）`}
                  >
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </div>
                );
              })}
            </div>
                </div>
            
          {/* スクロール可能なコンテンツエリア */}
          <div 
            className="schedule-content-area" 
            style={{
              position: 'relative',
              minWidth: `${200 + 96 * 20 * scheduleScale}px` // 設備列200px + 96セル×20px×スケール
            }}
            onClick={(e) => {
              // セル選択中は背景クリックを無視（日別ビューと同じ）
              if (isSelecting) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              handleBackgroundClick(e);
            }}
            onContextMenu={(e) => {
              // 右クリックをスクロール操作に割り当てる
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              if (e.button !== 2) return; // 右クリックのみ
              e.preventDefault();
              e.stopPropagation();
              const container = (document.querySelector('.excel-schedule-container') as HTMLElement) || (e.currentTarget.parentElement as HTMLElement);
              if (!container) return;
              const startX = e.clientX;
              const startY = e.clientY;
              const startScrollLeft = container.scrollLeft;
              const startScrollTop = container.scrollTop;
              const handleMove = (moveEvent: MouseEvent) => {
                moveEvent.preventDefault();
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                container.scrollLeft = startScrollLeft - dx;
                container.scrollTop = startScrollTop - dy;
              };
              const handleUp = () => {
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
              };
              document.addEventListener('mousemove', handleMove);
              document.addEventListener('mouseup', handleUp);
            }}
          >
          {/* 設備行とスケジュールセル（日別の社員行を設備行に変更） */}
          {equipments.map((equipment, equipmentIndex) => (
            <div key={`equipment-${equipmentIndex}`} className="excel-date-row" style={{
                display: 'flex',
                borderBottom: '1px solid #ccc',
              minHeight: '40px',
              position: 'relative',
              overflow: 'visible'
            }}>
              {/* 固定設備セル（極シンプル版） */}
              <div className="equipment-simple-cell" style={{
                position: 'sticky',
                left: 0,
                zIndex: 50,
                width: '200px',
                minWidth: '200px',
                maxWidth: '200px',
                height: 40,
                display: 'flex',
                alignItems: 'center',
              justifyContent: 'center',
                background: '#fff',
                border: '1px solid #ccc',
                fontSize: '12px',
                fontWeight: 700,
                boxShadow: 'none'
              }}>
                <span className="equipment-simple-text" style={{
                  margin: 0,
                  lineHeight: 1.2,
                  userSelect: 'none'
                }}>{equipment.name}</span>
              </div>

              {/* 時間セル（96マス：15分間隔の4セル構成） */}
                {Array.from({ length: 96 }, (_, slot) => {
              const hour = Math.floor(slot / 4);
              const minute = (slot % 4) * 15;

                // このセルの予約を検索
                const cellReservations = dailyReservations.filter(reservation => {
                  if (reservation.equipment_ids?.[0] !== equipment.id) return false;

                  const startTime = new Date(reservation.start_datetime);
                  const endTime = new Date(reservation.end_datetime);
                  const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
                  const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

                  if (startTime > dayEnd || endTime < dayStart) return false;

                  const scheduleStart = Math.max(startTime.getTime(), dayStart.getTime());
                  const scheduleEnd = Math.min(endTime.getTime(), dayEnd.getTime());
                  const startSlot = getTimeSlot(new Date(scheduleStart));
                  const endSlot = getEndTimeSlot(new Date(scheduleEnd));

                  return startSlot <= slot && slot < endSlot;
                });

                const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${equipment.id}-${slot}`;
                const isSelected = selectedCells.has(cellId);
                
                // デバッグ用（最初の数セルのみ）
                if (equipmentIndex === 0 && slot < 5) {
                  console.log('🔍 Cell render:', { 
                    cellId, 
                    isSelected, 
                    selectedCellsSize: selectedCells.size,
                    equipmentId: equipment.id,
                    equipmentName: equipment.name,
                    slot,
                    hour,
                    minute,
                    selectedDate: selectedDate.toISOString().split('T')[0]
                  });
                }

                  return (
                    <div
                      key={`cell-${equipmentIndex}-${slot}`}
                    className={`excel-time-cell quarter-hour-cell ${isSelected ? 'selected' : ''}`}
                      style={{
                      width: `${20 * scheduleScale}px`, // スケール対応
                        height: '40px',
                      backgroundColor: isSelected ? '#e3f2fd' : '#fff',
                      border: isSelected ? '2px solid #2196f3' : '1px solid #e0e0e0',
                      position: 'relative',
                        cursor: (interactionState.resizeData || interactionState.dragData) ? 'not-allowed' : 'pointer', // リサイズ・移動中は無効カーソル
                      fontSize: '10px',
                      boxShadow: isSelected ? '0 0 8px rgba(33, 150, 243, 0.3)' : 'none',
                      zIndex: isSelected ? 5 : 1,
                      opacity: (interactionState.resizeData || interactionState.dragData) ? 0.5 : 1 // リサイズ・移動中は半透明
                    }}
                    data-equipment-id={equipment.id}
                    data-slot={slot}
                    data-time={`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return; // 左クリック以外はセル選択無効化

                        // スケジュールアイテムがクリックされた場合はセル選択をスキップ
                        const target = e.target as HTMLElement;
                        const scheduleItem = target.closest('.schedule-item') || target.closest('.excel-schedule-item');
                        if (scheduleItem) {
                          console.log('🚫 セルのonMouseDown: スケジュールアイテムがクリックされたためスキップ');
                          return;
                        }
                        
                        e.stopPropagation();
                        handleCellMouseDown(equipment.id, slot, e);
                      }}
                    onMouseEnter={(e) => {
                      // ReusableEventBar（schedule-item）がホバーされた場合はセル選択をスキップ（日別ビューと同じ）
                      const target = e.target as HTMLElement;
                      const scheduleItem = target.closest('.schedule-item') || target.closest('.excel-schedule-item');
                      if (scheduleItem) {
                        return;
                      }
                      handleCellMouseEnter(equipment.id, slot);
                    }}
                    onMouseUp={handleCellMouseUp}
                      onDoubleClick={() => {
                        handleCellDoubleClick(equipment.id, slot);
                      }}
                    title={`${equipment.name} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                  >
                    {/* スケジュールアイテム（セル内描画は無効化） */}
                    {cellReservations.map(reservation => {
                      return null; // セル内描画は行わない（行オーバーレイ層で描画）
                    })}
                    </div>
                      );
                })}
            
              {/* 行オーバーレイ層：セルの上に予約を一括描画（日別スケジュールと同じ） */}
              <div
                className="row-schedule-layer"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 200, // 固定設備セル幅
                  width: 96 * 20 * scheduleScale,
                  height: 40,
                  pointerEvents: 'none', // セル選択を可能にするため、この層ではマウスイベントを受け取らない
                  overflow: 'visible'
                }}
              >
                {(() => {
                  const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
                  const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

                  const rowReservations = dailyReservations.filter(reservation => {
                    // より厳密な設備IDチェック（equipment_id または equipment_ids[0]）
                    const reservationEquipmentId = reservation.equipment_id || reservation.equipment_ids?.[0];
                    if (reservationEquipmentId !== equipment.id) return false;
                    
          const startTime = new Date(reservation.start_datetime);
          const endTime = new Date(reservation.end_datetime);
                    if (startTime > dayEnd || endTime < dayStart) return false;
                    return true;
                  });
                  
                  // デバッグログ削除（パフォーマンス最適化）
          
                  return rowReservations.map((reservation, reservationIndex) => {
                    // ドラッグ中の対象は非表示（日別ビューと同じ）
                    if (dragData && dragData.schedule.id === reservation.id) {
                      return null;
                    }
          
                    // リサイズ中は新しい時間を使用（日別ビューと同じ）
                    let startTime = new Date(reservation.start_datetime);
                    let endTime = new Date(reservation.end_datetime);
                    
                    if (isResizing && resizeGhost && resizeGhost.schedule.id === reservation.id) {
                      startTime = resizeGhost.newStart;
                      endTime = resizeGhost.newEnd;
                    }
                    
                    const startSlot = getTimeSlot(startTime);
                    const endSlot = getEndTimeSlot(endTime);
                    const left = startSlot * scaledCellWidth; // scaledCellWidthを使用（精度向上）
                    const width = (endSlot - startSlot) * scaledCellWidth; // scaledCellWidthを使用（精度向上）
                    
                    // 設備予約専用のイベントバー（位置計算を直接行う、日別ビューと同じ）
                    return (
                      <div
                        key={`row-item-${reservation.id}`}
                        className={`schedule-item ${selectedSchedule?.id === reservation.id ? 'selected' : ''}`}
                        style={{
                          background: `linear-gradient(180deg, ${lightenColor(safeHexColor(reservation.color || '#3498db'), 0.15)} 0%, ${safeHexColor(reservation.color || '#3498db')} 100%)`,
                          border: `1px solid ${lightenColor(safeHexColor(reservation.color || '#3498db'), -0.10)}`,
                          width: `${width}px`,
                          left: `${left}px`, // 直接leftを使用
                          position: 'absolute',
                          height: '36px',
                          top: '2px',
                          borderRadius: 4,
                          padding: '2px 4px',
                          fontSize: 11,
                          color: 'white',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          zIndex: 10000, // 非常に高いz-indexでセルより前面に
                          pointerEvents: 'auto' // 明示的にマウスイベントを受け取る（日別ビューと同じ）
                        }}
                        onMouseDown={(e) => {
                          // 日別ビューと同じ仕様：handleScheduleMouseDown内で選択状態を設定
                          handleScheduleMouseDown(reservation as any, e);
                        }}
                        onClick={(e) => {
                          // 日別ビューと同じ仕様：クリック時に選択状態を維持
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedSchedule(reservation as any);
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedSchedule(reservation as any);
                          setShowScheduleForm(true);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedSchedule(reservation as any);
                          setShowScheduleAction(true);
                        }}
                        title={`${reservation.title || reservation.purpose || '予約'}\n${formatTime(new Date(reservation.start_datetime))} - ${formatTime(new Date(reservation.end_datetime))}`}
                      >
                        <div style={{ 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          width: '100%', 
                          height: '100%', 
                          textAlign: 'center', 
                          color: 'white' 
                        }}>
                          <div className="schedule-title" style={{ fontWeight: 700, color: 'white' }}>
                            {reservation.title || reservation.purpose || '無題'}
                          </div>
                          <div className="schedule-time" style={{ fontSize: 10, opacity: 0.9, color: 'white' }}>
                            {`${formatTime(new Date(reservation.start_datetime))} - ${formatTime(new Date(reservation.end_datetime))}`}
                          </div>
                        </div>
                        
                        {/* リサイズハンドル（開始時刻=赤、終了時刻=緑） */}
                        <div
                          className="resize-handle resize-start"
                          onMouseDown={(e) => {
                            console.log('🔧 左リサイズハンドル クリック:', reservation.id);
                            e.preventDefault();
                            e.stopPropagation();
                            handleResizeMouseDown(reservation as any, 'start', e);
                          }}
                          style={{ 
                            position: 'absolute', 
                            left: -2, 
                            top: 0, 
                            width: 8, 
                            height: '100%', 
                            cursor: 'ew-resize', 
                            zIndex: 10001, // イベントバーより前面
                            pointerEvents: 'auto', // 明示的にマウスイベントを受け取る
                            backgroundColor: '#c62828', // 開始時刻ハンドル=赤
                            border: '1px solid rgba(255, 255, 255, 0.8)',
                            borderRadius: '2px 0 0 2px',
                            transition: 'all 0.2s ease',
                            opacity: selectedSchedule?.id === reservation.id ? 0.9 : 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            color: 'white',
                            fontWeight: 'bold'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#d32f2f'; // ホバー時は少し明るい赤
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#c62828';
                            e.currentTarget.style.opacity = selectedSchedule?.id === reservation.id ? '0.9' : '0';
                          }}
                        >
                          ◀
                        </div>
                        <div
                          className="resize-handle resize-end"
                          onMouseDown={(e) => {
                            console.log('🔧 右リサイズハンドル クリック:', reservation.id);
                            e.preventDefault();
                            e.stopPropagation();
                            handleResizeMouseDown(reservation as any, 'end', e);
                          }}
                          style={{ 
                            position: 'absolute', 
                            right: -2, 
                            top: 0, 
                            width: 8, 
                            height: '100%', 
                            cursor: 'ew-resize', 
                            zIndex: 10001, // イベントバーより前面
                            pointerEvents: 'auto', // 明示的にマウスイベントを受け取る
                            backgroundColor: '#2e7d32', // 終了時刻ハンドル=緑
                            border: '1px solid rgba(255, 255, 255, 0.8)',
                            borderRadius: '0 2px 2px 0',
                            transition: 'all 0.2s ease',
                            opacity: selectedSchedule?.id === reservation.id ? 0.9 : 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '8px',
                            color: 'white',
                            fontWeight: 'bold'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#388e3c'; // ホバー時は少し明るい緑
                            e.currentTarget.style.opacity = '1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#2e7d32';
                            e.currentTarget.style.opacity = selectedSchedule?.id === reservation.id ? '0.9' : '0';
                          }}
                        >
                          ▶
                        </div>
                      </div>
                    );
                  });
                })()}
            </div>
            </div>
          ))}
          </div>
          
          {/* ドラッグゴースト（schedule-content-area内に配置、日別ビューと同じ） */}
          {interactionState.dragGhost && interactionState.dragData && (() => {
            // 月別ビューのロジックに合わせてゴースト表示を計算
            const originalStart = new Date(interactionState.dragData.schedule.start_datetime);
            const originalEnd = new Date(interactionState.dragData.schedule.end_datetime);
            const originalDuration = originalEnd.getTime() - originalStart.getTime();
            
            // 新しい開始・終了時刻を計算
            const { hour, minute } = getTimeFromSlot(interactionState.dragGhost.newSlot);
            const newStart = new Date(
              interactionState.dragGhost.newDate.getFullYear(),
              interactionState.dragGhost.newDate.getMonth(),
              interactionState.dragGhost.newDate.getDate(),
              hour,
              minute
            );
            const newEnd = new Date(newStart.getTime() + originalDuration);
            
            const startSlot = getTimeSlot(newStart);
            const endSlot = getEndTimeSlot(newEnd);
            const width = (endSlot - startSlot) * scaledCellWidth;
            
            // 設備IDを取得（設備間移動を考慮）
            const targetEquipmentId = interactionState.dragGhost.newEmployeeId || (interactionState.dragData.schedule as any).equipment_id || (interactionState.dragData.schedule as any).equipment_ids?.[0];
            const targetEquipmentIndex = equipments.findIndex(eq => eq.id === targetEquipmentId);
            
            // 日付が選択日と同じで、設備が表示範囲内にある場合のみ表示
            const targetDate = interactionState.dragGhost.newDate;
            const isSameDate = targetDate.getFullYear() === selectedDate.getFullYear() &&
                              targetDate.getMonth() === selectedDate.getMonth() &&
                              targetDate.getDate() === selectedDate.getDate();
            
            if (!isSameDate || targetEquipmentIndex === -1) {
              return null;
            }
            
            // 日別ビューと同じ方式：グリッド内の正確な位置に表示
            // 実際のイベントバーは各行（excel-date-row）内のrow-schedule-layerに配置されている
            // row-schedule-layerは各行内でposition: absolute, top: 0, left: 200に配置
            // イベントバーはrow-schedule-layer内でposition: absolute, top: 2px, left: startSlot * scaledCellWidthに配置
            const rowHeight = 40; // 固定の行の高さ（minHeight: '40px'）
            const topOffset = 2; // イベントバーのオフセット（row-schedule-layer内でのtop位置）
            // 実際のイベントバーのleft計算: row-schedule-layerのleft(200) + イベントバーのleft(startSlot * scaledCellWidth)
            const actualLeft = 200 + startSlot * scaledCellWidth; // scaledCellWidthを使用（精度向上）
            // 設備インデックスは既に計算済み（targetEquipmentIndex）を使用
            // 実際のイベントバーの位置: 各行のrow-schedule-layer内でtop: 2px
            // ドラッグゴーストはschedule-content-areaに対してposition: absoluteで配置されるため、
            // 各行の位置（targetEquipmentIndex * rowHeight）+ row-schedule-layer内のオフセット（topOffset）を計算
            const actualTop = targetEquipmentIndex >= 0 ? targetEquipmentIndex * rowHeight + topOffset : 0;
            return (
              <div
                className="drag-ghost"
                style={{
                  position: 'absolute',
                  width: `${width}px`,
                  height: '36px', // 実際のイベントバーの高さと同じ
                  backgroundColor: safeHexColor(interactionState.dragGhost.schedule.color || '#3498db'),
                  border: '2px dashed rgba(255, 255, 255, 0.8)',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  zIndex: 1000,
                  opacity: 0.7,
                  left: `${actualLeft}px`,
                  top: `${actualTop}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
                }}
                title={`${interactionState.dragGhost.schedule.title || (interactionState.dragGhost.schedule as any).purpose || '予約'}\n${formatTime(newStart)} - ${formatTime(newEnd)}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                    {interactionState.dragGhost.schedule.title || (interactionState.dragGhost.schedule as any).purpose || '無題'}
                  </div>
                  <div style={{ fontSize: '9px', opacity: 0.9 }}>
                    {formatTime(newStart)} - {formatTime(newEnd)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
            
        {/* 現在時刻の赤い縦線 */}
            <CurrentTimeLineWrapper
              selectedDate={selectedDate}
              cellHeight={40}
          startHour={0}
          endHour={24}
          cellWidth={CELL_WIDTH_PX * scheduleScale}
          timeColumnWidth={200}
              pageType="equipment"
          gridContainerRef={gridRef}
        />
          </div>

      {/* 設備スケジュール登録フォーム（モーダル形式） */}
      {showRegistrationTab && isModalOpen && selectionSnapshot && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 30000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowRegistrationTab(false);
            setIsModalOpen(false);
            setSelectionSnapshot(null);
            clearSelection();
          }
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 0,
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
              <EquipmentScheduleForm
                selectedDate={selectedDate}
                employees={employees}
                equipments={equipments}
                reservations={[]} // 生データではなく空配列
                defaultEmployeeId={(() => {
                  // 列（セル）からのユーザーを優先
                  const empFromColumn = employees.find(e => e.id === (selectionSnapshot as any)?.employeeId)?.id;
                  return empFromColumn ?? employees[0]?.id;
                })()}
                defaultDepartmentId={(() => {
                  const empId = employees.find(e => e.id === (selectionSnapshot as any)?.employeeId)?.id
                    ?? employees[0]?.id;
                  return employees.find(e => e.id === empId)?.department_id ?? undefined;
                })()}
                initialValues={(() => {
                  const values = {
                    equipmentId: selectionSnapshot.equipmentId,
                    selectedDate: selectedDate,
                    initialStart: selectionSnapshot.startDateTime,
                    initialEnd: selectionSnapshot.endDateTime,
                    startTime: selectionSnapshot.startDateTime.toTimeString().slice(0, 5),
                    endTime: selectionSnapshot.endDateTime.toTimeString().slice(0, 5),
                    purpose: ''
                  };
                  
                  console.log('🔍 EquipmentScheduleForm に渡すinitialValues:', {
                    ...values,
                    startDateTimeISO: values.initialStart.toISOString(),
                    endDateTimeISO: values.initialEnd.toISOString(),
                    equipmentName: equipments.find(eq => eq.id === values.equipmentId)?.name
                  });
                  
                  return values;
                })()}
                onClose={() => {
                  setShowRegistrationTab(false);
                  setIsModalOpen(false);
                  setSelectionSnapshot(null);
                  clearSelection();
                }}
                onSave={() => {
                  setShowRegistrationTab(false);
                  setIsModalOpen(false);
                  setSelectionSnapshot(null);
                  clearSelection();
                  loadReservations();
                }}
              />
            </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showScheduleForm && selectedSchedule && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 30000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowScheduleForm(false);
          }
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 8,
            padding: 0,
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
              <EquipmentScheduleForm
                selectedDate={selectedDate}
                employees={employees}
              equipments={equipments}
              reservations={[]} // 生データではなく空配列
                defaultEmployeeId={employees.find(e => e.id === (selectedSchedule as any)?.employee_id)?.id ?? employees[0]?.id}
                defaultDepartmentId={(() => {
                  const empId = (selectedSchedule as any)?.employee_id ?? employees[0]?.id;
                  return employees.find(e => e.id === empId)?.department_id ?? undefined;
                })()}
              initialValues={{
                reservationId: selectedSchedule.id,
                equipmentId: selectedSchedule.equipment_ids?.[0] || 0,
                selectedDate: selectedDate,
                initialStart: new Date(selectedSchedule.start_datetime),
                initialEnd: new Date(selectedSchedule.end_datetime),
                startTime: new Date(selectedSchedule.start_datetime).toTimeString().slice(0, 5),
                endTime: new Date(selectedSchedule.end_datetime).toTimeString().slice(0, 5),
                purpose: selectedSchedule.title || ''
              }}
                onClose={() => {
                setShowScheduleForm(false);
              }}
              onSave={() => {
                setShowScheduleForm(false);
                loadReservations();
              }}
            />
          </div>
        </div>
      )}

      {/* 管理タブ（日別スケジュールと同じ） */}
      <ManagementTabs
        isVisible={showManagementTabs}
        onClose={() => setShowManagementTabs(false)}
        onNavigate={(path) => {
          setShowManagementTabs(false);
          setCurrentRegistrationView(path);
        }}
        onScheduleRegister={() => {
          setShowManagementTabs(false);
          setShowRegistrationTab(true);
        }}
        colors={SCHEDULE_COLORS}
      />

      {/* 登録画面（日別スケジュールと同じ） */}
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

      {currentRegistrationView === '/management/templates' && (
        <TemplateRegistrationModal
          isVisible={true}
          onClose={() => setCurrentRegistrationView(null)}
          onSuccess={() => {
            console.log('Template saved successfully');
            setCurrentRegistrationView(null);
          }}
        />
      )}

      {/* 重複注意タブ（右上にフローティング） */}
      {conflictTab && (
        <div style={{
          position: 'fixed',
          top: 16,
          right: 16,
          background: '#fff5f5',
          color: '#c53030',
          border: '1px solid #feb2b2',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
          zIndex: 20000,
          minWidth: 280,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 700 }}>⚠️ 設備予約の重複</div>
            <button onClick={() => setConflictTab(null)} style={{
              border: 'none', background: 'transparent', color: '#c53030', cursor: 'pointer', fontSize: 16
            }}>×</button>
    </div>
          <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
            {conflictTab.message}
          </div>
          {conflictTab.details && conflictTab.details.length > 0 && (
            <div style={{ marginTop: 8, background: '#fff', border: '1px solid #fed7d7', borderRadius: 6, padding: 8, maxHeight: 160, overflow: 'auto' }}>
              {conflictTab.details.map((d, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2, borderBottom: '1px dashed #fed7d7', padding: '6px 0' }}>
                  <div style={{ fontWeight: 600 }}>{d.purpose || '無題'}（ID: {d.id}）</div>
                  <div style={{ fontSize: 12 }}>{d.start} - {d.end}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ドラッグ中の固定位置ゴーストは削除（パフォーマンス最適化） */}

      {/* エラー表示 */}
      {error && (
        <div style={{
          position: 'fixed',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#dc3545',
          color: 'white',
          padding: '8px 16px',
          borderRadius: 4,
          zIndex: 1000
        }}>
          {error}
    </div>
      )}

    </>
  );
};

export default EquipmentReservation;