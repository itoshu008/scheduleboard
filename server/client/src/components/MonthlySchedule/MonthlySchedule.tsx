import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { normalizeEvent, eventSig } from '../../utils/timeQuant';
import { upsertEventIfChanged } from '../../utils/eventEquality';
import './MonthlySchedule.css';
import ScheduleItem from './ScheduleItem';

// 型定義
import { Department, Schedule, Employee, Equipment, SCHEDULE_COLORS } from '../../types';

// API
import { scheduleApi, employeeApi, equipmentReservationApi } from '../../utils/api';

// ユーティリティ
import { 
  getMonthDates, 
  getTimeSlot, 
  getTimeFromSlot, 
  formatDate,
  isSaturday,
  isSunday,
  isHolidaySync,
  getHolidayNameSync,
  getJapaneseDayName,
  formatTime,
  initializeHolidayData,
  debugHolidayRecognition
} from '../../utils/dateUtils';

// UI constants
import {
  SLOT_MINUTES,
  CELL_WIDTH_PX,
  MONTH_CELL_HEIGHT_PX,
  MONTH_BAR_HEIGHT_PX
} from '../../utils/uiConstants';

// コンポーネント
import ScheduleRegistrationModal from '../ScheduleRegistrationModal/ScheduleRegistrationModal';
import ScheduleEditModal from '../ScheduleEditModal/ScheduleEditModal';
import ContextMenu, { ContextMenuItem } from '../ContextMenu/ContextMenu';
import ManagementTabs from '../ManagementTabs/ManagementTabs';
import DepartmentRegistration from '../DepartmentRegistration/DepartmentRegistration';
import EmployeeRegistration from '../EmployeeRegistration/EmployeeRegistration';
import EquipmentRegistration from '../EquipmentRegistration/EquipmentRegistration';
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
import EventBar from '../EventBar/EventBar';
import SmartEventBar from '../SmartEventBar/SmartEventBar';
import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';

interface MonthlyScheduleProps {
  selectedDepartment: Department | null;
  selectedEmployee: Employee | null;
  selectedDate: Date;
  schedules: Schedule[];
  equipments: Equipment[];
  employees: Employee[];
  departments: Department[];
  onDateChange: (date: Date) => void;
  onEmployeeChange: (employee: Employee) => void;
  onDepartmentChange: (department: Department) => void;
  reloadSchedules: () => Promise<void>;
  onScheduleCreate?: (schedule: Schedule) => void;
}

// 月別スケジュール用の定数
const DISPLAY_OFFSET_SLOTS = 0; // 表示開始オフセット
const DISPLAY_SLOTS = 96; // 表示スロット数（0:00-23:45）

// 終了タイムスロットを計算する関数（他のコンポーネントと統一）
const getEndTimeSlot = (date: Date): number => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours * 4 + Math.ceil(minutes / 15);
};

// タイムスロットから日時を作成する関数
const createTimeFromSlot = (date: Date, slot: number): Date => {
  const { hour, minute } = getTimeFromSlot(slot);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
};

