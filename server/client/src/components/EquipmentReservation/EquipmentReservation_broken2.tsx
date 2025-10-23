import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { api, updateEquipmentReservation, createEquipmentReservation } from '../../api';
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
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
import { markOverlappingSchedules } from '../../utils/overlapUtils';
import { safeHexColor, lightenColor } from '../../utils/color';
import EquipmentScheduleForm from '../EquipmentScheduleForm/EquipmentScheduleForm';
import './EquipmentReservation.css';

// 日別スケジュール風のドラッグ・リサイズ機能
interface DragData {
  schedule: any;
  startX: number;
  startY: number;
  startSlot: number;
  startDate: Date;
  originalEquipmentId: number;
}

interface DragGhost {
  schedule: any;
  newSlot: number;
  newDate: Date;
  newEquipmentDelta?: number;
  deltaX: number;
  deltaY: number;
}

interface ResizeData {
  schedule: any;
  edge: 'start' | 'end';
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

interface ResizeGhost {
  schedule: any;
  newStart: Date;
  newEnd: Date;
  edge: 'start' | 'end';
}

type ModalInitialValues = {
  title?: string;
  description?: string;
  color?: string;
  start_datetime?: string;
  end_datetime?: string;
  employee_id?: number;
  equipment_id?: number;
  purpose?: string;
  id?: number;
};

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
  // 基本状態
  const [reservations, setReservations] = useState<any[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // ドラッグ・リサイズ状態（日別スケジュール参考）
  const [dragData, setDragData] = useState<DragData | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
  const [resizeData, setResizeData] = useState<ResizeData | null>(null);
  const [resizeGhost, setResizeGhost] = useState<ResizeGhost | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const isDragging = !!dragData;

  // セル選択状態
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState<null | {
    equipmentId: number;
    anchorSlot: number;
    endSlot: number;
  }>(null);

  // モーダル状態
  const [modalInitialValues, setModalInitialValues] = useState<ModalInitialValues>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 設備予約データの読み込み
  const loadReservations = useCallback(async () => {
    try {
      console.log('🔍 EquipmentReservation: Loading reservations for date:', selectedDate);
      
      const response = await api.get('/equipment-reservations', {
        params: {
          date: selectedDate.toISOString().split('T')[0]
        }
      });
      
      console.log('📊 Equipment reservations loaded:', response.data?.length || 0);
      setReservations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('❌ Failed to load equipment reservations:', error);
      setReservations([]);
    }
  }, [selectedDate]);

  // 初期データ読み込み
  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // スケジュールドラッグ開始
  const handleScheduleMouseDown = useCallback((schedule: any, e: React.MouseEvent) => {
    if ((e as any).button === 2) return; // 右クリック時は無効化
    if ((e as any).detail && (e as any).detail > 1) return; // ダブルクリック時は無効化
    
    // リサイズハンドル上ではドラッグ操作を無効
    const target = e.target as HTMLElement;
    if (target && target.classList && target.classList.contains('resize-handle')) {
      return;
    }
    
    // リサイズ中はドラッグ操作を無効
    if (isResizing || resizeData) {
      return;
    }
    
    e.stopPropagation();
    
    console.log('🚚 ドラッグ開始:', { scheduleId: schedule.id, title: schedule.title });
    
    // ドラッグ開始
    const startTime = new Date(schedule.start_datetime);
    const startSlot = getTimeSlot(startTime);
    const startDate = new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
    
    setDragData({
      schedule,
      startX: e.clientX,
      startY: e.clientY,
      startSlot,
      startDate,
      originalEquipmentId: schedule.equipment_ids?.[0] || 0
    });
    
    // マウスカーソルを変更
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }, [isResizing, resizeData]);

  // リサイズ開始
  const handleResizeMouseDown = useCallback((schedule: any, edge: 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation();
    
    console.log('📏 リサイズ開始:', { scheduleId: schedule.id, edge });
    
    const originalStart = new Date(schedule.start_datetime);
    const originalEnd = new Date(schedule.end_datetime);
    
    setResizeData({
      schedule,
      edge,
      startX: e.clientX,
      originalStart,
      originalEnd
    });
    
    setIsResizing(true);
    
    // マウスカーソルを変更
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // マウス移動処理
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      // ドラッグ処理
      if (dragData) {
        const deltaX = e.clientX - dragData.startX;
        const deltaY = e.clientY - dragData.startY;
        
        // 新しいスロット位置を計算
        const newSlot = Math.max(0, Math.min(95, dragData.startSlot + Math.round(deltaX / CELL_WIDTH_PX)));
        
        // 新しい設備位置を計算
        const equipmentDelta = Math.round(deltaY / 40);
        
        setDragGhost({
          schedule: dragData.schedule,
          newSlot,
          newDate: dragData.startDate,
          newEquipmentDelta: equipmentDelta,
          deltaX,
          deltaY
        });
      }
      
      // リサイズ処理
      if (resizeData) {
        const deltaX = e.clientX - resizeData.startX;
        const slotDelta = Math.round(deltaX / CELL_WIDTH_PX);
        
        let newStart = new Date(resizeData.originalStart);
        let newEnd = new Date(resizeData.originalEnd);
        
        if (resizeData.edge === 'start') {
          const startTime = getTimeFromSlot(getTimeSlot(resizeData.originalStart) + slotDelta);
          newStart = new Date(resizeData.originalStart.getFullYear(), resizeData.originalStart.getMonth(), resizeData.originalStart.getDate(), startTime.hour, startTime.minute);
          
          // 最小15分の制約
          if (newStart >= resizeData.originalEnd) {
            newStart = new Date(resizeData.originalEnd.getTime() - 15 * 60 * 1000);
          }
        } else {
          const endTime = getTimeFromSlot(getTimeSlot(resizeData.originalEnd) + slotDelta);
          newEnd = new Date(resizeData.originalEnd.getFullYear(), resizeData.originalEnd.getMonth(), resizeData.originalEnd.getDate(), endTime.hour, endTime.minute);
          
          // 最小15分の制約
          if (newEnd <= resizeData.originalStart) {
            newEnd = new Date(resizeData.originalStart.getTime() + 15 * 60 * 1000);
          }
        }
        
        setResizeGhost({
          schedule: resizeData.schedule,
          newStart,
          newEnd,
          edge: resizeData.edge
        });
      }
    });
  }, [dragData, resizeData]);

  // マウスアップ処理
  const handleMouseUp = useCallback(async () => {
    try {
      // ドラッグ完了処理
      if (dragData && dragGhost) {
        console.log('🚚 ドラッグ完了:', { scheduleId: dragData.schedule.id });
        
        // 新しい時間を計算
        const duration = new Date(dragData.schedule.end_datetime).getTime() - new Date(dragData.schedule.start_datetime).getTime();
        const newStartTime = createTimeFromSlot(selectedDate, dragGhost.newSlot);
        const newEndTime = new Date(newStartTime.getTime() + duration);
        
        // 新しい設備IDを計算
        const currentEquipmentIndex = equipments.findIndex(eq => eq.id === dragData.originalEquipmentId);
        const newEquipmentIndex = Math.max(0, Math.min(equipments.length - 1, currentEquipmentIndex + (dragGhost.newEquipmentDelta || 0)));
        const newEquipmentId = equipments[newEquipmentIndex]?.id || dragData.originalEquipmentId;
        
        const updatePayload = {
          purpose: dragData.schedule.title || dragData.schedule.purpose || '予約',
          start_datetime: toLocalISODateTime(newStartTime),
          end_datetime: toLocalISODateTime(newEndTime),
          equipment_id: newEquipmentId,
          employee_id: dragData.schedule.employee_id,
          color: dragData.schedule.color
        };
        
        await updateEquipmentReservation(dragData.schedule.id, updatePayload);
        console.log('✅ ドラッグ更新成功');
      await loadReservations();
      }
      
      // リサイズ完了処理
      if (resizeData && resizeGhost) {
        console.log('📏 リサイズ完了:', { scheduleId: resizeData.schedule.id });
        
        const updatePayload = {
          purpose: resizeData.schedule.title || resizeData.schedule.purpose || '予約',
          start_datetime: toLocalISODateTime(resizeGhost.newStart),
          end_datetime: toLocalISODateTime(resizeGhost.newEnd),
          equipment_id: resizeData.schedule.equipment_ids?.[0] || resizeData.schedule.equipment_id,
          employee_id: resizeData.schedule.employee_id,
          color: resizeData.schedule.color
        };
        
        await updateEquipmentReservation(resizeData.schedule.id, updatePayload);
        console.log('✅ リサイズ更新成功');
        await loadReservations();
      }
      
    } catch (error) {
      console.error('❌ 更新エラー:', error);
    } finally {
      // 状態をクリア
      setDragData(null);
      setDragGhost(null);
      setResizeData(null);
      setResizeGhost(null);
      setIsResizing(false);
      
      // カーソルを戻す
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [dragData, dragGhost, resizeData, resizeGhost, equipments, selectedDate, loadReservations]);

  // グローバルマウスイベント
  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
    return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // 予約ダブルクリック処理
  const handleReservationDoubleClick = useCallback((schedule: any, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🖱️ 予約ダブルクリック:', schedule);
    
    setModalInitialValues({
      id: schedule.id,
      title: schedule.title || schedule.purpose,
      description: schedule.description || '',
      color: schedule.color || '#dc3545',
      start_datetime: schedule.start_datetime,
      end_datetime: schedule.end_datetime,
      employee_id: schedule.employee_id,
      equipment_id: schedule.equipment_ids?.[0] || schedule.equipment_id,
      purpose: schedule.purpose || schedule.title
    });
    setShowEditModal(true);
  }, []);

  // セル選択からの登録
  const openRegistrationFromCell = useCallback(() => {
    if (selectedCells.size === 0) return;
    
    const cellsArray = Array.from(selectedCells);
    const cellData = cellsArray.map(cellId => {
      const [colString, equipmentIdString] = cellId.split('-');
      return {
        col: parseInt(colString),
        equipmentId: parseInt(equipmentIdString)
      };
    });
    
    const minCol = Math.min(...cellData.map(c => c.col));
    const maxCol = Math.max(...cellData.map(c => c.col));
    const equipmentIds = Array.from(new Set(cellData.map(c => c.equipmentId)));
    
    const startTime = createTimeFromSlot(selectedDate, minCol);
    const endTime = createTimeFromSlot(selectedDate, maxCol + 1);
    
    setModalInitialValues({
      start_datetime: toLocalISODateTime(startTime),
      end_datetime: toLocalISODateTime(endTime),
      equipment_id: equipmentIds[0],
      color: SCHEDULE_COLORS[0]
    });
    setShowRegistrationTab(true);
  }, [selectedCells, selectedDate]);

  // セル選択処理
  const handleCellMouseDown = useCallback((equipmentId: number, slot: number, e: React.MouseEvent) => {
    if (isDragging || isResizing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setSelecting({
      equipmentId,
      anchorSlot: slot,
      endSlot: slot
    });
    
    const cellId = `${slot}-${equipmentId}`;
    setSelectedCells(new Set([cellId]));
  }, [isDragging, isResizing]);

  const handleCellMouseEnter = useCallback((equipmentId: number, slot: number) => {
    if (!selecting) return;
    
    const minSlot = Math.min(selecting.anchorSlot, slot);
    const maxSlot = Math.max(selecting.anchorSlot, slot);
    
    const newSelectedCells = new Set<string>();
    for (let s = minSlot; s <= maxSlot; s++) {
      newSelectedCells.add(`${s}-${equipmentId}`);
    }
    
    setSelectedCells(newSelectedCells);
    setSelecting(prev => prev ? { ...prev, endSlot: slot } : null);
  }, [selecting]);

  const handleCellMouseUp = useCallback(() => {
    if (selecting) {
      setSelecting(null);
      if (selectedCells.size > 0) {
        setTimeout(() => openRegistrationFromCell(), 100);
      }
    }
  }, [selecting, selectedCells, openRegistrationFromCell]);

  const handleCellDoubleClick = useCallback((equipmentId: number, slot: number) => {
    const cellId = `${slot}-${equipmentId}`;
    setSelectedCells(new Set([cellId]));
    openRegistrationFromCell();
  }, [openRegistrationFromCell]);

  return (
    <div className="equipment-reservation">
      <div className="excel-schedule-container" ref={gridRef}>
        <div className="excel-schedule-table-container" ref={tableContainerRef}>
          <table className="excel-schedule-table">
            <thead>
              <tr>
                <th className="date-cell-fixed">設備/時間</th>
                {Array.from({ length: 24 }, (_, hour) => (
                  <th key={hour} className="time-header" colSpan={4}>
                    {hour.toString().padStart(2, '0')}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipments.map((equipment, equipmentIndex) => (
                <tr key={equipment.id} className="equipment-row">
                  <td className="date-cell-fixed equipment-name-cell">
                    <div className="equipment-name-text">
                  {equipment.name}
          </div>
                  </td>
                  
                  {/* 時間セル（96個：15分間隔） */}
                {Array.from({ length: 96 }, (_, slot) => {
              const hour = Math.floor(slot / 4);
              const minute = (slot % 4) * 15;
                    const cellId = `${slot}-${equipment.id}`;
                    const isSelected = selectedCells.has(cellId);

                  return (
                      <td
                        key={`cell-${slot}`}
                        className={`quarter-hour-cell ${isSelected ? 'selected' : ''} ${minute === 0 ? 'hour-border' : ''}`}
                        data-col={slot}
                        data-equipment-id={equipment.id}
                  onMouseDown={(e) => handleCellMouseDown(equipment.id, slot, e)}
                  onMouseEnter={() => handleCellMouseEnter(equipment.id, slot)}
                        onMouseUp={handleCellMouseUp}
                  onDoubleClick={() => handleCellDoubleClick(equipment.id, slot)}
                      />
                      );
                    })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 予約バー表示 */}
          {reservations.map((reservation, reservationIndex) => {
          // ドラッグ中のスケジュールは非表示
            if (isDragging && dragData && dragData.schedule.id === reservation.id) {
            return null;
          }
          
            // リサイズ中のスケジュールは非表示
            if (isResizing && resizeData && resizeData.schedule.id === reservation.id) {
            return null;
          }
          
            // 時間をスロットに変換
            const startTime = new Date(reservation.start_datetime);
            const endTime = new Date(reservation.end_datetime);
          const startSlot = getTimeSlot(startTime);
          const endSlot = getEndTimeSlot(endTime);
          
          // 設備の行位置を取得
          const equipmentIndex = equipments.findIndex(eq => eq.id === reservation.equipment_id);
          if (equipmentIndex === -1) return null;
          
          const leftPosition = 200 + startSlot * 20; // 設備名列の幅 + スロット位置
            const barWidth = (endSlot - startSlot) * 20;
            const topPosition = 32 + equipmentIndex * 40; // ヘッダー高さ + 行位置
            
            const schedule = {
              id: reservation.id,
              title: reservation.title || reservation.purpose || '予約',
              color: reservation.color || '#dc3545',
              start_datetime: reservation.start_datetime,
              end_datetime: reservation.end_datetime,
              employee_id: reservation.employee_id,
              equipment_ids: [reservation.equipment_id],
              created_at: reservation.created_at || new Date().toISOString(),
              updated_at: reservation.updated_at || new Date().toISOString()
            };
          
          return (
              <div
                key={`schedule-bar-${reservation.id}`}
                className="schedule-item"
                style={{
                  position: 'absolute',
                  left: `${leftPosition}px`,
                  top: `${topPosition}px`,
                  width: `${barWidth}px`,
                  height: '36px',
                  background: `linear-gradient(180deg, ${lightenColor(schedule.color, 25)} 0%, ${schedule.color} 100%)`,
                  border: `1px solid ${lightenColor(schedule.color, -10)}`,
                  borderRadius: 4,
                  padding: '2px 4px',
                  fontSize: 10,
                  color: 'white',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  zIndex: selectedSchedule?.id === reservation.id ? 1000 : 100,
                  boxShadow: selectedSchedule?.id === reservation.id 
                    ? '0 0 0 2px rgba(37,99,235,0.5)' 
                    : '0 1px 3px rgba(0,0,0,0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseDown={(e) => handleScheduleMouseDown(schedule, e)}
                onClick={(e) => {
                e.stopPropagation();
                setSelectedSchedule(schedule);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleReservationDoubleClick(schedule, e);
                }}
              >
                <div style={{ fontWeight: 700, textAlign: 'center', lineHeight: '1.2' }}>
                  {schedule.title}
                </div>
                <div style={{ fontSize: 8, opacity: 0.9, textAlign: 'center' }}>
                  {formatTime(new Date(schedule.start_datetime))} - {formatTime(new Date(schedule.end_datetime))}
                </div>
                
                {/* リサイズハンドル */}
                <div
                  className="resize-handle resize-start"
                  onMouseDown={(e) => handleResizeMouseDown(schedule, 'start', e)}
                  style={{
                    position: 'absolute',
                    left: -4,
                    top: 0,
                    width: 8,
                    height: '100%',
                    cursor: 'ew-resize',
                    zIndex: 15,
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    borderRadius: '2px'
                  }}
                />
                <div
                  className="resize-handle resize-end"
                  onMouseDown={(e) => handleResizeMouseDown(schedule, 'end', e)}
                  style={{
                    position: 'absolute',
                    right: -4,
                    top: 0,
                    width: 8,
                    height: '100%',
                    cursor: 'ew-resize',
                    zIndex: 15,
                    backgroundColor: 'rgba(255, 255, 255, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    borderRadius: '2px'
                  }}
                />
              </div>
          );
        })}
            
          {/* ドラッグゴースト表示 */}
          {dragGhost && dragData && (
            <div
              className="schedule-item drag-ghost"
              style={{
                position: 'absolute',
                left: `${200 + dragGhost.newSlot * 20}px`,
                top: `${32 + Math.max(0, Math.min(equipments.length - 1, equipments.findIndex(eq => eq.id === dragData.originalEquipmentId) + (dragGhost.newEquipmentDelta || 0))) * 40}px`,
                width: `${((new Date(dragGhost.schedule.end_datetime).getTime() - new Date(dragGhost.schedule.start_datetime).getTime()) / (15 * 60 * 1000)) * 20}px`,
                height: '36px',
                background: `linear-gradient(180deg, ${lightenColor(dragGhost.schedule.color, 25)} 0%, ${dragGhost.schedule.color} 100%)`,
                border: '2px dashed rgba(255, 255, 255, 0.8)',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 10,
                color: 'white',
                overflow: 'hidden',
                zIndex: 2000,
                opacity: 0.8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <div style={{ fontWeight: 700, textAlign: 'center', lineHeight: '1.2' }}>
                {dragGhost.schedule.title}
              </div>
              <div style={{ fontSize: 8, opacity: 0.9, textAlign: 'center' }}>
                移動中...
              </div>
            </div>
          )}

          {/* リサイズゴースト表示 */}
          {resizeGhost && (
            <div
              className="schedule-item resize-ghost"
            style={{
              position: 'absolute',
                left: `${200 + getTimeSlot(resizeGhost.newStart) * 20}px`,
                top: `${32 + (equipments.findIndex(eq => eq.id === resizeGhost.schedule.equipment_ids?.[0]) * 40)}px`,
                width: `${((resizeGhost.newEnd.getTime() - resizeGhost.newStart.getTime()) / (15 * 60 * 1000)) * 20}px`,
                height: '36px',
                background: `linear-gradient(180deg, ${lightenColor(resizeGhost.schedule.color, 25)} 0%, ${resizeGhost.schedule.color} 100%)`,
                border: '2px dashed rgba(255, 255, 0, 0.8)',
                borderRadius: 4,
                padding: '2px 4px',
                fontSize: 10,
              color: 'white',
                overflow: 'hidden',
                zIndex: 2000,
                opacity: 0.8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <div style={{ fontWeight: 700, textAlign: 'center', lineHeight: '1.2' }}>
                {resizeGhost.schedule.title}
            </div>
              <div style={{ fontSize: 8, opacity: 0.9, textAlign: 'center' }}>
                リサイズ中...
            </div>
          </div>
        )}
        </div>
            
        {/* 現在時刻の赤い縦線 */}
            <CurrentTimeLineWrapper
              selectedDate={selectedDate}
              cellHeight={40}
          startHour={0}
          endHour={24}
              cellWidth={20}
          timeColumnWidth={200}
              pageType="equipment"
          gridContainerRef={gridRef}
        />
          </div>

      {/* 設備スケジュール登録フォーム（モーダル形式） */}
      {showRegistrationTab && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowRegistrationTab(false);
            setSelectedCells(new Set());
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
                reservations={reservations}
              initialValues={modalInitialValues}
                onClose={() => {
                  setShowRegistrationTab(false);
                  setSelectedCells(new Set());
                }}
              onSave={() => {
                  setShowRegistrationTab(false);
                  setSelectedCells(new Set());
                loadReservations();
                }}
              />
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEditModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowEditModal(false);
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
              reservations={reservations}
              initialValues={modalInitialValues}
              onClose={() => setShowEditModal(false)}
              onSave={() => {
                setShowEditModal(false);
                loadReservations();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentReservation;
