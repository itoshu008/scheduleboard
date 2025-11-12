import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { api } from '../../api';
import { scheduleApi, equipmentApi } from '../../utils/api';

import {
  toLocalISODateTime,
  parseLocalDateTimeString,
  buildLocalDateTime,
  formatLocal,
  formatDate,
  getTimeFromSlot,
  getTimeSlot,
  getEndTimeSlot
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
import EventBar from '../EventBar/EventBar';

// 共通フック
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
// 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
import { useMonthlyEventBarHandlers } from '../../hooks/useMonthlyEventBarHandlers';

import './DailySchedule.css';
import './DailyScheduleContainer.css';
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
import OverlapConfirmationDialog from '../OverlapConfirmationDialog/OverlapConfirmationDialog';
import { checkScheduleOverlap, markOverlappingSchedules } from '../../utils/overlapUtils';

import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';

interface DailyScheduleProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  departments: Department[];
  employees: Employee[];
  schedules?: Schedule[]; // 月別ビューと統一
  onDepartmentChange: (department: Department) => Promise<void>;
  onEmployeeChange: (employee: Employee) => void;
}

/**
 * 日別スケジュール - 拘束解除版
 * 
 * 自由にカスタマイズ可能：
 * - レイアウト構造の変更可能
 * - スクロールバーのカスタマイズ可能
 * - コンテナサイズの調整可能
 * - セルサイズの変更可能
 * - 機能の追加・削除可能
 */
