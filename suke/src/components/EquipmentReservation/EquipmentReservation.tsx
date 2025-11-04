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
import EventBar from '../EventBar/EventBar';

// 共通フック（日別スケジュールと同じ）
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
import { useScheduleDrag } from '../../hooks/useScheduleDrag';
import { useScheduleDragResize } from '../../hooks/useScheduleDragResize';

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

  // 設備ID計算関数（日別スケジュールの社員ID計算を参考）
  const getEquipmentIdFromDelta = (originalEquipmentId: number, delta: number) => {
    const currentIndex = equipments.findIndex((eq: any) => eq.id === originalEquipmentId);
    if (currentIndex === -1) return originalEquipmentId;
    
    const newIndex = Math.max(0, Math.min(equipments.length - 1, currentIndex + delta));
    return equipments[newIndex].id;
  };
  
  // 日別スケジュールから移植した完璧なドラッグ・リサイズ機能
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
    scaledRowHeight: 40,
    onUpdateSchedule: async (scheduleId: number, updateData: any) => {
      console.log('🔄 設備予約更新:', { scheduleId, updateData });
      
      // 元の予約データを取得して必要な情報を補完
      console.log('🔍 元の予約データを検索:', { scheduleId, reservationsCount: reservations.length });
      const originalReservation = reservations.find(r => r.id === scheduleId);
      console.log('🔍 元の予約データ:', originalReservation);
      
      if (!originalReservation) {
        console.error('❌ 元の予約データが見つかりません:', scheduleId);
        console.error('❌ 利用可能な予約一覧:', reservations.map(r => ({ id: r.id, title: r.title })));
        throw new Error('元の予約データが見つかりません');
      }
      
      // 設備予約用のデータ形式に変換
      const equipmentReservationData = {
        purpose: updateData.title || updateData.purpose || originalReservation.title || originalReservation.purpose || '予約',
        color: updateData.color || originalReservation.color,
        employee_id: originalReservation.employee_id, // 元の社員IDを保持
        // 設備IDの決定優先度: 新しいequipment_id → employee_id(互換) → 元の値
        equipment_id: (updateData as any).equipment_id ?? updateData.employee_id ?? originalReservation.equipment_ids?.[0] ?? originalReservation.equipment_id,
        start_datetime: updateData.start_datetime instanceof Date 
          ? toLocalISODateTime(updateData.start_datetime)
          : updateData.start_datetime,
        end_datetime: updateData.end_datetime instanceof Date 
          ? toLocalISODateTime(updateData.end_datetime)
          : updateData.end_datetime
      };
      
      // 事前ローカル重複チェック（設備重複は絶対NG）
      try {
        const targetEquipId = equipmentReservationData.equipment_id;
        const newStart = new Date(equipmentReservationData.start_datetime as any);
        const newEnd = new Date(equipmentReservationData.end_datetime as any);
        const hasLocalConflict = dailyReservations.some(r => {
          if (r.id === scheduleId) return false;
          const rEquip = r.equipment_id || r.equipment_ids?.[0];
          if (rEquip !== targetEquipId) return false;
          const rStart = new Date(r.start_datetime);
          const rEnd = new Date(r.end_datetime);
          return !(rEnd <= newStart || rStart >= newEnd);
        });
        if (hasLocalConflict) {
          setConflictTab({
            message: '設備の重複予約はできません。同一設備・時間帯に既存の予約があります。'
          });
          // 自動クローズ
          setTimeout(() => setConflictTab(null), 4000);
          return; // API呼び出しを行わず終了
        }
      } catch (e) {
        // フォールバック（チェックに失敗してもサーバー側で弾かれる）
      }

      // 楽観的更新：サーバー応答前にUIを新しい位置へ反映
      try {
        const uiStart = equipmentReservationData.start_datetime instanceof Date
          ? toLocalISODateTime(equipmentReservationData.start_datetime as any)
          : (equipmentReservationData.start_datetime as any);
        const uiEnd = equipmentReservationData.end_datetime instanceof Date
          ? toLocalISODateTime(equipmentReservationData.end_datetime as any)
          : (equipmentReservationData.end_datetime as any);
        const uiEquipId = equipmentReservationData.equipment_id as number;
        const uiEquipName = equipments.find(eq => eq.id === uiEquipId)?.name;
        setReservations((prev) => prev.map(r => r.id === scheduleId
          ? { ...r, start_datetime: uiStart, end_datetime: uiEnd, equipment_id: uiEquipId, equipment_ids: [uiEquipId], equipment_name: uiEquipName }
          : r));
        if (selectedSchedule && selectedSchedule.id === scheduleId) {
          setSelectedSchedule({ ...(selectedSchedule as any), start_datetime: uiStart, end_datetime: uiEnd, equipment_id: uiEquipId, equipment_ids: [uiEquipId], equipment_name: uiEquipName } as any);
        }
      } catch {}

      console.log('🔄 変換後のデータ:', {
        ...equipmentReservationData,
        start_datetime_type: typeof equipmentReservationData.start_datetime,
        end_datetime_type: typeof equipmentReservationData.end_datetime,
        start_datetime_value: equipmentReservationData.start_datetime,
        end_datetime_value: equipmentReservationData.end_datetime
      });
      
      try {
        setIsSaving(true);
        await updateEquipmentReservation(scheduleId, equipmentReservationData);
        console.log('✅ 設備予約更新成功:', scheduleId);
      } catch (error: any) {
        console.error('❌ 設備予約更新失敗:', error);
        console.error('❌ 送信データ:', equipmentReservationData);
        // サーバーエラー時はUIを元に戻す
        try { await loadReservations(); } catch {}
        
        // 重複エラーの場合は特別な処理
        if (error?.response?.status === 409 && error?.response?.data?.error === 'EQUIPMENT_CONFLICT') {
          const conflictData = error.response.data;
          console.error('🚨 設備重複エラー:', conflictData);
          
          // 重複の詳細情報を表示
          const conflictDetails = conflictData.details?.conflictingReservations || [];
          const conflictMessages = conflictDetails.map((c: any) => 
            `予約ID: ${c.id}, 目的: ${c.purpose}, 時間: ${c.timeRange.start} - ${c.timeRange.end}`
          ).join('\n');
          
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
    },
    onReloadSchedules: async () => {
      await loadReservations();
    },
    employees: equipments.map(eq => ({ id: eq.id, name: eq.name })), // 設備を社員として扱う
    getEmployeeIdFromDelta: getEquipmentIdFromDelta
  });

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  // 設備予約データの読み込み
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
      if (newDragData || newIsResizing) return;

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
  }, [selectedSchedule, newDragData, newIsResizing, api, loadReservations]);

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

  // セル選択完了時の処理
  useEffect(() => {
    // セル選択が完了し、選択中でない場合に処理
    if (selectedCells.size > 0 && !isSelecting) {
      console.log('🔍 セル選択完了検出:', {
        selectedCellsSize: selectedCells.size,
        selectedCells: Array.from(selectedCells),
        isSelecting
      });

      // 少し遅延を入れてから処理（ユーザーの選択操作完了を待つ）
      const timer = setTimeout(() => {
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
        const cellDateTime = commonGetSelectedCellDateTime(equipmentsAsEmployees, selectedDate);
        
        if (cellDateTime) {
          const selectedEquipment = equipments.find(eq => eq.id === cellDateTime.employeeId);
          
          console.log('🔍 自動モーダル表示:', {
            startDateTime: cellDateTime.startDateTime.toISOString(),
            endDateTime: cellDateTime.endDateTime.toISOString(),
            equipmentId: cellDateTime.employeeId,
            equipmentName: selectedEquipment?.name,
            selectedCellsSize: selectedCells.size,
            startTimeString: cellDateTime.startDateTime.toTimeString().slice(0, 5),
            endTimeString: cellDateTime.endDateTime.toTimeString().slice(0, 5)
          });
          
          const snapshotData = {
            startDateTime: cellDateTime.startDateTime,
            endDateTime: cellDateTime.endDateTime,
            equipmentId: cellDateTime.employeeId,
            equipmentName: selectedEquipment?.name
          };

          console.log('🔍 セットするスナップショットデータ:', {
            ...snapshotData,
            startTimeForForm: snapshotData.startDateTime.toTimeString().slice(0, 5),
            endTimeForForm: snapshotData.endDateTime.toTimeString().slice(0, 5),
            startDateTimeISO: snapshotData.startDateTime.toISOString(),
            endDateTimeISO: snapshotData.endDateTime.toISOString()
          });

          setSelectionSnapshot(snapshotData);
          
          // ルール: 複数セル選択時のみ自動で登録タブを表示
          // 単一セルはダブルクリック時に表示（handleCellDoubleClickで対応）
          if (selectedCells.size >= 2 && !isModalOpen) {
            setShowRegistrationTab(true);
            setIsModalOpen(true);
          }
        }
      }, 500); // 500ms遅延

      return () => clearTimeout(timer);
    }
  }, [selectedCells, isSelecting, equipments, commonGetSelectedCellDateTime, selectedDate, isModalOpen]);

  // セル選択処理（日別スケジュールと同じ）
  const handleCellMouseDown = useCallback((equipmentId: number, slot: number) => {
    console.log('🖱️ セルマウスダウン:', { equipmentId, slot });
    commonHandleCellMouseDown(equipmentId, slot, selectedDate);
  }, [commonHandleCellMouseDown, selectedDate]);

  const handleCellMouseEnter = useCallback((equipmentId: number, slot: number) => {
    commonHandleCellMouseEnter(equipmentId, slot, selectedDate);
  }, [commonHandleCellMouseEnter, selectedDate]);

  const handleCellMouseUp = useCallback(() => {
    console.log('🖱️ セルマウスアップ');
    commonHandleCellMouseUp();
  }, [commonHandleCellMouseUp]);

  const handleCellDoubleClick = useCallback((equipmentId: number, slot: number) => {
    console.log('🖱️ セルダブルクリック:', { equipmentId, slot });
    commonHandleCellDoubleClick(equipmentId, slot, selectedDate);
    
    // ダブルクリック時は即座にモーダルを表示（自動表示をキャンセル）
    console.log('🔍 ダブルクリック：即座にモーダル表示');
    
    // 現在の選択状態を使用してモーダルを表示
    const equipmentsAsEmployees = equipments.map(eq => ({ 
      id: eq.id, 
      name: eq.name, 
      department_id: 1,
      employee_number: `EQ${eq.id}`,
      display_order: eq.display_order || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
    const cellDateTime = commonGetSelectedCellDateTime(equipmentsAsEmployees, selectedDate);
    
    if (cellDateTime) {
      const selectedEquipment = equipments.find(eq => eq.id === cellDateTime.employeeId);
      
      setSelectionSnapshot({
        startDateTime: cellDateTime.startDateTime,
        endDateTime: cellDateTime.endDateTime,
        equipmentId: cellDateTime.employeeId,
        equipmentName: selectedEquipment?.name
      });
      
      setShowRegistrationTab(true);
      setIsModalOpen(true);
    }
  }, [commonHandleCellDoubleClick, commonGetSelectedCellDateTime, selectedDate, equipments]);

  // スケール変更処理
  const handleScaleChange = useCallback((newScale: number) => {
    setIsScaling(true);
    setScheduleScale(newScale);
    setTimeout(() => setIsScaling(false), 100);
  }, []);

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
            <button className="nav-btn" onClick={() => (window.location.href = '/monthly')}>月別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/daily')}>日別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/all-employees')}>全社員</button>
            <button className="nav-btn active" onClick={() => (window.location.href = '/equipment')}>設備</button>
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
                        cursor: (newIsResizing || newDragData) ? 'not-allowed' : 'pointer', // リサイズ・移動中は無効カーソル
                      fontSize: '10px',
                      boxShadow: isSelected ? '0 0 8px rgba(33, 150, 243, 0.3)' : 'none',
                      zIndex: isSelected ? 5 : 1,
                      opacity: (newIsResizing || newDragData) ? 0.5 : 1 // リサイズ・移動中は半透明
                    }}
                    data-equipment-id={equipment.id}
                    data-slot={slot}
                    data-time={`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      onMouseDown={(e) => {
                        if (e.button !== 0) return; // 左クリック以外はセル選択無効化

                        // リサイズ・移動中はセル選択を無効化
                        if (newIsResizing || newDragData) {
                          console.log('🚫 セルのonMouseDown: リサイズ・移動中のためセル選択無効化');
                          return;
                        }

                        // スケジュールアイテムがクリックされた場合はセル選択をスキップ
                        const target = e.target as HTMLElement;
                        const scheduleItem = target.closest('.schedule-item');
                        if (scheduleItem) {
                          console.log('🚫 セルのonMouseDown: スケジュールアイテムがクリックされたためスキップ');
                          return;
                        }
                        
                        console.log('🖱️ セルクリック:', {
                          equipmentId: equipment.id,
                          equipmentName: equipment.name,
                          slot,
                          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                          cellId
                        });
                        
                        e.stopPropagation();
                        handleCellMouseDown(equipment.id, slot);
                      }}
                    onMouseEnter={(e) => {
                      // リサイズ・移動中はセル選択を無効化
                      if (newIsResizing || newDragData) {
                        return;
                      }

                      // スケジュールアイテムがホバーされた場合はセル選択をスキップ
                      const target = e.target as HTMLElement;
                      const scheduleItem = target.closest('.schedule-item');
                      if (scheduleItem) {
                        return;
                      }
                      handleCellMouseEnter(equipment.id, slot);
                    }}
                    onMouseUp={() => {
                      // リサイズ・移動中はセル選択を無効化
                      if (newIsResizing || newDragData) {
                        return;
                      }
                      handleCellMouseUp();
                    }}
                      onDoubleClick={() => {
                        // リサイズ・移動中はセル選択を無効化
                        if (newIsResizing || newDragData) {
                          console.log('🚫 セルのonDoubleClick: リサイズ・移動中のためセル選択無効化');
                          return;
                        }

                        console.log('🖱️ セルダブルクリック（直接）:', {
                          equipmentId: equipment.id,
                          equipmentName: equipment.name,
                          slot,
                          time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                          cellId,
                          selectedCellsBeforeDoubleClick: Array.from(selectedCells)
                        });
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
                  pointerEvents: 'auto',
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
                    // ドラッグ中の対象はプレビュー描画に切り替え
                    if (newDragData && newDragData.schedule.id === reservation.id) {
                      const originalStart = new Date(reservation.start_datetime);
                      const originalEnd = new Date(reservation.end_datetime);
                      const originalStartSlot = getTimeSlot(originalStart);
                      const originalEndSlot = getEndTimeSlot(originalEnd);
                      const durationSlots = Math.max(1, originalEndSlot - originalStartSlot);
                      const baseLeftPx = originalStartSlot * 20 * scheduleScale;
                      const deltaX = newDragGhost ? newDragGhost.deltaX : 0;
                      const maxTimelinePx = 96 * 20 * scheduleScale;

                      // プレビューはこの行のオーバーレイに描画し、topで行オフセットを表現
                      const baseEquipId = reservation.equipment_id || reservation.equipment_ids?.[0];
                      const previewEquipId = (newDragGhost && typeof newDragGhost.newEmployeeDelta === 'number')
                        ? getEquipmentIdFromDelta(newDragData.originalEmployeeId, newDragGhost.newEmployeeDelta || 0)
                        : baseEquipId;
                      const targetIndex = Math.max(0, Math.min(equipments.length - 1, equipments.findIndex(eq => eq.id === previewEquipId)));
                      const rowOffsetPx = (targetIndex - equipmentIndex) * 40;

                      // ピクセルベースでマウスに追従（幅は固定）、範囲をクランプ
                      const rawLeft = baseLeftPx + deltaX;
                      const widthPx = durationSlots * 20 * scheduleScale;
                      const leftPx = Math.max(0, Math.min(maxTimelinePx - widthPx, rawLeft));

                      return (
                        <EventBar
                          key={`eventbar-dragging-${reservation.id}-${equipment.id}-${equipmentIndex}-${reservationIndex}`}
                          schedule={{
                            ...reservation,
                            // フックのレーン判定用に employee_id は設備IDを渡す
                            employee_id: (reservation as any).equipment_id || (reservation as any).equipment_ids?.[0],
                            owner_employee_id: reservation.employee_id,
                            equipment_name: equipments.find(eq => eq.id === (reservation.equipment_id || reservation.equipment_ids?.[0]))?.name,
                            employee_name: employees.find(em => em.id === reservation.employee_id)?.name
                          } as any}
                          startPx={leftPx}
                          widthPx={widthPx}
                          height={36}
                          topPx={2 + rowOffsetPx}
                          laneIndex={equipmentIndex}
                          laneHeight={40}
                          maxTimelinePx={96 * 20 * scheduleScale}
                          maxLaneIndex={equipments.length - 1}
                          fontSize={11}
                          isSelected={true}
                          showGhost={false}
                          snapSizeX={20 * scheduleScale}
                          containerSelector='.equipment-reservation .schedule-grid-container'
                          headerHeightPx={32}
                          dateColumnWidthPx={200}
                          onBarMouseDownOverride={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
                          onResizeLeftMouseDownOverride={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
                          onResizeRightMouseDownOverride={(e)=>{ e.preventDefault(); e.stopPropagation(); }}
                          debug={false}
                        />
                      );
                    }
          
                    // リサイズ中は新しい時間を使用
                    let startTime = new Date(reservation.start_datetime);
                    let endTime = new Date(reservation.end_datetime);
                    
                    if (newIsResizing && newResizeGhost && newResizeGhost.schedule.id === reservation.id) {
                      startTime = newResizeGhost.newStart;
                      endTime = newResizeGhost.newEnd;
                    }
                    
          const startSlot = getTimeSlot(startTime);
          const endSlot = getEndTimeSlot(endTime);
                    const left = startSlot * 20 * scheduleScale;
                    const width = (endSlot - startSlot) * 20 * scheduleScale;
                    
                    // 高精度EventBarコンポーネントを使用（ドラッグ処理は無効化）
          
          return (
                      <EventBar
                        key={`eventbar-${reservation.id}-${equipment.id}-${equipmentIndex}-${reservationIndex}`}
            schedule={{
              ...reservation,
              // フックのレーン判定用に employee_id は設備IDを渡す
              employee_id: (reservation as any).equipment_id || (reservation as any).equipment_ids?.[0],
              owner_employee_id: reservation.employee_id,
              equipment_name: equipments.find(eq => eq.id === (reservation.equipment_id || reservation.equipment_ids?.[0]))?.name,
              employee_name: employees.find(em => em.id === reservation.employee_id)?.name
            } as any}
                        startPx={left}
                        widthPx={width}
                        height={36}
                        topPx={2}
                        laneIndex={equipmentIndex}
                        laneHeight={40}
                        maxTimelinePx={96 * 20 * scheduleScale}
                        maxLaneIndex={equipments.length - 1}
                        fontSize={11}
              isSelected={selectedSchedule?.id === reservation.id}
                        showGhost={false}
                        snapSizeX={20 * scheduleScale}
                        containerSelector='.equipment-reservation .schedule-grid-container'
                        headerHeightPx={32}
                        dateColumnWidthPx={200}
                        onMove={undefined}
                        onMoveCommit={undefined}
                        onResize={undefined}
                        onResizeCommit={undefined}
                        onBarMouseDownOverride={(e, s) => {
                          // 外部フックのドラッグ開始を使用
                          newHandleScheduleMouseDown(s, e);
                        }}
                        onResizeLeftMouseDownOverride={(e, s) => {
                          newHandleResizeMouseDown(s, 'start', e);
                        }}
                        onResizeRightMouseDownOverride={(e, s) => {
                          newHandleResizeMouseDown(s, 'end', e);
                        }}
                        onClick={(e, schedule) => {
                          e.preventDefault();
                e.stopPropagation();
                          setSelectedSchedule(schedule);
                          // クリックでドラッグ開始しない（誤ってドラッグゴーストが出るのを防止）
              }}
                        onDoubleClick={(e, schedule) => {
                          // ドラッグ/リサイズ中や更新中はダブルクリック無効（未コミットで戻る現象防止）
                          if (newDragData || newIsResizing || isSaving) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const fresh = reservations.find(r => r.id === schedule.id) || schedule;
                          setSelectedSchedule(fresh as any);
                          setShowScheduleForm(true);
                        }}
                        onContextMenu={(e, schedule) => {
                e.preventDefault();
                e.stopPropagation();
                setSelectedSchedule(schedule);
                          setShowScheduleAction(true);
                        }}
                        debug={false} // シンプル化のためデバッグ無効化
                      />
                    );
                  });
                })()}
            </div>
            </div>
          ))}
          </div>
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
                    purpose: '',
                    selectedCellsSize: selectedCells.size
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