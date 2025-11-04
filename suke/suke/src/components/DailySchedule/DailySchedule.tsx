import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { api } from '../../api';
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
import { useScheduleDrag } from '../../hooks/useScheduleDrag';
import { useScheduleDragResize } from '../../hooks/useScheduleDragResize';

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
  onDepartmentChange,
  onEmployeeChange
}) => {
  // 基本状態
  const [schedules, setSchedules] = useState<Schedule[]>([]);
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
  
  // 月別スケジュールから移植した完璧なドラッグ・リサイズ機能
  const {
    dragData: newDragData,
    dragGhost: newDragGhost,
    resizeData: newResizeData,
    resizeGhost: newResizeGhost,
    isResizing: newIsResizing,
    mousePosition: newMousePosition,
    handleScheduleMouseDown: newHandleScheduleMouseDown,
    handleResizeMouseDown: newHandleResizeMouseDown
  } = useScheduleDragResize({
    scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
    scaledRowHeight: 40 * scheduleScale, // 日別は社員間移動可能
    onUpdateSchedule: async (scheduleId: number, updateData: any) => {
      await api.put(`/schedules/${scheduleId}`, updateData);
    },
    onReloadSchedules: async () => {
      await loadSchedules();
    },
    employees: filteredEmployees, // フィルタされた社員リスト
    getEmployeeIdFromDelta // 外部で定義した関数を渡す
  });

  // ドラッグ機能の共通フック（既存、後で削除予定）
  const {
    isDragging,
    dragData,
    dragGhost,
    mousePosition,
    setDragData,
    setDragGhost,
    setMousePosition,
    handleScheduleMouseDown: commonHandleScheduleMouseDown,
    handleMouseMove: commonHandleMouseMove,
    handleMouseUp: commonHandleMouseUp,
    clearDrag
  } = useScheduleDrag();

  // リサイズ機能（既存のまま）
  const [resizeData, setResizeData] = useState<{
    schedule: Schedule;
    edge: 'start' | 'end';
    startX: number;
    originalStart: Date;
    originalEnd: Date;
    initialPosition: { x: number; y: number };
  } | null>(null);
  
  const [resizeGhost, setResizeGhost] = useState<{
    schedule: Schedule;
    edge: 'start' | 'end';
    newStart: Date;
    newEnd: Date;
    position: { x: number; y: number };
  } | null>(null);
  const [pendingOperation, setPendingOperation] = useState<{ type: 'drag' | 'resize'; timeoutId: NodeJS.Timeout } | null>(null);
  
  const [isResizing, setIsResizing] = useState(false);
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

  // スケジュール読み込み
  const loadSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/schedules', { params: { date: formatDate(selectedDate), scope: 'all' } });
      setSchedules(markOverlappingSchedules(Array.isArray(response.data) ? response.data : []));
    } catch (err) {
      console.error('スケジュール読み込みエラー:', err);
      setError('スケジュールの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // 設備データ読み込み
  const loadEquipments = useCallback(async () => {
    try {
      const response = await api.get('/equipment');
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
      await api.put(`/schedules/${selectedSchedule.id}`, updateData);
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
      await api.delete(`/schedules/${scheduleId}`);
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
      
      await api.post('/schedules', processedData);
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

  // セル選択（直接実装）
  const handleCellMouseDown = useCallback((employeeId: number, slot: number) => {
    if (isDragging) return; // ドラッグ中は選択無効

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
  }, [isDragging, selectedDate, setSelectedSchedule, setSelectedCells, setIsSelecting, setSelectionAnchor]);

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

  // リサイズ開始（月別から移植）
  const handleResizeMouseDown = (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // リサイズ開始時にセル選択をクリア
    setSelectedCells(new Set());
    setIsSelecting(false);
    
    const originalStart = new Date(schedule.start_datetime);
    const originalEnd = new Date(schedule.end_datetime);
    
    // シンプルなリサイズ開始
    setResizeData({
      schedule,
      edge,
      startX: e.clientX,
      originalStart,
      originalEnd,
      initialPosition: { x: e.clientX, y: e.clientY }
    });
    
    setIsResizing(true);
  };

  // スケジュールマウスダウン（月別から移植）

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
      
      await api.post('/schedules', newSchedule);
      await loadSchedules();
    } catch (error) {
      console.error('スケジュールペーストエラー:', error);
      setError('スケジュールのペーストに失敗しました');
    }
    handleContextMenuClose();
  }, [clipboard, selectedDepartment, selectedDate, selectedCells, loadSchedules]);

  const handleScheduleMouseDown = (schedule: Schedule, e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は選択/ドラッグを無効化（右クリックスクロール用）
    const target = e.target as HTMLElement;
    
    // リサイズハンドル上ではドラッグ操作を無効
    if (target && target.classList && target.classList.contains('resize-handle')) {
      return;
    }
    
    // リサイズ中はドラッグ操作を無効
    if (isResizing || resizeData) {
      return;
    }
    
    // 背景クリックでの選択解除を防ぐ
    e.stopPropagation();
    
    // 即座に選択状態を設定
    setSelectedSchedule(schedule);
    
    // セル選択状態をクリア（スケジュール選択のみ）
    setSelectedCells(new Set());
    setIsSelecting(false);
    setSelectionAnchor(null);
    
    // ドラッグ開始の閾値
    const DRAG_THRESHOLD = 5;
    
    // イベントバーの中央を基準点として計算
    const scheduleElement = e.target as HTMLElement;
    const rect = scheduleElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const startX = centerX; // イベントバーの中央X座標
    const startY = centerY; // イベントバーの中央Y座標
    let dragInitiated = false;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (dragInitiated) return;
      
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      
      // 閾値を超えたらドラッグ開始
      if (deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD) {
        dragInitiated = true;
        
        // ドラッグ開始時にセル選択をクリア
        setSelectedCells(new Set());
        setIsSelecting(false);
        
        const originalStart = new Date(schedule.start_datetime);
        const originalEnd = new Date(schedule.end_datetime);
        
        setDragData({
          schedule,
          startX: centerX, // イベントバーの中央X座標を基準に
          startY: centerY, // イベントバーの中央Y座標を基準に
          originalStart,
          originalEnd
        });
        
        // イベントバーの中央を基準にした初期ゴースト表示
        const scheduleWidth = (getEndTimeSlot(originalEnd) - getTimeSlot(originalStart)) * 20;
        
        // イベントバーの中央位置を計算（既にcenterX, centerYが中央座標）
        const initialGhostX = centerX - (scheduleWidth / 2);
        const initialGhostY = centerY - 20; // イベントバーの高さ(40px)の半分
        
        setDragGhost({
          schedule,
          start: originalStart,
          end: originalEnd
        });
        
        // 初期マウス位置をイベントバーの中央に設定
        setMousePosition({ x: initialGhostX, y: initialGhostY });
        
        // 共通フックのマウス移動処理を使用
        commonHandleMouseMove(moveEvent, employees, selectedDate, 'daily');
        
        // クリーンアップ
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      }
    };
    
    const handleMouseUp = async () => {
      // クリーンアップ
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (dragInitiated) {
        // 共通フックのマウスアップ処理を使用
        await commonHandleMouseUp(async (scheduleId, updateData) => {
          await api.put(`/schedules/${scheduleId}`, updateData);
          await loadSchedules();
        });
      } else {
        // console.log('Daily - Click completed for schedule:', schedule.id);
      }
    };
    
    // イベントリスナー登録
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };


  // データ読み込み
  useEffect(() => {
    loadSchedules();
    loadEquipments();
  }, [loadSchedules, loadEquipments]);

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
      } else if (e.key === 'Escape' && pendingOperation) {
        // ESCキーで遅延中の操作をキャンセル
        clearTimeout(pendingOperation.timeoutId);
        setPendingOperation(null);
        
        if (pendingOperation.type === 'drag') {
          setDragData(null);
          setDragGhost(null);
          setMousePosition(null);
        } else if (pendingOperation.type === 'resize') {
          setResizeData(null);
          setResizeGhost(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSchedule, clipboard, pendingOperation]);

  // マウス移動処理（月別から移植・日別用に調整）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // 前のアニメーションフレームをキャンセル
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // 新しいアニメーションフレームをスケジュール
      animationFrameRef.current = requestAnimationFrame(() => {
        if (dragData && isDragging && !isResizing) {
          console.log('🎯 DRAG_START - マウス移動検出');
          
          // ドラッグ処理（時間軸と社員軸の両方対応）
          const deltaX = e.clientX - dragData.startX;
          const deltaY = e.clientY - dragData.startY;
          
          // 時間軸の移動計算
          const cellWidth = 20; // CELL_WIDTH_PX
          const timeSlots = Math.round(deltaX / cellWidth);
          
          // 社員軸の移動計算
          const rowHeight = 40; // 社員行の高さ
          const employeeRows = Math.round(deltaY / rowHeight);
          
          // 新しい時間を計算
          const newStart = new Date(dragData.originalStart);
          newStart.setMinutes(newStart.getMinutes() + timeSlots * 15);
          
          const newEnd = new Date(dragData.originalEnd);
          newEnd.setMinutes(newEnd.getMinutes() + timeSlots * 15);
          
          // 日付境界チェック（簡略化）
          const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
          const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
          
          let ghostStart = newStart;
          let ghostEnd = newEnd;
          const durationMs = dragData.originalEnd.getTime() - dragData.originalStart.getTime();
          
          if (ghostStart < dayStart) {
            ghostStart = new Date(dayStart);
            ghostEnd = new Date(ghostStart.getTime() + durationMs);
          }
          if (ghostEnd > dayEnd) {
            ghostEnd = new Date(dayEnd);
            ghostStart = new Date(ghostEnd.getTime() - durationMs);
          }
          
          // 新しい社員を計算
          const originalEmployee = employees.find(emp => emp.id === dragData.schedule.employee_id);
          
          let newEmployeeId = dragData.schedule.employee_id;
          if (originalEmployee) {
            const originalIndex = filteredEmployees.findIndex(emp => emp.id === originalEmployee.id);
            const newIndex = Math.max(0, Math.min(filteredEmployees.length - 1, originalIndex + employeeRows));
            newEmployeeId = filteredEmployees[newIndex].id;
          }
          
          setDragGhost({
            schedule: {
              ...dragData.schedule,
              employee_id: newEmployeeId
            },
            start: ghostStart,
            end: ghostEnd
          });
          
          // マウス位置を更新（イベントバーの中央基準）
          const scheduleWidth = (getEndTimeSlot(ghostEnd) - getTimeSlot(ghostStart)) * 20;
          const centerX = e.clientX - (scheduleWidth / 2);
          const centerY = e.clientY - 20; // イベントバーの高さ(40px)の半分
          setMousePosition({ x: centerX, y: centerY });
          
          console.log('🎯 DRAG_UPDATE:', {
            deltaX,
            deltaY,
            timeSlots,
            employeeRows,
            originalEmployeeId: dragData.schedule.employee_id,
            newEmployeeId,
            newStart: toLocalISODateTime(ghostStart),
            newEnd: toLocalISODateTime(ghostEnd)
          });
          
        } else if (resizeData && isResizing && !isDragging) {
          console.log('🔧 RESIZE_START - マウス移動検出');
          
          // 簡単で直感的なリサイズ処理
          const deltaX = e.clientX - resizeData.startX;
          const cellWidth = 20; // CELL_WIDTH_PX
          const timeSlots = Math.round(deltaX / cellWidth);
          
          let newStart = new Date(resizeData.originalStart);
          let newEnd = new Date(resizeData.originalEnd);
          
          if (resizeData.edge === 'start') {
            newStart.setMinutes(newStart.getMinutes() + timeSlots * 15);
            // 開始時刻が終了時刻を超えないように制限
            if (newStart >= newEnd) {
              newStart = new Date(newEnd.getTime() - 15 * 60 * 1000); // 15分前
            }
          } else {
            newEnd.setMinutes(newEnd.getMinutes() + timeSlots * 15);
            // 終了時刻が開始時刻より前にならないように制限
            if (newEnd <= newStart) {
              newEnd = new Date(newStart.getTime() + 15 * 60 * 1000); // 15分後
            }
          }
          
          // 即座にスケジュールを更新（リアルタイムプレビュー）
          const updatedSchedules = (schedules ?? []).map(schedule => {
            if (schedule.id === resizeData.schedule.id) {
              return {
                ...schedule,
                start_datetime: toLocalISODateTime(newStart),
                end_datetime: toLocalISODateTime(newEnd)
              } as Schedule;
            }
            return schedule;
          });
          
          setSchedules(updatedSchedules);
          
          console.log('🔧 RESIZE_REALTIME_UPDATE:', {
            scheduleId: resizeData.schedule.id,
            edge: resizeData.edge,
            newStart: toLocalISODateTime(newStart),
            newEnd: toLocalISODateTime(newEnd),
            deltaX,
            timeSlots
          });
        }
      });
    };

    const handleMouseUp = async () => {
      if (dragData && isDragging) {
        console.log('🎯 DRAG_MOUSEUP - ドラッグ完了処理開始');
        
        if (!dragGhost) {
          console.log('⚠️ DRAG_MOUSEUP - ゴーストなし、クリーンアップのみ');
          setDragData(null);
          // setIsDragging は共通フックで管理されるため削除
          setDragGhost(null);
          setMousePosition(null);
          document.body.classList.remove('dragging');
          return;
        }

        console.log('✅ DRAG_MOUSEUP - ドラッグ実行:', {
          scheduleId: dragData.schedule.id,
          originalEmployeeId: dragData.schedule.employee_id,
          newEmployeeId: dragGhost.schedule.employee_id,
          newStart: toLocalISODateTime(dragGhost.start),
          newEnd: toLocalISODateTime(dragGhost.end)
        });

        // 300ms遅延でドラッグ実行
        const timeoutId = setTimeout(async () => {
          const newStart = new Date(dragGhost.start);
          const newEnd = new Date(dragGhost.end);
          
          try {
            await api.put(`/schedules/${dragData.schedule.id}`, {
              employee_id: dragGhost.schedule.employee_id, // 新しい社員IDを使用
              title: dragData.schedule.title,
              color: toApiColor(dragData.schedule.color),
              start_datetime: newStart,
              end_datetime: newEnd
            });
            
            await loadSchedules();
          } catch (err) {
            console.error('スケジュール移動エラー:', err);
            alert('スケジュールの移動に失敗しました。');
          } finally {
            setDragData(null);
            // setIsDragging は共通フックで管理されるため削除
            setDragGhost(null);
            setMousePosition(null);
            document.body.classList.remove('dragging');
            setPendingOperation(null);
          }
        }, 300);
        
        setPendingOperation({ type: 'drag', timeoutId });
        
        // 即座にドラッグ状態とゴーストを解除
        // setIsDragging は共通フックで管理されるため削除
        setDragGhost(null);
        setMousePosition(null);
        document.body.classList.remove('dragging');
        
      } else if (resizeData && isResizing) {
        console.log('🔧 RESIZE_MOUSEUP - リサイズ完了処理開始');
        
        // 現在のスケジュール状態を取得
        const currentSchedule = schedules.find(s => s.id === resizeData.schedule.id);
        if (!currentSchedule) {
          console.log('⚠️ RESIZE_MOUSEUP - スケジュールが見つからない');
          setResizeData(null);
          setIsResizing(false);
          return;
        }

        console.log('✅ RESIZE_MOUSEUP - リサイズ保存:', {
          scheduleId: resizeData.schedule.id,
          newStart: currentSchedule.start_datetime,
          newEnd: currentSchedule.end_datetime
        });

        // 即座にAPIに保存
        try {
          await api.put(`/schedules/${resizeData.schedule.id}`, {
            employee_id: resizeData.schedule.employee_id,
            title: resizeData.schedule.title,
            color: toApiColor(resizeData.schedule.color),
            start_datetime: new Date(currentSchedule.start_datetime),
            end_datetime: new Date(currentSchedule.end_datetime)
          });
          
          console.log('✅ RESIZE_API_SUCCESS - 保存完了');
          // リロードは不要（既に更新済み）
        } catch (err) {
          console.error('❌ RESIZE_API_ERROR:', err);
          alert('スケジュールのリサイズに失敗しました。');
          // エラー時は元の状態に戻す
          await loadSchedules();
        } finally {
          setResizeData(null);
          setIsResizing(false);
        }
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        // アニメーションフレームをクリーンアップ
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [dragData, isDragging, dragGhost, resizeData, isResizing, resizeGhost, selectedDate, loadSchedules]);

  // スケール計算
  const scaledCellWidth = CELL_WIDTH_PX * scheduleScale;
  const scaledRowHeight = DAILY_BAR_HEIGHT_PX * scheduleScale;
  const scaledColWidth = 240 * scheduleScale;

  // 日別用のデータフィルタリング（選択日のスケジュールのみ）
  const dailySchedules = schedules.filter(schedule => {
    const scheduleDate = new Date(schedule.start_datetime);
    return scheduleDate.toDateString() === selectedDate.toDateString();
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
              <button className="nav-btn" onClick={() => (window.location.href = '/monthly')}>月別</button>
              <button className="nav-btn active" onClick={() => (window.location.href = '/daily')}>日別</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/all-employees')}>全社員</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/equipment')}>設備</button>
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
          maxWidth: '98vw',
          height: 'calc(100vh - 180px)',
                overflow: 'auto',
          border: '1px solid #ccc',
          backgroundColor: '#fff',
          position: 'relative',
          boxSizing: 'border-box',
          margin: '0 auto'
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
                        
                        if (newIsResizing && newResizeGhost && newResizeGhost.schedule.id === schedule.id) {
                          startTime = newResizeGhost.newStart;
                          endTime = newResizeGhost.newEnd;
                        }
                        
                        const startSlot = getTimeSlot(startTime);
                        const endSlot = getEndTimeSlot(endTime);
                        const left = startSlot * 20 * scheduleScale;
                        const width = (endSlot - startSlot) * 20 * scheduleScale;
                        
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
                              background: `linear-gradient(180deg, ${lightenColor(safeHexColor(schedule.color), 25)} 0%, ${safeHexColor(schedule.color)} 100%)`,
                              border: `1px solid ${lightenColor(safeHexColor(schedule.color), -10)}`,
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
                              if (newIsResizing || newResizeData) {
                                console.log('🚫 リサイズ中のため選択を無効化');
                                return;
                              }
                              
                              e.preventDefault();
                              e.stopPropagation();
                              setSelectedSchedule(schedule);
                              newHandleScheduleMouseDown(schedule, e);
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
                                newHandleResizeMouseDown(schedule, 'start', e);
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
                                newHandleResizeMouseDown(schedule, 'end', e);
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

          {/* ドラッグゴースト（月別から移植） */}
          {dragGhost && mousePosition && (
            <div
              className="drag-ghost"
              style={{
                position: 'fixed',
                width: `${(getEndTimeSlot(dragGhost.end) - getTimeSlot(dragGhost.start)) * 20}px`,
                height: '40px',
                backgroundColor: safeHexColor(dragGhost.schedule.color),
                border: '2px dashed rgba(255, 255, 255, 0.8)',
                borderRadius: '4px',
                pointerEvents: 'none',
                zIndex: 1000,
                opacity: 0.7,
                left: `${mousePosition.x}px`,
                top: `${mousePosition.y}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '11px',
                fontWeight: 'bold',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
              }}
              title={(() => {
                const targetEmployee = employees.find(emp => emp.id === dragGhost.schedule.employee_id);
                return `${dragGhost.schedule.title}\n${targetEmployee?.name || '不明な社員'}\n${formatTime(dragGhost.start)} - ${formatTime(dragGhost.end)}`;
              })()}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                  📅 {dragGhost.schedule.title || '無題'}
                </div>
                <div style={{ fontSize: '9px', opacity: 0.9 }}>
                  {(() => {
                    const targetEmployee = employees.find(emp => emp.id === dragGhost.schedule.employee_id);
                    return `${targetEmployee?.name || '不明'} | ${formatTime(dragGhost.start)} - ${formatTime(dragGhost.end)}`;
                  })()}
                </div>
                {(() => {
                  const originalEmployee = employees.find(emp => emp.id === dragData?.schedule.employee_id);
                  const targetEmployee = employees.find(emp => emp.id === dragGhost.schedule.employee_id);
                  if (originalEmployee?.id !== targetEmployee?.id) {
                    return (
                      <div style={{ fontSize: '8px', opacity: 0.8, color: '#ffeb3b' }}>
                        {originalEmployee?.name} → {targetEmployee?.name}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

          {/* リサイズ中は実際のイベントバーがリアルタイム更新される */}
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

      {/* ドラッグゴースト - マウスカーソルに追従 */}
      {newDragData && newDragGhost && newMousePosition && (
        <div
          style={{
            position: 'fixed',
            left: `${newMousePosition.x - 50}px`, // マウスの少し左に表示
            top: `${newMousePosition.y - 18}px`, // マウスの少し上に表示
            width: `${(() => {
              const originalStart = new Date(newDragData.schedule.start_datetime);
              const originalEnd = new Date(newDragData.schedule.end_datetime);
              const originalDuration = originalEnd.getTime() - originalStart.getTime();
              const durationInSlots = Math.ceil(originalDuration / (15 * 60 * 1000)); // 15分単位
              return durationInSlots * CELL_WIDTH_PX * scheduleScale;
            })()}px`,
            height: '36px',
            background: `linear-gradient(180deg, ${lightenColor(safeHexColor(newDragData.schedule.color), 25)} 0%, ${safeHexColor(newDragData.schedule.color)} 100%)`,
            border: `2px solid ${lightenColor(safeHexColor(newDragData.schedule.color), -10)}`,
            borderRadius: '4px',
            padding: '2px 4px',
            fontSize: '11px',
            color: 'white',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 100000,
            opacity: 0.8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div style={{ fontWeight: 700, color: 'white' }}>{newDragData.schedule.title || '無題'}</div>
          <div style={{ fontSize: 10, opacity: 0.9, color: 'white' }}>
            {(() => {
              const { hour, minute } = getTimeFromSlot(newDragGhost.newSlot);
              const originalStart = new Date(newDragData.schedule.start_datetime);
              const originalEnd = new Date(newDragData.schedule.end_datetime);
              const originalDuration = originalEnd.getTime() - originalStart.getTime();
              const newStart = new Date(originalStart);
              newStart.setHours(hour, minute, 0, 0);
              const newEnd = new Date(newStart.getTime() + originalDuration);
              return `${newStart.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} - ${newEnd.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
            })()}
          </div>
          {newDragGhost.newEmployeeDelta !== 0 && (
            <div style={{ fontSize: 9, opacity: 0.8, color: 'white' }}>
              👤 {(() => {
                const newEmployeeId = getEmployeeIdFromDelta(newDragData.originalEmployeeId, newDragGhost.newEmployeeDelta || 0);
                const newEmployee = filteredEmployees.find(emp => emp.id === newEmployeeId);
                return newEmployee?.name || '不明';
              })()}
            </div>
          )}
        </div>
      )}

    </>
  );
};

export default DailySchedule;
