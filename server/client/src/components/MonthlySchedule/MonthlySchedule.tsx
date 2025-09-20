import React, { useState, useEffect, useRef } from 'react';
import './MonthlySchedule.css';

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
import ScheduleFormModal from '../ScheduleFormModal/ScheduleFormModal';
import ScheduleActionModal from '../ScheduleActionModal/ScheduleActionModal';
import ScheduleRegistrationModal from '../ScheduleRegistrationModal/ScheduleRegistrationModal';
import ContextMenu, { ContextMenuItem } from '../ContextMenu/ContextMenu';
import ManagementTabs from '../ManagementTabs/ManagementTabs';
import DepartmentRegistration from '../DepartmentRegistration/DepartmentRegistration';
import EmployeeRegistration from '../EmployeeRegistration/EmployeeRegistration';
import EquipmentRegistration from '../EquipmentRegistration/EquipmentRegistration';
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
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
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleAction, setShowScheduleAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);

  // schedules propsの変更を監視（デバッグ用）
  useEffect(() => {
    console.log('MonthlySchedule: schedules updated, count:', schedules.length);
  }, [schedules]);

  // 最新のschedulesを参照するためのref
  const schedulesRef = useRef(schedules);
  useEffect(() => {
    schedulesRef.current = schedules;
  }, [schedules]);

  // ドラッグ＆ドロップのマウスイベント処理
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragData) return;

      const deltaX = e.clientX - dragData.startX;
      const deltaY = e.clientY - dragData.startY;

      // 5分間隔でスナップ
      const cellWidth = scaledCellWidth;
      const snappedX = snapToFineGrid(deltaX, cellWidth);
      const newSlot = dragData.startSlot + pixelToFineSlot(snappedX, cellWidth);

      // ドラッグゴーストを更新
      setDragGhost({
        schedule: dragData.schedule,
        newSlot: Math.max(0, Math.min(95, newSlot)), // 0-95の範囲に制限
        deltaX: snappedX,
        deltaY
      });
    };

    const handleMouseUp = () => {
      if (dragData && dragGhost) {
        // ドラッグ終了 - スケジュール更新
        updateSchedulePosition(dragData.schedule, dragGhost.newSlot);
      }
      setDragData(null);
      setDragGhost(null);
    };

    if (dragData) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'grabbing';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'auto';
    };
  }, [dragData, dragGhost, scaledCellWidth]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scheduleScale, setScheduleScale] = useState(100);

  
  // ドラッグ＆ドロップ関連の状態
  const [dragData, setDragData] = useState<{
    schedule: Schedule;
    startX: number;
    startY: number;
    startSlot: number;
    startDate: Date;
  } | null>(null);
  
  // リサイズ関連の状態
  const [resizeData, setResizeData] = useState<{
    schedule: Schedule;
    edge: 'start' | 'end';
    startX: number;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  
  // ドラッグゴースト
  const [dragGhost, setDragGhost] = useState<{
    schedule: Schedule;
    start: Date;
    end: Date;
  } | null>(null);

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
  
  // クリップボード機能
  const [clipboard, setClipboard] = useState<Schedule | null>(null);
  
  // ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 初期読み込み処理（コンポーネントマウント時とプロパティ変更時）
  useEffect(() => {
    if (schedules.length === 0) {
      reloadSchedules().catch(console.error);
    }
  }, [selectedDate, reloadSchedules, schedules.length]);

  // 月の日付を取得
  const monthDates = getMonthDates(selectedDate.getFullYear(), selectedDate.getMonth());

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

  // スケジュール位置更新
  const updateSchedulePosition = async (schedule: Schedule, newSlot: number) => {
    try {
      const originalStart = new Date(schedule.start_datetime);
      const originalEnd = new Date(schedule.end_datetime);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newStart = createTimeFromSlot(originalStart, newSlot);
      const newEnd = new Date(newStart.getTime() + duration);
      
      console.log('Updating schedule position:', {
        id: schedule.id,
        oldSlot: getTimeSlot(originalStart),
        newSlot,
        newStart: newStart.toISOString(),
        newEnd: newEnd.toISOString()
      });

      await scheduleApi.update(schedule.id, {
        start_datetime: newStart.toISOString(),
        end_datetime: newEnd.toISOString()
      });

      // スケジュール一覧を再読み込み
      await reloadSchedules();
      console.log('✅ Schedule moved successfully with fine precision');
    } catch (error) {
      console.error('Schedule move failed:', error);
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
    if (dragData || resizeData) return; // ドラッグ中は選択無効

    console.log('MonthlySchedule: handleCellMouseDown - Input date:', date.toDateString(), 'Slot:', slot);
    const cellId = getCellId(date, slot);
    console.log('MonthlySchedule: handleCellMouseDown - Generated cellId:', cellId);
    
    // スケジュール選択をクリア（日別スケジュールから移植）
    setSelectedSchedule(null);
    
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

  // スケジュールアイテムのマウスダウン（ドラッグ開始）- 日別スケジュール参考
  const handleScheduleMouseDown = (schedule: Schedule, e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は選択/ドラッグを無効化（右クリックスクロール用）
    if ((e as any).detail && (e as any).detail > 1) return; // ダブルクリック時はドラッグ無効化
    
    // リサイズハンドル上ではドラッグ操作を無効
    const target = e.target as HTMLElement;
    if (target && target.classList && target.classList.contains('resize-handle')) {
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
    
    setDragData({
      schedule,
      startX: e.clientX,
      startY: e.clientY,
      startSlot,
      startDate
    });
    
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
        
        setDragData({
          schedule,
          startX: centerX, // イベントバーの中央X座標を基準に
          startY: centerY, // イベントバーの中央Y座標を基準に
          startSlot: getTimeSlot(startTime),
          startDate
        });
        
        setDragGhost({
          schedule,
          start: startTime,
          end: new Date(schedule.end_datetime)
        });

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

  // スケジュールダブルクリック（編集）
  const handleScheduleDoubleClick = (schedule: Schedule, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSchedule(schedule);
    setShowScheduleForm(true);
  };

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
  };

  // グローバルマウス移動 - 日別スケジュール参考
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
          
          // 日付軸の移動（縦方向）
          const dateDelta = Math.round(deltaY / scaledRowHeight);
          const newDate = new Date(dragData.startDate);
          newDate.setDate(newDate.getDate() + dateDelta);
          
          // 新しい開始・終了時刻を計算
          const originalStart = new Date(dragData.schedule.start_datetime);
          const originalEnd = new Date(dragData.schedule.end_datetime);
          const originalDuration = originalEnd.getTime() - originalStart.getTime();
          const newStart = createTimeFromSlot(newDate, newStartSlot);
          const newEnd = new Date(newStart.getTime() + originalDuration);
          
          setDragGhost({
            schedule: dragData.schedule,
            start: newStart,
            end: newEnd
          });

          // マウス位置を更新（ドラッグゴースト表示用）
          setMousePosition({ x: e.clientX, y: e.clientY });
        }

        // リサイズ処理
        if (resizeData && resizeGhost) {
          const deltaX = e.clientX - resizeData.startX;
          const slotDelta = Math.round(deltaX / scaledCellWidth);

          let newStart = new Date(resizeData.originalStart);
          let newEnd = new Date(resizeData.originalEnd);
          
          if (resizeData.edge === 'start') {
            const newStartSlot = Math.max(0, Math.min(95, getTimeSlot(resizeData.originalStart) + slotDelta));
            newStart = createTimeFromSlot(newStart, newStartSlot);
            
            // 開始時刻が終了時刻を超えないようにする
            if (newStart >= newEnd) {
              newStart = new Date(newEnd.getTime() - 15 * 60 * 1000); // 15分前
            }
          } else {
            const newEndSlot = Math.max(0, Math.min(95, getTimeSlot(resizeData.originalEnd) + slotDelta));
            newEnd = createTimeFromSlot(newEnd, newEndSlot);
            
            // 終了時刻が開始時刻を超えないようにする
            if (newEnd <= newStart) {
              newEnd = new Date(newStart.getTime() + 15 * 60 * 1000); // 15分後
            }
          }
            
            setResizeGhost({
              schedule: resizeData.schedule,
            newStart,
            newEnd,
            edge: resizeData.edge
          });

          // リアルタイム更新（プレビュー）- 日別スケジュールから移植
          const updatedSchedules = (schedules ?? []).map(schedule => {
            if (schedule.id === resizeData.schedule.id) {
              return {
                ...schedule,
                start_datetime: newStart.toISOString(),
                end_datetime: newEnd.toISOString()
              } as Schedule;
            }
            return schedule;
          });
          
          // 状態を更新してリアルタイムプレビュー
          // setSchedules(updatedSchedules); // コメントアウト：実際の更新はマウスアップ時に行う
        }
      });
    };

    const handleMouseUp = async () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // ドラッグ終了処理
      if (dragData && dragGhost) {
        console.log('MonthlySchedule: Drag ended, updating schedule:', {
          scheduleId: dragData.schedule.id,
          newStart: dragGhost.start,
          newEnd: dragGhost.end
        });
        
        try {
          // 元のスケジュールデータを保持して更新（Date オブジェクトとして送信）
          const updateData = {
              title: dragData.schedule.title,
              color: toApiColor(dragData.schedule.color),
            employee_id: dragData.schedule.employee_id,
            start_datetime: dragGhost.start,
            end_datetime: dragGhost.end
          };
          
          console.log('MonthlySchedule: Sending update data:', {
            scheduleId: dragData.schedule.id,
            updateData: {
              ...updateData,
              start_datetime: dragGhost.start.toISOString(),
              end_datetime: dragGhost.end.toISOString()
            }
          });
          
          await scheduleApi.update(dragData.schedule.id, updateData);
          console.log('MonthlySchedule: Schedule update successful');
            await reloadSchedules();
        } catch (error) {
          console.error('スケジュール移動エラー:', error);
          if (error && typeof error === 'object' && 'response' in error) {
            console.error('Error details:', (error as any).response?.data);
          }
            alert('スケジュールの移動に失敗しました。');
        }

        setDragData(null);
        setDragGhost(null);
        setMousePosition(null);
      }

      // リサイズ終了処理
      if (resizeData && resizeGhost) {
        try {
          const updateData = {
              title: resizeData.schedule.title,
              color: toApiColor(resizeData.schedule.color),
            employee_id: resizeData.schedule.employee_id,
              start_datetime: resizeGhost.newStart,
              end_datetime: resizeGhost.newEnd
          };
          
          console.log('MonthlySchedule: Resize update data:', {
            scheduleId: resizeData.schedule.id,
            updateData: {
              ...updateData,
              start_datetime: resizeGhost.newStart.toISOString(),
              end_datetime: resizeGhost.newEnd.toISOString()
            }
          });
          
          await scheduleApi.update(resizeData.schedule.id, updateData);
            await reloadSchedules();
        } catch (error) {
          console.error('スケジュールリサイズエラー:', error);
          if (error && typeof error === 'object' && 'response' in error) {
            console.error('Error details:', (error as any).response?.data);
          }
            alert('スケジュールのリサイズに失敗しました。');
        }

        setResizeData(null);
        setResizeGhost(null);
        setIsResizing(false);
      }
    };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
  }, [dragData, dragGhost, resizeData, resizeGhost, reloadSchedules]);

  // スケジュール操作関数
  const handleScheduleSave = async (scheduleData: any) => {
    try {
      if (selectedSchedule) {
        await scheduleApi.update(selectedSchedule.id, scheduleData);
      }
      await reloadSchedules();
      setShowScheduleForm(false);
      setSelectedSchedule(null);
    } catch (error) {
      console.error('スケジュール保存エラー:', error);
    }
  };

  const handleScheduleDelete = async (scheduleId: number) => {
    try {
      await scheduleApi.delete(scheduleId);
      await reloadSchedules();
      setShowScheduleAction(false);
      setSelectedSchedule(null);
    } catch (error) {
      console.error('スケジュール削除エラー:', error);
    }
  };

  const handleScheduleCopy = (schedule: Schedule) => {
    setClipboard(schedule);
    setShowScheduleAction(false);
  };

  const handleSchedulePaste = async () => {
    if (!clipboard || selectedCells.size === 0) return;

    try {
      const firstCellId = Array.from(selectedCells ?? [])[0];
      const parts = firstCellId.split('-');
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      const slot = parseInt(parts[3]);
      
      const targetDate = new Date(year, month - 1, day);
      const targetTime = createTimeFromSlot(targetDate, slot);
      
      const clipboardStart = new Date(clipboard.start_datetime);
      const clipboardEnd = new Date(clipboard.end_datetime);
      const duration = clipboardEnd.getTime() - clipboardStart.getTime();
      const endTime = new Date(targetTime.getTime() + duration);

      await scheduleApi.create({
        employee_id: clipboard.employee_id,
        title: clipboard.title,
        start_datetime: targetTime,
        end_datetime: endTime,
        color: toApiColor(clipboard.color)
      });

      await reloadSchedules();
      setSelectedCells(new Set());
    } catch (error) {
      console.error('スケジュール貼り付けエラー:', error);
    }
  };

  // 選択されたセルから日時を取得
  const getSelectedCellDateTime = () => {
    console.log('getSelectedCellDateTime: selectedCells.size =', selectedCells.size);
    console.log('getSelectedCellDateTime: selectedCells =', Array.from(selectedCells));
    
    if (selectedCells.size === 0) {
      console.log('getSelectedCellDateTime: No cells selected');
      return null;
    }

    const cellIds = Array.from(selectedCells ?? []).sort();
    console.log('getSelectedCellDateTime: cellIds =', cellIds);
    const firstCellId = cellIds[0];
    const lastCellId = cellIds[cellIds.length - 1];
    console.log('getSelectedCellDateTime: firstCellId =', firstCellId, 'lastCellId =', lastCellId);

    const firstParts = firstCellId.split('-');
    const lastParts = lastCellId.split('-');

    const firstYear = parseInt(firstParts[0]);
    const firstMonth = parseInt(firstParts[1]);
    const firstDay = parseInt(firstParts[2]);
    const firstSlot = parseInt(firstParts[3]);

    const lastYear = parseInt(lastParts[0]);
    const lastMonth = parseInt(lastParts[1]);
    const lastDay = parseInt(lastParts[2]);
    const lastSlot = parseInt(lastParts[3]);

    const startDate = new Date(firstYear, firstMonth - 1, firstDay);
    const endDate = new Date(lastYear, lastMonth - 1, lastDay);

    const startDateTime = createTimeFromSlot(startDate, firstSlot);
    const endDateTime = createTimeFromSlot(endDate, lastSlot + 1); // 次のスロットまで
    
    return {
      startDateTime,
      endDateTime,
      employeeId: selectedEmployee?.id || 0
    };
  };

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
      
      // スケジュール作成成功
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
      setSelectedCells(new Set());
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
    setSelectedCells(new Set());
  };

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedSchedule) {
        handleScheduleDelete(selectedSchedule.id);
      } else if (e.ctrlKey && e.key === 'c' && selectedSchedule) {
        handleScheduleCopy(selectedSchedule);
      } else if (e.ctrlKey && e.key === 'v' && clipboard) {
        handleSchedulePaste();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSchedule, clipboard]);

  // 背景クリックでセル選択解除
  const handleBackgroundClick = (e: React.MouseEvent) => {
    // スケジュールアイテムやセルのクリックでない場合のみ
        const target = e.target as HTMLElement;
    if (!target.closest('.schedule-item') && !target.closest('.excel-time-cell') && !target.closest('.date-cell-fixed')) {
      setSelectedCells(new Set());
          setSelectedSchedule(null);
        }
  };

  if (!selectedDepartment || !selectedEmployee) {
    return (
      <div className="monthly-schedule-no-selection" onClick={handleBackgroundClick}>
        <div className="no-selection">
          <p>部署と社員を選択してください</p>
        </div>
      </div>
    );
  }

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

      {/* トップ固定バナー */}
      <div className="top-fixed-banner" style={{ position: 'sticky', top: '0', zIndex: 2000, background: '#f8f9fa', borderBottom: '2px solid #dee2e6', padding: '10px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="nav-btn active" onClick={() => (window.location.href = '/monthly')}>月別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/daily')}>日別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/all-employees')}>全社員</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/equipment')}>設備</button>
            <button 
              className="nav-btn registration-btn" 
              onClick={() => {
                // セルが選択されていない場合は選択をクリア
                if (selectedCells.size === 0) {
                  setSelectedSchedule(null);
                }
                setShowRegistrationTab(true);
              }} 
              style={{ marginLeft: '50px' }}
            >
              スケジュール登録
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h2 style={{ margin: 0, color: '#495057', fontSize: '18px', fontWeight: '600' }}>登録管理</h2>
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
          {/* 固定ヘッダー：時間軸 */}
          <div className="time-header-fixed" style={{
            position: 'sticky',
            top: 0,
            zIndex: 100,
            backgroundColor: '#f0f0f0',
            borderBottom: '2px solid #ccc',
            display: 'flex',
          width: `${scaledDateColumnWidth + 96 * scaledCellWidth}px`,
          minWidth: `${scaledDateColumnWidth + 96 * scaledCellWidth}px`
          }}>
            {/* 左上の空白セル */}
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
              position: 'sticky',
              left: 0,
              zIndex: 101,
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
              {/* 日付セル */}
                <div className="date-cell-fixed" style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 50,
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
                  const cellSchedules = schedules.filter(schedule => {
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
                      onMouseEnter={() => handleCellMouseEnter(date, slot)}
                      onMouseUp={handleCellMouseUp}
                      onDoubleClick={() => handleCellDoubleClick(date, slot)}
                      title={`${date.getMonth() + 1}/${date.getDate()} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                    >
                      {/* スケジュールアイテム */}
                      {(cellSchedules ?? []).map(schedule => {
                        const originalStartSlot = getTimeSlot(new Date(schedule.start_datetime));
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
                        
                        const leftOffset = isResizing && resizeGhost && resizeGhost.schedule.id === schedule.id && resizeGhost.edge === 'start' ? 
                          (getTimeSlot(resizeGhost.newStart) - originalStartSlot) * scaledCellWidth : 0;
                        
                        return (
                          <div
                            key={schedule.id}
                            className={`schedule-item ${selectedSchedule?.id === schedule.id ? 'selected' : ''}`}
                            style={{
                              background: `linear-gradient(180deg, ${lightenColor(schedule.color, 0.25)} 0%, ${safeHexColor(schedule.color)} 100%)`,
                              border: `1px solid ${lightenColor(schedule.color, -0.10)}`,
                              width: `${width}px`,
                              position: 'absolute',
                              left: `${leftOffset}px`,
                              height: '100%',
                              borderRadius: 4,
                              padding: '2px 4px',
                              fontSize: scaledSmallFontSize,
                              color: 'white',
                              overflow: 'hidden',
                              cursor: dragData?.schedule.id === schedule.id ? 'grabbing' : 'grab'
                            }}
                            onMouseDown={(e) => handleScheduleMouseDown(schedule, e)}
                            onDoubleClick={(e) => handleScheduleDoubleClick(schedule, e)}
                            onContextMenu={(e) => handleScheduleContextMenu(schedule, e)}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSchedule(schedule);
                            }}
                            title={`${schedule.title}\n${formatTime(startTime)} - ${formatTime(endTime)}`}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', textAlign: 'center', color: 'white' }}>
                              <div className="schedule-title" style={{ fontWeight: 700, color: 'white' }}>{schedule.title || '無題'}</div>
                              <div className="schedule-time" style={{ fontSize: Math.max(6, scaledSmallFontSize - 2), opacity: 0.9, color: 'white' }}>{`${formatTime(startTime)} - ${formatTime(endTime)}`}</div>
                            </div>
                            
                            {/* リサイズハンドル */}
                            <div
                              className="resize-handle resize-start"
                              onMouseDown={(e) => handleResizeMouseDown(schedule, 'start', e)}
                              style={{ 
                                position: 'absolute', 
                                left: -6, 
                                top: 0, 
                                width: 12, 
                                height: '100%', 
                                cursor: 'ew-resize', 
                                zIndex: 15,
                                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.6)',
                                borderRadius: '2px',
                                transition: 'all 0.2s ease'
                              }}
                            />
                            <div
                              className="resize-handle resize-end"
                              onMouseDown={(e) => handleResizeMouseDown(schedule, 'end', e)}
                              style={{ 
                                position: 'absolute', 
                                right: -6, 
                                top: 0, 
                                width: 12, 
                                height: '100%', 
                                cursor: 'ew-resize', 
                                zIndex: 15,
                                backgroundColor: 'rgba(255, 255, 255, 0.3)',
                                border: '1px solid rgba(255, 255, 255, 0.6)',
                                borderRadius: '2px',
                                transition: 'all 0.2s ease'
                              }}
                            />
                          </div>
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
        {dragGhost && mousePosition && (
          <div
            className="drag-ghost"
            style={{
              position: 'absolute',
              width: `${(getEndTimeSlot(dragGhost.end) - getTimeSlot(dragGhost.start)) * scaledCellWidth}px`,
              height: `${scaledRowHeight}px`,
              backgroundColor: safeHexColor(dragGhost.schedule.color),
              border: '2px dashed rgba(255, 255, 255, 0.8)',
              borderRadius: '4px',
              pointerEvents: 'none',
              zIndex: 1000,
              opacity: 0.7,
              left: `${scaledDateColumnWidth + getTimeSlot(dragGhost.start) * scaledCellWidth}px`,
              top: `${80 + monthDates.findIndex(date => 
                date.getFullYear() === dragGhost.start.getFullYear() && 
                date.getMonth() === dragGhost.start.getMonth() && 
                date.getDate() === dragGhost.start.getDate()
              ) * scaledRowHeight}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: `${scaledSmallFontSize}px`,
              fontWeight: 'bold',
              boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
            }}
            title={`${dragGhost.schedule.title}\n${formatTime(dragGhost.start)} - ${formatTime(dragGhost.end)}`}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '1px', fontSize: `${Math.max(8, scaledSmallFontSize - 1)}px` }}>
                📅 {dragGhost.start.getDate()}日 {dragGhost.schedule.title || '無題'}
          </div>
              <div style={{ fontSize: `${Math.max(6, scaledSmallFontSize - 2)}px`, opacity: 0.9 }}>
                {formatTime(dragGhost.start)} - {formatTime(dragGhost.end)}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
        </div>
      )}

      {/* モーダル */}
      {showScheduleForm && selectedSchedule && (
        <ScheduleFormModal
          schedule={selectedSchedule}
          employee={selectedEmployee || undefined}
          colors={SCHEDULE_COLORS}
          onSave={handleScheduleSave}
          onCancel={() => {
            setShowScheduleForm(false);
            setSelectedSchedule(null);
            setSelectedCells(new Set());
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
          onDelete={() => selectedSchedule && handleScheduleDelete(selectedSchedule.id)}
          onCopy={() => selectedSchedule && handleScheduleCopy(selectedSchedule)}
          onCancel={() => {
            setShowScheduleAction(false);
            setSelectedSchedule(null);
          }}
        />
      )}

      {showRegistrationTab && (() => {
        console.log('MonthlySchedule: Rendering ScheduleRegistrationModal - selectedDate:', selectedDate.toDateString(), 'selectedCells:', selectedCells);
        const cellDateTime = getSelectedCellDateTime();
        console.log('MonthlySchedule: getSelectedCellDateTime result:', cellDateTime);
        return null;
      })()}
      {showRegistrationTab && (
        <ScheduleRegistrationModal
          selectedCells={selectedCells}
          employees={employees}
          equipments={equipments}
          selectedDate={selectedDate}
          colors={SCHEDULE_COLORS}
          initialData={getSelectedCellDateTime()}
          onSave={handleRegistrationSave}
          onCancel={handleRegistrationCancel}
        />
      )}

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
