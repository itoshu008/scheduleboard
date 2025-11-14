import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { api } from '../../api';
import { scheduleApi } from '../../utils/api';

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

// 共通フック
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
// 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
import { useMonthlyEventBarHandlers } from '../../hooks/useMonthlyEventBarHandlers';

// 共通コンポーネント
import UniversalEventBar from '../UniversalEventBar/UniversalEventBar';
import UniversalDragGhost from '../UniversalDragGhost/UniversalDragGhost';

import './AllEmployeesSchedule.css';
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
import OverlapConfirmationDialog from '../OverlapConfirmationDialog/OverlapConfirmationDialog';
import { checkScheduleOverlap, markOverlappingSchedules } from '../../utils/overlapUtils';

import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';

interface AllEmployeesScheduleProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  departments: Department[];
  employees: Employee[];
  schedules?: Schedule[]; // App.tsxから受け取るスケジュールデータ
  onDepartmentChange: (department: Department) => Promise<void>;
  onEmployeeChange: (employee: Employee) => void;
}

/**
 * ⚠️ 重要：全社員スケジュール完成版 - 拘束設定
 * 
 * この設定は確定版です。他のページ変更時も維持してください：
 * - Excel風レイアウト構造（日別からコピー、全社員×時間マトリックス）
 * - 1px極細スクロールバー（縦・横強制表示）
 * - コンテナサイズ（98vw × calc(100vh - 180px)）
 * - 40px行高さ、20px×96マス時間セル
 * - 全機能（API、モーダル、ドラッグ&ドロップ、リサイズ）
 */