const DailySchedule: React.FC<DailyScheduleProps> = ({
  selectedDate,
  onDateChange,
  departments,
  employees,
  schedules: propSchedules,
  onDepartmentChange,
  onEmployeeChange
}) => {
  // 基本状態（propsから受け取ったスケジュールを使用、なければ独自に管理）
  const [localSchedules, setLocalSchedules] = useState<Schedule[]>([]);
  
  // propsから受け取ったスケジュールを優先的に使用（App.tsxでWebSocket管理）
  // propSchedulesが提供されている場合はそれを使用、なければlocalSchedulesを使用
  const schedules = useMemo(() => {
    console.log('📊 DailySchedule: schedules useMemo triggered:', {
      propSchedules: propSchedules !== undefined ? propSchedules.length : 'undefined',
      localSchedules: localSchedules.length
    });
    
    if (propSchedules !== undefined) {
      console.log('✅ DailySchedule: Using propSchedules:', propSchedules.length);
      return propSchedules || [];
    }
    console.log('⚠️ DailySchedule: Using localSchedules:', localSchedules.length);
    return localSchedules;
  }, [propSchedules, localSchedules]);
  const setSchedules = propSchedules ? (() => {}) : setLocalSchedules;
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(
    departments.length > 0 ? departments[0] : null
  );
  
  const [forceShowToolbar, setForceShowToolbar] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('all-force-show-toolbar');
      return v === '1';
    } catch {}
    return true;
  });
  
  const [scheduleScale, setScheduleScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  
  // 共通フックを使用
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

  // モーダル状態
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleAction, setShowScheduleAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);
  
  // 選択確定処理の安定化
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectionSnapshot, setSelectionSnapshot] = useState<{
    startDateTime: Date;
    endDateTime: Date;
    employeeId: number;
    employeeName?: string;
  } | null>(null);
  
  // フィルタされた社員リストを事前に計算
  const filteredEmployees = selectedDepartment 
    ? employees.filter(emp => emp.department_id === selectedDepartment.id)
    : [];
  
  // 社員ID計算関数
  const getEmployeeIdFromDelta = (originalEmployeeId: number, delta: number) => {
    // 現在の社員のインデックスを取得
    const currentIndex = filteredEmployees.findIndex((emp: any) => emp.id === originalEmployeeId);
    if (currentIndex === -1) return originalEmployeeId; // 見つからない場合は元のIDを返す
    
    // 新しいインデックスを計算（境界チェック付き）
    const newIndex = Math.max(0, Math.min(filteredEmployees.length - 1, currentIndex + delta));
    return filteredEmployees[newIndex].id;
  };
  
  // 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
  // 注意: loadSchedulesを先に定義してからreloadSchedulesを定義する必要がある
  const [isPanning, setIsPanning] = useState(false);
  const [containerMarginTop, setContainerMarginTop] = useState<number>(0);
  
  // コピー&ペースト（月別から完全移植）
  const [clipboard, setClipboard] = useState<Schedule | null>(null);

  // コンテキストメニュー状態
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<{ id: number; type: string } | null>(null);

  // 重複確認状態
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [overlapInfo, setOverlapInfo] = useState<any>(null);

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  // useEffect for localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem('all-force-show-toolbar');
      if (v !== '1') localStorage.setItem('all-force-show-toolbar', '1');
    } catch {}
  }, []);

  // ユーティリティ関数
  const getTimeSlot = useCallback((date: Date): number => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return hours * 4 + Math.floor(minutes / 15);
  }, []);

  const getEndTimeSlot = useCallback((date: Date): number => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return hours * 4 + Math.ceil(minutes / 15);
  }, []);
  
  // マウス移動処理（requestAnimationFrameで最適化）（月別から完全移植）

  const formatTime = useCallback((date: Date): string => {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
  }, []);

  // スケジュール読み込み（propsから受け取ったスケジュールがない場合のみ）
  const loadSchedules = useCallback(async () => {
    if (propSchedules) {
      // propsから受け取ったスケジュールを使用（WebSocketで更新される）
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await scheduleApi.getDailyAll(formatDate(selectedDate));
      setLocalSchedules(markOverlappingSchedules(Array.isArray(response.data) ? response.data : []));
    } catch (err) {
      console.error('スケジュール読み込みエラー:', err);
      setError('スケジュールの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, propSchedules]);

  // reloadSchedulesをloadSchedulesの後に定義（初期化順序の問題を回避）
  // propSchedulesが存在する場合でも、強制的にAPIから再読み込みして確実に更新を反映
  const reloadSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await scheduleApi.getDailyAll(formatDate(selectedDate));
      const updatedSchedules = markOverlappingSchedules(Array.isArray(response.data) ? response.data : []);
      setLocalSchedules(updatedSchedules);
      console.log('✅ スケジュール再読み込み完了:', updatedSchedules.length, '件');
    } catch (err) {
      console.error('スケジュール再読み込みエラー:', err);
      setError('スケジュールの再読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // 月別ビューのイベントバー処理ロジックを使用
  const {
    interactionState,
    setInteractionState,
    isResizing,
    mousePosition,
    handleScheduleMouseDown,
    handleResizeMouseDown,
    updateSchedulePosition
  } = useMonthlyEventBarHandlers({
    scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
    scaledRowHeight: 40 * scheduleScale, // 日別は社員間移動可能
    reloadSchedules,
    setSelectedSchedule,
    setSelectedCells,
    getEmployeeIdFromDelta, // 社員間移動をサポート
    enableVerticalMovement: true // 縦方向移動を有効化（社員間移動）
  });

  // 月別ビューのロジックと互換性を保つため、既存の変数名をエイリアス
  const dragData = interactionState.dragData;
  const dragGhost = interactionState.dragGhost;
  const resizeData = interactionState.resizeData;
  const resizeGhost = interactionState.resizeGhost;

  // セル選択（直接実装）- useMonthlyEventBarHandlersの後に定義（interactionStateにアクセスするため）
  const handleCellMouseDown = useCallback((employeeId: number, slot: number) => {
    if (interactionState.dragData) return; // ドラッグ中は選択無効（月別ビューのロジックと統一）

    const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${employeeId}-${slot}`;
    console.log('🔍 DailySchedule: handleCellMouseDown', { 
      employeeId, 
      slot, 
      cellId, 
      selectedDate,
      selectedDateString: selectedDate.toDateString(),
      selectedDateLocal: toLocalISODateTime(selectedDate),
      year: selectedDate.getFullYear(),
      month: selectedDate.getMonth() + 1,
      day: selectedDate.getDate()
    });

    // スケジュール選択をクリア
    setSelectedSchedule(null);

    // セル選択開始
    setSelectedCells(new Set([cellId]));
    setIsSelecting(true);
    setSelectionAnchor({ employeeId, slot });
  }, [interactionState.dragData, selectedDate, setSelectedSchedule, setSelectedCells, setIsSelecting, setSelectionAnchor]);
  const loadEquipments = useCallback(async () => {
    try {
      const response = await equipmentApi.getAll();
      setEquipments(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('設備データ読み込みエラー:', err);
    }
  }, []);

  // スケール変更
  const handleScaleChange = useCallback((newScale: number) => {
    setScheduleScale(newScale);
  }, []);

  // スケジュール保存
  const handleScheduleSave = useCallback(async (scheduleData: Partial<Schedule>) => {
    if (!selectedSchedule?.id) return;
    
    try {
      setIsSaving(true);
      const updateData = {
        ...scheduleData,
        start_datetime: new Date(scheduleData.start_datetime!),
        end_datetime: new Date(scheduleData.end_datetime!),
        color: toApiColor(scheduleData.color),
      };
      await scheduleApi.update(selectedSchedule.id, updateData);
      await loadSchedules();
      setShowScheduleForm(false);
      setSelectedSchedule(null);
    } catch (err) {
      console.error('スケジュール保存エラー:', err);
      setError('スケジュールの保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }, [selectedSchedule, loadSchedules]);

  // スケジュール削除
  const handleScheduleDelete = useCallback(async (scheduleId: number) => {
    try {
      await scheduleApi.delete(scheduleId);
      await loadSchedules();
      setShowScheduleAction(false);
      setSelectedSchedule(null);
    } catch (err) {
      console.error('スケジュール削除エラー:', err);
      setError('スケジュールの削除に失敗しました。');
    }
  }, [loadSchedules]);

  // スケジュールコピー（月別から完全移植）
  const handleScheduleCopy = useCallback((schedule: Schedule) => {
    setClipboard({ ...schedule });
    handleContextMenuClose();
  }, []);

  // 登録保存（日時データ変換対応）
  const handleRegistrationSave = useCallback(async (scheduleData: any) => {
    try {
      setIsSaving(true);
      
      // 日時データを適切に変換
      const processedData = {
        ...scheduleData,
        start_datetime: typeof scheduleData.start_datetime === 'string' 
          ? new Date(scheduleData.start_datetime) 
          : scheduleData.start_datetime,
        end_datetime: typeof scheduleData.end_datetime === 'string' 
          ? new Date(scheduleData.end_datetime) 
          : scheduleData.end_datetime,
        color: toApiColor(scheduleData.color),
      };
      
      await scheduleApi.create(processedData);
      await loadSchedules();
      setShowRegistrationTab(false);
      // 保存成功後にだけ選択をクリア
      setSelectedCells(new Set());
      setIsModalOpen(false);
    } catch (err) {
      console.error('スケジュール登録エラー:', err);
      setError('スケジュールの登録に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  }, [loadSchedules]);

  // 登録キャンセル
  const handleRegistrationCancel = useCallback(() => {
    setShowRegistrationTab(false);
    setSelectedCells(new Set());
    setIsModalOpen(false);
  }, []);

  // 重複確認
  const handleOverlapConfirm = useCallback(async () => {
    if (overlapInfo?.schedule) {
      await handleScheduleSave(overlapInfo.schedule);
    }
    setShowOverlapDialog(false);
    setOverlapInfo(null);
  }, [overlapInfo, handleScheduleSave]);

  const handleOverlapCancel = useCallback(() => {
    setShowOverlapDialog(false);
    setOverlapInfo(null);
  }, []);

  // コンテキストメニュー
  const handleContextMenuClose = useCallback(() => {
    setContextMenuPosition(null);
    setContextMenuTarget(null);
  }, []);

  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (!contextMenuTarget) return [];

    return [
      {
        id: 'edit',
        label: '編集',
        icon: '✏️',
        shortcut: 'Ctrl+E',
        action: () => {
          setShowScheduleAction(false);
          setShowScheduleForm(true);
        }
      },
      {
        id: 'copy',
        label: 'コピー',
        icon: '📋',
        shortcut: 'Ctrl+C',
        action: () => handleScheduleCopy(selectedSchedule!)
      },
      {
        id: 'paste',
        label: '貼り付け',
        icon: '📌',
        shortcut: 'Ctrl+V',
        action: handleSchedulePaste,
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
        action: () => handleScheduleDelete(contextMenuTarget.id)
      }
    ];
  }, [contextMenuTarget, selectedSchedule, clipboard]);

  // 選択セル日時取得（直接実装）
  const getSelectedCellDateTime = useCallback(() => {
    console.log('🔍 DailySchedule getSelectedCellDateTime: 開始', {
      selectedCellsSize: selectedCells.size,
      selectedCells: Array.from(selectedCells)
    });
    
    if (selectedCells.size === 0) return null;

    const cellIds = Array.from(selectedCells);
    console.log('🔍 DailySchedule getSelectedCellDateTime: ソート前', { cellIds });
    
    // セルIDを数値的にソート（スロット番号で正しく並べる）
    const sortedCellIds = cellIds.sort((a, b) => {
      const aParts = a.split('-');
      const bParts = b.split('-');
      if (aParts.length === 5 && bParts.length === 5) {
        const aSlot = parseInt(aParts[4]);
        const bSlot = parseInt(bParts[4]);
        return aSlot - bSlot;
      }
      return a.localeCompare(b);
    });
    
    const firstCellId = sortedCellIds[0];
    const lastCellId = sortedCellIds[sortedCellIds.length - 1];
    
    console.log('🔍 DailySchedule getSelectedCellDateTime: ソート後', {
      sortedCellIds,
      firstCellId,
      lastCellId
    });

    const parseCellId = (id: string) => {
      const parts = id.split('-');
      if (parts.length === 5) { // YYYY-MM-DD-employeeId-slot
        return {
          year: parseInt(parts[0]),
          month: parseInt(parts[1]) - 1,
          day: parseInt(parts[2]),
          employeeId: parseInt(parts[3]),
          slot: parseInt(parts[4])
        };
      }
      return null;
    };

    const firstCell = parseCellId(firstCellId);
    const lastCell = parseCellId(lastCellId);
    
    console.log('🔍 DailySchedule getSelectedCellDateTime: パース結果', {
      firstCell,
      lastCell,
      firstCellId,
      lastCellId
    });

    if (!firstCell || !lastCell) return null;

    // 全社員スケジュールと同じ方法で時間を計算
    const startTime = getTimeFromSlot(firstCell.slot);
    const endTime = getTimeFromSlot(lastCell.slot + 1);
    
    // 日付は selectedDate から取得（全社員スケジュールと同じ方法）
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const day = selectedDate.getDate();
    
    const startDateTime = new Date(year, month, day, startTime.hour, startTime.minute);
    const endDateTime = new Date(year, month, day, endTime.hour, endTime.minute);

    const targetEmployee = employees.find(emp => emp.id === firstCell.employeeId);

    console.log('🔍 DailySchedule getSelectedCellDateTime: 最終結果', {
      firstCell,
      lastCell,
      startTime,
      endTime,
      year,
      month,
      day,
      selectedDate,
      startDateTime,
      endDateTime,
      employeeId: firstCell.employeeId,
      employeeName: targetEmployee?.name || '不明'
    });

    return {
      startDateTime,
      endDateTime,
      employeeId: firstCell.employeeId,
      employeeName: targetEmployee?.name || '不明'
    };
  }, [selectedCells, employees]);


  const handleCellMouseEnter = useCallback((employeeId: number, slot: number) => {
    if (!isSelecting || !selectionAnchor) return;

    const newSelectedCells = new Set<string>();
    const startEmployee = Math.min(selectionAnchor.employeeId, employeeId);
    const endEmployee = Math.max(selectionAnchor.employeeId, employeeId);
    const startSlot = Math.min(selectionAnchor.slot, slot);
    const endSlot = Math.max(selectionAnchor.slot, slot);

    // 選択範囲のセルを生成
    for (let empId = startEmployee; empId <= endEmployee; empId++) {
      for (let s = startSlot; s <= endSlot; s++) {
        const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${empId}-${s}`;
        newSelectedCells.add(cellId);
      }
    }
    console.log('🔍 DailySchedule: handleCellMouseEnter', { 
      employeeId,
      slot,
      startEmployee,
      endEmployee,
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

  // 1) window mouseup で必ず選択終了
  useEffect(() => {
    const onUp = () => setIsSelecting(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  // 2) 選択確定時に1回だけモーダルを開く
  useEffect(() => {
    if (!isSelecting && selectedCells.size > 0) {
      console.log('🔍 DailySchedule: 選択確定、モーダルを開く', { selectedCellsSize: selectedCells.size });
      try {
        const snap = getSelectedCellDateTime();
        if (snap) {
          setSelectionSnapshot(snap as any);
        }
      } catch (e) {
        console.warn('selection snapshot failed:', e);
      }
      setIsModalOpen(true);
    }
  }, [isSelecting, selectedCells.size]);

  // 3) 選択セルから日時を算出（既存の getSelectedCellDateTime を利用）
  const selection = useMemo(() => {
    if (selectedCells.size === 0) return null;
    const result = getSelectedCellDateTime();
    console.log('🔍 DailySchedule selection useMemo:', {
      selectedCellsSize: selectedCells.size,
      selectedCells: Array.from(selectedCells),
      result
    });
    return result;
  }, [selectedCells, getSelectedCellDateTime]);

  // セル選択のダブルクリック（新規登録）
  const handleCellDoubleClick = useCallback((employeeId: number, slot: number) => {
    const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${employeeId}-${slot}`;
    setSelectedCells(new Set([cellId]));
    setSelectedSchedule(null);
    setShowRegistrationTab(true);
  }, [selectedDate, setSelectedCells, setSelectedSchedule]);

  // 背景クリックでセル選択解除
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // スケジュールアイテムやセルのクリックでない場合のみ
    const target = e.target as HTMLElement;
    if (!target.closest('.excel-schedule-item') && !target.closest('.excel-time-cell')) {
      setSelectedCells(new Set());
      setSelectedSchedule(null);
      setIsSelecting(false);
      setSelectionAnchor(null);
    }
  }, []);


  const handleScheduleDoubleClick = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSchedule(schedule);
    setShowScheduleForm(true);
  }, []);

  const handleScheduleContextMenu = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSchedule(schedule);
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuTarget({ id: schedule.id, type: 'schedule' });
  }, []);

  // リサイズ開始は月別ビューのロジック（useMonthlyEventBarHandlers）から提供されるhandleResizeMouseDownを使用

  // スケジュールペースト（月別から完全移植）
  const handleSchedulePaste = useCallback(async () => {
    if (!clipboard || !selectedDepartment) return;
    
    const targetDate = selectedDate;
    let targetEmployeeId = selectedDepartment.id; // 日別では部署IDを使用
    
    // セルが選択されている場合は、その位置にペースト
    if (selectedCells.size > 0) {
      const firstCellId = Array.from(selectedCells ?? [])[0];
      const [employeeIdStr, slotStr] = firstCellId.split('-');
      const employeeId = parseInt(employeeIdStr);
      const timeSlot = parseInt(slotStr);
      
      targetEmployeeId = employeeId;
      // 日別では同じ日付内でのペースト
    }
    
    const duration = new Date(clipboard.end_datetime).getTime() - new Date(clipboard.start_datetime).getTime();
    const startTime = new Date(targetDate);
    startTime.setHours(9, 0, 0, 0); // デフォルト開始時間
    const endTime = new Date(startTime.getTime() + duration);
    
    try {
      const newSchedule = {
        employee_id: targetEmployeeId,
        title: clipboard.title,
        start_datetime: startTime,
        end_datetime: endTime,
        color: toApiColor(clipboard.color)
      };
      
      await scheduleApi.create(newSchedule);
      await loadSchedules();
    } catch (error) {
      console.error('スケジュールペーストエラー:', error);
      setError('スケジュールのペーストに失敗しました');
    }
    handleContextMenuClose();
  }, [clipboard, selectedDepartment, selectedDate, selectedCells, loadSchedules]);

  // 月別ビューのロジックを使用（handleScheduleMouseDownはuseMonthlyEventBarHandlersから提供される）


  // データ読み込み（propsから受け取ったスケジュールがない場合のみ）
  useEffect(() => {
    if (!propSchedules) {
      loadSchedules();
    }
    loadEquipments();
  }, [loadSchedules, loadEquipments, propSchedules]);

  // propsから受け取ったスケジュールを反映（即座に更新）
  useEffect(() => {
    if (propSchedules !== undefined) {
      // propSchedulesが提供されている場合は、空配列でも反映
      setLocalSchedules(markOverlappingSchedules(propSchedules || []));
    }
  }, [propSchedules]);

  // 部署の初期選択
  useEffect(() => {
    if (departments.length > 0 && !selectedDepartment) {
      setSelectedDepartment(departments[0]);
    }
  }, [departments, selectedDepartment]);

  // キーボードショートカット（月別から完全移植）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedSchedule) {
        handleScheduleDelete(selectedSchedule.id);
      } else if (e.ctrlKey && e.key === 'c' && selectedSchedule) {
        handleScheduleCopy(selectedSchedule);
      } else if (e.ctrlKey && e.key === 'v' && clipboard) {
        handleSchedulePaste();
      } else if (e.key === 'Escape' && (interactionState.dragData || interactionState.resizeData)) {
        // ESCキーでドラッグ・リサイズ操作をキャンセル（月別ビューのロジックと統一）
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
  }, [selectedSchedule, clipboard, interactionState, setInteractionState]);

  // マウス移動処理は月別ビューのロジック（useMonthlyEventBarHandlers）で管理されるため削除
  // 日別ビュー特有の社員間移動機能は後で追加予定

  // スケール計算
  const scaledCellWidth = CELL_WIDTH_PX * scheduleScale;
  const scaledRowHeight = DAILY_BAR_HEIGHT_PX * scheduleScale;
  const scaledColWidth = 240 * scheduleScale;

  // 日別用のデータフィルタリング（選択日のスケジュールのみ）
  // 重複チェックを使用（スケジュールが選択日と重複しているか）
  const dailySchedules = useMemo(() => {
    const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
    
    return schedules.filter(schedule => {
      const startTime = new Date(schedule.start_datetime);
      const endTime = new Date(schedule.end_datetime);
      // スケジュールが選択日と重複しているかチェック
      return startTime <= dayEnd && endTime >= dayStart;
    });
  }, [schedules, selectedDate]);

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
      {/* ヘッダー */}
      <div className="schedule-header" ref={headerRef}>
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
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

      {/* ナビゲーションコントロール */}
      <div className="grid-top-controls" ref={controlsRef}>
        <div className="grid-controls-row">
          <div className="nav-btn-left" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            
            {/* ナビゲーションボタン */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/monthly')}>月別</button>
              <button className="nav-btn active" onClick={() => (window.location.href = '/scheduleboard/daily')}>日別</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/all-employees')}>全社員</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/equipment')}>設備</button>
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
                onClick={() => setShowRegistrationTab(true)}
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
                ✨ スケジュール新規登録
              </button>
            </div>
          </div>
        </div>
        <div className="grid-controls-row-third">
          <div className="department-section">
            <div className="department-buttons">
              {departments.map(dept => (
                <button
                  key={dept.id}
                  className={`dept-btn ${selectedDepartment?.id === dept.id ? 'active' : ''}`}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔍 DailySchedule: 部署選択', {
                      selectedDept: dept.name,
                      deptId: dept.id,
                      totalEmployees: employees.length,
                      deptEmployees: employees.filter(emp => emp.department_id === dept.id).length
                    });
                    await onDepartmentChange(dept);
                    setSelectedDepartment(dept);
                  }}
                >
                  {dept.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* スケジュールテーブル */}
        {loading ? (
          <div className="loading-center">
            <div className="loading-spinner"></div>
            <p>データを読み込み中...</p>
          </div>
      ) : (
        /* Excel風スケジュールコンテナ（月別と同じ構造） */
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
          {/* Excel風スケジュールテーブル（月別参照） */}
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
            {/* 固定ヘッダー：時間軸（月別と同じ） */}
            <div className="time-header-fixed" style={{
              position: 'sticky',
              top: 0,
              left: 0,
              zIndex: 100,
              backgroundColor: '#f0f0f0',
              borderBottom: '2px solid #ccc',
              display: 'flex',
                                                minWidth: `${80 + 96 * 20}px` // 社員列80px + 96セル×20px = 2000px
               }}>
                 {/* 左上の空白セル（4マス：80px） */}
                 <div style={{
                   width: '80px',
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
                   社員/時間
                 </div>
              
                               {/* 時間ヘッダー（0:00～23:00の24マス：1時間間隔） */}
                 <div style={{ display: 'flex', flexShrink: 0 }}>
                   {Array.from({ length: 24 }, (_, hour) => {
                     return (
                       <div key={hour} style={{
                         width: '80px', // 1時間間隔で統一
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
                       title={`時間ヘッダー: 80px × 40px（${hour.toString().padStart(2, '0')}:00）`}
                       >
                         {`${hour.toString().padStart(2, '0')}:00`}
                       </div>
                     );
                   })}
                 </div>
            </div>

                           {/* スクロール可能なコンテンツエリア（1時間間隔対応） */}
               <div 
                 className="schedule-content-area" 
                 style={{
                   position: 'relative',
                   minWidth: `${80 + 96 * 20}px` // 社員列80px + 96セル×20px = 2000px
                 }}
                 onClick={handleBackgroundClick}
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
               {/* 社員行とスケジュールセル（月別の日付行を社員行に変更） */}
              {selectedDepartment ? (() => {
                console.log('🔍 DailySchedule: 部署フィルタリング', {
                  selectedDepartment: selectedDepartment.name,
                  selectedDepartmentId: selectedDepartment.id,
                  totalEmployees: employees.length,
                  filteredEmployees: filteredEmployees.length,
                  filteredEmployeeNames: filteredEmployees.map(emp => emp.name)
                });
                return filteredEmployees.map((employee, employeeIndex) => (
                <div key={`employee-${employeeIndex}`} className="excel-date-row" style={{
                  display: 'flex',
                  borderBottom: '1px solid #ccc',
                  minHeight: '40px',
                  position: 'relative',
                  overflow: 'visible'
                }}>
                                       {/* 固定社員セル（4マス：80px） */}
                     <div className="date-cell-fixed" style={{
                       position: 'sticky',
                       left: 0,
                       zIndex: 50,
                       width: '80px',
                       backgroundColor: '#f8f9fa',
                       border: '1px solid #ccc',
                       display: 'flex',
                       flexDirection: 'column',
                       alignItems: 'center',
                       justifyContent: 'center',
                       padding: '2px',
                       fontSize: '11px',
                       fontWeight: '500',
                       lineHeight: '1.1'
                     }}>
                       <div style={{ margin: 0 }}>{employee.name}</div>
                     </div>

                                       {/* 時間セル（96マス：15分間隔の4セル構成） */}
                     {Array.from({ length: 96 }, (_, slot) => {
                       const hour = Math.floor(slot / 4);
                       const minute = (slot % 4) * 15;

                    // このセルのスケジュールを検索
                                          const cellSchedules = dailySchedules.filter(schedule => {
                      if (schedule.employee_id !== employee.id) return false;

                      const startTime = new Date(schedule.start_datetime);
                      const endTime = new Date(schedule.end_datetime);
                      const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
                      const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

                      if (startTime > dayEnd || endTime < dayStart) return false;

                      const scheduleStart = Math.max(startTime.getTime(), dayStart.getTime());
                      const scheduleEnd = Math.min(endTime.getTime(), dayEnd.getTime());
                      const startSlot = getTimeSlot(new Date(scheduleStart));
                      const endSlot = getEndTimeSlot(new Date(scheduleEnd));

                      return startSlot <= slot && slot < endSlot;
                    });

                    const cellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${employee.id}-${slot}`;
                    const isSelected = selectedCells.has(cellId);
                    
                    // デバッグ用（最初の数セルのみ）
                    if (employeeIndex === 0 && slot < 5) {
                      console.log('🔍 Cell render:', { cellId, isSelected, selectedCellsSize: selectedCells.size });
                    }

                    return (
                                               <div
                          key={`cell-${employeeIndex}-${slot}`}
                          className={`excel-time-cell quarter-hour-cell ${isSelected ? 'selected' : ''}`}
                          style={{
                            width: '20px', // 15分間隔で統一
                            height: '40px',
                            backgroundColor: isSelected ? '#e3f2fd' : '#fff',
                            border: isSelected ? '2px solid #2196f3' : '1px solid #e0e0e0',
                            position: 'relative',
                            cursor: 'pointer',
                            fontSize: '10px',
                            boxShadow: isSelected ? '0 0 8px rgba(33, 150, 243, 0.3)' : 'none',
                            zIndex: isSelected ? 5 : 1
                          }}
                          data-employee-id={employee.id}
                          data-slot={slot}
                          data-time={`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                          onMouseDown={(e) => {
                            if (e.button !== 0) return; // 左クリック以外はセル選択無効化（右・中）
                            
                            // ReusableEventBar（schedule-item）がクリックされた場合はセル選択をスキップ
                            const target = e.target as HTMLElement;
                            const scheduleItem = target.closest('.schedule-item');
                            if (scheduleItem) {
                              console.log('🚫 セルのonMouseDown: ReusableEventBarがクリックされたためスキップ');
                              return;
                            }
                            
                            e.stopPropagation();
                            handleCellMouseDown(employee.id, slot);
                          }}
                          onMouseEnter={(e) => {
                            // ReusableEventBar（schedule-item）がホバーされた場合はセル選択をスキップ
                            const target = e.target as HTMLElement;
                            const scheduleItem = target.closest('.schedule-item');
                            if (scheduleItem) {
                              return;
                            }
                            handleCellMouseEnter(employee.id, slot);
                          }}
                          onMouseUp={handleCellMouseUp}
                          onDoubleClick={() => {
                            handleCellDoubleClick(employee.id, slot);
                          }}
                          title={`${employee.name} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                        >
                        {/* スケジュールアイテム（4セル構成対応） */}
                        {cellSchedules.map(schedule => {
                          const startSlot = getTimeSlot(new Date(schedule.start_datetime));
                          if (startSlot !== slot) return null; // 開始スロットでのみ描画
                          
                          const endSlot = getEndTimeSlot(new Date(schedule.end_datetime));
                          let width = (endSlot - startSlot) * 20; // 15分間隔（20px）
                          
                          // 複数セル選択時は選択範囲の幅を使用
                          const currentCellId = `${employee.id}-${slot}`;
                          const isCurrentCellSelected = selectedCells.has(currentCellId);
                          
                          if (isCurrentCellSelected && selectedCells.size > 1) {
                            // 同じ社員の選択されたセルの範囲を計算
                            const employeeSelectedCells = Array.from(selectedCells)
                              .filter(cellId => cellId.startsWith(`${employee.id}-`))
                              .map(cellId => {
                                const [, slotStr] = cellId.split('-');
                                return parseInt(slotStr);
                              })
                              .filter(s => !isNaN(s))
                              .sort((a, b) => a - b);
                            
                            if (employeeSelectedCells.length > 1) {
                              const minSlot = Math.min(...employeeSelectedCells);
                              const maxSlot = Math.max(...employeeSelectedCells);
                              const slotRange = maxSlot - minSlot + 1;
                              
                              // 選択範囲の幅を使用
                              width = slotRange * 20; // 15分間隔（20px）
                            }
                          }
                          
                          // 月別参照：イベントバーの高さは固定（月別と同じ方式）
                          const height = 36; // 月別参照：固定高さ
                          const topOffset = 2; // 月別参照：固定オフセット
                          
                          return null;
                          
                        })}
                      </div>
                    );
                  })}

                  {/* 行オーバーレイ層：セルの上にスケジュールを一括描画（セル跨ぎ対応） */}
                  <div
                    className="row-schedule-layer"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 80, // 固定社員セル幅（この行の左の固定セルが80pxのため）
                      width: 96 * 20,
                      height: 40,
                      pointerEvents: 'none',
                      overflow: 'visible'
                    }}
                  >
                    {(() => {
                      const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
                      const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
                      const rowSchedules = dailySchedules.filter(schedule => {
                        if (schedule.employee_id !== employee.id) return false;
                        const startTime = new Date(schedule.start_datetime);
                        const endTime = new Date(schedule.end_datetime);
                        if (startTime > dayEnd || endTime < dayStart) return false;
                        return true;
                      });

                      return rowSchedules.map(schedule => {
                        // リサイズ中は新しい時間を使用
                        let startTime = new Date(schedule.start_datetime);
                        let endTime = new Date(schedule.end_datetime);
                        
                        if (isResizing && resizeGhost && resizeGhost.schedule.id === schedule.id) {
                          startTime = resizeGhost.newStart;
                          endTime = resizeGhost.newEnd;
                        }
                        
                        const startSlot = getTimeSlot(startTime);
                        const endSlot = getEndTimeSlot(endTime);
                        const left = startSlot * scaledCellWidth; // scaledCellWidthを使用（精度向上）
                        const width = (endSlot - startSlot) * scaledCellWidth; // scaledCellWidthを使用（精度向上）
                        
                        // デバッグ情報（リサイズ中のスケジュールのみ）
                        if (resizeData && resizeData.schedule.id === schedule.id) {
                          console.log('🎯 ACTUAL_SCHEDULE_POSITION:', {
                            scheduleId: schedule.id,
                            startSlot,
                            endSlot,
                            left,
                            width,
                            top: 2,
                            employeeIndex
                          });
                        }
                        // 日別スケジュール専用のイベントバー（位置計算を直接行う）
                        return (
                          <div
                            key={`row-item-${schedule.id}`}
                            className={`schedule-item ${selectedSchedule?.id === schedule.id ? 'selected' : ''}`}
                            style={{
                              background: `linear-gradient(180deg, ${lightenColor(safeHexColor(schedule.color || '#3498db'), 0.15)} 0%, ${safeHexColor(schedule.color || '#3498db')} 100%)`,
                              border: `1px solid ${lightenColor(safeHexColor(schedule.color || '#3498db'), -0.10)}`,
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
                              pointerEvents: 'auto' // 明示的にマウスイベントを受け取る
                            }}
                            onMouseDown={(e) => {
                              console.log('🎯 イベントバー クリック:', schedule.id, schedule.title);
                              
                              // リサイズ中は選択を無効化
                              if (isResizing || resizeData) {
                                console.log('🚫 リサイズ中のため選択を無効化');
                                return;
                              }
                              
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedSchedule(schedule);
                              handleScheduleMouseDown(schedule, e);
                            }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedSchedule(schedule);
                              setShowScheduleForm(true);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedSchedule(schedule);
                              setShowScheduleAction(true);
                            }}
                            title={`${schedule.title}\n${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`}
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
                                {schedule.title || '無題'}
                              </div>
                              <div className="schedule-time" style={{ fontSize: 10, opacity: 0.9, color: 'white' }}>
                                {`${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`}
                              </div>
                            </div>
                            
                            {/* 改良されたリサイズハンドル */}
                            <div
                              className="resize-handle resize-start"
                              onMouseDown={(e) => {
                                console.log('🔧 左リサイズハンドル クリック:', schedule.id);
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
                                zIndex: 10001, // イベントバーより前面
                                pointerEvents: 'auto', // 明示的にマウスイベントを受け取る
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '2px 0 0 2px',
                                transition: 'all 0.2s ease',
                                opacity: selectedSchedule?.id === schedule.id ? 1 : 0
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                                e.currentTarget.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
                                e.currentTarget.style.opacity = selectedSchedule?.id === schedule.id ? '1' : '0';
                              }}
                            />
                            <div
                              className="resize-handle resize-end"
                              onMouseDown={(e) => {
                                console.log('🔧 右リサイズハンドル クリック:', schedule.id);
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
                                zIndex: 10001, // イベントバーより前面
                                pointerEvents: 'auto', // 明示的にマウスイベントを受け取る
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                border: '1px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '0 2px 2px 0',
                                transition: 'all 0.2s ease',
                                opacity: selectedSchedule?.id === schedule.id ? 1 : 0
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.6)';
                                e.currentTarget.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
                                e.currentTarget.style.opacity = selectedSchedule?.id === schedule.id ? '1' : '0';
                              }}
                            />
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                ));
              })() : (
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
                    <div>部署を選択してください</div>
                    <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.7 }}>
                      上部の部署ボタンから表示したい部署を選択してください
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>


          
          {/* 現在時刻ライン */}
          <CurrentTimeLineWrapper
            selectedDate={selectedDate}
            cellHeight={40}
            startHour={8}
            endHour={20}
            cellWidth={20}
            timeColumnWidth={80}
            pageType="daily"
            gridContainerRef={tableContainerRef}
          />

          {/* ドラッグゴースト（カーソル位置にイベントバーの中心が来るように調整） */}
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
            
            // 社員IDを取得（社員間移動を考慮）
            const targetEmployeeId = interactionState.dragGhost.newEmployeeId || interactionState.dragData.schedule.employee_id;
            const targetEmployeeIndex = filteredEmployees.findIndex(emp => emp.id === targetEmployeeId);
            
            // 日付が選択日と同じで、社員が表示範囲内にある場合のみ表示
            const targetDate = interactionState.dragGhost.newDate;
            const isSameDate = targetDate.getFullYear() === selectedDate.getFullYear() &&
                              targetDate.getMonth() === selectedDate.getMonth() &&
                              targetDate.getDate() === selectedDate.getDate();
            
            if (!isSameDate || targetEmployeeIndex === -1) {
              return null;
            }
            
            // 月別ビューと同じ方式：グリッド内の正確な位置に表示
            // 実際のイベントバーは各行（excel-date-row）内のrow-schedule-layerに配置されている
            // row-schedule-layerは各行内でposition: absolute, top: 0, left: 80に配置
            // イベントバーはrow-schedule-layer内でposition: absolute, top: 2px, left: startSlot * scaledCellWidthに配置
            const rowHeight = 40; // 固定の行の高さ（minHeight: '40px'）
            const topOffset = 2; // イベントバーのオフセット（row-schedule-layer内でのtop位置）
            // 実際のイベントバーのleft計算: row-schedule-layerのleft(80) + イベントバーのleft(startSlot * scaledCellWidth)
            const actualLeft = 80 + startSlot * scaledCellWidth; // scaledCellWidthを使用（精度向上）
            // 社員インデックスは既に計算済み（targetEmployeeIndex）を使用
            // 実際のイベントバーの位置: 各行のrow-schedule-layer内でtop: 2px
            // ドラッグゴーストはschedule-content-areaに対してposition: absoluteで配置されるため、
            // 各行の位置（targetEmployeeIndex * rowHeight）+ row-schedule-layer内のオフセット（topOffset）を計算
            const actualTop = targetEmployeeIndex >= 0 ? targetEmployeeIndex * rowHeight + topOffset : 0;
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
                  left: `${actualLeft}px`, // カーソル位置にイベントバーの中心が来るように計算
                  top: `${actualTop}px`, // カーソル位置にイベントバーの中心が来るように計算
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
                }}
                title={`${interactionState.dragGhost.schedule.title}\n${formatTime(newStart)} - ${formatTime(newEnd)}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                    {interactionState.dragGhost.schedule.title || '無題'}
                  </div>
                  <div style={{ fontSize: '9px', opacity: 0.9 }}>
                    {formatTime(newStart)} - {formatTime(newEnd)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* モーダル */}
      {showScheduleForm && selectedSchedule && (
        <ScheduleFormModal
          schedule={selectedSchedule}
          employee={employees.find(emp => emp.id === selectedSchedule.employee_id)}
          colors={SCHEDULE_COLORS}
          onSave={handleScheduleSave}
          onCancel={() => {
            setShowScheduleForm(false);
            setSelectedSchedule(null);
          }}
        />
      )}

      {showScheduleAction && selectedSchedule && (
        <ScheduleActionModal
          schedule={selectedSchedule}
          onEdit={() => {
            setShowScheduleAction(false);
            setShowScheduleForm(true);
          }}
          onDelete={() => handleScheduleDelete(selectedSchedule.id)}
          onCopy={() => handleScheduleCopy(selectedSchedule)}
          onCancel={() => {
            setShowScheduleAction(false);
            setSelectedSchedule(null);
          }}
        />
      )}

      {showRegistrationTab && isModalOpen && (() => {
        console.log('🔍 DailySchedule ScheduleRegistrationModal props:', {
          isModalOpen,
          selection,
          selectionSnapshot,
          defaultStart: (selectionSnapshot?.startDateTime ?? selection?.startDateTime) ?? new Date(),
          defaultEnd: (selectionSnapshot?.endDateTime ?? selection?.endDateTime) ?? new Date(),
          selectedDepartmentId: selectedDepartment?.id ?? 0,
          defaultEmployeeId: selectionSnapshot?.employeeId ?? selection?.employeeId ?? filteredEmployees[0]?.id
        });
        return (
          <ScheduleRegistrationModal
            isOpen={isModalOpen}
            onClose={() => {
              console.log('🔍 DailySchedule: モーダルを閉じる、選択をクリア');
              setSelectedCells(new Set());
              setSelectionSnapshot(null);
              setIsModalOpen(false);
            }}
            defaultStart={(selectionSnapshot?.startDateTime ?? selection?.startDateTime) ?? new Date()}
            defaultEnd={(selectionSnapshot?.endDateTime ?? selection?.endDateTime) ?? new Date()}
            selectedDepartmentId={selectedDepartment?.id ?? 0}
            defaultEmployeeId={
              (selectionSnapshot?.employeeId)
              ?? (selection?.employeeId)
              ?? (filteredEmployees[0]?.id)
              ?? (employees[0]?.id)
            }
            employees={employees}
          onCreated={(created) => {
            console.log('🔍 DailySchedule onCreated:', { created, selectionSnapshot, selection });
            setSchedules((prev) => [...prev, created]);
            setIsModalOpen(false);
          }}
        />
        );
      })()}

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
          setShowRegistrationTab(true);
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

      {/* 重複確認ダイアログ */}
      <OverlapConfirmationDialog
        isOpen={showOverlapDialog}
        overlapInfo={overlapInfo || { type: 'schedule', overlappingItems: [] }}
        onConfirm={handleOverlapConfirm}
        onCancel={handleOverlapCancel}
      />

      {/* コンテキストメニュー */}
      <ContextMenu
        items={getContextMenuItems()}
        position={contextMenuPosition}
        onClose={handleContextMenuClose}
      />

      {/* マウスカーソルに追従するゴーストは削除（グリッド内の正確な位置に表示する方式に統一） */}

    </>
  );
};

export default DailySchedule;
