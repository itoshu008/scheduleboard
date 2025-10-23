import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Employee, Schedule, Department, Equipment, SCHEDULE_COLORS } from '../../types';
import { api } from '../../api';
import {
  toLocalISODateTime,
  formatTime,
  getTimeSlot,
  getEndTimeSlot,
  createTimeFromSlot
} from '../../utils/dateUtils';
import { lightenColor } from '../../utils/color';
import EquipmentScheduleForm from '../EquipmentScheduleForm/EquipmentScheduleForm';
import './EquipmentReservation.css';

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
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState<null | {
    equipmentId: number;
    anchorSlot: number;
    endSlot: number;
  }>(null);
  const [modalInitialValues, setModalInitialValues] = useState<any>({});
  const [showEditModal, setShowEditModal] = useState(false);

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);

  // 設備予約データの読み込み
  const loadReservations = useCallback(async () => {
    try {
      console.log('🔍 Loading reservations for date:', selectedDate);
      
      const response = await api.get('/equipment-reservations', {
        params: {
          date: selectedDate.toISOString().split('T')[0]
        }
      });
      
      console.log('📊 Reservations loaded:', response.data?.length || 0);
      setReservations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('❌ Failed to load reservations:', error);
      setReservations([]);
    }
  }, [selectedDate]);

  // 初期データ読み込み
  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

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

  // 予約ダブルクリック処理
  const handleReservationDoubleClick = useCallback((reservation: any, e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('🖱️ 予約ダブルクリック:', reservation);
    
    setModalInitialValues({
      id: reservation.id,
      title: reservation.title || reservation.purpose,
      start_datetime: reservation.start_datetime,
      end_datetime: reservation.end_datetime,
      employee_id: reservation.employee_id,
      equipment_id: reservation.equipment_id,
      purpose: reservation.purpose || reservation.title,
      color: reservation.color || '#dc3545'
    });
    setShowEditModal(true);
  }, []);

  return (
    <div className="equipment-reservation">
      <div className="excel-schedule-container" ref={gridRef}>
        <div className="excel-schedule-table-container">
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

          {/* シンプルな予約バー表示（ドラッグ・リサイズなし） */}
          {reservations.map((reservation) => {
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
            
            return (
              <div
                key={`reservation-${reservation.id}`}
                className="schedule-item"
                style={{
                  position: 'absolute',
                  left: `${leftPosition}px`,
                  top: `${topPosition}px`,
                  width: `${barWidth}px`,
                  height: '36px',
                  background: `linear-gradient(180deg, ${lightenColor(reservation.color || '#dc3545', 25)} 0%, ${reservation.color || '#dc3545'} 100%)`,
                  border: `1px solid ${lightenColor(reservation.color || '#dc3545', -10)}`,
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
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedSchedule(reservation);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleReservationDoubleClick(reservation, e);
                }}
              >
                <div style={{ fontWeight: 700, textAlign: 'center', lineHeight: '1.2' }}>
                  {reservation.title || reservation.purpose || '予約'}
                </div>
                <div style={{ fontSize: 8, opacity: 0.9, textAlign: 'center' }}>
                  {formatTime(new Date(reservation.start_datetime))} - {formatTime(new Date(reservation.end_datetime))}
                </div>
              </div>
            );
          })}
        </div>
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