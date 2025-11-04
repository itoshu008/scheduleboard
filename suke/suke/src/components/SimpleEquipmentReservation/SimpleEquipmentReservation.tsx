import React, { useState, useEffect } from 'react';
import { Equipment, Employee } from '../../types';
import { api } from '../../api';
import dayjs from 'dayjs';

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
}

const SimpleEquipmentReservation: React.FC<SimpleEquipmentReservationProps> = ({
  selectedDate,
  onDateChange,
  equipments
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    equipment_id: 1,
    employee_id: 1,
    start_time: '09:00',
    end_time: '10:00'
  });

  // 時間スロット（15分間隔、0:00-23:45）
  const timeSlots = Array.from({ length: 96 }, (_, i) => {
    const hour = Math.floor(i / 4);
    const minute = (i % 4) * 15;
    return {
      slot: i,
      time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    };
  });

  // 初期データ読み込み
  useEffect(() => {
    loadEmployees();
    loadReservations();
  }, [selectedDate]);

  const loadEmployees = async () => {
    try {
      const response = await api.get('/employees');
      setEmployees(response.data);
      if (response.data.length > 0) {
        setFormData(prev => ({ ...prev, employee_id: response.data[0].id }));
      }
    } catch (error) {
      console.error('従業員データの読み込みに失敗:', error);
    }
  };

  const loadReservations = async () => {
    try {
      const dateStr = dayjs(selectedDate).format('YYYY-MM-DD');
      const response = await api.get(`/equipment-reservations?date=${dateStr}`);
      setReservations(response.data || []);
    } catch (error) {
      console.error('予約データの読み込みに失敗:', error);
    }
  };

  // セルクリック処理
  const handleCellClick = (equipmentId: number, slot: number) => {
    const cellId = `${equipmentId}-${slot}`;
    const newSelectedCells = new Set(selectedCells);
    
    if (selectedCells.has(cellId)) {
      newSelectedCells.delete(cellId);
    } else {
      newSelectedCells.add(cellId);
    }
    
    setSelectedCells(newSelectedCells);
  };

  // フォーム表示
  const openForm = () => {
    if (selectedCells.size === 0) {
      alert('時間を選択してください');
      return;
    }

    // 選択されたセルから時間を計算
    const cellIds = Array.from(selectedCells);
    const slots = cellIds.map(id => parseInt(id.split('-')[1]));
    const equipmentId = parseInt(cellIds[0].split('-')[0]);
    
    const minSlot = Math.min(...slots);
    const maxSlot = Math.max(...slots);
    
    const startTime = timeSlots[minSlot].time;
    const endTime = timeSlots[maxSlot + 1]?.time || '23:59';

    setFormData(prev => ({
      ...prev,
      equipment_id: equipmentId,
      start_time: startTime,
      end_time: endTime
    }));
    
    setShowForm(true);
  };

  // 予約保存
  const saveReservation = async () => {
    if (!formData.title.trim()) {
      alert('タイトルを入力してください');
      return;
    }

    try {
      const dateStr = dayjs(selectedDate).format('YYYY-MM-DD');
      const startDateTime = `${dateStr}T${formData.start_time}:00`;
      const endDateTime = `${dateStr}T${formData.end_time}:00`;

      const payload = {
        title: formData.title,
        equipment_id: formData.equipment_id,
        employee_id: formData.employee_id,
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        color: '#dc3545'
      };

      console.log('予約作成:', payload);
      
      await api.post('/equipment-reservations', payload);
      
      // 成功後の処理
      setShowForm(false);
      setSelectedCells(new Set());
      setFormData({ title: '', equipment_id: 1, employee_id: 1, start_time: '09:00', end_time: '10:00' });
      await loadReservations();
      
      alert('予約を作成しました');
    } catch (error: any) {
      console.error('予約作成エラー:', error);
      const message = error.response?.data?.message || error.response?.data?.error || '予約の作成に失敗しました';
      alert(`エラー: ${message}`);
    }
  };

  // 予約の表示位置を計算
  const getReservationStyle = (reservation: Reservation, equipmentIndex: number) => {
    const startTime = dayjs(reservation.start_datetime);
    const endTime = dayjs(reservation.end_datetime);
    
    const startSlot = startTime.hour() * 4 + Math.floor(startTime.minute() / 15);
    const endSlot = endTime.hour() * 4 + Math.floor(endTime.minute() / 15);
    
    const left = 200 + startSlot * 20;
    const width = (endSlot - startSlot) * 20;
    const top = 32 + equipmentIndex * 40;
    
    return {
      position: 'absolute' as const,
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: '38px',
      backgroundColor: reservation.color || '#dc3545',
      border: '1px solid rgba(0,0,0,0.1)',
      borderRadius: '4px',
      padding: '2px 4px',
      fontSize: '11px',
      color: 'white',
      overflow: 'hidden',
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    };
  };

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 180px)', overflow: 'scroll' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '20px', gap: '20px' }}>
        <h2>設備予約</h2>
        <input
          type="date"
          value={dayjs(selectedDate).format('YYYY-MM-DD')}
          onChange={(e) => onDateChange(new Date(e.target.value))}
        />
        <button
          onClick={openForm}
          disabled={selectedCells.size === 0}
          style={{
            padding: '8px 16px',
            backgroundColor: selectedCells.size > 0 ? '#dc3545' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: selectedCells.size > 0 ? 'pointer' : 'not-allowed'
          }}
        >
          新規予約 ({selectedCells.size}セル選択中)
        </button>
      </div>

      {/* グリッド */}
      <div style={{ position: 'relative', minWidth: '2120px' }}>
        {/* 時間ヘッダー */}
        <div style={{ position: 'sticky', top: 0, zIndex: 100, backgroundColor: 'white' }}>
          <div style={{ display: 'flex', borderBottom: '2px solid #ddd' }}>
            <div style={{ width: '200px', height: '32px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              設備 / 時間
            </div>
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} style={{ width: '80px', height: '32px', border: '1px solid #ddd', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                {hour.toString().padStart(2, '0')}:00
              </div>
            ))}
          </div>
        </div>

        {/* 設備行 */}
        {equipments.map((equipment, equipmentIndex) => (
          <div key={equipment.id} style={{ display: 'flex', position: 'relative' }}>
            {/* 設備名 */}
            <div style={{ width: '200px', height: '40px', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
              {equipment.name}
            </div>
            
            {/* 時間セル */}
            {timeSlots.map(({ slot, time }) => {
              const cellId = `${equipment.id}-${slot}`;
              const isSelected = selectedCells.has(cellId);
              const hour = Math.floor(slot / 4);
              const minute = (slot % 4) * 15;
              const isHourBorder = minute === 0;
              
              return (
                <div
                  key={slot}
                  onClick={() => handleCellClick(equipment.id, slot)}
                  style={{
                    width: '20px',
                    height: '40px',
                    border: '1px solid #ddd',
                    borderLeft: isHourBorder ? '2px solid #666' : '1px solid #ddd',
                    backgroundColor: isSelected ? '#007bff' : 'white',
                    cursor: 'pointer',
                    opacity: isSelected ? 0.7 : 1
                  }}
                  title={`${equipment.name} ${time}`}
                />
              );
            })}
            
            {/* 予約バー */}
            {reservations
              .filter(reservation => reservation.equipment_id === equipment.id)
              .map(reservation => (
                <div
                  key={reservation.id}
                  style={getReservationStyle(reservation, equipmentIndex)}
                  title={`${reservation.title} (${dayjs(reservation.start_datetime).format('HH:mm')}-${dayjs(reservation.end_datetime).format('HH:mm')})`}
                >
                  {reservation.title}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* 予約フォーム */}
      {showForm && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', width: '400px', maxHeight: '80vh', overflow: 'auto' }}>
            <h3>新規予約</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label>タイトル:</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                placeholder="予約のタイトルを入力"
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label>設備:</label>
              <select
                value={formData.equipment_id}
                onChange={(e) => setFormData(prev => ({ ...prev, equipment_id: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
              >
                {equipments.map(equipment => (
                  <option key={equipment.id} value={equipment.id}>{equipment.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label>担当者:</label>
              <select
                value={formData.employee_id}
                onChange={(e) => setFormData(prev => ({ ...prev, employee_id: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
              >
                {employees.map(employee => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <div style={{ flex: 1 }}>
                <label>開始時刻:</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label>終了時刻:</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                  style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', marginTop: '5px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowForm(false)}
                style={{ padding: '8px 16px', border: '1px solid #ddd', backgroundColor: 'white', borderRadius: '4px', cursor: 'pointer' }}
              >
                キャンセル
              </button>
              <button
                onClick={saveReservation}
                style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleEquipmentReservation;
