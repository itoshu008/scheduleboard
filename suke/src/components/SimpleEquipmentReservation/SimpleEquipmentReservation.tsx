import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Equipment, Employee } from '../../types';
import { api } from '../../api';
import dayjs from 'dayjs';
import { formatDate, getTimeSlot, getTimeFromSlot, getEndTimeSlot } from '../../utils/dateUtils';
import { CELL_WIDTH_PX } from '../../utils/uiConstants';
import ScheduleRegistrationModal from '../ScheduleRegistrationModal/ScheduleRegistrationModal';
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
// 月別ビューのイベントバー処理ロジックを使用（勤怠アプリに影響を与えないよう、ScheduleBoard専用APIのみ使用）
import { useMonthlyEventBarHandlers } from '../../hooks/useMonthlyEventBarHandlers';
import { safeHexColor, lightenColor, toApiColor } from '../../utils/color';
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
      setReservations(response.data || []);
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
    setSelectedSchedule: (schedule: any) => setSelectedSchedule(schedule),
    setSelectedCells
  });

  // 月別ビューのロジックと互換性を保つため、既存の変数名をエイリアス
  const dragData = interactionState.dragData;
  const dragGhost = interactionState.dragGhost;
  const resizeData = interactionState.resizeData;
  const resizeGhost = interactionState.resizeGhost;

  // セルクリック処理（セル選択フックを使用）
  const handleCellClick = (equipmentId: number, slot: number) => {
    const cellId = `equipment-${equipmentId}-${slot}`;
    const newSelectedCells = new Set(selectedCells);
    
    if (selectedCells.has(cellId)) {
      newSelectedCells.delete(cellId);
    } else {
      newSelectedCells.add(cellId);
    }
    
    setSelectedCells(newSelectedCells);
  };

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
      start_datetime: reservation.start_datetime,
      end_datetime: reservation.end_datetime,
      color: reservation.color || '#dc3545'
    };
  }, []);

  // 予約の表示位置を計算（月別ビューのロジックと統一）
  const getReservationStyle = (reservation: Reservation, equipmentIndex: number) => {
    const startTime = dayjs(reservation.start_datetime);
    const endTime = dayjs(reservation.end_datetime);
    
    const startSlot = getTimeSlot(startTime.toDate());
    const endSlot = getEndTimeSlot(endTime.toDate());
    
    const left = 80 + startSlot * 20;
    const width = (endSlot - startSlot) * 20;
    const top = 40 + equipmentIndex * 40;
    
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
            minWidth: `${80 + 96 * 20}px`
          }}>
            {/* 左上の空白セル */}
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
              minWidth: `${80 + 96 * 20}px`
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
                    lineHeight: '1.1',
                    borderRight: '2px solid #999'
                  }}>
                    <div style={{ margin: 0 }}>{equipment.name}</div>
                  </div>

                  {/* 時間セル（96マス：15分間隔） */}
                  {Array.from({ length: 96 }, (_, slot) => {
                    const hour = Math.floor(slot / 4);
                    const minute = (slot % 4) * 15;
                    const cellId = `equipment-${equipment.id}-${slot}`;
                    const isSelected = selectedCells.has(cellId);
                    const isHourBorder = minute === 0;

                    return (
                      <div
                        key={slot}
                        className={`time-cell-15min ${isSelected ? 'selected' : ''} ${isHourBorder ? 'hour-border' : ''}`}
                        style={{
                          width: '20px',
                          height: '40px',
                          border: '1px solid #eee',
                          borderLeft: isHourBorder ? '2px solid #999' : '1px solid #ccc',
                          backgroundColor: isSelected ? '#007bff' : 'white',
                          cursor: 'pointer',
                          opacity: isSelected ? 0.7 : 1,
                          transition: 'background-color 0.2s ease'
                        }}
                        onClick={() => handleCellClick(equipment.id, slot)}
                        title={`${equipment.name} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                      />
                    );
                  })}

                  {/* 予約バー（月別ビューのロジックと統一） */}
                  {reservations
                    .filter(reservation => reservation.equipment_id === equipment.id)
                    .map(reservation => {
                      const schedule = reservationToSchedule(reservation);
                      const isSelected = selectedSchedule?.id === reservation.id;
                      
                      return (
                        <div
                          key={reservation.id}
                          style={getReservationStyle(reservation, equipmentIndex)}
                          onMouseDown={(e) => handleScheduleMouseDown(schedule, e)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setSelectedSchedule(reservation);
                            setShowRegistrationModal(true);
                          }}
                          title={`${reservation.title} (${dayjs(reservation.start_datetime).format('HH:mm')}-${dayjs(reservation.end_datetime).format('HH:mm')}) ${reservation.employee_name || ''}`}
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