const MonthlySchedule: React.FC<MonthlyScheduleProps> = ({
  selectedDepartment,
  selectedEmployee,
  selectedDate,
  schedules,
  equipments,
  employees,
  departments,
  onDateChange,
  onEmployeeChange,
  onDepartmentChange,
  reloadSchedules,
  onScheduleCreate
}) => {
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);

  // 1) props.schedules を正規化（参照安定のため useMemo）
  const normalizedFromProps = useMemo<Schedule[]>(
    () => (schedules ?? []).map((e: Schedule) => normalizeEvent(e) as Schedule),
    [schedules]
  );

  // 2) "内容シグネチャ"：正規化後のイベントを署名化→ソート→連結
  const propsSig = useMemo(
    () => normalizedFromProps.map(eventSig).sort().join('@@'),
    [normalizedFromProps]
  );

  // 3) ループ抑止フラグ
  const prevSigRef = useRef<string>('');
  const applyingRef = useRef(false);
  
  // 可視配列の参照安定化（フィルタ・ソートのみ）
  const visibleSchedules = useMemo(() => {
    const currentMonth = selectedDate.getMonth();
    const currentYear = selectedDate.getFullYear();
    
    return schedules.filter(schedule => {
      const startTime = new Date(schedule.start_datetime);
      const endTime = new Date(schedule.end_datetime);
      
      // 月の範囲でフィルタリング（古いデータを除外）
      const scheduleMonth = startTime.getMonth();
      const scheduleYear = startTime.getFullYear();
      
      return scheduleMonth === currentMonth && scheduleYear === currentYear;
    });
  }, [schedules, selectedDate]);
  
  // 多重レンダリング検知のデバッグ
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  if (renderCountRef.current % 20 === 0) {
    console.log('📈 MonthlySchedule renders:', renderCountRef.current);
  }
  useEffect(() => {
    // **同値なら絶対に何もしない**（ここで return しないとループへ）
    if (prevSigRef.current === propsSig) return;

    // 反映中の再入をブロック
    if (applyingRef.current) return;
    applyingRef.current = true;

    prevSigRef.current = propsSig;

    // 差分適用：同値は配列参照維持で再レンダ抑止
    // setSchedulesはpropsから来るので、ここでは直接更新しない
    // 代わりに、親コンポーネントに更新を通知
    console.log('📝 MonthlySchedule: Content changed, normalizedFromProps:', normalizedFromProps.length);
  }, [propsSig, normalizedFromProps]);

  // 最新のschedulesを参照するためのref
  const schedulesRef = useRef(schedules);
  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  // クリック・ダブルクリックの多重発火ガード
  const dblBlockUntilRef = useRef(0);

  // 過剰レンダ警告のスパム抑止
  const warnRef = useRef(0);
  const warnExcessRender = useCallback((info: any) => {
    if (++warnRef.current % 10 === 0) { // 10回に1回
      console.warn('⚠️ Excessive re-rendering detected!', { count: warnRef.current, ...info });
    }
  }, []);

  // 基本状態
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scheduleScale, setScheduleScale] = useState(100);

  // 統合されたinteractionState（同値ガード化）
  const [interactionState, _setInteractionState] = useState<{
    dragData: {
      schedule: Schedule;
      startX: number;
      startY: number;
      startSlot: number;
      startDate: Date;
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
    } | null;
    resizeGhost: {
      schedule: Schedule;
      edge: 'start' | 'end';
      newStart: Date;
      newEnd: Date;
    } | null;
  }>({
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
  }, [_setInteractionState]);

  // 既存の reset 関数をこれに統一
  const resetInteractionState = useCallback(() => {
    setInteractionState({
      dragData: null,
      resizeData: null,
      isEventBarInteracting: false,
      isModalClosing: false,
      showEditModal: false,
      dragGhost: null,
      resizeGhost: null
    }); // 同値なら set されない
    console.debug('🔄 MonthlySchedule: Resetting event bar interaction state');
  }, [setInteractionState]);

  // グローバル mouseup を"1回だけ"登録（多重登録を禁止）
  const onGlobalMouseUpRef = useRef<(ev: MouseEvent) => void>(() => {});

  useEffect(() => {
    onGlobalMouseUpRef.current = () => {
      // ここで毎回 state をいじるのは resetInteractionState のみ
      resetInteractionState();
    };
  }, [resetInteractionState]);

  useEffect(() => {
    const handler = (ev: MouseEvent) => onGlobalMouseUpRef.current?.(ev);
    window.addEventListener('mouseup', handler, { passive: true });
    return () => window.removeEventListener('mouseup', handler);
  }, []); // ← 依存空：一度だけ登録

  // onMouseDown での state 更新を最小化
  const beginDrag = useCallback((schedule: Schedule, startX: number, startY: number, startSlot: number, startDate: Date) => {
    setInteractionState((prev: any) => {
      if (prev.dragData && prev.dragData.schedule.id === schedule.id) return prev; // 変化なし→更新しない
      return { 
        ...prev, 
        dragData: { 
          schedule, 
          startX, 
          startY, 
          startSlot, 
          startDate 
        } 
      };
    });
  }, [setInteractionState]);

  // ドラッグ＆ドロップのマウスイベント処理


  // リサイズゴースト
  const [resizeGhost, setResizeGhost] = useState<{
    schedule: Schedule;
    newStart: Date;
    newEnd: Date;
    edge: 'start' | 'end';
  } | null>(null);
  
  // マウス位置
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  // リサイズ状態
  const [isResizing, setIsResizing] = useState(false);
  
  
  // ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 初期読み込み処理（App.tsxで既に読み込まれているため、ここでは読み込みしない）
  // useEffect(() => {
  //   if (schedules.length === 0) {
  //     console.log('MonthlySchedule: Loading schedules for date:', selectedDate);
  //     reloadSchedules().catch(console.error);
  //   }
  // }, [selectedDate]);

  // 月の日付を取得
  const monthDates = getMonthDates(selectedDate);

  // スケール計算
  const scaledCellWidth = CELL_WIDTH_PX * (scheduleScale / 100);
  const scaledRowHeight = MONTH_CELL_HEIGHT_PX * (scheduleScale / 100);
  const scaledDateColumnWidth = 120 * (scheduleScale / 100);
  const scaledTimeHeaderWidth = 80 * (scheduleScale / 100); // 1時間 = 4マス × 20px = 80px
  const scaledFontSize = Math.max(8, 12 * (scheduleScale / 100)); // フォントサイズもスケール適用（最小8px）
  const scaledSmallFontSize = Math.max(6, 10 * (scheduleScale / 100)); // 小さなフォントサイズ（最小6px）

  // 時間スロット配列（96個：0:00-23:45、15分間隔）
  const timeSlots = Array.from({ length: DISPLAY_SLOTS }, (_, i) => {
    const slot = DISPLAY_OFFSET_SLOTS + i;
    const hour = Math.floor(slot / 4);
    const minute = (slot % 4) * 15;
    return { slot, hour, minute };
  });

  // 5分間隔の細かいスナップ用関数
  const snapToFineGrid = (pixelPosition: number, cellWidth: number) => {
    const slotPosition = pixelPosition / cellWidth;
    const fineSlot = Math.round(slotPosition * 3); // 15分を3分割して5分間隔
    return (fineSlot / 3) * cellWidth;
  };

  const pixelToFineSlot = (pixelPosition: number, cellWidth: number) => {
    const slotPosition = pixelPosition / cellWidth;
    return Math.round(slotPosition * 3) / 3; // 5分間隔にスナップ
  };

  // 時刻からスロット番号を取得
  const getTimeSlot = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return hours * 4 + Math.floor(minutes / 15);
  };

  // スロット番号から時刻を作成
  const createTimeFromSlot = (baseDate: Date, slot: number) => {
    const hours = Math.floor(slot / 4);
    const minutes = (slot % 4) * 15;
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes);
  };

  // スケジュール位置更新（日付と時間の両方対応）
  const updateSchedulePosition = async (schedule: Schedule, newDate: Date, newSlot: number) => {
    try {
      const originalStart = new Date(schedule.start_datetime);
      const originalEnd = new Date(schedule.end_datetime);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newStart = createTimeFromSlot(newDate, newSlot);
      const newEnd = new Date(newStart.getTime() + duration);
      
      const updateData = {
        title: schedule.title || '無題',
        employee_id: schedule.employee_id,
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
        newStart: newStart.toISOString(),
        newEnd: newEnd.toISOString(),
        updateData: {
          ...updateData,
          start_datetime: newStart.toISOString(),
          end_datetime: newEnd.toISOString()
        }
      });

      await scheduleApi.update(schedule.id, updateData);

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
  };

  // セルIDを生成する関数
  const getCellId = (date: Date, slot: number) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const cellId = `${year}-${month}-${day}-${slot}`;
    return cellId;
  };

  // 日付移動関数
  const moveDate = (direction: 'prev' | 'next', unit: 'day' | 'month') => {
    const newDate = new Date(selectedDate);
    if (unit === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    } else if (unit === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    }
    onDateChange(newDate);
  };

  // セル選択の処理
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ date: Date; slot: number } | null>(null);

  const handleCellMouseDown = (date: Date, slot: number, e?: React.MouseEvent) => {
    // 右クリック時はセル選択を無効化（右クリックドラッグスクロール用）
    if (e && e.button === 2) return;
    if (interactionState.dragData || interactionState.resizeData) return; // ドラッグ中は選択無効
    
    // イベントバー操作中または編集モーダル閉じた後はセル選択を無効化
    if (interactionState.isEventBarInteracting || interactionState.isModalClosing) {
      console.log('🚫 MonthlySchedule: Cell selection disabled - event bar is being interacted with or modal is closing');
      return;
    }

    console.log('MonthlySchedule: handleCellMouseDown - Input date:', date.toDateString(), 'Slot:', slot);
    const cellId = getCellId(date, slot);
    console.log('MonthlySchedule: handleCellMouseDown - Generated cellId:', cellId);
    
    // スケジュール選択をクリア（日別スケジュールから移植）
    // ただし、編集モーダルが開いている場合はクリアしない
    // また、スケジュールアイテム上でのクリックの場合はクリアしない（ダブルクリックで編集モードに入るため）
    if (!showRegistrationTab) {
      // クリックされた要素がスケジュールアイテムかどうかをチェック
      const target = e?.target as HTMLElement;
      const isOnScheduleItem = target?.closest('.schedule-item');
      
      if (!isOnScheduleItem) {
        console.log('MonthlySchedule: handleCellMouseDown - Clearing selectedSchedule (not on schedule item)');
        setSelectedSchedule(null);
      } else {
        console.log('MonthlySchedule: handleCellMouseDown - Keeping selectedSchedule (on schedule item)');
      }
    }
    
    // セル選択開始
    setSelectedCells(new Set([cellId]));
    setIsSelecting(true);
    setSelectionStart({ date, slot });
  };

  const handleCellMouseEnter = (date: Date, slot: number) => {
    if (!isSelecting || !selectionStart) return;

    // 同じ日付の場合のみ範囲選択を許可（1列のみ）
    if (date.toDateString() !== selectionStart.date.toDateString()) {
      return; // 異なる日付の場合は選択を拡張しない
    }

    // 同じ日付内での時間範囲選択
    const startSlot = selectionStart.slot;
    const endSlot = slot;
    const minSlot = Math.min(startSlot, endSlot);
    const maxSlot = Math.max(startSlot, endSlot);

    const newSelectedCells = new Set<string>();

    // 同じ日付の時間範囲のセルを選択
    for (let s = minSlot; s <= maxSlot; s++) {
      newSelectedCells.add(getCellId(date, s));
    }

    setSelectedCells(newSelectedCells);
  };

  const handleCellMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
    
    // 2セル以上選択時は登録タブ表示（日別スケジュールから移植）
    if (selectedCells.size >= 2) {
      setShowRegistrationTab(true);
    }
    // 1セルのみの場合は選択を維持（ダブルクリックで登録タブを開く）
  };

  // セルダブルクリックで新規登録
  const handleCellDoubleClick = (date: Date, slot: number) => {
    console.log('MonthlySchedule: handleCellDoubleClick - date:', date.toDateString(), 'slot:', slot);
    const cellId = getCellId(date, slot);
    console.log('MonthlySchedule: handleCellDoubleClick - generated cellId:', cellId);
    setSelectedCells(new Set([cellId]));
    setSelectedSchedule(null);
    // 状態更新を待ってからモーダルを表示
    setTimeout(() => {
      console.log('MonthlySchedule: Opening registration tab after state update');
      setShowRegistrationTab(true);
    }, 0);
  };

  // 2セル以上選択時の自動登録タブ表示は handleCellMouseUp で処理

  // 選択されたセルから日時を取得
  const getSelectedCellDateTime = () => {
    console.log('getSelectedCellDateTime: selectedCells.size =', selectedCells.size);
    console.log('getSelectedCellDateTime: selectedCells =', Array.from(selectedCells));
    
    if (selectedCells.size === 0) {
      console.log('getSelectedCellDateTime: No cells selected');
      return null;
    }

    // 最初の選択されたセルから情報を抽出
    const firstCellId = Array.from(selectedCells)[0];
    const parts = firstCellId.split('-');
    
    if (parts.length < 4) {
      console.log('getSelectedCellDateTime: Invalid cell ID format:', firstCellId);
      return null;
    }

    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Dateオブジェクトでは0ベース
    const day = parseInt(parts[2]);
    const slot = parseInt(parts[3]);

    // 選択されたセルの開始時刻を計算
    const date = new Date(year, month, day);
    const hour = Math.floor(slot / 4);
    const minute = (slot % 4) * 15;
    
    const startDateTime = new Date(date);
    startDateTime.setHours(hour, minute, 0, 0);
    
    // 終了時刻を計算（選択されたセルの範囲に基づく）
    let endSlot = slot;
    const sortedCells = Array.from(selectedCells).sort();
    
    // 連続するセルの最後のスロットを見つける
    for (const cellId of sortedCells) {
      const cellParts = cellId.split('-');
      if (cellParts.length >= 4) {
        const cellSlot = parseInt(cellParts[3]);
        if (cellSlot > endSlot) {
          endSlot = cellSlot;
        }
      }
    }
    
    const endDateTime = new Date(date);
    const endHour = Math.floor((endSlot + 1) / 4);
    const endMinute = ((endSlot + 1) % 4) * 15;
    endDateTime.setHours(endHour, endMinute, 0, 0);

    // 社員IDも取得（月別スケジュールでは選択された社員）
    const employeeId = selectedEmployee?.id || null;

    const result = {
      startDateTime,
      endDateTime,
      employeeId
    };
    
    console.log('getSelectedCellDateTime: result =', result);
    return result;
  };

  // スケジュールアイテムのマウスダウン（ドラッグ開始）- 日別スケジュール参考
  const handleScheduleMouseDown = (schedule: Schedule, e: React.MouseEvent) => {
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
    
    console.log('MonthlySchedule: Schedule mouse down started for:', schedule.title, schedule.id);
    
    // 即座に選択状態を設定
    setSelectedSchedule(schedule);
    
    // セル選択状態をクリア（スケジュール選択のみ）
    setSelectedCells(new Set());

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
        startDate
      }
    }));
    
    // ドラッグ開始の閾値
    const DRAG_THRESHOLD = 5;
    
    // イベントバーの中央を基準点として計算
    const scheduleElement = e.currentTarget as HTMLElement;
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
        
        console.log('MonthlySchedule: Drag initiated for:', schedule.title);
        
        // ドラッグ開始時にセル選択をクリア
        setSelectedCells(new Set());
        
        const startTime = new Date(schedule.start_datetime);
        const startDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
        
        setInteractionState((prev: any) => ({
          ...prev,
          dragData: {
            schedule,
            startX: centerX, // イベントバーの中央X座標を基準に
            startY: centerY, // イベントバーの中央Y座標を基準に
            startSlot: getTimeSlot(startTime),
            startDate
          },
          dragGhost: {
            schedule,
            newSlot: getTimeSlot(startTime),
            newDate: new Date(startTime),
            deltaX: 0,
            deltaY: 0
          }
        }));

        // 初期マウス位置をイベントバーの中央に設定
        setMousePosition({ x: centerX, y: centerY });
        
        console.log('MonthlySchedule: Drag data set:', {
          schedule: schedule.id,
          startX: centerX,
          startY: centerY,
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
        console.log('MonthlySchedule: Click completed for schedule:', schedule.id);
      }
    };
    
    // イベントリスナー登録
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // スケジュールクリック（選択）
  const handleScheduleClick = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    if (Date.now() < dblBlockUntilRef.current) return; // 直近のダブルクリック中は抑止
    e.preventDefault();
    e.stopPropagation();
    console.log('🎯 MonthlySchedule: Click on schedule:', {
      id: schedule.id,
      title: schedule.title
    });
    setSelectedSchedule(schedule);
  }, []);

  // スケジュールダブルクリック（編集モーダルを開く）
  const handleScheduleDoubleClick = useCallback((schedule: Schedule, e: React.MouseEvent) => {
    dblBlockUntilRef.current = Date.now() + 320; // 320ms 以内の click は無視
    e.preventDefault();
    e.stopPropagation();
    console.log('🎯 MonthlySchedule: Double-click on schedule:', {
      id: schedule.id,
      title: schedule.title,
      color: schedule.color,
      start: schedule.start_datetime,
      end: schedule.end_datetime
    });
    
    console.log('🔥 MonthlySchedule: Opening edit modal for schedule:', schedule);
    
    // イベントバー操作状態を設定
    setInteractionState((prev: any) => ({
      ...prev,
      isEventBarInteracting: true,
      dragData: null,
      resizeData: null,
      dragGhost: null,
      resizeGhost: null
    }));
    // マウス位置もクリア
    setMousePosition(null);
    
    // 状態を確実に設定
    setSelectedSchedule(schedule);
    
    // 少し遅延させてモーダルを開く（状態更新を確実にするため）
    setTimeout(() => {
      console.log('🔥 MonthlySchedule: Setting showEditModal to true');
      setInteractionState((prev: any) => ({ ...prev, showEditModal: true }));
    }, 50);
  }, [setInteractionState, setMousePosition, setSelectedSchedule]);

  // スケジュール右クリック（アクション） - 右クリックスクロール機能のため無効化
  const handleScheduleContextMenu = (schedule: Schedule, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 右クリックスクロール機能のため、コンテキストメニューは無効化
    // setSelectedSchedule(schedule);
    // setShowScheduleAction(true);
  };

  // リサイズハンドルのマウスダウン
  const handleResizeMouseDown = (schedule: Schedule, edge: 'start' | 'end', e: React.MouseEvent) => {
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
  };

  // グローバルマウス移動とマウスアップ処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      animationFrameRef.current = requestAnimationFrame(() => {
        // ドラッグ処理
        if (interactionState.dragData && interactionState.dragGhost) {
          const deltaX = e.clientX - interactionState.dragData.startX;
          const deltaY = e.clientY - interactionState.dragData.startY;
          
          // 時間軸の移動（横方向）
          const slotDelta = Math.round(deltaX / scaledCellWidth);
          const newStartSlot = Math.max(0, Math.min(95, interactionState.dragData.startSlot + slotDelta));
          
          // 日付軸の移動（縦方向）
          const dateDelta = Math.round(deltaY / scaledRowHeight);
          const newDate = new Date(interactionState.dragData.startDate);
          newDate.setDate(newDate.getDate() + dateDelta);
          
          // 新しい開始・終了時刻を計算
          const originalStart = new Date(interactionState.dragData.schedule.start_datetime);
          const originalEnd = new Date(interactionState.dragData.schedule.end_datetime);
          const originalDuration = originalEnd.getTime() - originalStart.getTime();
          const newStart = createTimeFromSlot(newDate, newStartSlot);
          const newEnd = new Date(newStart.getTime() + originalDuration);
          
          setInteractionState((prev: any) => ({
            ...prev,
            dragGhost: {
              schedule: interactionState.dragData!.schedule,
              newSlot: newStartSlot,
              newDate: newDate,
              deltaX: e.clientX - interactionState.dragData!.startX,
              deltaY: e.clientY - interactionState.dragData!.startY
            }
          }));

          // マウス位置を更新（ドラッグゴースト表示用）
          setMousePosition({ x: e.clientX, y: e.clientY });
        }

        // リサイズ処理
        if (interactionState.resizeData && interactionState.resizeGhost) {
          const deltaX = e.clientX - interactionState.resizeData.startX;
          const slotDelta = Math.round(deltaX / scaledCellWidth);

          let newStart = new Date(interactionState.resizeData.originalStart);
          let newEnd = new Date(interactionState.resizeData.originalEnd);
          
          if (interactionState.resizeData.edge === 'start') {
            // 左ハンドル：開始時刻を変更、終了時刻は固定
            newEnd = interactionState.resizeData.originalEnd; // 終了時刻は固定
            
            // 新しい開始時刻を計算（左に伸ばすことができるように）
            const originalStartSlot = getTimeSlot(interactionState.resizeData.originalStart);
            let newStartSlot = originalStartSlot + slotDelta;
            
            // 境界チェック：0以上、終了時刻より前
            const endSlot = getTimeSlot(interactionState.resizeData.originalEnd);
            newStartSlot = Math.max(0, Math.min(newStartSlot, endSlot - 1)); // 最低1スロット分の幅を確保
            
            const startDate = new Date(interactionState.resizeData.originalStart);
            startDate.setHours(0, 0, 0, 0);
            newStart = createTimeFromSlot(startDate, newStartSlot);
            
          } else {
            // 右ハンドル：終了時刻を変更、開始時刻は固定
            newStart = interactionState.resizeData.originalStart; // 開始時刻は固定
            
            const originalEndSlot = getTimeSlot(interactionState.resizeData.originalEnd);
            let newEndSlot = originalEndSlot + slotDelta;
            
            // 境界チェック：開始時刻より後、95以下
            const startSlot = getTimeSlot(interactionState.resizeData.originalStart);
            newEndSlot = Math.max(startSlot + 1, Math.min(newEndSlot, 95)); // 最低1スロット分の幅を確保
            
            const endDate = new Date(interactionState.resizeData.originalEnd);
            endDate.setHours(0, 0, 0, 0);
            newEnd = createTimeFromSlot(endDate, newEndSlot);
            
          }
            
          setInteractionState((prev: any) => ({
            ...prev,
            resizeGhost: {
              schedule: interactionState.resizeData!.schedule,
              newStart,
              newEnd,
              edge: interactionState.resizeData!.edge
            }
          }));

          // マウス位置を更新（リサイズゴースト表示用）
          setMousePosition({ x: e.clientX, y: e.clientY });
        }
      });
    };

    const handleMouseUp = async () => {
      console.log('🎯 グローバルマウスアップ:', { dragData: !!interactionState.dragData, resizeData: !!interactionState.resizeData });
      
      // イベントバー操作状態をリセット
      if (interactionState.isEventBarInteracting) {
        console.log('🔄 MonthlySchedule: Resetting event bar interaction state');
        setInteractionState((prev: any) => ({ ...prev, isEventBarInteracting: false }));
      }
      
      // ドラッグ終了処理
      if (interactionState.dragData && interactionState.dragGhost) {
        try {
          console.log('🚚 ドラッグ確定:', {
            scheduleId: interactionState.dragData.schedule.id,
            newDate: interactionState.dragGhost.newDate,
            newSlot: interactionState.dragGhost.newSlot
          });
          
          // ドラッグ終了 - スケジュール更新
          await updateSchedulePosition(interactionState.dragData.schedule, interactionState.dragGhost.newDate, interactionState.dragGhost.newSlot);
          
          console.log('MonthlySchedule: Drag update completed successfully');
        } catch (error) {
          console.error('MonthlySchedule: Drag update failed:', error);
          alert('スケジュールの移動に失敗しました: ' + (error as any)?.message);
        }
      }
      
      // リサイズ終了処理
      if (interactionState.resizeData && interactionState.resizeGhost) {
        try {
          console.log('🔧 リサイズ確定:', {
            scheduleId: interactionState.resizeData.schedule.id,
            edge: interactionState.resizeData.edge,
            newStart: interactionState.resizeGhost.newStart.toISOString(),
            newEnd: interactionState.resizeGhost.newEnd.toISOString()
          });
          
          const updateData = {
            title: interactionState.resizeData.schedule.title || '無題',
            color: toApiColor(interactionState.resizeData.schedule.color),
            employee_id: interactionState.resizeData.schedule.employee_id,
            start_datetime: interactionState.resizeGhost.newStart,
            end_datetime: interactionState.resizeGhost.newEnd
          };
          
          await scheduleApi.update(interactionState.resizeData.schedule.id, updateData);
          await reloadSchedules();
          
          console.log('MonthlySchedule: Resize update completed successfully');
        } catch (error) {
          console.error('MonthlySchedule: Resize update failed:', error);
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
    if ((interactionState.dragData || interactionState.resizeData) && !interactionState.showEditModal) {
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
  }, [interactionState, schedules, scaledCellWidth, scaledRowHeight]);

  // スケジュール操作関数（編集タブは削除済み）
  const handleScheduleSave = async (scheduleData: any) => {
    // 編集タブは削除されたため、何も処理しない
    console.log('Schedule save - edit tab removed');
  };

  const handleScheduleDelete = async (scheduleId: number) => {
    try {
      await scheduleApi.delete(scheduleId);
      await reloadSchedules();
      setSelectedSchedule(null);
    } catch (error: any) {
      console.error('スケジュール削除エラー:', error);
      // 404の場合はすでに存在しないのでUIから除去し、再取得
      const status = error?.response?.status;
      if (status === 404) {
        setSelectedSchedule(null);
        await reloadSchedules();
      }
    }
  };

  // 登録タブ表示要求時に担当者がいない場合は、登録画面（社員登録）へ誘導
  useEffect(() => {
    if (!showRegistrationTab) return;
    // 部署選択がある場合はその部署の社員数を確認、無ければ全体の社員数を確認
    const deptId = selectedDepartment?.id ?? null;
    const deptEmployees = deptId ? employees.filter(e => e.department_id === deptId) : employees;
    if (!deptEmployees || deptEmployees.length === 0) {
      // 社員がいない場合は登録タブを閉じて管理>社員登録を開く
      setShowRegistrationTab(false);
      setCurrentRegistrationView('/management/employees');
    }
  }, [showRegistrationTab, selectedDepartment, employees]);

  // 新規登録処理
  const handleRegistrationSave = async (scheduleData: any) => {
    try {
      console.log('MonthlySchedule: handleRegistrationSave called with:', scheduleData);
      console.log('MonthlySchedule: selectedCells:', selectedCells);
      
      // セルの情報から日時を取得
      const cellDateTime = getSelectedCellDateTime();
      
      let startDateTime, endDateTime;
      
      if (cellDateTime) {
        // セルの情報から日時を取得
        console.log('MonthlySchedule: Using cell information for datetime');
        startDateTime = cellDateTime.startDateTime;
        endDateTime = cellDateTime.endDateTime;
      } else {
        // セルの情報がない場合は scheduleData から取得
        console.log('MonthlySchedule: Using scheduleData for datetime');
        startDateTime = new Date(scheduleData.start_datetime);
        endDateTime = new Date(scheduleData.end_datetime);
      }
      
      const createData = {
        employee_id: scheduleData.employee_id,
        title: scheduleData.title,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        color: scheduleData.color || SCHEDULE_COLORS[0]
      };

      console.log('MonthlySchedule: Creating schedule with data:', createData);
      console.log('MonthlySchedule: Start datetime:', createData.start_datetime.toDateString(), createData.start_datetime.toTimeString());
      console.log('MonthlySchedule: End datetime:', createData.end_datetime.toDateString(), createData.end_datetime.toTimeString());
      
      console.log('MonthlySchedule: Calling scheduleApi.create...');
      const createRes = await scheduleApi.create({ ...(createData as any), equipment_ids: scheduleData.equipment_ids } as any);
      console.log('MonthlySchedule: scheduleApi.create completed');
      
      const created = createRes.data as Schedule;
      console.log('MonthlySchedule: Created schedule response:', created);
      console.log('MonthlySchedule: API response status:', createRes.status);
      console.log('MonthlySchedule: Current schedules count:', schedules.length);
      console.log('MonthlySchedule: Created schedule ID:', created.id);
      
      console.log('✅ Schedule created successfully:', created.id);
      // フロント側でも設備予約を同期（保険）
      if (Array.isArray(scheduleData.equipment_ids)) {
        for (const eid of scheduleData.equipment_ids) {
          try {
            await equipmentReservationApi.create({
              equipment_id: Number(eid),
              employee_id: createData.employee_id,
              title: createData.title,
              start_datetime: createData.start_datetime,
              end_datetime: createData.end_datetime,
              color: createData.color
            } as any);
          } catch (e) {
            console.warn('Equipment reservation sync failed (client-side)', e);
          }
        }
      }
      // 楽観反映を一時的に無効化（reloadSchedulesで確実に更新）
      console.log('MonthlySchedule: Skipping optimistic update, using reloadSchedules instead');
      
      // 作成したスケジュールの月が現在表示中の月と異なる場合は確認
      const scheduleMonth = createData.start_datetime.getMonth();
      const currentMonth = selectedDate.getMonth();
      const scheduleYear = createData.start_datetime.getFullYear();
      const currentYear = selectedDate.getFullYear();
      
      if (scheduleYear !== currentYear || scheduleMonth !== currentMonth) {
        const shouldSwitch = window.confirm(
          `作成したスケジュールは${scheduleYear}年${scheduleMonth + 1}月です。` +
          `その月に移動しますか？（現在は${currentYear}年${currentMonth + 1}月を表示中）`
        );
        
        if (shouldSwitch) {
          const newDate = new Date(scheduleYear, scheduleMonth, 1);
          onDateChange(newDate);
          // 月を変更した場合は全スケジュールを再読み込み
          await reloadSchedules();
        }
      } else {
        // 同じ月でも再読み込みしてUIを更新
        console.log('MonthlySchedule: Reloading schedules for same month');
        console.log('MonthlySchedule: Schedules before reload:', schedules.length);
        await reloadSchedules();
        console.log('MonthlySchedule: Reload completed');
        
        // UI更新確認
        setTimeout(() => {
          const currentSchedules = schedulesRef.current;
          const foundSchedule = currentSchedules.find(s => s.id === created.id);
          if (foundSchedule) {
            console.log('✅ Schedule created successfully and UI updated');
          } else {
            console.warn('⚠️ Schedule created but UI not updated yet');
          }
        }, 500);
      }
      
      setShowRegistrationTab(false);
      // セル選択は維持する（連続登録を可能にするため）
      // setSelectedCells(new Set());
    } catch (error) {
      console.error('スケジュール登録エラー:', error);
      console.error('エラーの詳細:', error instanceof Error ? error.message : error);
      if (error && typeof error === 'object' && 'response' in error) {
        console.error('APIレスポンスエラー:', (error as any).response?.data);
      }
      alert('スケジュールの登録に失敗しました。');
    }
  };

  const handleRegistrationCancel = () => {
    setShowRegistrationTab(false);
    // セル選択は維持する（ユーザーが再度登録できるように）
    // setSelectedCells(new Set());
  };

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedSchedule) {
        handleScheduleDelete(selectedSchedule.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSchedule]);

  // 背景クリックでセル選択解除
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // スケジュールアイテムやセルのクリックでない場合のみ
        const target = e.target as HTMLElement;
    if (!target.closest('.schedule-item') && !target.closest('.excel-time-cell') && !target.closest('.date-cell-fixed')) {
      setSelectedCells(new Set());
          setSelectedSchedule(null);
        }
  };

  // 部署/社員未選択でもコントロールは常に表示する（メッセージはヘッダー近辺に出す）

  return (
    <div className="monthly-schedule-page monthly-schedule" onClick={handleBackgroundClick}>
      <div className="schedule-header">
                  <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
            月別スケジュール
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
          {/* 月別専用スケールコントロール */}
          <div className="monthly-scale-control" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '14px', color: '#666' }}>表示倍率:</span>
            <select
              value={scheduleScale}
              onChange={(e) => setScheduleScale(parseInt(e.target.value))}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #ccc',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value={50}>50%</option>
              <option value={75}>75%</option>
              <option value={100}>100%</option>
              <option value={125}>125%</option>
              <option value={150}>150%</option>
              <option value={200}>200%</option>
            </select>
          </div>
        </h2>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* ナビゲーションバー */}
      <div className="navigation-bar" style={{ 
        position: 'sticky', 
        top: '0', 
        zIndex: 10000, 
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)', 
        borderBottom: '2px solid #dee2e6', 
        padding: '10px 20px' 
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            
            {/* ナビゲーションボタン */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="nav-btn active" onClick={() => (window.location.href = '/monthly')}>月別</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/daily')}>日別</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/all-employees')}>全社員</button>
              <button className="nav-btn" onClick={() => (window.location.href = '/equipment')}>設備</button>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <button 
              className="nav-btn management-btn" 
              onClick={() => setShowManagementTabs(true)}
              style={{ backgroundColor: '#28a745', color: 'white' }}
            >
              管理画面
            </button>
          </div>
        </div>
      </div>

          
      {/* 日付コントロール */}
      <div className="date-controls" style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: '500', color: '#495057' }}>日付:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
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
              <button 
                className="date-nav-btn today-btn" 
                onClick={() => onDateChange(new Date())}
                title="本日"
              >
                本日
              </button>
            </div>
          </div>
      </div>

      {/* 担当者選択 */}
      <div className="employee-section" style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: '500', color: '#495057' }}>担当者:</span>
            <div className="employee-selector">
              {(() => {
                if (!selectedDepartment) {
                  return <span className="no-employees-text">部署と社員を選択してください</span>;
                }
                
                const deptEmployees = employees.filter(emp => emp.department_id === selectedDepartment.id);
                
                if (deptEmployees.length > 0) {
                  return (
                      <select
                        value={selectedEmployee?.id || ''}
                        onChange={(e) => {
                          const employeeId = parseInt(e.target.value);
                          const employee = employees.find(emp => emp.id === employeeId);
                          if (employee) {
                            onEmployeeChange(employee);
                          }
                        }}
                        className="employee-select"
                      >
                        <option value="">社員を選択してください</option>
                        {(deptEmployees ?? []).map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </select>
                  );
                } else {
                  return (
                    <span className="no-employees-text">
                      該当の部署に所属する社員はいません
                    </span>
                  );
                }
              })()}
            </div>
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
                marginLeft: '20px',
                fontWeight: '600',
                boxShadow: '0 4px 8px rgba(220, 53, 69, 0.3)',
                transition: 'all 0.3s ease'
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

      {/* 部署選択 */}
      <div className="department-section" style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid #dee2e6' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontWeight: '500', color: '#495057' }}>部署:</span>
            <div className="department-buttons">
              {(departments ?? []).map(dept => (
                <button
                  key={dept.id}
                  className={`dept-btn ${selectedDepartment?.id === dept.id ? 'active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDepartmentChange(dept);
                  }}
                >
                  {dept.name}
                </button>
              ))}
            </div>
        </div>
      </div>

      
      {/* Excel風スケジュールテーブル */}
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
          
          const container = tableContainerRef.current;
          if (!container) return;
          
          const startX = e.clientX;
          const startY = e.clientY;
          const startScrollLeft = container.scrollLeft;
          const startScrollTop = container.scrollTop;
          
          const handleMove = (moveEvent: MouseEvent) => {
            moveEvent.preventDefault();
            moveEvent.stopPropagation();
            
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            
            // スムーズなスクロール
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
          {/* 時間軸ヘッダー（スクロール追従） */}
          <div className="time-header-fixed" style={{
            backgroundColor: '#f0f0f0',
            borderBottom: '2px solid #ccc',
            display: 'flex',
          width: `${scaledDateColumnWidth + 96 * scaledCellWidth}px`,
          minWidth: `${scaledDateColumnWidth + 96 * scaledCellWidth}px`
          }}>
            {/* 左上の空白セル（スクロール追従） */}
            <div style={{
            width: `${scaledDateColumnWidth}px`,
            height: `${scaledRowHeight}px`,
              backgroundColor: '#e0e0e0',
              border: '1px solid #ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            fontSize: `${scaledFontSize}px`,
              flexShrink: 0
            }}>
              日付/時間
            </div>
            
          {/* 時間ヘッダー */}
          <div style={{ display: 'flex', flexShrink: 0, width: `${96 * scaledCellWidth}px` }}>
              {Array.from({ length: 24 }, (_, hour) => (
                <div key={hour} style={{
                width: `${scaledTimeHeaderWidth}px`,
                height: `${scaledRowHeight}px`,
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: `${scaledSmallFontSize}px`,
                  color: '#333',
                  flexShrink: 0
                }}>
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>
          </div>

          {/* スクロール可能なコンテンツエリア */}
          <div className="schedule-content-area" style={{
            position: 'relative',
          width: `${scaledDateColumnWidth + DISPLAY_SLOTS * scaledCellWidth}px`,
          minWidth: `${scaledDateColumnWidth + DISPLAY_SLOTS * scaledCellWidth}px`
          }}>
            {/* 日付行とスケジュールセル */}
            {(monthDates ?? []).map((date, dateIndex) => (
              <div key={`date-${dateIndex}`} className="excel-date-row" style={{
                display: 'flex',
                borderBottom: '1px solid #ccc',
                minHeight: `${scaledRowHeight}px`,
                width: `${scaledDateColumnWidth + DISPLAY_SLOTS * scaledCellWidth}px`
              }}>
              {/* 日付セル（スクロール追従） */}
                <div className="date-cell-fixed" style={{
                  width: `${scaledDateColumnWidth}px`,
                flexShrink: 0,
                  backgroundColor: isSaturday(date) ? '#e6f3ff' : 
                                  isSunday(date) || isHolidaySync(date) ? '#ffe6e6' : '#f8f9fa',
                  border: '1px solid #ccc',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                fontSize: `${scaledSmallFontSize}px`,
                  fontWeight: '500',
                  lineHeight: '1.1'
                }}>
                  <div style={{ margin: 0 }}>{date.getDate()}日({getJapaneseDayName(date)})</div>
                  {isHolidaySync(date) && (
                    <div style={{ fontSize: `${Math.max(6, scaledSmallFontSize - 2)}px`, color: '#d32f2f', fontWeight: 'bold', margin: 0 }}>
                      {getHolidayNameSync(date)}
                    </div>
                  )}
                </div>

                {/* 時間セル（96マス：15分間隔） */}
              <div style={{ display: 'flex', width: `${96 * scaledCellWidth}px`, flexShrink: 0, position: 'relative', zIndex: 1, overflow: 'visible' }}>
                {Array.from({ length: 96 }, (_, slot) => {
                  const hour = Math.floor(slot / 4);
                  const minute = (slot % 4) * 15;

                  // このセルのスケジュールを検索
                  const cellSchedules = visibleSchedules.filter(schedule => {
                    const startTime = new Date(schedule.start_datetime);
                    const endTime = new Date(schedule.end_datetime);
                    
                    // 月の範囲でフィルタリング（古いデータを除外）
                    const currentMonth = selectedDate.getMonth();
                    const currentYear = selectedDate.getFullYear();
                    const scheduleMonth = startTime.getMonth();
                    const scheduleYear = startTime.getFullYear();
                    
                    // 現在表示している月と異なる月のスケジュールは除外
                    if (scheduleMonth !== currentMonth || scheduleYear !== currentYear) {
                      return false;
                    }
                    
                    // 日付範囲でフィルタリング
                    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
                    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
                    
                    if (startTime > dayEnd || endTime < dayStart) return false;
                    
                    const scheduleStart = Math.max(startTime.getTime(), dayStart.getTime());
                    const scheduleEnd = Math.min(endTime.getTime(), dayEnd.getTime());
                    const startSlot = getTimeSlot(new Date(scheduleStart));
                    const endSlot = getEndTimeSlot(new Date(scheduleEnd));
                    
                    
                    return startSlot <= slot && slot < endSlot;
                  });

                  const cellId = getCellId(date, slot);
                  const isSelected = selectedCells.has(cellId);
                  
                  
                  return (
                    <div
                      key={`cell-${dateIndex}-${slot}`}
                      className={`excel-time-cell ${isSelected ? 'selected' : ''}`}
                      style={{
                        width: `${scaledCellWidth}px`,
                        height: `${scaledRowHeight}px`,
                        backgroundColor: '#fff',
                        border: '1px solid #e0e0e0',
                        boxSizing: 'border-box',
                        position: 'relative',
                        cursor: 'pointer',
                        fontSize: `${scaledSmallFontSize}px`,
                        flex: `0 0 ${scaledCellWidth}px`,
                        flexShrink: 0
                      }}
                      data-date={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`}
                      data-slot={slot}
                      data-time={`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      onMouseDown={(e) => {
                        if (e.button === 2) return; // 右クリック時はセル選択を無効化（右クリックスクロール用）
                        if (e.button !== 0) return; // 左クリック以外はセル選択無効化
                        e.stopPropagation();
                        handleCellMouseDown(date, slot, e);
                      }}
                      onMouseEnter={() => {
                        if (!interactionState.isEventBarInteracting && !interactionState.isModalClosing) {
                          handleCellMouseEnter(date, slot);
                        }
                      }}
                      onMouseUp={() => {
                        if (!interactionState.isEventBarInteracting && !interactionState.isModalClosing) {
                          handleCellMouseUp();
                        }
                      }}
                      onDoubleClick={(e) => {
                        // イベントバー操作中または編集モーダル閉じた後は無視
                        if (interactionState.isEventBarInteracting || interactionState.isModalClosing) {
                          console.log('🚫 MonthlySchedule: Cell double-click ignored - event bar is being interacted with or modal is closing');
                          return;
                        }
                        // スケジュールアイテム上でのダブルクリックの場合は無視
                        const target = e.target as HTMLElement;
                        if (target.closest('.schedule-item')) {
                          console.log('MonthlySchedule: Cell double-click ignored (on schedule item)');
                          return;
                        }
                        handleCellDoubleClick(date, slot);
                      }}
                      title={`${date.getMonth() + 1}/${date.getDate()} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                    >
                      {/* スケジュールアイテム */}
                      {(cellSchedules ?? []).map(schedule => {
                        const scheduleStartTime = new Date(schedule.start_datetime);
                        const scheduleEndTime = new Date(schedule.end_datetime);
                        const originalStartSlot = getTimeSlot(scheduleStartTime);
                        
                        // スケジュールの開始スロットでのみ描画
                        if (originalStartSlot !== slot) return null;
                        
                        
                        let startTime = new Date(schedule.start_datetime);
                        let endTime = new Date(schedule.end_datetime);
                        
                        if (isResizing && resizeGhost && resizeGhost.schedule.id === schedule.id) {
                          startTime = resizeGhost.newStart;
                          endTime = resizeGhost.newEnd;
                        }
                        
                        const startSlot = getTimeSlot(startTime);
                        const endSlot = getEndTimeSlot(endTime);
                        let width = (endSlot - startSlot) * scaledCellWidth;
                        
                        // 複数セル選択時は選択範囲の幅を使用
                        const currentCellId = getCellId(date, slot);
                        const isCurrentCellSelected = selectedCells.has(currentCellId);
                        
                        if (isCurrentCellSelected && selectedCells.size > 1) {
                          // 同じ日付の選択されたセルの範囲を計算
                          const dateSelectedCells = Array.from(selectedCells ?? [])
                            .filter(cellId => cellId.startsWith(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-`))
                            .map(cellId => {
                              const parts = cellId.split('-');
                              return parseInt(parts[3]);
                            })
                            .filter(s => !isNaN(s))
                            .sort((a, b) => a - b);
                          
                          if (dateSelectedCells.length > 1) {
                            const minSlot = Math.min(...dateSelectedCells);
                            const maxSlot = Math.max(...dateSelectedCells);
                            const slotRange = maxSlot - minSlot + 1;
                            
                            // 選択範囲の幅を使用
                            width = slotRange * scaledCellWidth;
                          }
                        }
                        
                        // 正確な位置計算：スケジュールの開始時刻に基づく位置調整
                        const scheduleStartSlot = getTimeSlot(startTime);
                        const cellStartSlot = slot;
                        const slotOffset = scheduleStartSlot - cellStartSlot;
                        
                        // 左ハンドルリサイズ時は新しい開始位置を使用
                        let leftOffset = slotOffset * scaledCellWidth;
                        if (isResizing && resizeGhost && resizeGhost.schedule.id === schedule.id) {
                          if (resizeGhost.edge === 'start') {
                            // 左ハンドルリサイズ時：新しい開始時刻の位置を計算
                            const newStartSlot = getTimeSlot(resizeGhost.newStart);
                            leftOffset = (newStartSlot - cellStartSlot) * scaledCellWidth;
                          } else {
                            // 右ハンドルリサイズ時：元の位置を維持
                            leftOffset = slotOffset * scaledCellWidth;
                          }
                        }
                        
                        // レンダリング回数をカウント（デバッグ用）
                        if ((window as any).scheduleRenderCount) {
                          (window as any).scheduleRenderCount++;
                        } else {
                          (window as any).scheduleRenderCount = 1;
                        }
                        
                        // 過剰なレンダリングを検出
                        if ((window as any).scheduleRenderCount > 50) {
                          warnExcessRender({
                            scheduleId: schedule.id,
                            title: schedule.title,
                          });
                        }
                        
                        return (
                          <ScheduleItem
                            key={`schedule-${schedule.id}-${schedule.title}-${schedule.start_datetime}-${schedule.end_datetime}`}
                            schedule={schedule}
                            employees={employees}
                            selectedSchedule={selectedSchedule}
                            showEditModal={interactionState.showEditModal}
                            isEventBarInteracting={interactionState.isEventBarInteracting}
                            isModalClosing={interactionState.isModalClosing}
                            width={width}
                            leftOffset={leftOffset}
                            onMouseDown={(e) => {
                              // 編集モーダルが開いている場合はドラッグ・リサイズを無効化
                              if (interactionState.showEditModal) {
                                console.log('🚫 MonthlySchedule: Drag/resize disabled - edit modal is open');
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              
                              // リサイズハンドルのクリックでない場合のみドラッグ開始とスケジュール選択
                              const target = e.target as HTMLElement;
                              if (!target.classList.contains('resize-handle')) {
                                console.log('🎯 MonthlySchedule: Event bar mouse down - setting interaction state');
                                setInteractionState((prev: any) => ({ ...prev, isEventBarInteracting: true }));
                                setSelectedSchedule(schedule);
                                handleScheduleMouseDown(schedule, e);
                              }
                            }}
                            onClick={(e) => handleScheduleClick(schedule, e)}
                            onDoubleClick={(e) => {
                              console.log('🔥🔥🔥 DOUBLE CLICK EVENT FIRED on schedule:', {
                                id: schedule.id,
                                title: schedule.title,
                                target: e.target,
                                targetClassList: (e.target as HTMLElement).classList.toString()
                              });
                              
                              // リサイズハンドルまたはその子要素のダブルクリックは無効化
                              const target = e.target as HTMLElement;
                              if (target.classList.contains('resize-handle') || target.closest('.resize-handle')) {
                                console.log('🚫 MonthlySchedule: Double-click on resize handle - ignoring');
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              
                              console.log('🔥🔥🔥 DOUBLE CLICK: Not on resize handle, proceeding with edit');
                              e.preventDefault();
                              e.stopPropagation();
                              console.log('🔥🔥🔥 DOUBLE CLICK: About to call handleScheduleDoubleClick');
                              console.log('🔥🔥🔥 DOUBLE CLICK: Current selectedSchedule before call:', selectedSchedule);
                              handleScheduleDoubleClick(schedule, e);
                            }}
                            onContextMenu={(e) => handleScheduleContextMenu(schedule, e)}
                            onResizeMouseDown={handleResizeMouseDown}
                            lightenColor={lightenColor}
                            formatTime={formatTime}
                          />
                        );
                      })}

                      {/* 新規スケジュールプレビュー（無効化） */}
                      {(() => {
                        // 新規スケジュールプレビューを無効化
                        return null;
                        
                        // 以下は無効化されたコード
                        // 2セル以上選択されていない場合は表示しない
                        if (selectedCells.size < 2) return null;
                        
                        // 既存のスケジュールがある場合はプレビューを表示しない
                        if (cellSchedules.length > 0) return null;
                        
                        // 同じ日付の選択されたセルの範囲を計算
                        const dateSelectedCells = Array.from(selectedCells ?? [])
                          .filter(cellId => cellId.startsWith(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}-`))
                          .map(cellId => {
                            const parts = cellId.split('-');
                            return parseInt(parts[3]);
                          })
                          .filter(s => !isNaN(s))
                          .sort((a, b) => a - b);
                        
                        if (dateSelectedCells.length === 0) return null;
                        
                        const minSlot = Math.min(...dateSelectedCells);
                        const maxSlot = Math.max(...dateSelectedCells);
                        
                        // 現在のセルが選択範囲の開始セルでない場合はプレビューを表示しない
                        if (slot !== minSlot) return null;
                        
                        const slotRange = maxSlot - minSlot + 1;
                        const width = slotRange * scaledCellWidth;
        
        return (
          <div
                            key="new-schedule-preview"
                            className="schedule-item new-schedule-preview"
            style={{
                              background: 'linear-gradient(180deg, rgba(76, 175, 80, 0.3) 0%, rgba(76, 175, 80, 0.2) 100%)',
                              border: '2px dashed #4caf50',
              width: `${width}px`,
                              position: 'absolute',
                              left: '0px',
                              height: '100%',
                              borderRadius: 4,
                              padding: '2px 4px',
                              fontSize: scaledSmallFontSize,
                              color: '#2e7d32',
                              overflow: 'hidden',
                              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
                              textAlign: 'center',
              fontWeight: 'bold'
            }}
                            onClick={() => {
                              setShowRegistrationTab(true);
                            }}
                            title="クリックして新規スケジュールを作成"
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                              <div style={{ fontSize: scaledSmallFontSize, opacity: 0.8 }}>+ 新規</div>
                              <div style={{ fontSize: Math.max(6, scaledSmallFontSize - 2), opacity: 0.6 }}>
                                {(() => {
                                  // シンプルな時間表示（エラーを避ける）
                                  const startHour = Math.floor(minSlot / 4);
                                  const startMinute = (minSlot % 4) * 15;
                                  const endHour = Math.floor((maxSlot + 1) / 4);
                                  const endMinute = ((maxSlot + 1) % 4) * 15;
                                  return `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')} - ${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
                                })()}
                              </div>
                            </div>
          </div>
        );
      })()}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        {/* ドラッグゴースト */}
        {interactionState.dragGhost && interactionState.dragData && (
          (() => {
            // 新しい時間を計算
            const originalStart = new Date(interactionState.dragData.schedule.start_datetime);
            const originalEnd = new Date(interactionState.dragData.schedule.end_datetime);
            const originalDuration = originalEnd.getTime() - originalStart.getTime();
            
            const newStart = createTimeFromSlot(interactionState.dragGhost.newDate, interactionState.dragGhost.newSlot);
            const newEnd = new Date(newStart.getTime() + originalDuration);
            
            const startSlot = getTimeSlot(newStart);
            const endSlot = getEndTimeSlot(newEnd);
            const width = (endSlot - startSlot) * scaledCellWidth;
            
            // 日付インデックスを取得（月の範囲外でも処理）
            const targetDate = interactionState.dragGhost.newDate;
            let dateIndex = monthDates.findIndex(date => 
              date.getFullYear() === targetDate.getFullYear() && 
              date.getMonth() === targetDate.getMonth() && 
              date.getDate() === targetDate.getDate()
            );
            
            // 月の範囲外の場合は表示しない
            if (dateIndex === -1) {
              return null;
            }
            
            return (
              <div
                className="drag-ghost"
                style={{
                  position: 'absolute',
                  width: `${width}px`,
                  height: `${scaledRowHeight}px`,
                  backgroundColor: safeHexColor(interactionState.dragGhost.schedule.color),
                  border: '2px dashed rgba(255, 255, 255, 0.8)',
                  borderRadius: '4px',
                  pointerEvents: 'none',
                  zIndex: 1000,
                  opacity: 0.7,
                  left: `${scaledDateColumnWidth + startSlot * scaledCellWidth}px`,
                  top: `${49 + dateIndex * scaledRowHeight}px`, // ヘッダー高さ調整（22px下に移動）
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: `${scaledSmallFontSize}px`,
                  fontWeight: 'bold',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
                }}
                title={`${interactionState.dragGhost.schedule.title}\n${formatTime(newStart)} - ${formatTime(newEnd)}`}
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '1px', fontSize: `${Math.max(8, scaledSmallFontSize - 1)}px` }}>
                    📅 {newStart.getDate()}日 {interactionState.dragGhost.schedule.title || '無題'}
                  </div>
                  <div style={{ fontSize: `${Math.max(6, scaledSmallFontSize - 2)}px`, opacity: 0.9 }}>
                    {formatTime(newStart)} - {formatTime(newEnd)}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* モーダル - 編集タブは削除済み */}

      {showRegistrationTab && (
        <ScheduleRegistrationModal
          isOpen={showRegistrationTab}
          onClose={() => {
            setShowRegistrationTab(false);
            setSelectedSchedule(null);
          }}
          defaultStart={(() => {
            if (selectedSchedule) {
              console.log('MonthlySchedule: Using selected schedule time for defaultStart:', selectedSchedule.start_datetime);
              return new Date(selectedSchedule.start_datetime);
            }
            const cellDateTime = getSelectedCellDateTime();
            if (cellDateTime) {
              console.log('MonthlySchedule: Using cell time for defaultStart:', cellDateTime.startDateTime);
              return cellDateTime.startDateTime;
            }
            console.log('MonthlySchedule: Using current time for defaultStart');
            return new Date();
          })()}
          defaultEnd={(() => {
            if (selectedSchedule) {
              console.log('MonthlySchedule: Using selected schedule time for defaultEnd:', selectedSchedule.end_datetime);
              return new Date(selectedSchedule.end_datetime);
            }
            const cellDateTime = getSelectedCellDateTime();
            if (cellDateTime) {
              console.log('MonthlySchedule: Using cell time for defaultEnd:', cellDateTime.endDateTime);
              return cellDateTime.endDateTime;
            }
            console.log('MonthlySchedule: Using current time for defaultEnd');
            const now = new Date();
            return new Date(now.getTime() + 60 * 60 * 1000); // 1時間後
          })()}
          selectedDepartmentId={(() => {
            const empId = (selectedSchedule?.employee_id) 
              ?? (selectedEmployee?.id) 
              ?? (getSelectedCellDateTime()?.employeeId) 
              ?? (employees[0]?.id);
            const emp = employees.find(e => e.id === empId);
            return emp?.department_id ?? 0;
          })()}
          defaultEmployeeId={(selectedSchedule?.employee_id) 
            ?? (selectedEmployee?.id) 
            ?? (getSelectedCellDateTime()?.employeeId) 
            ?? (employees[0]?.id)}
          employees={employees}
          initialValues={(() => {
            const initialVals = selectedSchedule ? {
              title: selectedSchedule.title,
              description: selectedSchedule.purpose || '',
              color: selectedSchedule.color || '#3498db',
              scheduleId: selectedSchedule.id
            } : undefined;
            
            console.log('🎯 MonthlySchedule: Passing initialValues to ScheduleRegistrationModal:', {
              selectedSchedule: selectedSchedule ? {
                id: selectedSchedule.id,
                title: selectedSchedule.title,
                color: selectedSchedule.color
              } : null,
              hasSelectedSchedule: !!selectedSchedule,
              showRegistrationTab,
              initialValues: initialVals
            });
            
            return initialVals;
          })()}
          onCreated={async (created) => {
            console.log('MonthlySchedule: onCreated called with:', created);
            const isEditMode = selectedSchedule && selectedSchedule.id;
            const wasUpdating = created && (created._wasUpdated === true || (typeof created.id === 'number' && created.id > 0));
            console.log('MonthlySchedule: Edit mode:', !!isEditMode);
            console.log('MonthlySchedule: Was updating (from created):', wasUpdating);
            console.log('MonthlySchedule: Created data _wasUpdated flag:', created?._wasUpdated);
            console.log('MonthlySchedule: selectedSchedule at callback:', selectedSchedule);
            
            // 編集モードの場合はより確実に更新を反映
            if (isEditMode || wasUpdating) {
              console.log('📝 MonthlySchedule: EDIT MODE - Starting change process');
              console.log('📝 MonthlySchedule: editedScheduleId:', selectedSchedule?.id || created?.id);
              console.log('📝 MonthlySchedule: schedules before reload:', schedules.length);
              console.log('📝 MonthlySchedule: created data:', created);
              console.log('📝 MonthlySchedule: selectedSchedule data:', selectedSchedule);
              
              const editedScheduleId = selectedSchedule?.id || created?.id;
              
              // 選択状態をクリアしてから再読み込み
              setSelectedSchedule(null);
              setSelectedCells(new Set());
              
              console.log('📝 MonthlySchedule: Calling reloadSchedules()...');
              await reloadSchedules();
              console.log('📝 MonthlySchedule: reloadSchedules() completed');
              
              // forceRenderの更新は削除（reloadSchedulesで十分）
              console.log('📝 MonthlySchedule: Edit completed, no force render needed');
            } else {
              console.log('📝 MonthlySchedule: NEW SCHEDULE MODE');
              await reloadSchedules();
              setSelectedCells(new Set());
            }
            
            // 状態をクリアする前に少し待つ
            setTimeout(() => {
              setShowRegistrationTab(false);
              setSelectedSchedule(null);
            }, 200);
          }}
        />
      )}

      {/* 新しい編集モーダル */}
      <ScheduleEditModal
        isOpen={interactionState.showEditModal}
        onClose={() => {
          console.log('🔄 MonthlySchedule: Closing edit modal');
          setInteractionState((prev: any) => ({ 
            ...prev, 
            showEditModal: false,
            isModalClosing: true,
            isEventBarInteracting: false
          }));
          // ドラッグ・リサイズ状態を完全にクリア
          setInteractionState((prev: any) => ({ 
            ...prev, 
            dragData: null,
            resizeData: null,
            dragGhost: null
          }));
          setMousePosition(null);
          // 少し遅延させて選択状態をクリア
          setTimeout(() => {
            setSelectedSchedule(null);
            // リサイズハンドルのスタイルをリセット
            const resizeHandles = document.querySelectorAll('.resize-handle');
            resizeHandles.forEach(handle => {
              const element = handle as HTMLElement;
              element.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
              element.style.border = '1px solid rgba(255, 255, 255, 0.8)';
              element.style.opacity = '0';
            });
            // 一時的な無効化状態を解除（少し長めの遅延）
            setTimeout(() => {
              console.log('🔄 MonthlySchedule: Modal closing state reset');
              setInteractionState((prev: any) => ({ ...prev, isModalClosing: false }));
            }, 1000);
          }, 100);
        }}
        schedule={selectedSchedule}
        employees={employees}
        onUpdated={async (updatedSchedule) => {
          console.log('✅ MonthlySchedule: Schedule updated:', updatedSchedule);
          // reloadSchedulesは呼ばない（重複を避けるため）
          // onCreatedコールバックで処理される
          
          // イベントバー操作状態をリセット
          setInteractionState((prev: any) => ({ ...prev, isEventBarInteracting: false }));
          // 選択状態をクリア
          setSelectedSchedule(null);
          setInteractionState((prev: any) => ({ ...prev, showEditModal: false }));
        }}
      />

      {/* デバッグ用ボタン */}
      <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 9999 }}>
        <button 
          onClick={async () => {
            console.log('🔍 DEBUG: Current schedules:', schedules);
            console.log('🔍 DEBUG: Current selectedSchedule:', selectedSchedule);
            console.log('🔍 DEBUG: Current showRegistrationTab:', showRegistrationTab);
            console.log('🔍 DEBUG: Current showEditModal:', interactionState.showEditModal);
            console.log('🔍 DEBUG: Current isEventBarInteracting:', interactionState.isEventBarInteracting);
            console.log('🔍 DEBUG: Current propsSig:', propsSig);
            console.log('🔍 DEBUG: Current visibleSchedules:', visibleSchedules);
            try {
              const response = await fetch('http://localhost:4001/api/debug/schedules');
              const data = await response.json();
              console.log('🔍 DEBUG: Server schedules:', data);
            } catch (error) {
              console.error('🔍 DEBUG: Error fetching server schedules:', error);
            }
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          🔍 DEBUG
        </button>
      </div>

      {/* コンテキストメニュー */}
      {contextMenuPosition && (
        <ContextMenu
          position={contextMenuPosition}
          items={[]}
          onClose={() => setContextMenuPosition(null)}
        />
      )}

      {/* 登録管理タブ */}
      <ManagementTabs
        isVisible={showManagementTabs}
        onClose={() => setShowManagementTabs(false)}
        colors={SCHEDULE_COLORS}
        onNavigate={(path) => {
          setShowManagementTabs(false);
          setCurrentRegistrationView(path);
        }}
        onScheduleRegister={() => {
          setShowManagementTabs(false);
          setShowRegistrationTab(true);
        }}
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

export default MonthlySchedule;
