import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { scheduleApi, employeeApi, equipmentApi } from '../../utils/api';
import { formatDate, getTimeFromSlot } from '../../utils/dateUtils';
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
  onDepartmentChange,
  onEmployeeChange
}) => {
  // 基本状態
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scheduleScale, setScheduleScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  
  // 選択状態
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<{ employeeId: number; slot: number } | null>(null);

  // モーダル状態
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleAction, setShowScheduleAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);
  
  // ドラッグ&ドロップ状態（日別から強化移植）
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // ドラッグ&ドロップ詳細状態
  const [dragData, setDragData] = useState<{ schedule: Schedule; startX: number; startY: number; originalStart: Date; originalEnd: Date; } | null>(null);
  const [resizeData, setResizeData] = useState<{ schedule: Schedule; edge: 'start' | 'end'; startX: number; originalStart: Date; originalEnd: Date; initialPosition: { x: number; y: number }; } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ schedule: Schedule; start: Date; end: Date; } | null>(null);
  const [resizeGhost, setResizeGhost] = useState<{ schedule: Schedule; edge: 'start' | 'end'; newStart: Date; newEnd: Date; position: { x: number; y: number }; } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingOperation, setPendingOperation] = useState<{ type: 'drag' | 'resize'; timeoutId: NodeJS.Timeout } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [containerMarginTop, setContainerMarginTop] = useState<number>(0);
  
  // コピー&ペースト（月別から完全移植）
  const [clipboard, setClipboard] = useState<Schedule | null>(null);
  const AE_ADJUST_KEY = 'all-container-adjust';
  const [adjust, setAdjust] = useState<{ marginTop: number; widthDelta: number; heightDelta: number; locked: boolean; toolbarX?: number; toolbarY?: number }>(() => {
    try {
      const raw = localStorage.getItem(AE_ADJUST_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { marginTop: 0, widthDelta: 0, heightDelta: 0, locked: false };
  });
  const saveAdjust = (next: Partial<{ marginTop: number; widthDelta: number; heightDelta: number; locked: boolean; toolbarX?: number; toolbarY?: number }>) => {
    setAdjust(prev => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(AE_ADJUST_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    });
  };

  // ツールバーのドラッグ
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isToolbarDragging, setIsToolbarDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    if (!tableContainerRef.current || !toolbarRef.current) return;
    const rect = toolbarRef.current.getBoundingClientRect();
    dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    setIsToolbarDragging(true);
    e.preventDefault();
    e.stopPropagation();
  };
  useEffect(() => {
    if (!isToolbarDragging) return;
    const move = (e: MouseEvent) => {
    const container = tableContainerRef.current;
      const toolbar = toolbarRef.current;
      if (!container || !toolbar) return;
      const crect = container.getBoundingClientRect();
      const trect = toolbar.getBoundingClientRect();
      let left = e.clientX - crect.left - dragOffsetRef.current.x;
      let top = e.clientY - crect.top - dragOffsetRef.current.y;
      left = Math.max(0, Math.min(left, crect.width - trect.width));
      top = Math.max(0, Math.min(top, crect.height - trect.height));
      saveAdjust({ toolbarX: Math.round(left), toolbarY: Math.round(top) });
    };
    const up = () => setIsToolbarDragging(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up, { once: true });
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [isToolbarDragging]);

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

  // スケジュールコンテナに!importantで適用（CSSの!importantを上書きするため）
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const currentBase = el.offsetHeight || 400;
    const h = Math.max(100, currentBase + (adjust?.heightDelta || 0));
    const mt = (containerMarginTop) + (adjust?.marginTop || 0);
    const wCalc = `calc(95% + 20px + ${(adjust?.widthDelta || 0)}px)`;
    const maxW = `${1820 + (adjust?.widthDelta || 0)}px`;
    const minW = `${Math.max(0, 820 + (adjust?.widthDelta || 0))}px`;
    el.style.setProperty('height', `${h}px`, 'important');
    el.style.setProperty('max-height', `${currentBase}px`, 'important');
    el.style.setProperty('min-height', `${currentBase}px`, 'important');
    el.style.setProperty('margin-top', `${mt}px`, 'important');
    el.style.setProperty('width', wCalc, 'important');
    el.style.setProperty('max-width', maxW, 'important');
    el.style.setProperty('min-width', minW, 'important');
  }, [adjust, containerMarginTop, employees.length, scheduleScale]);

  useEffect(() => {
    const calcOffset = () => {
      const headerH = headerRef.current?.offsetHeight || 0;
      const controlsH = controlsRef.current?.offsetHeight || 0;
      const safeGap = 12;
      setContainerMarginTop(headerH + controlsH + safeGap);
    };
    calcOffset();
    window.addEventListener('resize', calcOffset);
    return () => window.removeEventListener('resize', calcOffset);
  }, []);

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

  // スケジュール読み込み
  const loadSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await scheduleApi.getDailyAll(formatDate(selectedDate));
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
      const response = await equipmentApi.getAll();
      setEquipments(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('設備データ読み込みエラー:', err);
    }
  }, []);

  // データ読み込み
  useEffect(() => {
    loadSchedules();
    loadEquipments();
  }, [loadSchedules, loadEquipments]);

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
  const handleCellMouseDown = useCallback((employeeId: number, slot: number) => {
    const cellId = `${employeeId}-${slot}`;
    
    // スケジュール選択をクリア
    setSelectedSchedule(null);
    
    // セル選択開始
    setSelectedCells(new Set([cellId]));
    setIsSelecting(true);
    setSelectionAnchor({ employeeId, slot });
  }, []);

  const handleCellMouseEnter = useCallback((employeeId: number, slot: number) => {
    if (!isSelecting || !selectionAnchor) return;
    
    const newSelectedCells = new Set<string>();
    const startEmployee = Math.min(selectionAnchor.employeeId, employeeId);
    const endEmployee = Math.max(selectionAnchor.employeeId, employeeId);
    const startSlot = Math.min(selectionAnchor.slot, slot);
    const endSlot = Math.max(selectionAnchor.slot, slot);

    // フィルタリングされた社員リストから実際のemployeeIdを取得
    const employeeList = employees;
    
    for (let empIndex = 0; empIndex < employeeList.length; empIndex++) {
      const emp = employeeList[empIndex];
      if (emp.id >= startEmployee && emp.id <= endEmployee) {
        for (let s = startSlot; s <= endSlot; s++) {
          newSelectedCells.add(`${emp.id}-${s}`);
        }
      }
    }
    
    setSelectedCells(newSelectedCells);
  }, [isSelecting, selectionAnchor, employees]);

  const handleCellMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionAnchor(null);
    
    // 2セル以上選択時は登録タブ表示
    if (selectedCells.size >= 2) {
      setShowRegistrationTab(true);
    }
  }, [selectedCells.size]);

  // セル選択のダブルクリック（新規登録）
  const handleCellDoubleClick = useCallback((employeeId: number, slot: number) => {
    const cellId = `${employeeId}-${slot}`;
    setSelectedCells(new Set([cellId]));
    setSelectedSchedule(null);
    setShowRegistrationTab(true);
  }, []);

  // スケジュール操作（日別から高機能移植）
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
    
    // 背景クリックでの選択解除を防ぐ（右クリックは除外済み）
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
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      
      if (!dragInitiated && distance > DRAG_THRESHOLD) {
        dragInitiated = true;
        const originalStart = new Date(schedule.start_datetime);
        const originalEnd = new Date(schedule.end_datetime);

        // ドラッグ状態だけ開始し、ゴースト描画は次のmousemoveでセル位置確定後に行う
        setDragData({
          schedule,
          startX: centerX,
          startY: centerY,
          originalStart,
          originalEnd
        });
        setIsDragging(true);
        document.body.classList.add('dragging');
        return; // このフレームではゴーストを出さない
      }
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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

  // リサイズ操作（日別から高機能移植）
  const handleResizeMouseDown = (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // セル選択状態をクリア
    setSelectedCells(new Set());
    setIsSelecting(false);
    setSelectionAnchor(null);
    
    const originalStart = new Date(schedule.start_datetime);
    const originalEnd = new Date(schedule.end_datetime);
    
    setResizeData({
      schedule,
      edge,
      startX: e.clientX,
      originalStart,
      originalEnd,
      initialPosition: { x: 0, y: 0 }
    });
    
    setResizeGhost({
      schedule,
      edge,
      newStart: originalStart,
      newEnd: originalEnd,
      position: { x: 0, y: 0 }
    });
    
    setIsResizing(true);
  };

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
          end_datetime: new Date(scheduleData.end_datetime!)
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

  // スケジュールペースト（月別から完全移植）
  const handleSchedulePaste = useCallback(async () => {
    if (!clipboard) return;
    
    let targetDate = selectedDate;
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
      
      await scheduleApi.create(newSchedule);
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
      
      // 日時データを適切に変換
      const processedData = {
        ...scheduleData,
        start_datetime: typeof scheduleData.start_datetime === 'string' 
          ? new Date(scheduleData.start_datetime) 
          : scheduleData.start_datetime,
        end_datetime: typeof scheduleData.end_datetime === 'string' 
          ? new Date(scheduleData.end_datetime) 
          : scheduleData.end_datetime,
      };
      
      await scheduleApi.create(processedData);
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
      const [employeeId, slot] = id.split('-').map(Number);
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
    
    return {
      startDateTime: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), startTime.hour, startTime.minute),
      endDateTime: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), endTime.hour, endTime.minute),
      employeeId: targetEmployeeId
    };
  }, [selectedCells, employees, selectedDate]);

  // マウス移動処理
  // メインのマウスイベントハンドラー（日別から高機能移植）
  useEffect(() => {
    const getTimeSlot = (date: Date): number => {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      return hours * 4 + Math.floor(minutes / 15);
    };

    const getEndTimeSlot = (date: Date): number => {
      const hours = date.getHours();
      const minutes = date.getMinutes();
      return hours * 4 + Math.ceil(minutes / 15);
    };

    const formatTime = (date: Date): string => {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = requestAnimationFrame(() => {
        // ドラッグ処理
        if (isDragging && dragData) {
          const deltaX = e.clientX - dragData.startX;
          const timeSlots = Math.round(deltaX / 20);
          
          const originalDuration = dragData.originalEnd.getTime() - dragData.originalStart.getTime();
          const newStart = new Date(dragData.originalStart.getTime() + timeSlots * 15 * 60 * 1000);
          const newEnd = new Date(newStart.getTime() + originalDuration);

          // 日付境界チェック
          const dayStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 0, 0, 0);
          const dayEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 23, 59, 59);

          if (newStart >= dayStart && newEnd <= dayEnd) {
            // 全社員での上下移動（社員変更）を実装
            const deltaY = e.clientY - dragData.startY;
            const rowHeight = 40; // 社員行の高さ
            const employeeRows = Math.round(deltaY / rowHeight);
            
            // 元の社員を取得
            const originalEmployee = employees.find(emp => emp.id === dragData.schedule.employee_id);
            let newEmployeeId = dragData.schedule.employee_id;
            
            if (originalEmployee) {
              // 表示中の全社員リストでの位置を計算
              const originalIndex = employees.findIndex(emp => emp.id === originalEmployee.id);
              const newIndex = Math.max(0, Math.min(employees.length - 1, originalIndex + employeeRows));
              newEmployeeId = employees[newIndex].id;
            }
            
            setDragGhost({
              schedule: {
                ...dragData.schedule,
                employee_id: newEmployeeId
              },
              start: newStart,
              end: newEnd
            });
            
            // マウス位置を更新（月別スケジュール参考：セル位置基準）
            const scheduleWidth = (getEndTimeSlot(newEnd) - getTimeSlot(newStart)) * 20;
            
            // 対象セルを取得してゴースト位置を計算
            const containerEl = tableContainerRef.current;
            if (containerEl) {
              // 新しい社員と時間スロットを計算
              const targetEmployeeId = newEmployeeId;
              const startSlot = getTimeSlot(newStart);
              
              // セレクタでセルを検索
              const targetCell = containerEl.querySelector(`[data-employee-id="${targetEmployeeId}"][data-slot="${startSlot}"]`) as HTMLElement;
              
              if (targetCell) {
                // セルの実際の位置を取得（月別参考）
                const cellRect = targetCell.getBoundingClientRect();
                const ghostX = cellRect.left;
                const ghostY = cellRect.top;
                
                setMousePosition({ x: ghostX, y: ghostY });
              } else {
                // フォールバック：マウス位置基準
                const centerX = e.clientX - (scheduleWidth / 2);
                const centerY = e.clientY - 20;
                setMousePosition({ x: centerX, y: centerY });
              }
            } else {
              // フォールバック：マウス位置基準
              const centerX = e.clientX - (scheduleWidth / 2);
              const centerY = e.clientY - 20;
              setMousePosition({ x: centerX, y: centerY });
            }
          }
        }

        // リサイズ処理
        if (isResizing && resizeData) {
          const deltaX = e.clientX - resizeData.startX;
          const timeSlots = Math.round(deltaX / 20);

          let newStart = new Date(resizeData.originalStart);
          let newEnd = new Date(resizeData.originalEnd);

          if (resizeData.edge === 'start') {
            newStart = new Date(resizeData.originalStart.getTime() + timeSlots * 15 * 60 * 1000);
          } else {
            newEnd = new Date(resizeData.originalEnd.getTime() + timeSlots * 15 * 60 * 1000);
          }

          // 時間制約チェック
          if (newStart < newEnd && newStart.getTime() !== newEnd.getTime()) {
            const containerEl = tableContainerRef.current;
            if (containerEl) {
              const containerRect = containerEl.getBoundingClientRect();
              const scrollTop = containerEl.scrollTop;
              const scrollLeft = containerEl.scrollLeft;

              // 社員インデックスを計算
              const employeeList = employees;
              const employeeIndex = employeeList.findIndex(emp => emp.id === resizeData.schedule.employee_id);
              
              if (employeeIndex >= 0) {
                const newStartSlot = getTimeSlot(newStart);
                const targetEmployeeId = employeeList[employeeIndex].id;
                const targetCell = containerEl.querySelector(`div[data-employee-id="${targetEmployeeId}"][data-slot="${newStartSlot}"]`) as HTMLElement;

                if (targetCell) {
                  const cellRect = targetCell.getBoundingClientRect();
                  const left = cellRect.left;
                  const top = cellRect.top;

                  setResizeGhost({
                    schedule: resizeData.schedule,
                    edge: resizeData.edge,
                    newStart,
                    newEnd,
                    position: { x: left, y: top }
                  });
                }
              }
            }
          }
        }
      });
    };

    const handleMouseUp = async () => {
      // ドラッグ終了処理
      if (isDragging && dragData && dragGhost) {
        setIsDragging(false);
        setDragData(null);
        setDragGhost(null);
        setMousePosition(null);
        document.body.classList.remove('dragging');

        const timeoutId = setTimeout(async () => {
          try {
            const updatedSchedule = {
              employee_id: dragGhost.schedule.employee_id, // 新しい社員IDを使用
              title: dragData.schedule.title,
              color: toApiColor(dragData.schedule.color),
              start_datetime: dragGhost.start,
              end_datetime: dragGhost.end
            };

            await scheduleApi.update(dragData.schedule.id, updatedSchedule);
            await loadSchedules();
          } catch (err) {
            console.error('ドラッグ更新エラー:', err);
            setError('スケジュールの更新に失敗しました。');
          }
          setPendingOperation(null);
        }, 300);

        setPendingOperation({ type: 'drag', timeoutId });
      }

      // リサイズ終了処理
      if (isResizing && resizeData && resizeGhost) {
        setIsResizing(false);
        setResizeGhost(null);

        const timeoutId = setTimeout(async () => {
          try {
            const updatedSchedule = {
              ...resizeData.schedule,
              start_datetime: resizeGhost.newStart,
              end_datetime: resizeGhost.newEnd
            };

            await scheduleApi.update(resizeData.schedule.id, updatedSchedule);
            await loadSchedules();
          } catch (err) {
            console.error('リサイズ更新エラー:', err);
            setError('スケジュールの更新に失敗しました。');
          }
          setPendingOperation(null);
        }, 300);

        setPendingOperation({ type: 'resize', timeoutId });
        setResizeData(null);
      }
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [dragData, isDragging, dragGhost, resizeData, isResizing, resizeGhost, selectedDate, loadSchedules, employees]);

  return (
    <>
      {/* ヘッダー */}
      <div className="schedule-header">
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
          社員スケジュール管理
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
          <ScaleControl 
            scale={scheduleScale}
            onScaleChange={handleScaleChange}
            className="all-employees-scale inline-scale"
          />
        </h2>
      </div>

      {/* ナビゲーションコントロール */}
            <div className="grid-top-controls" ref={controlsRef}>
              <div className="grid-controls-row">
                <div className="nav-btn-left">
                  <button className="nav-btn" onClick={() => (window.location.href = '/monthly')}>月別</button>
                  <button className="nav-btn" onClick={() => (window.location.href = '/daily')}>日別</button>
                  <button className="nav-btn active" onClick={() => (window.location.href = '/all-employees')}>全社員</button>
                  <button className="nav-btn" onClick={() => (window.location.href = '/equipment')}>設備</button>
                </div>
                <div className="nav-btn-right">
            <button className="nav-btn" onClick={() => setShowRegistrationTab(true)}>スケジュール登録</button>
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
                      className="date-nav-btn month-btn" 
                      onClick={() => moveDate('prev', 'month')}
                      title="前月"
                    >
                      &laquo;
                    </button>
                    <button 
                      className="date-nav-btn day-btn" 
                      onClick={() => moveDate('prev', 'day')}
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
                      onClick={() => moveDate('next', 'day')}
                      title="翌日"
                    >
                      &rsaquo;
                    </button>
                    <button 
                      className="date-nav-btn month-btn" 
                      onClick={() => moveDate('next', 'month')}
                      title="翌月"
                    >
                      &raquo;
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
      {/* エラー表示 */}
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
        /* Excel風スケジュールコンテナ（日別からコピー） */
        <div 
          className="excel-schedule-container" 
          ref={tableContainerRef}
          style={{
            width: '100%',
            maxWidth: '98vw',
            height: 'calc(100vh - 180px)',
            overflow: 'auto',
            border: '1px solid #ccc',
            backgroundColor: '#fff',
            position: 'relative',
            boxSizing: 'border-box',
            margin: '0 auto',
            scrollbarWidth: 'thin',
            scrollbarColor: '#c0c0c0 #f5f5f5'
          }}
          onContextMenu={(e) => {
            // 右クリックメニューを抑止（右クリックをスクロールに割当て）
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            // 右クリックドラッグでスクロール
            if (e.button !== 2) return;
            e.preventDefault();
            e.stopPropagation();
            const container = tableContainerRef.current as HTMLElement | null;
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
            minWidth: `${150 + 96 * 20}px` // 社員列150px + 96セル×20px = 2070px
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

          {/* スクロール可能なコンテンツエリア（日別からコピー） */}
          <div className="schedule-content-area" style={{
            position: 'relative',
            minWidth: `${150 + 96 * 20}px`, // 社員列150px + 96セル×20px = 2070px
          }}>
            {/* 社員行とスケジュールセル（日別からコピー） */}
            {employees.map((employee, employeeIndex) => (
              <div key={`employee-${employeeIndex}`} className="excel-date-row" style={{
                display: 'flex',
                borderBottom: '1px solid #ccc',
                minHeight: '40px',
                position: 'relative' // 各行を基準にオーバーレイを配置
              }}>
                {/* 固定社員セル（日別からコピー） */}
                <div className="date-cell-fixed" style={{
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
                }}>
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

                  const cellId = `${employee.id}-${slot}`;
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
                      onMouseDown={(e) => {
                        if (e.button !== 0) return; // 左クリック以外はセル選択無効化（右・中）
                        e.stopPropagation();
                        handleCellMouseDown(employee.id, slot);
                      }}
                      onMouseEnter={() => handleCellMouseEnter(employee.id, slot)}
                      onMouseUp={handleCellMouseUp}
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
                              background: `linear-gradient(180deg, ${lightenColor(schedule.color, 0.25)} 0%, ${safeHexColor(schedule.color)} 100%)`,
                              border: selectedSchedule?.id === schedule.id ? '2px solid #2196f3' : `1px solid ${lightenColor(schedule.color, -0.10)}`,
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
                            
                            {/* リサイズハンドル（日別から移植） */}
                            <div
                              className="resize-handle resize-start"
                              onMouseDown={(e) => handleResizeMouseDown(schedule, 'start', e)}
                              style={{ 
                                position: 'absolute', 
                                left: -6, 
                                top: 2, 
                                width: 16, 
                                height: 'calc(100% - 4px)', 
                                cursor: 'ew-resize', 
                                zIndex: 15,
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                border: '2px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '3px',
                                opacity: 0.8
                              }}
                            />
                            <div
                              className="resize-handle resize-end"
                              onMouseDown={(e) => handleResizeMouseDown(schedule, 'end', e)}
                              style={{ 
                                position: 'absolute', 
                                right: -6, 
                                top: 2, 
                                width: 16, 
                                height: 'calc(100% - 4px)', 
                                cursor: 'ew-resize', 
                                zIndex: 15,
                                backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                border: '2px solid rgba(255, 255, 255, 0.8)',
                                borderRadius: '3px',
                                opacity: 0.8
                              }}
                            />
                          </div>
                        );
                      })}
                      
                      {/* 複数セル選択時のプレビュー（スケジュールがない場合） */}
                      {(() => {
                        const currentCellId = `${employee.id}-${slot}`;
                        const isCurrentCellSelected = selectedCells.has(currentCellId);
                        
                        if (isCurrentCellSelected && selectedCells.size > 1 && cellSchedules.length === 0) {
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
                      const left = startSlot * 20;
                      let width = (endSlot - startSlot) * 20;
                      
                      // 複数セル選択時は選択範囲の幅を使用
                      const startCellId = `${employee.id}-${startSlot}`;
                      const isStartCellSelected = selectedCells.has(startCellId);
                      
                      if (isStartCellSelected && selectedCells.size > 1) {
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
                          width = slotRange * 20;
                        }
                      }

                      return (
                        <div
                          key={schedule.id}
                          className={`excel-schedule-item ${selectedSchedule?.id === schedule.id ? 'selected' : ''}`}
                          style={{
                            position: 'absolute',
                            top: '0px', // ゴーストと同じ位置に修正
                            left: `${left}px`,
                            width: `${width}px`,
                            height: '40px', // セル高さと同じに修正
                            background: `linear-gradient(180deg, ${lightenColor(schedule.color, 0.25)} 0%, ${safeHexColor(schedule.color)} 100%)`,
                            border: `1px solid ${lightenColor(schedule.color, -0.10)}`,
                            borderRadius: '6px',
                            padding: '2px 6px',
                            fontSize: '10px',
                            color: 'white',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            zIndex: 15,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            pointerEvents: 'auto'
                          }}
                          onMouseDown={(e) => handleScheduleMouseDown(schedule, e)}
                          onDoubleClick={(e) => handleScheduleDoubleClick(schedule, e)}
                          onContextMenu={(e) => handleScheduleContextMenu(schedule, e)}
                          title={`${schedule.title}\n${formatTime(new Date(schedule.start_datetime))} - ${formatTime(new Date(schedule.end_datetime))}`}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                              {schedule.title || '無題'}
                            </div>
                            <div style={{ fontSize: '9px', opacity: 0.9 }}>
                              {formatTime(new Date(schedule.start_datetime))} - {formatTime(new Date(schedule.end_datetime))}
                            </div>
                          </div>
                          
                          {/* リサイズハンドル */}
                          <div
                            className="resize-handle resize-start"
                            onMouseDown={(e) => handleResizeMouseDown(schedule, 'start', e)}
                            style={{ 
                              position: 'absolute', 
                              left: -6, 
                              top: 2, 
                              width: 16, 
                              height: 'calc(100% - 4px)', 
                              cursor: 'ew-resize', 
                              zIndex: 15,
                              backgroundColor: 'rgba(255, 255, 255, 0.4)',
                              border: '2px solid rgba(255, 255, 255, 0.8)',
                              borderRadius: '3px',
                              opacity: 0.8
                            }}
                          />
                          <div
                            className="resize-handle resize-end"
                            onMouseDown={(e) => handleResizeMouseDown(schedule, 'end', e)}
                            style={{ 
                              position: 'absolute', 
                              right: -6, 
                              top: 2, 
                              width: 16, 
                              height: 'calc(100% - 4px)', 
                              cursor: 'ew-resize', 
                              zIndex: 15,
                              backgroundColor: 'rgba(255, 255, 255, 0.4)',
                              border: '2px solid rgba(255, 255, 255, 0.8)',
                              borderRadius: '3px',
                              opacity: 0.8
                            }}
                          />
                        </div>
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

          {/* ドラッグゴースト（日別から移植） */}
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
              title={`${dragGhost.schedule.title}\n${formatTime(dragGhost.start)} - ${formatTime(dragGhost.end)}`}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                  👥 {dragGhost.schedule.title || '無題'}
                </div>
                <div style={{ fontSize: '9px', opacity: 0.9 }}>
                  {formatTime(dragGhost.start)} - {formatTime(dragGhost.end)}
                </div>
                {(() => {
                  const targetEmployee = employees.find(emp => emp.id === dragGhost.schedule.employee_id);
                  const originalEmployee = employees.find(emp => emp.id === dragData?.schedule.employee_id);
                  if (targetEmployee && originalEmployee && targetEmployee.id !== originalEmployee.id) {
                    return (
                      <div style={{ fontSize: '8px', opacity: 0.8, marginTop: '1px', color: '#ffeb3b' }}>
                        {originalEmployee.name} → {targetEmployee.name}
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}

          {/* リサイズゴースト（日別から移植） */}
          {resizeGhost && (() => {
            const getTimeSlot = (date: Date): number => {
              const hours = date.getHours();
              const minutes = date.getMinutes();
              return hours * 4 + Math.floor(minutes / 15);
            };

            const getEndTimeSlot = (date: Date): number => {
              const hours = date.getHours();
              const minutes = date.getMinutes();
              return hours * 4 + Math.ceil(minutes / 15);
            };

            const formatTime = (date: Date): string => {
              return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            };

            const width = (getEndTimeSlot(resizeGhost.newEnd) - getTimeSlot(resizeGhost.newStart)) * 20;
            
            return (
              <div
                className="resize-ghost"
                style={{
                  position: 'fixed',
                  width: `${width}px`,
                  height: '40px',
                  backgroundColor: safeHexColor(resizeGhost.schedule.color),
                  border: '2px dashed rgba(255, 255, 255, 0.8)',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  zIndex: 1000,
                  opacity: 0.7,
                  left: `${resizeGhost.position.x}px`,
                  top: `${resizeGhost.position.y}px`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
                title={`${resizeGhost.schedule.title}\n${formatTime(resizeGhost.newStart)} - ${formatTime(resizeGhost.newEnd)}`}
              >
                {resizeGhost.edge === 'start' ? '◀' : '▶'} {resizeGhost.schedule.title || '無題'}
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

      {showRegistrationTab && (
        <ScheduleRegistrationModal
          selectedCells={selectedCells}
          employees={employees}
          equipments={equipments}
          selectedDate={selectedDate}
          colors={SCHEDULE_COLORS}
          initialData={getSelectedCellDateTime()}
          existingSchedules={schedules}
          onSave={handleRegistrationSave}
          onCancel={handleRegistrationCancel}
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


    </>
  );
};

export default AllEmployeesSchedule;