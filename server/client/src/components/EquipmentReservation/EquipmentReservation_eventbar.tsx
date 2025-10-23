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
import EventBar from '../EventBar/EventBar';
import { safeHexColor, lightenColor } from '../../utils/color';
import EquipmentScheduleForm from '../EquipmentScheduleForm/EquipmentScheduleForm';
import './EquipmentReservation.css';

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
    e.preventDefault();
    e.stopPropagation();
    
    setSelecting({
      equipmentId,
      anchorSlot: slot,
      endSlot: slot
    });
    
    const cellId = `${slot}-${equipmentId}`;
    setSelectedCells(new Set([cellId]));
  }, []);

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

          {/* EventBarを使用した予約バー表示 */}
          {reservations.map((reservation, reservationIndex) => {
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
              <EventBar
                key={`event-bar-${reservation.id}-${reservationIndex}`}
                schedule={schedule}
                startPx={leftPosition}
                widthPx={barWidth}
                height={36}
                topPx={topPosition}
                laneIndex={equipmentIndex}
                laneHeight={40}
                maxTimelinePx={1920} // 96スロット × 20px = 1920px
                maxLaneIndex={equipments.length > 0 ? equipments.length - 1 : 0}
                fontSize={10}
                isSelected={selectedSchedule?.id === reservation.id}
                snapSizeX={20}
                containerSelector=".excel-schedule-container"
                headerHeightPx={32}
                dateColumnWidthPx={200}
                onMove={(id, newStartPx, newLaneIndex) => {
                  console.log('🎯 EventBar onMove:', { id, newStartPx, newLaneIndex });
                }}
                onMoveCommit={async (id, newStartPx, newLaneIndex) => {
                  console.log('🎯 EventBar onMoveCommit:', { id, newStartPx, newLaneIndex });
                  try {
                    // 新しい時間を計算
                    const newStartSlot = Math.round(newStartPx / 20);
                    const newStartTime = createTimeFromSlot(selectedDate, newStartSlot);
                    const startTime = new Date(reservation.start_datetime);
                    const endTime = new Date(reservation.end_datetime);
                    const duration = endTime.getTime() - startTime.getTime();
                    const newEndTime = new Date(newStartTime.getTime() + duration);
                    
                    // 新しい設備IDを取得
                    const targetEquipment = equipments[newLaneIndex];
                    if (!targetEquipment) return;
                    
                    const updatePayload = {
                      purpose: reservation.purpose || reservation.title || '予約',
                      start_datetime: toLocalISODateTime(newStartTime),
                      end_datetime: toLocalISODateTime(newEndTime),
                      equipment_id: targetEquipment.id,
                      employee_id: reservation.employee_id,
                      color: reservation.color
                    };
                    
                    await updateEquipmentReservation(id, updatePayload);
                    console.log('✅ Move update successful');
                    await loadReservations();
                  } catch (error) {
                    console.error('❌ Move update failed:', error);
                  }
                }}
                onResize={(id, newWidthPx, newStartPx) => {
                  console.log('🎯 EventBar onResize:', { id, newWidthPx, newStartPx });
                }}
                onResizeCommit={async (id, newWidthPx, newStartPx) => {
                  console.log('🎯 EventBar onResizeCommit:', { id, newWidthPx, newStartPx });
                  try {
                    // 新しい時間を計算
                    const newStartSlot = Math.round(newStartPx / 20);
                    const newEndSlot = Math.round((newStartPx + newWidthPx) / 20);
                    
                    // 最小幅の制約（15分 = 1スロット）
                    if (newEndSlot - newStartSlot < 1) {
                      console.log('🚫 Equipment reservation: Minimum width constraint');
                      return;
                    }
                    
                    const newStartTime = createTimeFromSlot(selectedDate, newStartSlot);
                    const newEndTime = createTimeFromSlot(selectedDate, newEndSlot);
                    
                    const updatePayload = {
                      purpose: reservation.purpose || reservation.title || '予約',
                      start_datetime: toLocalISODateTime(newStartTime),
                      end_datetime: toLocalISODateTime(newEndTime),
                      equipment_id: reservation.equipment_id,
                      employee_id: reservation.employee_id,
                      color: reservation.color
                    };
                    
                    await updateEquipmentReservation(id, updatePayload);
                    console.log('✅ Resize update successful');
                    await loadReservations();
                  } catch (error) {
                    console.error('❌ Resize update failed:', error);
                  }
                }}
                onClick={(e, schedule) => {
                  console.log('🎯 EventBar onClick:', { scheduleId: schedule.id });
                  setSelectedSchedule(schedule);
                }}
                onDoubleClick={(e, schedule) => {
                  console.log('🎯 EventBar onDoubleClick:', { scheduleId: schedule.id });
                  handleReservationDoubleClick(schedule, e);
                }}
                onContextMenu={(e, schedule) => {
                  console.log('🎯 EventBar onContextMenu:', { scheduleId: schedule.id });
                }}
                debug={false}
                showGhost={false}
                ghostOpacity={0.8}
              />
            );
          })}
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