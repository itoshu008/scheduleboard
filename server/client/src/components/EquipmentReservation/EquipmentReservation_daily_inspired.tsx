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
  createTimeFromSlot
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

// 共通フック（日別スケジュール参考）
import { useScheduleCellSelection } from '../../hooks/useScheduleCellSelection';
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
 * 設備予約スケジュール - 日別スケジュール参考版
 * 
 * 日別スケジュールの実装パターンを設備予約に適用：
 * - 共通フック（useScheduleCellSelection, useScheduleDragResize）を使用
 * - EventBarコンポーネントによる安定したドラッグ・リサイズ
 * - 設備×時間のマトリックス表示
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
  // 基本状態
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scheduleScale, setScheduleScale] = useState(1);
  const [isScaling, setIsScaling] = useState(false);
  
  // 共通フック（日別スケジュール参考）
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

  // モーダル状態
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [showScheduleAction, setShowScheduleAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  const [showManagementTabs, setShowManagementTabs] = useState(false);
  const [currentRegistrationView, setCurrentRegistrationView] = useState<string | null>(null);
  
  // 選択確定処理の安定化
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
      
      // 設備予約用のデータ形式に変換
      const equipmentReservationData = {
        purpose: updateData.title || updateData.purpose || '予約',
        color: updateData.color,
        employee_id: updateData.employee_id,
        equipment_id: updateData.equipment_ids?.[0] || updateData.equipment_id,
        start_datetime: updateData.start_datetime instanceof Date 
          ? toLocalISODateTime(updateData.start_datetime)
          : updateData.start_datetime,
        end_datetime: updateData.end_datetime instanceof Date 
          ? toLocalISODateTime(updateData.end_datetime)
          : updateData.end_datetime
      };
      
      await updateEquipmentReservation(scheduleId, equipmentReservationData);
    },
    onReloadSchedules: async () => {
      await loadReservations();
    },
    employees: equipments.map(eq => ({ id: eq.id, name: eq.name })), // 設備を社員として扱う
    getEmployeeIdFromDelta: getEquipmentIdFromDelta
  });

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);

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
      setReservations(Array.isArray(response.data) ? response.data : []);
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

  // セル選択処理（日別スケジュール参考）
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
    
    // セル選択確定処理
    if (selectedCells.size > 0) {
      const selectedCellsArray = Array.from(selectedCells);
      const employeeIds = Array.from(new Set(selectedCellsArray.map(cellId => {
        const [slotStr, empIdStr] = cellId.split('-');
        return parseInt(empIdStr);
      })));
      const slots = selectedCellsArray.map(cellId => {
        const [slotStr] = cellId.split('-');
        return parseInt(slotStr);
      });
      
      const minSlot = Math.min(...slots);
      const maxSlot = Math.max(...slots);
      
      const startDateTime = new Date(selectedDate);
      const { hour: startHour, minute: startMinute } = getTimeFromSlot(minSlot);
      startDateTime.setHours(startHour, startMinute, 0, 0);
      
      const endDateTime = new Date(selectedDate);
      const { hour: endHour, minute: endMinute } = getTimeFromSlot(maxSlot + 1);
      endDateTime.setHours(endHour, endMinute, 0, 0);
      
      setSelectionSnapshot({
        startDateTime,
        endDateTime,
        equipmentId: employeeIds[0],
        equipmentName: equipments.find(eq => eq.id === employeeIds[0])?.name
      });
      
      setShowRegistrationTab(true);
      setIsModalOpen(true);
    }
  }, [commonHandleCellDoubleClick, selectedCells, selectedDate, equipments]);

  // スケール変更処理
  const handleScaleChange = useCallback((newScale: number) => {
    setIsScaling(true);
    setScheduleScale(newScale);
    setTimeout(() => setIsScaling(false), 100);
  }, []);

  // 予約をSchedule型に変換
  const convertReservationToSchedule = (reservation: any): Schedule => ({
    id: reservation.id,
    title: reservation.title || reservation.purpose || '予約',
    color: reservation.color || '#dc3545',
    start_datetime: reservation.start_datetime,
    end_datetime: reservation.end_datetime,
    employee_id: reservation.employee_id,
    equipment_ids: [reservation.equipment_id],
    created_at: reservation.created_at || new Date().toISOString(),
    updated_at: reservation.updated_at || new Date().toISOString()
  });

  return (
    <div className="equipment-reservation">
      {/* スケール制御 */}
      <div className="scale-control-container" style={{ position: 'fixed', top: 10, right: 10, zIndex: 1000 }}>
        <ScaleControl
          scale={scheduleScale}
          onScaleChange={handleScaleChange}
        />
      </div>

      <div className="daily-schedule" ref={gridRef}>
        <div className="schedule-table-container" ref={tableContainerRef}>
          <table className="schedule-table" role="presentation">
            <thead ref={headerRef}>
              <tr>
                <th className="date-column" style={{ width: '120px' }}>設備/時間</th>
                {Array.from({ length: 24 }, (_, hour) => (
                  <th key={hour} className="time-column" colSpan={4} style={{ width: `${80 * scheduleScale}px` }}>
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equipments.map((equipment, equipmentIndex) => (
                <tr key={`equipment-${equipment.id}`} className="employee-row" data-employee-id={equipment.id}>
                  <td className="date-cell" style={{ width: '120px', height: '40px' }}>
                    <div className="employee-name" style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      height: '100%',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>
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
                        key={`cell-${equipment.id}-${slot}`}
                        className={`schedule-cell ${isSelected ? 'selected' : ''} ${minute === 0 ? 'hour-border' : ''}`}
                        style={{ 
                          width: `${CELL_WIDTH_PX * scheduleScale}px`, 
                          height: '40px',
                          position: 'relative'
                        }}
                        data-employee-id={equipment.id}
                        data-slot={slot}
                        data-time={`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return; // 左クリック以外はセル選択無効化
                          
                          // EventBar（schedule-item）がクリックされた場合はセル選択をスキップ
                          const target = e.target as HTMLElement;
                          const scheduleItem = target.closest('.schedule-item');
                          if (scheduleItem) {
                            console.log('🚫 セルのonMouseDown: EventBarがクリックされたためスキップ');
                            return;
                          }
                          
                          e.stopPropagation();
                          handleCellMouseDown(equipment.id, slot);
                        }}
                        onMouseEnter={(e) => {
                          // EventBar（schedule-item）がホバーされた場合はセル選択をスキップ
                          const target = e.target as HTMLElement;
                          const scheduleItem = target.closest('.schedule-item');
                          if (scheduleItem) {
                            return;
                          }
                          
                          handleCellMouseEnter(equipment.id, slot);
                        }}
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
            // ドラッグ中のスケジュールは非表示
            if (newDragData && newDragData.schedule.id === reservation.id) {
              return null;
            }
            
            // リサイズ中のスケジュールは非表示
            if (newIsResizing && newResizeData && newResizeData.schedule.id === reservation.id) {
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
            
            const leftPosition = 120 + startSlot * (CELL_WIDTH_PX * scheduleScale);
            const barWidth = (endSlot - startSlot) * (CELL_WIDTH_PX * scheduleScale);
            const topPosition = 32 + equipmentIndex * 40;
            
            const schedule = convertReservationToSchedule(reservation);

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
                maxTimelinePx={120 + 96 * (CELL_WIDTH_PX * scheduleScale)}
                maxLaneIndex={equipments.length > 0 ? equipments.length - 1 : 0}
                fontSize={10}
                isSelected={selectedSchedule?.id === reservation.id}
                snapSizeX={CELL_WIDTH_PX * scheduleScale}
                containerSelector=".schedule-table-container"
                headerHeightPx={32}
                dateColumnWidthPx={120}
                onMove={(id, newStartPx, newLaneIndex) => {
                  console.log('🎯 EventBar onMove:', { id, newStartPx, newLaneIndex });
                }}
                onMoveCommit={async (id, newStartPx, newLaneIndex) => {
                  console.log('🎯 EventBar onMoveCommit:', { id, newStartPx, newLaneIndex });
                  // ドラッグ・リサイズフックが処理
                }}
                onResize={(id, newWidthPx, newStartPx) => {
                  console.log('🎯 EventBar onResize:', { id, newWidthPx, newStartPx });
                }}
                onResizeCommit={async (id, newWidthPx, newStartPx) => {
                  console.log('🎯 EventBar onResizeCommit:', { id, newWidthPx, newStartPx });
                  // ドラッグ・リサイズフックが処理
                }}
                onClick={(e, schedule) => {
                  console.log('🎯 EventBar onClick:', { scheduleId: schedule.id });
                  setSelectedSchedule(schedule);
                }}
                onDoubleClick={(e, schedule) => {
                  console.log('🎯 EventBar onDoubleClick:', { scheduleId: schedule.id });
                  // 編集モーダルを表示
                  setSelectionSnapshot({
                    startDateTime: new Date(schedule.start_datetime),
                    endDateTime: new Date(schedule.end_datetime),
                    equipmentId: schedule.equipment_ids?.[0] || 0,
                    equipmentName: equipments.find(eq => eq.id === schedule.equipment_ids?.[0])?.name
                  });
                  setShowScheduleForm(true);
                  setIsModalOpen(true);
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

          {/* ドラッグゴースト表示 */}
          {newDragGhost && newDragData && (
            <div
              className="schedule-item drag-ghost"
              style={{
                position: 'absolute',
                left: `${120 + newDragGhost.newSlot * (CELL_WIDTH_PX * scheduleScale)}px`,
                top: `${32 + Math.max(0, Math.min(equipments.length - 1, equipments.findIndex(eq => eq.id === newDragData.originalEmployeeId) + (newDragGhost.newEmployeeDelta || 0))) * 40}px`,
                width: `${((new Date(newDragGhost.schedule.end_datetime).getTime() - new Date(newDragGhost.schedule.start_datetime).getTime()) / (15 * 60 * 1000)) * (CELL_WIDTH_PX * scheduleScale)}px`,
                height: '36px',
                background: `linear-gradient(180deg, ${lightenColor(newDragGhost.schedule.color, 25)} 0%, ${newDragGhost.schedule.color} 100%)`,
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
                {newDragGhost.schedule.title}
              </div>
              <div style={{ fontSize: 8, opacity: 0.9, textAlign: 'center' }}>
                移動中...
              </div>
            </div>
          )}

          {/* リサイズゴースト表示 */}
          {newResizeGhost && (
            <div
              className="schedule-item resize-ghost"
              style={{
                position: 'absolute',
                left: `${120 + getTimeSlot(newResizeGhost.newStart) * (CELL_WIDTH_PX * scheduleScale)}px`,
                top: `${32 + (equipments.findIndex(eq => eq.id === newResizeGhost.schedule.equipment_ids?.[0]) * 40)}px`,
                width: `${((newResizeGhost.newEnd.getTime() - newResizeGhost.newStart.getTime()) / (15 * 60 * 1000)) * (CELL_WIDTH_PX * scheduleScale)}px`,
                height: '36px',
                background: `linear-gradient(180deg, ${lightenColor(newResizeGhost.schedule.color, 25)} 0%, ${newResizeGhost.schedule.color} 100%)`,
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
                {newResizeGhost.schedule.title}
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
          cellWidth={CELL_WIDTH_PX * scheduleScale}
          timeColumnWidth={120}
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
          zIndex: 10000,
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
              reservations={reservations}
              initialValues={{
                equipmentId: selectionSnapshot.equipmentId,
                startTime: selectionSnapshot.startDateTime.toTimeString().slice(0, 5),
                endTime: selectionSnapshot.endDateTime.toTimeString().slice(0, 5),
                purpose: ''
              }}
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
      {showScheduleForm && isModalOpen && selectionSnapshot && (
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
            setShowScheduleForm(false);
            setIsModalOpen(false);
            setSelectionSnapshot(null);
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
              initialValues={{
                reservationId: selectedSchedule?.id,
                equipmentId: selectionSnapshot.equipmentId,
                startTime: selectionSnapshot.startDateTime.toTimeString().slice(0, 5),
                endTime: selectionSnapshot.endDateTime.toTimeString().slice(0, 5),
                purpose: selectedSchedule?.title || ''
              }}
              onClose={() => {
                setShowScheduleForm(false);
                setIsModalOpen(false);
                setSelectionSnapshot(null);
              }}
              onSave={() => {
                setShowScheduleForm(false);
                setIsModalOpen(false);
                setSelectionSnapshot(null);
                loadReservations();
              }}
            />
          </div>
        </div>
      )}

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
    </div>
  );
};

export default EquipmentReservation;