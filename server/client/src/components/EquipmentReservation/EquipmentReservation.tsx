import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Equipment, Employee, Department, SCHEDULE_COLORS } from '../../types';
import { equipmentReservationApi, employeeApi, equipmentApi } from '../../utils/api';
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

import './EquipmentReservation.css';
import { CurrentTimeLineWrapper } from '../CurrentTimeLine/CurrentTimeLine';
import { markOverlappingSchedules } from '../../utils/overlapUtils';

interface EquipmentReservationProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  equipments: Equipment[];
}

const EquipmentReservation: React.FC<EquipmentReservationProps> = ({
  selectedDate,
  onDateChange,
  equipments: propEquipments
}) => {
  // 基本状態
  const [reservations, setReservations] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>(propEquipments || []);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 選択状態
  const [selectedReservation, setSelectedReservation] = useState<any | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<{ equipmentId: number; slot: number } | null>(null);

  // モーダル状態
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [showReservationAction, setShowReservationAction] = useState(false);
  const [showRegistrationTab, setShowRegistrationTab] = useState(false);
  
  // コンテキストメニュー状態
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  // リファレンス
  const gridRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  useEffect(() => {
    console.log('EquipmentReservation: showTemplateModal =', showTemplateModal);
  }, [showTemplateModal]);

  // データ読み込み関数
  const loadEquipments = useCallback(async () => {
    try {
      setLoading(true);
      console.log('EquipmentReservation: Loading equipments...');
      const response = await equipmentApi.getAll();
      console.log('EquipmentReservation: Equipment API response:', response);
      const equipmentData = Array.isArray(response.data) ? response.data : [];
      console.log('EquipmentReservation: Equipment data:', equipmentData);
      setEquipments(equipmentData);
    } catch (err) {
      console.error('設備データ読み込みエラー:', err);
      setError('設備データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEmployees = useCallback(async () => {
    try {
      const response = await employeeApi.getAll();
      setEmployees(Array.isArray(response.data) ? response.data : []);
        } catch (err) {
      console.error('社員データ読み込みエラー:', err);
    }
  }, []);

  const loadReservations = useCallback(async () => {
      try {
        const response = await equipmentReservationApi.getAll({
          start_date: formatDate(selectedDate),
          end_date: formatDate(selectedDate)
        });
        setReservations(markOverlappingSchedules(Array.isArray(response.data) ? response.data : []));
        } catch (err) {
      console.error('予約データ読み込みエラー:', err);
      setError('予約データの読み込みに失敗しました。');
    }
  }, [selectedDate]);

  // propsから設備データを更新
  useEffect(() => {
    console.log('EquipmentReservation: Props equipments changed:', propEquipments);
    if (propEquipments && propEquipments.length > 0) {
      setEquipments(propEquipments);
      } else {
      loadEquipments();
    }
  }, [propEquipments, loadEquipments]);

  // データ読み込み
  useEffect(() => {
    loadEmployees();
    loadReservations();
  }, [loadEmployees, loadReservations]);

  // セル選択関数
  const getCellId = (equipmentId: number, slot: number) => {
    return `${equipmentId}-${slot}`;
  };

  // セル選択機能（他のスケジュール画面と統一）
  const handleCellMouseDown = (equipmentId: number, slot: number) => {
    const cellId = getCellId(equipmentId, slot);
    setSelectedCells(new Set([cellId]));
    setSelectedReservation(null);

    setIsSelecting(true);
    setSelectionAnchor({ equipmentId, slot });
  };

  const handleCellMouseEnter = (equipmentId: number, slot: number) => {
    if (!isSelecting || !selectionAnchor) return;
    
    const newSelectedCells = new Set<string>();
    const startEquipment = Math.min(selectionAnchor.equipmentId, equipmentId);
    const endEquipment = Math.max(selectionAnchor.equipmentId, equipmentId);
    const startSlot = Math.min(selectionAnchor.slot, slot);
    const endSlot = Math.max(selectionAnchor.slot, slot);

    for (let eqId = startEquipment; eqId <= endEquipment; eqId++) {
      for (let s = startSlot; s <= endSlot; s++) {
        newSelectedCells.add(getCellId(eqId, s));
      }
    }
    
    setSelectedCells(newSelectedCells);
  };

  const handleCellMouseUp = () => {
    setIsSelecting(false);
    setSelectionAnchor(null);
    
    // 2セル以上選択時は登録タブ表示
    if (selectedCells.size >= 2) {
      setShowRegistrationTab(true);
    }
  };

  // セルダブルクリックで新規登録
  const handleCellDoubleClick = (equipmentId: number, slot: number) => {
    const cellId = getCellId(equipmentId, slot);
    setSelectedCells(new Set([cellId]));
    setSelectedReservation(null);
    setShowRegistrationTab(true);
  };

  // 時間スロット関数
  const getTimeFromSlotLocal = (slot: number) => {
    const hour = Math.floor(slot / 4);
    const minute = (slot % 4) * 15;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  };

  // モーダルハンドラー
  const handleScheduleSave = async (scheduleData: any) => {
    try {
      await equipmentReservationApi.update(selectedReservation.id, scheduleData);
      await loadReservations();
      setShowReservationForm(false);
      setSelectedReservation(null);
    } catch (err) {
      console.error('予約更新エラー:', err);
      alert('予約の更新に失敗しました。');
    }
  };

  const handleRegistrationSave = async (scheduleData: any) => {
    try {
      console.log('EquipmentReservation: handleRegistrationSave called with:', scheduleData);
      
      // ScheduleRegistrationModalからのデータを設備予約用に変換
      const createData = {
        equipment_id: 1, // 仮の設備ID（実際には選択された設備IDを使用）
        employee_id: scheduleData.employee_id,
        purpose: scheduleData.title, // titleをpurposeとして使用
        title: scheduleData.title,
        start_datetime: new Date(scheduleData.start_datetime),
        end_datetime: new Date(scheduleData.end_datetime),
        color: scheduleData.color || SCHEDULE_COLORS[0]
      };

      console.log('EquipmentReservation: Creating reservation with data:', createData);
      await equipmentReservationApi.create(createData);
      await loadReservations();
      setShowRegistrationTab(false);
      setSelectedCells(new Set());
    } catch (err) {
      console.error('予約作成エラー:', err);
      alert('予約の作成に失敗しました。');
    }
  };

  const handleContextMenuClose = () => {
    setContextMenuPosition(null);
  };

  if (loading) {
    return (
      <div className="equipment-reservation loading">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="equipment-reservation error">
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>再読み込み</button>
      </div>
    );
  }

  return (
    <div className="equipment-reservation">
      {/* ヘッダー（全社員と同仕様） */}
      <div className="schedule-header" ref={headerRef}>
        <h2 style={{ textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', margin: 0 }}>
          設備予約管理
          <span style={{ fontSize: '18px', fontWeight: 'normal', color: '#666' }}>
            {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            {" "}
            {new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </h2>
      </div>

      {/* ナビゲーションコントロール（全社員と同仕様） */}
      <div className="grid-top-controls" ref={controlsRef}>
        <div className="grid-controls-row">
          <div className="nav-btn-left">
            <button className="nav-btn" onClick={() => (window.location.href = '/monthly')}>月別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/daily')}>日別</button>
            <button className="nav-btn" onClick={() => (window.location.href = '/all-employees')}>全社員</button>
            <button className="nav-btn active" onClick={() => (window.location.href = '/equipment')}>設備</button>
          </div>
          <div className="nav-btn-right">
            <button className="nav-btn" onClick={() => setShowRegistrationTab(true)}>スケジュール登録</button>
            <button className="nav-btn management-btn" onClick={() => { console.log('EquipmentReservation: Open template modal click'); setShowTemplateModal(true); }} style={{ backgroundColor: 'red', color: 'white' }}>テンプレ管理</button>
          </div>
        </div>
        <div className="grid-controls-row-second">
          <div className="date-section">
            <span className="section-label">日付:</span>
            <div className="date-controls">
              <button className="date-nav-btn month-btn" onClick={() => onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, selectedDate.getDate()))} title="前月">&laquo;</button>
              <button className="date-nav-btn day-btn" onClick={() => onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() - 1))} title="前日">&lsaquo;</button>
              <input type="date" value={formatDate(selectedDate)} onChange={(e) => { const [y,m,d]=e.target.value.split('-').map(Number); onDateChange(new Date(y, m-1, d)); }} className="date-input" />
              <button className="date-nav-btn day-btn" onClick={() => onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + 1))} title="翌日">&rsaquo;</button>
              <button className="date-nav-btn month-btn" onClick={() => onDateChange(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate()))} title="翌月">&raquo;</button>
            </div>
          </div>
        </div>
      </div>

      {/* テンプレート登録モーダル */}
      <TemplateRegistrationModal
        isVisible={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onSuccess={() => setShowTemplateModal(false)}
      />

      {/* メインコンテンツ */}
      <div className="excel-schedule-container" style={{
            width: '100%',
        maxWidth: '98vw',
        height: 'calc(100vh - 180px)',
        overflow: 'scroll',
            position: 'relative',
        border: '1px solid #ccc'
      }}>
        {/* 時間ヘッダー */}
        <div style={{
          display: 'flex',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          backgroundColor: '#f5f5f5',
          borderBottom: '2px solid #333'
        }}>
          {/* 左上の固定セル */}
            <div style={{
              width: '200px',
            minWidth: '200px',
              height: '40px',
              backgroundColor: '#e0e0e0',
              border: '1px solid #ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              position: 'sticky',
              left: 0,
            zIndex: 101
          }}>
              設備/時間
                </div>
            
          {/* 時間ヘッダー */}
          {Array.from({ length: 24 }, (_, hour) => (
                  <div key={hour} style={{
              width: '80px',
              minWidth: '80px',
                    height: '40px',
              backgroundColor: '#4caf50',
              color: 'white',
              border: '1px solid #333',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
              fontSize: '11px'
            }}>
                    {`${hour.toString().padStart(2, '0')}:00`}
                  </div>
          ))}
                </div>
            
        {/* 設備行 */}
        {equipments.map((equipment, equipmentIndex) => {
          console.log('EquipmentReservation: Rendering equipment:', equipment);
          return (
          <div key={`equipment-${equipmentIndex}`} style={{
                display: 'flex',
                borderBottom: '1px solid #ccc',
                minHeight: '40px'
              }}>
            {/* 設備名セル */}
            <div style={{
                width: '200px',
                minWidth: '200px',
                maxWidth: '200px',
              backgroundColor: '#f8f9fa',
              border: '1px solid #dee2e6',
                display: 'flex',
                alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              position: 'sticky',
              left: 0,
              zIndex: 50
            }}>
              {equipment?.name || `設備${equipmentIndex + 1}`}
              </div>

            {/* 時間セル */}
                {Array.from({ length: 96 }, (_, slot) => {
              const cellId = getCellId(equipment.id, slot);
              const isSelected = selectedCells.has(cellId);
                  const hour = Math.floor(slot / 4);
                  const minute = (slot % 4) * 15;

                  return (
                    <div
                      key={`cell-${equipmentIndex}-${slot}`}
                      style={{
                    width: '20px',
                    minWidth: '20px',
                        height: '40px',
                    border: '1px solid #e0e0e0',
                    backgroundColor: isSelected ? '#e3f2fd' : '#fafafa',
                        cursor: 'pointer',
                    position: 'relative'
                  }}
                  onMouseDown={() => handleCellMouseDown(equipment.id, slot)}
                  onMouseEnter={() => handleCellMouseEnter(equipment.id, slot)}
                  onMouseUp={handleCellMouseUp}
                  onDoubleClick={() => handleCellDoubleClick(equipment.id, slot)}
                  title={`${equipment.name} - ${getTimeFromSlotLocal(slot)}`}
                >
                  {/* 予約アイテムをここに表示 */}
                  {reservations
                    .filter(reservation => reservation.equipment_id === equipment.id)
                    .map(reservation => {
                      // 予約の時間範囲がこのスロットに含まれるかチェック
                      const startTime = new Date(reservation.start_datetime);
                      const endTime = new Date(reservation.end_datetime);
                      const slotTime = new Date(selectedDate);
                      slotTime.setHours(hour, minute, 0, 0);
                      
                      if (slotTime >= startTime && slotTime < endTime) {
                            return (
                          <div
                            key={reservation.id}
                                  style={{ 
                                    position: 'absolute', 
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              backgroundColor: reservation.color || '#3174ad',
                              color: 'white',
                              fontSize: '10px',
                              padding: '2px',
                              overflow: 'hidden',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReservation(reservation);
                              setShowReservationForm(true);
                            }}
                            title={reservation.title}
                          >
                            {reservation.title}
                              </div>
                            );
                      }
                      return null;
                          })}
                    </div>
                      );
                    })}
              </div>
          );
        })}
            
        {/* 現在時刻ライン */}
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

      {/* モーダル */}
      {showReservationForm && selectedReservation && (
        <ScheduleFormModal
          schedule={selectedReservation as any}
          employee={employees.find(emp => emp.id === selectedReservation.employee_id)}
          colors={SCHEDULE_COLORS}
          onSave={handleScheduleSave}
          onCancel={() => {
            setShowReservationForm(false);
            setSelectedReservation(null);
          }}
        />
      )}

      {showRegistrationTab && (
        <ScheduleRegistrationModal
            selectedCells={selectedCells}
            employees={employees}
            selectedDate={selectedDate}
            colors={SCHEDULE_COLORS}
          initialData={null}
            onSave={handleRegistrationSave}
          onCancel={() => {
            setShowRegistrationTab(false);
            setSelectedCells(new Set());
          }}
        />
      )}

      {/* コンテキストメニュー */}
      {contextMenuPosition && (
      <ContextMenu
        position={contextMenuPosition}
          items={[
            { id: 'new-reservation', label: '新規予約', action: () => setShowRegistrationTab(true) },
            { id: 'close', label: '閉じる', action: handleContextMenuClose }
          ]}
        onClose={handleContextMenuClose}
      />
      )}
    </div>
  );
};

export default EquipmentReservation;
