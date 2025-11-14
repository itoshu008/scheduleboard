import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Equipment, Employee } from '../../types';
import { api } from '../../api';
import dayjs from 'dayjs';
import { formatDate, getTimeSlot, getTimeFromSlot, getEndTimeSlot, parseLocalDateTimeString } from '../../utils/dateUtils';
import { CELL_WIDTH_PX } from '../../utils/uiConstants';
import ScheduleRegistrationModal from '../ScheduleRegistrationModal/ScheduleRegistrationModal';
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
// 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
import { useMonthlyEventBarHandlers } from '../../hooks/useMonthlyEventBarHandlers';
import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';
import { equipmentReservationApi } from '../../utils/api';
import './SimpleEquipmentReservation.css';

interface SimpleEquipmentReservationProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  equipments: Equipment[];
}

interface Reservation {
  id: number;
  title: string;
  equipment_id: number;
  employee_id: number;
  start_datetime: string;
  end_datetime: string;
  color?: string;
  equipment_name?: string;
  employee_name?: string;
}

const SimpleEquipmentReservation: React.FC<SimpleEquipmentReservationProps> = ({
  selectedDate,
  onDateChange,
  equipments
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<Reservation | null>(null);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
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
  const scheduleScale = 100; // 設備ビューは固定スケール

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
      const response = await api.get(`/equipment-reservations?date=${dateStr}`);
      const reservationsData = response.data || [];
      console.log('🔍 [設備予約] Loaded reservations:', reservationsData.length, 'for date:', dateStr);
      if (reservationsData.length > 0) {
        console.log('🔍 [設備予約] Sample reservation:', reservationsData[0]);
        console.log('🔍 [設備予約] Sample start_datetime:', reservationsData[0].start_datetime);
        console.log('🔍 [設備予約] Sample end_datetime:', reservationsData[0].end_datetime);
        console.log('🔍 [設備予約] Sample equipment_id:', reservationsData[0].equipment_id);
      } else {
        console.log('🔍 [設備予約] No reservations found for date:', dateStr);
      }
      setReservations(reservationsData);
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

  // 月別ビューのイベントバー処理ロジックを使用（設備予約用にカスタマイズ）
  const {
    interactionState,
    setInteractionState,
    isResizing,
    mousePosition,
    handleScheduleMouseDown,
    handleResizeMouseDown
  } = useMonthlyEventBarHandlers({
    scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
    scaledRowHeight: 40 * scheduleScale,
    reloadSchedules,
    setSelectedSchedule: (schedule: any) => setSelectedSchedule(schedule),
    setSelectedCells
  });

  // 設備予約用のドラッグ＆リサイズ処理（equipmentReservationApiを使用）
  useEffect(() => {
    const handleMouseUp = async () => {
      const state = interactionState;
      
      // ドラッグ終了処理
      if (state.dragData && state.dragGhost) {
        try {
          console.log('🚚 設備予約ドラッグ確定:', {
            reservationId: state.dragData.schedule.id,
            newDate: state.dragGhost.newDate,
            newSlot: state.dragGhost.newSlot
          });
          
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
          
          const updateData = {
            title: state.dragData.schedule.title || '予約',
            color: toApiColor(state.dragData.schedule.color),
            employee_id: state.dragData.schedule.employee_id,
            equipment_id: state.dragData.schedule.equipment_id || (state.dragData.schedule as any).equipment_id,
            start_datetime: newStart,
            end_datetime: newEnd
          };
          
          await equipmentReservationApi.update(state.dragData.schedule.id, updateData);
          
          // WebSocketの更新を待つ
          await new Promise(resolve => setTimeout(resolve, 300));
          
          await loadReservations();
          
          console.log('設備予約ドラッグ更新完了');
        } catch (error) {
          console.error('設備予約ドラッグ更新エラー:', error);
          alert('予約の移動に失敗しました: ' + (error as any)?.message);
        }
      }
      
      // リサイズ終了処理
      if (state.resizeData && state.resizeGhost) {
        try {
          console.log('🔧 設備予約リサイズ確定:', {
            reservationId: state.resizeData.schedule.id,
            edge: state.resizeData.edge,
            newStart: state.resizeGhost.newStart.toISOString(),
            newEnd: state.resizeGhost.newEnd.toISOString()
          });
          
          const updateData = {
            title: state.resizeData.schedule.title || '予約',
            color: toApiColor(state.resizeData.schedule.color),
            employee_id: state.resizeData.schedule.employee_id,
            equipment_id: state.resizeData.schedule.equipment_id || (state.resizeData.schedule as any).equipment_id,
            start_datetime: state.resizeGhost.newStart,
            end_datetime: state.resizeGhost.newEnd
          };
          
          await equipmentReservationApi.update(state.resizeData.schedule.id, updateData);
          
          // WebSocketの更新を待つ
          await new Promise(resolve => setTimeout(resolve, 300));
          
          await loadReservations();
          
          console.log('設備予約リサイズ更新完了');
        } catch (error) {
          console.error('設備予約リサイズ更新エラー:', error);
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
    };

    // イベントリスナー登録（ドラッグまたはリサイズ中のみ）
    const hasActiveOperation = interactionState.dragData || interactionState.resizeData;
    if (hasActiveOperation && !interactionState.showEditModal) {
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [!!interactionState.dragData, !!interactionState.resizeData, interactionState.showEditModal, interactionState, loadReservations, setInteractionState]);

  // 月別ビューのロジックと互換性を保つため、既存の変数名をエイリアス
  const dragData = interactionState.dragData;
  const dragGhost = interactionState.dragGhost;
  const resizeData = interactionState.resizeData;
  const resizeGhost = interactionState.resizeGhost;

  // セル選択状態（直接管理 - 全社員ページと同様）
  const [localSelectedCells, setLocalSelectedCells] = useState<Set<string>>(new Set());
  const [localIsSelecting, setLocalIsSelecting] = useState(false);
  const [localSelectionAnchor, setLocalSelectionAnchor] = useState<{ equipmentId: number; slot: number } | null>(null);

  // 設備予約ページ用のセル選択ハンドラー（全社員ページと同様）
  const handleEquipmentCellMouseDown = useCallback((equipmentId: number, slot: number, e?: React.MouseEvent) => {
    // 右クリック時はセル選択を無効化（右クリックドラッグスクロール用）
    if (e && e.button === 2) return;
    if (e && e.button !== 0) return; // 左クリック以外はセル選択無効化
    
    // セルIDに日付情報を含める（全社員ページと統一）
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const cellId = `${year}-${month}-${day}-equipment-${equipmentId}-${slot}`;
    
    // スケジュール選択をクリア
    setSelectedSchedule(null);
    
    // セル選択開始
    setLocalSelectedCells(new Set([cellId]));
    setLocalIsSelecting(true);
    setLocalSelectionAnchor({ equipmentId, slot });
  }, [selectedDate]);

  const handleEquipmentCellMouseEnter = useCallback((equipmentId: number, slot: number) => {
    if (!localIsSelecting || !localSelectionAnchor) return;
    
    const newSelectedCells = new Set<string>();
    const startEquipment = Math.min(localSelectionAnchor.equipmentId, equipmentId);
    const endEquipment = Math.max(localSelectionAnchor.equipmentId, equipmentId);
    const startSlot = Math.min(localSelectionAnchor.slot, slot);
    const endSlot = Math.max(localSelectionAnchor.slot, slot);

    // セルIDに日付情報を含める
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    
    // 設備リストから実際のequipmentIdを取得
    const equipmentList = equipments;
    
    for (let eqIndex = 0; eqIndex < equipmentList.length; eqIndex++) {
      const eq = equipmentList[eqIndex];
      if (eq.id >= startEquipment && eq.id <= endEquipment) {
        for (let s = startSlot; s <= endSlot; s++) {
          newSelectedCells.add(`${year}-${month}-${day}-equipment-${eq.id}-${s}`);
        }
      }
    }
    
    setLocalSelectedCells(newSelectedCells);
  }, [localIsSelecting, localSelectionAnchor, equipments, selectedDate]);

  const handleEquipmentCellMouseUp = useCallback(() => {
    setLocalIsSelecting(false);
    setLocalSelectionAnchor(null);
    
    // 選択されたセルをuseScheduleCellSelectionの形式に変換
    const convertedCells = new Set<string>();
    localSelectedCells.forEach(cellId => {
      // 形式: YYYY-MM-DD-equipment-equipmentId-slot
      // これをequipment-equipmentId-slot形式に変換（既存のコードとの互換性のため）
      const parts = cellId.split('-');
      if (parts.length >= 6 && parts[3] === 'equipment') {
        const equipmentId = parts[4];
        const slot = parts[5];
        convertedCells.add(`equipment-${equipmentId}-${slot}`);
      }
    });
    setSelectedCells(convertedCells);
    
    // 2セル以上選択時は自動的にモーダルを開く
    if (convertedCells.size >= 2) {
      // 選択されたセルから設備IDを取得（最初のセルから）
      const firstCellId = Array.from(convertedCells)[0];
      const parts = firstCellId.split('-');
      if (parts.length >= 3 && parts[0] === 'equipment') {
        const equipmentId = parseInt(parts[1]);
        setSelectedEquipmentId(equipmentId);
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
            const equipmentId = parts[4];
            const slot = parts[5];
            convertedCells.add(`equipment-${equipmentId}-${slot}`);
          }
        });
        setSelectedCells(convertedCells);
        
        // 2セル以上選択時は自動的にモーダルを開く
        if (convertedCells.size >= 2) {
          // 選択されたセルから設備IDを取得（最初のセルから）
          const firstCellId = Array.from(convertedCells)[0];
          const parts = firstCellId.split('-');
          if (parts.length >= 3 && parts[0] === 'equipment') {
            const equipmentId = parseInt(parts[1]);
            setSelectedEquipmentId(equipmentId);
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

  // 予約保存
  const handleReservationSave = async (scheduleData: any) => {
    try {
      // 選択されたセルから時間を計算
      let startDateTime: string;
      let endDateTime: string;
      let equipmentId: number;

      if (selectedCells.size > 0) {
        const cellIds = Array.from(selectedCells);
        const slots = cellIds.map(id => parseInt(id.split('-')[2]));
        equipmentId = parseInt(cellIds[0].split('-')[1]);
        const minSlot = Math.min(...slots);
        const maxSlot = Math.max(...slots);
        const startHour = Math.floor(minSlot / 4);
        const startMinute = (minSlot % 4) * 15;
        const endHour = Math.floor((maxSlot + 1) / 4);
        const endMinute = ((maxSlot + 1) % 4) * 15;
        
        const dateStr = formatDate(selectedDate);
        startDateTime = `${dateStr}T${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}:00`;
        endDateTime = `${dateStr}T${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
      } else {
        // フォームから取得
        const dateStr = formatDate(selectedDate);
        startDateTime = scheduleData.start_datetime || `${dateStr}T09:00:00`;
        endDateTime = scheduleData.end_datetime || `${dateStr}T10:00:00`;
        equipmentId = scheduleData.equipment_id || selectedEquipmentId || equipments[0]?.id || 1;
      }

      const payload = {
        title: scheduleData.title || scheduleData.purpose || '予約',
        equipment_id: equipmentId,
        employee_id: scheduleData.employee_id || employees[0]?.id || 1,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        color: scheduleData.color || '#dc3545'
      };

      console.log('設備予約作成:', payload);
      await api.post('/equipment-reservations', payload);
      await loadReservations();
      setShowRegistrationModal(false);
      setSelectedCells(new Set());
      setLocalSelectedCells(new Set());
      setLocalIsSelecting(false);
      setLocalSelectionAnchor(null);
      setSelectedSchedule(null);
      setSelectedEquipmentId(null);
    } catch (error: any) {
      console.error('予約作成エラー:', error);
      const message = error.response?.data?.message || error.response?.data?.error || '予約の作成に失敗しました';
      alert(`エラー: ${message}`);
    }
  };

  // 予約をSchedule型に変換（月別ビューのロジックと互換性を保つため）
  const reservationToSchedule = useCallback((reservation: Reservation): any => {
    return {
      id: reservation.id,
      title: reservation.title,
      employee_id: reservation.employee_id,
      equipment_id: reservation.equipment_id, // 設備予約用にequipment_idを追加
      start_datetime: reservation.start_datetime,
      end_datetime: reservation.end_datetime,
      color: reservation.color || '#dc3545'
    };
  }, []);

  // 予約の表示位置を計算（設備予約ページ専用）
  const getReservationStyle = (reservation: Reservation, equipmentIndex: number) => {
    // ISO形式の文字列をローカル時間として解釈
    // dayjsはUTCとして解釈する可能性があるため、parseLocalDateTimeStringを使用
    const startTimeStr = reservation.start_datetime;
    const endTimeStr = reservation.end_datetime;
    
    console.log('🔍 [getReservationStyle] Reservation ID:', reservation.id, 'start:', startTimeStr, 'end:', endTimeStr);
    
    if (!startTimeStr || !endTimeStr) {
      console.warn('🔍 [getReservationStyle] Reservation missing datetime:', reservation.id);
      return { display: 'none' };
    }
    
    // ISO形式（Z付きまたはタイムゾーン付き）の場合は、UTCとして解釈してからローカル時間に変換
    let startDate: Date;
    let endDate: Date;
    
    try {
      if (startTimeStr.includes('T') && (startTimeStr.includes('Z') || startTimeStr.match(/[+-]\d{2}:\d{2}$/))) {
        // ISO形式（UTC）の場合、new Date()で自動的にローカル時間に変換される
        // サーバー側でJST→UTCに変換されているため、new Date()で解釈すれば自動的にローカル時間になる
        startDate = new Date(startTimeStr);
        endDate = new Date(endTimeStr);
        
        console.log('🔍 [getReservationStyle] ISO format detected. UTC:', startTimeStr, '→ Local:', startDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
      } else {
        // 既にローカル時間形式の場合
        startDate = parseLocalDateTimeString(startTimeStr);
        endDate = parseLocalDateTimeString(endTimeStr);
        console.log('🔍 [getReservationStyle] Local format detected. Parsed:', startDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
      }
      
      // 日付が無効な場合は非表示
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.warn('🔍 [getReservationStyle] Invalid date for reservation:', reservation.id, startTimeStr, endTimeStr);
        return { display: 'none' };
      }
      
      // 選択されている日付と予約の日付が一致するか確認
      const reservationDateStr = formatDate(startDate);
      const selectedDateStr = formatDate(selectedDate);
      const endDateStr = formatDate(endDate);
      
      // 開始日または終了日が選択日と一致する場合は表示
      // サーバー側で既にフィルタリングされているため、ここでは表示する
      if (reservationDateStr !== selectedDateStr && endDateStr !== selectedDateStr) {
        console.log('🔍 [getReservationStyle] Reservation date mismatch:', reservation.id, 'reservation start:', reservationDateStr, 'reservation end:', endDateStr, 'selected:', selectedDateStr);
        return { display: 'none' };
      }
      
      let startSlot = getTimeSlot(startDate);
      let endSlot = getEndTimeSlot(endDate);
      
      // 日をまたぐ場合の処理
      if (reservationDateStr !== selectedDateStr) {
        // 開始日が選択日と異なる場合（前日から続く予約）、開始スロットを0に
        startSlot = 0;
      }
      
      if (endDateStr !== selectedDateStr) {
        // 終了日が選択日と異なる場合（翌日に続く予約）、終了スロットを96に
        endSlot = 96; // その日の終わりまで表示
      }
      
      console.log('🔍 [getReservationStyle] Slots calculated:', { startSlot, endSlot, startHour: startDate.getHours(), startMinute: startDate.getMinutes(), reservationDate: reservationDateStr, selectedDate: selectedDateStr });
      
      // スロットが無効な場合は非表示
      if (startSlot < 0 || startSlot >= 96 || endSlot <= startSlot || endSlot > 96) {
        console.warn('🔍 [getReservationStyle] Invalid slot range for reservation:', reservation.id, startSlot, endSlot);
        return { display: 'none' };
      }
      
      // 固定設備セルの幅は300px、時間セルは20px幅
      const left = 300 + startSlot * 20;
      const width = (endSlot - startSlot) * 20;
      // 親要素（行）内での相対位置なので、行の高さ40pxに対して中央寄せ（2px下げる）
      const top = 2;
      
      console.log('🔍 [getReservationStyle] Style calculated:', { left, width, top });
      
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
      console.error('🔍 [getReservationStyle] Error calculating reservation style:', reservation.id, error, { startTimeStr, endTimeStr });
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
    <div className="equipment-schedule">
      {/* ヘッダー */}
      <div className="schedule-header" ref={headerRef}>
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
          <span style={{ fontSize: '18px', fontWeight: 'normal', color: '#666' }}>
            設備予約 - {selectedDate.toLocaleDateString('ja-JP', { 
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
              <button className="nav-btn active" onClick={() => (window.location.href = '/scheduleboard/equipment')}>設備</button>
            </div>
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
                  const equipmentId = parseInt(cellIds[0].split('-')[1]);
                  setSelectedEquipmentId(equipmentId);
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
              設備/時間
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
            {equipments.length === 0 ? (
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
                  <div>設備が登録されていません</div>
                  <div style={{ fontSize: '14px', marginTop: '8px', opacity: 0.7 }}>
                    管理画面から設備を登録してください
                  </div>
                </div>
              </div>
            ) : (
              equipments.map((equipment, equipmentIndex) => (
                <div key={equipment.id} className="excel-date-row" style={{
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
                    <div style={{ margin: 0 }}>{equipment.name}</div>
                  </div>

                  {/* 時間セル（96マス：15分間隔） */}
                  {Array.from({ length: 96 }, (_, slot) => {
                    const hour = Math.floor(slot / 4);
                    const minute = (slot % 4) * 15;
                    // ローカル選択状態と既存の選択状態の両方をチェック
                    const year = selectedDate.getFullYear();
                    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                    const day = String(selectedDate.getDate()).padStart(2, '0');
                    const localCellId = `${year}-${month}-${day}-equipment-${equipment.id}-${slot}`;
                    const legacyCellId = `equipment-${equipment.id}-${slot}`;
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
                        data-equipment-id={equipment.id}
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
                          handleEquipmentCellMouseDown(equipment.id, slot, e);
                        }}
                        onMouseEnter={() => {
                          if (localIsSelecting) {
                            handleEquipmentCellMouseEnter(equipment.id, slot);
                          }
                        }}
                        onMouseUp={handleEquipmentCellMouseUp}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          // 1セル選択時にモーダルを開く
                          const year = selectedDate.getFullYear();
                          const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
                          const day = String(selectedDate.getDate()).padStart(2, '0');
                          const cellId = `${year}-${month}-${day}-equipment-${equipment.id}-${slot}`;
                          
                          // このセルだけを選択状態にする
                          const singleCellId = `equipment-${equipment.id}-${slot}`;
                          setSelectedCells(new Set([singleCellId]));
                          setSelectedEquipmentId(equipment.id);
                          setSelectedSchedule(null);
                          setShowRegistrationModal(true);
                        }}
                        onDragStart={(e) => {
                          e.preventDefault(); // ブラウザのドラッグ&ドロップを無効化
                        }}
                        onSelectStart={(e) => {
                          e.preventDefault(); // テキスト選択開始を防ぐ
                        }}
                        title={`${equipment.name} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      />
                    );
                  })}

                  {/* 予約バー（月別ビューのロジックと統一） */}
                  {reservations
                    .filter(reservation => {
                      // 設備IDが一致するか
                      if (reservation.equipment_id !== equipment.id) {
                        console.log('🔍 [Filter] Reservation equipment_id mismatch:', reservation.id, reservation.equipment_id, 'vs', equipment.id);
                        return false;
                      }
                      
                      console.log('🔍 [Filter] Reservation passed equipment_id check:', reservation.id);
                      
                      // APIから取得したデータは既に選択した日付でフィルタリングされているため、
                      // フロントエンドでの追加フィルタリングは不要
                      // ただし、念のため日付の整合性を確認
                      try {
                        const startTimeStr = reservation.start_datetime;
                        if (!startTimeStr) {
                          console.warn('🔍 [Filter] Reservation missing start_datetime:', reservation.id);
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
                          console.warn('🔍 [Filter] Invalid date for reservation:', reservation.id, startTimeStr);
                          return false;
                        }
                        
                        console.log('🔍 [Filter] Reservation passed all checks:', reservation.id);
                        return true; // APIで既にフィルタリングされているため、常にtrueを返す
                      } catch (error) {
                        console.error('🔍 [Filter] Error processing reservation:', reservation.id, error, reservation);
                        return false;
                      }
                    })
                    .map(reservation => {
                      console.log('🔍 [Map] Rendering reservation:', reservation.id);
                      const schedule = reservationToSchedule(reservation);
                      const isSelected = selectedSchedule?.id === reservation.id;
                      const style = getReservationStyle(reservation, equipmentIndex);
                      console.log('🔍 [Map] Reservation style:', reservation.id, style);
                      
                      // 予約バーが非表示の場合はレンダリングしない
                      if (style.display === 'none') {
                        console.log('🔍 [Map] Reservation style is display:none, skipping render:', reservation.id);
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
                          className="equipment-reservation-bar"
                          data-reservation-id={reservation.id}
                          style={style}
                          onMouseDown={(e) => handleScheduleMouseDown(schedule, e)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedSchedule(reservation);
                            setShowRegistrationModal(true);
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
            setSelectedEquipmentId(null);
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
          equipments={equipments}
          defaultEquipmentId={selectedEquipmentId || equipments[0]?.id}
          initialValues={selectedSchedule ? {
            title: selectedSchedule.title,
            scheduleId: selectedSchedule.id
          } : undefined}
          onCreated={handleReservationSave}
        />
      )}
    </div>
  );
};

export default SimpleEquipmentReservation;