const AllEmployeesSchedule: React.FC<AllEmployeesScheduleProps> = ({
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
    if (propSchedules !== undefined) {
      return propSchedules || [];
    }
    return localSchedules;
  }, [propSchedules, localSchedules]);
  const setSchedules = propSchedules ? (() => {}) : setLocalSchedules;
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scheduleScale, setScheduleScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  
  // セル選択状態（直接管理）
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<{ employeeId: number; slot: number } | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);

  // モーダル状態
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleAction, setShowScheduleAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);
  
  // 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
  // 注意: loadSchedulesを先に定義してからreloadSchedulesを定義する必要がある

  // 社員ID計算関数（日別・全社員ビューでの社員間移動用）
  const getEmployeeIdFromDelta = useCallback((originalEmployeeId: number, delta: number) => {
    // 現在の社員のインデックスを取得
    const currentIndex = employees.findIndex((emp: any) => emp.id === originalEmployeeId);
    if (currentIndex === -1) return originalEmployeeId; // 見つからない場合は元のIDを返す
    
    // 新しいインデックスを計算（境界チェック付き）
    const newIndex = Math.max(0, Math.min(employees.length - 1, currentIndex + delta));
    return employees[newIndex].id;
  }, [employees]);

  // 旧リサイズ機能は削除（新しいuseUniversalDragResizeに統合）
  const [pendingOperation, setPendingOperation] = useState<{ type: 'drag' | 'resize'; timeoutId: NodeJS.Timeout } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  
  // コピー&ペースト（月別から完全移植）
  const [clipboard, setClipboard] = useState<Schedule | null>(null);

  // ツールバーのドラッグ（削除 - 使用されていない）

  // 全社員ページ専用の強制表示フラグ
  const [forceShowToolbar, setForceShowToolbar] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('all-force-show-toolbar');
      return v === '1';
    } catch {}
    return true; // デフォルトは表示
  });
  useEffect(() => {
    try {
      const v = localStorage.getItem('all-force-show-toolbar');
      if (v !== '1') localStorage.setItem('all-force-show-toolbar', '1');
    } catch {}
  }, []);

  // ⚠️ 動的スタイル設定を完全に削除（CSSで完結させるため）
  // containerMarginTopとadjust.marginTopの動的設定を削除

  // コンテキストメニュー状態
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuTarget, setContextMenuTarget] = useState<{ id: number; type: string } | null>(null);

  // 重複確認状態
  const [showOverlapDialog, setShowOverlapDialog] = useState(false);
  const [overlapInfo, setOverlapInfo] = useState<any>(null);

  // リファレンス
  const gridRef = useRef<HTMLTableElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number>();

  // スケール計算
  const scaledCellWidth = CELL_WIDTH_PX * scheduleScale;
  const scaledRowHeight = DAILY_BAR_HEIGHT_PX * scheduleScale;
  const scaledColWidth = 150 * scheduleScale;
  
  // 動的サイズ計算（削除）
  // const containerHeight = (employees.length + 1) * scaledRowHeight + 40; // +1 for header, +40 for padding
  
  // デバッグ用ログ（削除）
  // console.log('All Employees Schedule - Dynamic Height:', {
  //   employeesCount: employees.length,
  //   scaledRowHeight,
  //   calculatedHeight: (employees.length + 1) * scaledRowHeight + 40,
  //   finalHeight: containerHeight
  // });

  // グローバルイベント制御
  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 1) {
        const target = e.target as HTMLElement;
        if (!target.closest('.schedule-item') && !target.closest('.resize-handle')) {
      return;
    }
      e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleGlobalContextMenu);
    document.addEventListener('mousedown', handleGlobalMouseDown);

    return () => {
      document.removeEventListener('contextmenu', handleGlobalContextMenu);
      document.removeEventListener('mousedown', handleGlobalMouseDown);
    };
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
    scaledRowHeight: 40 * scheduleScale,
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

  // 設備データ読み込み
  const loadEquipments = useCallback(async () => {
    try {
      const response = await api.get('/admin/equipment');
      setEquipments(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('設備データ読み込みエラー:', err);
    }
  }, []);

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

  // 日付移動
  const moveDate = useCallback((direction: 'prev' | 'next', unit: 'day' | 'month') => {
    const newDate = new Date(selectedDate);
    if (unit === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    onDateChange(newDate);
  }, [selectedDate, onDateChange]);

  // スケール変更
  const handleScaleChange = useCallback((newScale: number) => {
    setScheduleScale(newScale);
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

  // セル選択（日別から強化移植）
  const handleCellMouseDown = useCallback((employeeId: number, slot: number, e?: React.MouseEvent) => {
    // 右クリック時はセル選択を無効化（右クリックドラッグスクロール用）
    if (e && e.button === 2) return;
    if (e && e.button !== 0) return; // 左クリック以外はセル選択無効化
    
    // セルIDに日付情報を含める（他のスケジュールと統一）
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const cellId = `${year}-${month}-${day}-${employeeId}-${slot}`;
    
    // スケジュール選択をクリア
    setSelectedSchedule(null);
    
    // セル選択開始
    setSelectedCells(new Set([cellId]));
    setIsSelecting(true);
    setSelectionAnchor({ employeeId, slot });
  }, [selectedDate]);

  const handleCellMouseEnter = useCallback((employeeId: number, slot: number) => {
    if (!isSelecting || !selectionAnchor) return;
    
    const newSelectedCells = new Set<string>();
    const startEmployee = Math.min(selectionAnchor.employeeId, employeeId);
    const endEmployee = Math.max(selectionAnchor.employeeId, employeeId);
    const startSlot = Math.min(selectionAnchor.slot, slot);
    const endSlot = Math.max(selectionAnchor.slot, slot);

    // フィルタリングされた社員リストから実際のemployeeIdを取得
    const employeeList = employees;
    
    // セルIDに日付情報を含める
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    
    for (let empIndex = 0; empIndex < employeeList.length; empIndex++) {
      const emp = employeeList[empIndex];
      if (emp.id >= startEmployee && emp.id <= endEmployee) {
        for (let s = startSlot; s <= endSlot; s++) {
          newSelectedCells.add(`${year}-${month}-${day}-${emp.id}-${s}`);
        }
      }
    }
    
    setSelectedCells(newSelectedCells);
  }, [isSelecting, selectionAnchor, employees, selectedDate]);

  const handleCellMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionAnchor(null);
    
    // 2セル以上選択時は登録タブ表示
    if (selectedCells.size >= 2) {
      setShowRegistrationTab(true);
    }
  }, [selectedCells.size]);

  // グローバルなmouseupイベントリスナーでドラッグ終了を検知
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
        setSelectionAnchor(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSelecting]);

  // セル選択のダブルクリック（新規登録）
  const handleCellDoubleClick = useCallback((employeeId: number, slot: number) => {
    // 新形式のセルIDを使用: YYYY-MM-DD-employeeId-slot
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const cellId = `${year}-${month}-${day}-${employeeId}-${slot}`;
    setSelectedCells(new Set([cellId]));
    setSelectedSchedule(null);
    setShowRegistrationTab(true);
  }, [selectedDate]);

  // スケジュール操作は月別ビューのロジック（useMonthlyEventBarHandlers）から提供されるhandleScheduleMouseDownを使用

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

  // 古いリサイズ操作は削除（useUniversalDragResizeに統合済み）

  // コンテナ操作
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      setIsPanning(true);
    }
  }, []);

  // 背景クリック
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.schedule-item') && !target.closest('.schedule-cell-15min')) {
      setSelectedSchedule(null);
    }
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

  // スケジュールペースト（月別から完全移植）
  const handleSchedulePaste = useCallback(async () => {
    if (!clipboard) return;
    
    const targetDate = selectedDate;
    let targetEmployeeId = clipboard.employee_id; // 全社員では元の社員IDを使用
    
    // セルが選択されている場合は、その位置にペースト
    if (selectedCells.size > 0) {
      const firstCellId = Array.from(selectedCells ?? [])[0];
      const [employeeIdStr, slotStr] = firstCellId.split('-');
      const employeeId = parseInt(employeeIdStr);
      const timeSlot = parseInt(slotStr);
      
      targetEmployeeId = employeeId;
      // 全社員では同じ日付内でのペースト
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
      
      await api.post('/admin/schedules', newSchedule);
      await loadSchedules();
    } catch (error) {
      console.error('スケジュールペーストエラー:', error);
      setError('スケジュールのペーストに失敗しました');
    }
    handleContextMenuClose();
  }, [clipboard, selectedDate, selectedCells, loadSchedules]);

  // 登録保存（日時データ変換対応）
  const handleRegistrationSave = useCallback(async (scheduleData: any) => {
    try {
      setIsSaving(true);
      
      // 日時データを適切に変換（toServerISOを使用してUTC ISO文字列に変換）
      const { toServerISO } = await import('../../utils/datetime');
      
      const processedData = {
        title: scheduleData.title || scheduleData.purpose || '新規スケジュール',
        employee_id: scheduleData.employee_id,
        start_datetime: scheduleData.start_datetime instanceof Date 
          ? toServerISO(scheduleData.start_datetime)
          : (typeof scheduleData.start_datetime === 'string' 
            ? scheduleData.start_datetime 
            : toServerISO(new Date(scheduleData.start_datetime))),
        end_datetime: scheduleData.end_datetime instanceof Date 
          ? toServerISO(scheduleData.end_datetime)
          : (typeof scheduleData.end_datetime === 'string' 
            ? scheduleData.end_datetime 
            : toServerISO(new Date(scheduleData.end_datetime))),
        color: toApiColor(scheduleData.color || '#3498db'),
        note: scheduleData.note || scheduleData.description || ''
      };
      
      await api.post('/admin/schedules', processedData);
      
      // WebSocket更新を待つ
      await new Promise(resolve => setTimeout(resolve, 300));
      
      await loadSchedules();
      setShowRegistrationTab(false);
      setSelectedCells(new Set());
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

  // 選択セル日時取得
  const getSelectedCellDateTime = useCallback(() => {
    if (selectedCells.size === 0) return null;
    
    // 選択されたセルから時間スロットを抽出し、ソート
    const cellIds = Array.from(selectedCells ?? []);
    const slots = cellIds.map(id => {
      const parts = id.split('-');
      // 新形式: YYYY-MM-DD-employeeId-slot の場合
      if (parts.length === 5) {
        return { employeeId: parseInt(parts[3]), slot: parseInt(parts[4]) };
      }
      // 旧形式: employeeId-slot の場合（後方互換性）
      const [employeeId, slot] = parts.map(Number);
      return { employeeId, slot };
    }).sort((a, b) => a.slot - b.slot);
    
    // 全社員スケジュールでは、複数社員のセルが選択される可能性がある
    // 同じ社員のセルのみを対象とする
    const employeeGroups = new Map<number, { employeeId: number; slot: number }[]>();
    slots.forEach(s => {
      if (!employeeGroups.has(s.employeeId)) {
        employeeGroups.set(s.employeeId, []);
      }
      employeeGroups.get(s.employeeId)!.push(s);
    });
    
    // 最も多くセルが選択されている社員を選択
    let targetEmployeeId = 0;
    let maxCells = 0;
    employeeGroups.forEach((cells, employeeId) => {
      if (cells.length > maxCells) {
        maxCells = cells.length;
        targetEmployeeId = employeeId;
      }
    });
    
    const targetCells = employeeGroups.get(targetEmployeeId) || [];
    if (targetCells.length === 0) return null;
    
    const employee = employees.find(emp => emp.id === targetEmployeeId);
    if (!employee) return null;

    const firstSlot = targetCells[0];
    const lastSlot = targetCells[targetCells.length - 1];
    const startTime = getTimeFromSlot(firstSlot.slot);
    const endTime = getTimeFromSlot(lastSlot.slot + 1); // 最後のセルの終了時刻
    
    // セルIDから日付を抽出
    const firstCellId = cellIds.find(id => {
      const parts = id.split('-');
      if (parts.length === 5) {
        return parseInt(parts[3]) === targetEmployeeId && parseInt(parts[4]) === firstSlot.slot;
      }
      return false;
    });
    
    let year = selectedDate.getFullYear();
    let month = selectedDate.getMonth();
    let day = selectedDate.getDate();
    
    if (firstCellId) {
      const parts = firstCellId.split('-');
      if (parts.length === 5) {
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1; // 0-based month
        day = parseInt(parts[2]);
      }
    }
    
    // 選択された最初のセルから日時を取得
    const startTimeObj = getTimeFromSlot(firstSlot.slot);
    const endTimeObj = getTimeFromSlot(lastSlot.slot + 1);
    
    return {
      startDateTime: new Date(year, month, day, startTimeObj.hour, startTimeObj.minute),
      endDateTime: new Date(year, month, day, endTimeObj.hour, endTimeObj.minute),
      employeeId: targetEmployeeId
    };
  }, [selectedCells, employees, selectedDate]);

  // マウス移動処理
  // ⚠️ 注意: 古いドラッグ処理はuseUniversalDragResizeフックに統合されました
  // このuseEffectは削除されました（ドラッグ処理の競合を防ぐため）

  // grid-top-controlsの高さを動的に計算して、excel-schedule-containerの位置を調整
  const [controlsHeight, setControlsHeight] = useState(0);
  const excelContainerRef = useRef<HTMLDivElement>(null);

  // useLayoutEffectでDOM更新直後に確実に実行
  useLayoutEffect(() => {
    const updateControlsHeight = () => {
      if (controlsRef.current && excelContainerRef.current) {
        const height = controlsRef.current.offsetHeight;
        setControlsHeight(height);
        
        // 日別スケジュールと同じ方式：margin-topは使わず、位置は自然に配置
        // 高さは記録のみ（将来の調整用）
        excelContainerRef.current.style.removeProperty('margin-top');
        excelContainerRef.current.style.removeProperty('margin-bottom');
        excelContainerRef.current.style.removeProperty('transform');
      }
    };

    // 即座に実行
    updateControlsHeight();
    
    // 複数のタイミングで実行（確実に実行されるように）
    const timer1 = setTimeout(updateControlsHeight, 0);
    const timer2 = setTimeout(updateControlsHeight, 50);
    const timer3 = setTimeout(updateControlsHeight, 100);
    const timer4 = setTimeout(updateControlsHeight, 200);
    const timer5 = setTimeout(updateControlsHeight, 500);
    
    // requestAnimationFrameでも実行
    const raf1 = requestAnimationFrame(updateControlsHeight);
    const raf2 = requestAnimationFrame(() => {
      requestAnimationFrame(updateControlsHeight);
    });
    
    window.addEventListener('resize', updateControlsHeight);
    
    // MutationObserverでDOMの変更を監視
    const observer = new MutationObserver(() => {
      setTimeout(updateControlsHeight, 0);
    });
    
    // 少し遅延させてから監視を開始（DOMが完全に構築されるまで待つ）
    const observeTimer = setTimeout(() => {
      if (controlsRef.current) {
        observer.observe(controlsRef.current, { 
          childList: true, 
          subtree: true, 
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      }
      
      if (excelContainerRef.current) {
        observer.observe(excelContainerRef.current, {
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      }
    }, 100);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
      clearTimeout(observeTimer);
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('resize', updateControlsHeight);
      observer.disconnect();
    };
  }); // 依存配列なし - 毎回実行


  return (
    <div className="all-employees-schedule">
      {/* ヘッダー */}
      <div className="schedule-header" ref={headerRef}>
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
          <span style={{ fontSize: '18px', fontWeight: 'normal', color: '#666' }}>
            {new Date().toLocaleDateString('ja-JP', { 
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
              <button className="nav-btn" onClick={() => (window.location.href = '/scheduleboard/daily')}>日別</button>
              <button className="nav-btn active" onClick={() => (window.location.href = '/scheduleboard/all-employees')}>全社員</button>
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
        {/* DailyScheduleとの高さ差を埋めるためのダミー行（非表示） */}
        <div className="grid-controls-row-third" style={{ display: 'none', height: 0, margin: 0, padding: 0, visibility: 'hidden' }}>
              </div>
            </div>
            
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* ローディング表示 */}
      {loading ? (
        <div className="loading-center">
          <div className="loading-spinner"></div>
          <p>データを読み込み中...</p>
        </div>
      ) : (
        /* Excel風スケジュールコンテナ（日別から完全コピー） */
        <div 
          ref={excelContainerRef}
          className="excel-schedule-container" 
          style={{
            width: '100%',
            maxWidth: '100vw',
            height: 'calc(100vh - 180px)',
            overflow: 'auto',
            border: '1px solid #ccc',
            backgroundColor: '#fff',
            position: 'relative',
            boxSizing: 'border-box',
            margin: 0
          }}
        >
          {/* Excel風スケジュールテーブル（日別参照） */}
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
          {/* 固定ヘッダー：時間軸（日別からコピー） */}
          <div className="time-header-fixed" style={{
            position: 'sticky',
            top: 0,
            left: 0,
            zIndex: 100,
            backgroundColor: '#f0f0f0',
            borderBottom: '2px solid #ccc',
            display: 'flex',
            minWidth: `${150 + 96 * 20}px`, // 社員列150px + 96セル×20px = 2070px
            margin: 0,
            padding: 0
          }}>
            {/* 左上の空白セル（150px） */}
            <div style={{
              width: '150px',
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

            {/* 時間ヘッダー（日別完全移植：24時間表示） */}
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

          {/* スクロール可能なコンテンツエリア（日別から完全コピー） */}
          <div 
            className="schedule-content-area" 
            style={{
            position: 'relative',
              minWidth: `${150 + 96 * 20}px` // 社員列150px + 96セル×20px = 2070px
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
            {/* 社員行とスケジュールセル（日別からコピー） */}
            {employees.map((employee, employeeIndex) => (
              <div key={`employee-${employeeIndex}`} className="excel-date-row" style={{
                display: 'flex',
                borderBottom: '1px solid #ccc',
                minHeight: '40px',
                position: 'relative' // 各行を基準にオーバーレイを配置
              }}>
                {/* 固定社員セル（日別からコピー） */}
                <div 
                  className="date-cell-fixed" 
                  style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 50,
                  width: '150px',
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
                  }}
                >
                  <div style={{ margin: 0 }}>{employee.name}</div>
                </div>
                {/* 時間セル（日別完全移植：96マス15分間隔の4セル構成） */}
                {Array.from({ length: 96 }, (_, slot) => {
                  const hour = Math.floor(slot / 4);
                  const minute = (slot % 4) * 15;

                  // このセルのスケジュールを検索
                  const cellSchedules = schedules.filter(schedule => {
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
                      title={`${employee.name} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      draggable={false}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return; // 左クリック以外はセル選択無効化（右・中）
                        
                        // UniversalEventBarとの干渉チェック
                        const target = e.target as HTMLElement;
                        if (target.closest('.schedule-item')) {
                          return; // イベントバー上ではセル選択を無効化
                        }
                        
                        e.preventDefault(); // テキスト選択を防ぐ
                        e.stopPropagation();
                        handleCellMouseDown(employee.id, slot, e);
                      }}
                      onMouseEnter={() => {
                        if (isSelecting) {
                          handleCellMouseEnter(employee.id, slot);
                        }
                      }}
                      onMouseUp={handleCellMouseUp}
                      onDragStart={(e) => {
                        e.preventDefault(); // ブラウザのドラッグ&ドロップを無効化
                      }}
                      onSelectStart={(e) => {
                        e.preventDefault(); // テキスト選択開始を防ぐ（「新規スケジュール」などの文字選択を防ぐ）
                      }}
                      onDoubleClick={() => {
                        handleCellDoubleClick(employee.id, slot);
                      }}
                    >
                      {/* セルは表示のみ - スケジュールは行オーバーレイ層で描画 */}
                      {/* 旧方式は削除 - 行オーバーレイ層で一括描画に変更 */}
                      {false && cellSchedules.map(schedule => {
                        const startSlot = getTimeSlot(new Date(schedule.start_datetime));
                        if (startSlot !== slot) return null; // 開始スロットでのみ描画

                        const endSlot = getEndTimeSlot(new Date(schedule.end_datetime));
                        let width = (endSlot - startSlot) * 20; // 15分間隔（20px）

                        // 複数セル選択時は選択範囲の幅を使用
                        const currentCellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${employee.id}-${slot}`;
                        const isCurrentCellSelected = selectedCells.has(currentCellId);
                        
                        if (isCurrentCellSelected && selectedCells.size > 1) {
                          // 同じ社員の選択されたセルの範囲を計算
                          const employeeSelectedCells = Array.from(selectedCells)
                            .filter(cellId => {
                              const parts = cellId.split('-');
                              // 新形式: YYYY-MM-DD-employeeId-slot
                              if (parts.length === 5) {
                                return parseInt(parts[3]) === employee.id;
                              }
                              // 旧形式: employeeId-slot
                              return parseInt(parts[0]) === employee.id;
                            })
                            .map(cellId => {
                              const parts = cellId.split('-');
                              // 新形式: YYYY-MM-DD-employeeId-slot
                              if (parts.length === 5) {
                                return parseInt(parts[4]);
                              }
                              // 旧形式: employeeId-slot
                              return parseInt(parts[1]);
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

                        return (
                          <div
                            key={schedule.id}
                            className={`excel-schedule-item ${selectedSchedule?.id === schedule.id ? 'selected' : ''}`}
                            style={{
                              position: 'absolute',
                              top: `${topOffset}px`,
                              left: '0px', // 4セル構成では各セルの左端から開始
                              width: `${width - 2}px`,
                              height: `${height}px`,
                              background: `linear-gradient(180deg, ${lightenColor(safeHexColor(schedule.color || '#3498db'), 0.15)} 0%, ${safeHexColor(schedule.color || '#3498db')} 100%)`,
                              border: selectedSchedule?.id === schedule.id ? '2px solid #2196f3' : `1px solid ${lightenColor(safeHexColor(schedule.color || '#3498db'), -0.10)}`,
                              borderRadius: '4px',
                              padding: '2px 4px',
                              fontSize: '11px',
                              color: 'white',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              zIndex: selectedSchedule?.id === schedule.id ? 1100 : 1000,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold',
                              textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                            }}
                            onMouseDown={(e) => handleScheduleMouseDown(schedule, e)}
                            onDoubleClick={(e) => handleScheduleDoubleClick(schedule, e)}
                            onContextMenu={(e) => handleScheduleContextMenu(schedule, e)}
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
                                {width > 40 ? (schedule.title || '無題') : '●'}
                              </div>
                              {width > 80 && (
                                <div className="schedule-time" style={{ fontSize: 10, opacity: 0.9, color: 'white' }}>
                                  {`${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`}
                                </div>
                              )}
                            </div>
                            
                            {/* リサイズハンドル（開始時刻=赤、終了時刻=緑） */}
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
                                backgroundColor: '#c62828', // 開始時刻ハンドル=赤
                                border: '1px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '2px 0 0 2px',
                                transition: 'all 0.2s ease',
                                opacity: selectedSchedule?.id === schedule.id ? 0.9 : 0
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#d32f2f'; // ホバー時は少し明るい赤
                                e.currentTarget.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#c62828';
                                e.currentTarget.style.opacity = selectedSchedule?.id === schedule.id ? '0.9' : '0';
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
                                backgroundColor: '#2e7d32', // 終了時刻ハンドル=緑
                                border: '1px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '0 2px 2px 0',
                                transition: 'all 0.2s ease',
                                opacity: selectedSchedule?.id === schedule.id ? 0.9 : 0
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#388e3c'; // ホバー時は少し明るい緑
                                e.currentTarget.style.opacity = '1';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#2e7d32';
                                e.currentTarget.style.opacity = selectedSchedule?.id === schedule.id ? '0.9' : '0';
                              }}
                            />
                          </div>
                        );
                      })}
                      
                      {/* 複数セル選択時のプレビュー（スケジュールがない場合） */}
                      {(() => {
                        const currentCellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${employee.id}-${slot}`;
                        const isCurrentCellSelected = selectedCells.has(currentCellId);
                        
                        if (isCurrentCellSelected && selectedCells.size > 1 && cellSchedules.length === 0) {
                          // 同じ社員の選択されたセルの範囲を計算
                          const employeeSelectedCells = Array.from(selectedCells)
                            .filter(cellId => {
                              const parts = cellId.split('-');
                              // 新形式: YYYY-MM-DD-employeeId-slot
                              if (parts.length === 5) {
                                return parseInt(parts[3]) === employee.id;
                              }
                              // 旧形式: employeeId-slot
                              return parseInt(parts[0]) === employee.id;
                            })
                            .map(cellId => {
                              const parts = cellId.split('-');
                              // 新形式: YYYY-MM-DD-employeeId-slot
                              if (parts.length === 5) {
                                return parseInt(parts[4]);
                              }
                              // 旧形式: employeeId-slot
                              return parseInt(parts[1]);
                            })
                            .filter(s => !isNaN(s))
                            .sort((a, b) => a - b);
                          
                          if (employeeSelectedCells.length > 1) {
                            const minSlot = Math.min(...employeeSelectedCells);
                            const maxSlot = Math.max(...employeeSelectedCells);
                            
                            // 選択範囲の開始スロットでのみプレビューを表示
                            if (slot === minSlot) {
                              const slotRange = maxSlot - minSlot + 1;
                              const width = slotRange * 20; // 15分間隔（20px）
                              
                              return (
                                <div
                                  key={`preview-${employee.id}-${minSlot}`}
                                  className="excel-schedule-item"
                                  style={{
                                    position: 'absolute',
                                    top: '2px',
                                    left: '0px',
                                    width: `${width}px`,
                                    height: '36px',
                                    background: 'linear-gradient(180deg, rgba(33, 150, 243, 0.3) 0%, rgba(33, 150, 243, 0.5) 100%)',
                                    border: '2px dashed #2196f3',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '11px',
                                    color: '#2196f3',
                                    fontWeight: 'bold',
                                    zIndex: 10,
                                    pointerEvents: 'none'
                                  }}
                                >
                                  新規スケジュール
                                </div>
                              );
                            }
                          }
                        }
                        return null;
                      })()}
                    </div>
                  );
                })}

                {/* 行オーバーレイ層：セルの上にスケジュールを一括描画（セル跨ぎ対応） */}
                <div
                  className="row-schedule-layer"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 150, // 全社員の社員セル幅（150px）
                    width: 96 * 20,
                    height: 40,
                    pointerEvents: 'none',
                    overflow: 'visible'
                  }}
                >
                  {(() => {
                    const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
                    const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);
                    const rowSchedules = schedules.filter(schedule => {
                      if (schedule.employee_id !== employee.id) return false;
                      const startTime = new Date(schedule.start_datetime);
                      const endTime = new Date(schedule.end_datetime);
                      if (startTime > dayEnd || endTime < dayStart) return false;
                      return true;
                    });

                    return rowSchedules.map(schedule => {
                      const startSlot = getTimeSlot(new Date(schedule.start_datetime));
                      const endSlot = getEndTimeSlot(new Date(schedule.end_datetime));
                      const left = startSlot * scaledCellWidth; // scheduleScaleを考慮
                      let width = (endSlot - startSlot) * scaledCellWidth; // scheduleScaleを考慮
                      
                      // 複数セル選択時は選択範囲の幅を使用
                      const startCellId = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}-${employee.id}-${startSlot}`;
                      const isStartCellSelected = selectedCells.has(startCellId);
                      
                      if (isStartCellSelected && selectedCells.size > 1) {
                        // 同じ社員の選択されたセルの範囲を計算
                        const employeeSelectedCells = Array.from(selectedCells)
                          .filter(cellId => {
                            const parts = cellId.split('-');
                            // 新形式: YYYY-MM-DD-employeeId-slot
                            if (parts.length === 5) {
                              return parseInt(parts[3]) === employee.id;
                            }
                            // 旧形式: employeeId-slot
                            return parseInt(parts[0]) === employee.id;
                          })
                          .map(cellId => {
                            const parts = cellId.split('-');
                            // 新形式: YYYY-MM-DD-employeeId-slot
                            if (parts.length === 5) {
                              return parseInt(parts[4]);
                            }
                            // 旧形式: employeeId-slot
                            return parseInt(parts[1]);
                          })
                          .filter(s => !isNaN(s))
                          .sort((a, b) => a - b);
                        
                        if (employeeSelectedCells.length > 1) {
                          const minSlot = Math.min(...employeeSelectedCells);
                          const maxSlot = Math.max(...employeeSelectedCells);
                          const slotRange = maxSlot - minSlot + 1;
                          
                          // 選択範囲の幅を使用
                          width = slotRange * scaledCellWidth; // scheduleScaleを考慮
                        }
                      }

                      return (
                        <UniversalEventBar
                          key={schedule.id}
                          schedule={schedule}
                          isSelected={selectedSchedule?.id === schedule.id}
                          isResizing={isResizing}
                          resizeData={resizeData}
                          scaledCellWidth={CELL_WIDTH_PX * scheduleScale}
                          scheduleScale={scheduleScale}
                          onMouseDown={handleScheduleMouseDown}
                          onDoubleClick={(schedule, e) => handleScheduleDoubleClick(schedule, e)}
                          onContextMenu={(schedule, e) => handleScheduleContextMenu(schedule, e)}
                          onResizeMouseDown={handleResizeMouseDown}
                          startSlot={startSlot}
                          width={width}
                          left={left}
                          top={0}
                          height={40}
                        />
                      );
                    });
                  })()}
                  
                  {/* 複数セル選択時の新規スケジュールプレビュー */}
                  {(() => {
                    if (selectedCells.size <= 1) return null;
                    
                    // この社員の選択されたセルを取得
                    const employeeSelectedCells = Array.from(selectedCells)
                      .filter(cellId => cellId.startsWith(`${employee.id}-`))
                      .map(cellId => {
                        const [, slotStr] = cellId.split('-');
                        return parseInt(slotStr);
                      })
                      .filter(s => !isNaN(s))
                      .sort((a, b) => a - b);
                    
                    if (employeeSelectedCells.length <= 1) return null;
                    
                    // 選択範囲にスケジュールがないかチェック
                    const minSlot = Math.min(...employeeSelectedCells);
                    const maxSlot = Math.max(...employeeSelectedCells);
                    const hasScheduleInRange = schedules.some(schedule => {
                      if (schedule.employee_id !== employee.id) return false;
                      const startSlot = getTimeSlot(new Date(schedule.start_datetime));
                      const endSlot = getEndTimeSlot(new Date(schedule.end_datetime));
                      return (startSlot >= minSlot && startSlot <= maxSlot) || (endSlot >= minSlot && endSlot <= maxSlot);
                    });
                    
                    if (hasScheduleInRange) return null; // スケジュールがある場合は表示しない
                    
                    const left = minSlot * 20;
                    const width = (maxSlot - minSlot + 1) * 20;
                    
                    return (
                      <div
                        key={`preview-${employee.id}`}
                        className="excel-schedule-item"
                        style={{
                          position: 'absolute',
                          top: '2px',
                          left: `${left}px`,
                          width: `${width}px`,
                          height: '36px',
                          background: 'linear-gradient(180deg, rgba(33, 150, 243, 0.3) 0%, rgba(33, 150, 243, 0.5) 100%)',
                          border: '2px dashed #2196f3',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          color: '#2196f3',
                          fontWeight: 'bold',
                          zIndex: 10,
                          pointerEvents: 'none'
                        }}
                      >
                        新規スケジュール
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
            
            {/* ドラッグゴースト（schedule-content-area内に配置） */}
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
              const targetEmployeeIndex = employees.findIndex(emp => emp.id === targetEmployeeId);
              
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
              // row-schedule-layerは各行内でposition: absolute, top: 0, left: 150に配置
              // イベントバーはrow-schedule-layer内でposition: absolute, top: 0, left: startSlot * scaledCellWidthに配置
              const rowHeight = 40; // 固定の行の高さ（minHeight: '40px'）
              const topOffset = 0; // イベントバーのオフセット（row-schedule-layer内でのtop位置、実際は0）
              // 実際のイベントバーのleft計算: row-schedule-layerのleft(150) + イベントバーのleft(startSlot * scaledCellWidth)
              const actualLeft = 150 + startSlot * scaledCellWidth;
              // 社員インデックスは既に計算済み（targetEmployeeIndex）を使用
              // 実際のイベントバーの位置: 各行のrow-schedule-layer内でtop: 0
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
            
          
          {/* 現在時刻ライン */}
          <CurrentTimeLineWrapper
            selectedDate={selectedDate}
            cellHeight={40}
            startHour={8}
            endHour={20}
            cellWidth={20}
            timeColumnWidth={120}
            pageType="all-employees"
            gridContainerRef={tableContainerRef}
          />

          {/* 古いドラッグゴーストは削除（UniversalDragGhostに統合済み） */}

          {/* 古いリサイズゴーストは削除（useUniversalDragResizeに統合済み） */}
          </div>
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

      {showRegistrationTab && (
        <ScheduleRegistrationModal
          isOpen={showRegistrationTab}
          onClose={() => setShowRegistrationTab(false)}
          defaultStart={getSelectedCellDateTime()?.startDateTime ?? new Date()}
          defaultEnd={getSelectedCellDateTime()?.endDateTime ?? new Date()}
          selectedDepartmentId={0}
          defaultEmployeeId={
            getSelectedCellDateTime()?.employeeId
            ?? employees[0]?.id
          }
          employees={employees}
          onCreated={async (created) => {
            // WebSocket更新を待つ（モーダル内で既にAPI呼び出し済み）
            await new Promise(resolve => setTimeout(resolve, 300));
            // propSchedulesを使用している場合は、WebSocketで更新されるため、ここでは何もしない
            // localSchedulesを使用している場合のみ更新
            if (!propSchedules) {
            setSchedules((prev) => [...prev, created]);
            }
            setSelectedCells(new Set());
            setShowRegistrationTab(false);
          }}
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

      {/* リサイズゴースト（月別ビューのロジックと統一） */}
      {interactionState.resizeGhost && interactionState.resizeData && (() => {
        // リサイズ中は実際のイベントバーが更新されるため、ゴースト表示は不要
        return null;
      })()}

    </div>
  );
};

export default AllEmployeesSchedule;