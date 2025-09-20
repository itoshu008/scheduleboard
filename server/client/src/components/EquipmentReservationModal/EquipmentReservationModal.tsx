import React, { useState, useEffect } from 'react';
import './EquipmentReservationModal.css';

// 型定義
import { Employee, Equipment, EquipmentReservation as EquipmentReservationType } from '../../types';

interface EquipmentReservationModalProps {
  selectedCells: Set<string>;
  employees: Employee[];
  equipments: Equipment[];
  selectedDate: Date;
  colors: string[];
  initialData?: {
    startDateTime: Date;
    endDateTime: Date;
    equipmentId: number;
  } | null;
  onSave: (reservationData: Partial<EquipmentReservationType>) => void;
  onCancel: () => void;
  onTemplate?: () => void;
  onCopy?: () => void;
}

const EquipmentReservationModal: React.FC<EquipmentReservationModalProps> = ({
  selectedCells,
  employees,
  equipments,
  selectedDate,
  colors,
  initialData,
  onSave,
  onCancel,
  onTemplate,
  onCopy
}) => {

  const [purpose, setPurpose] = useState('');
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const [selectedEquipment, setSelectedEquipment] = useState<number | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // 初期データまたは選択されたセルから時間を計算
  useEffect(() => {
    if (initialData) {
      // 初期データがある場合はそれを使用
      const startHour = initialData.startDateTime.getHours();
      const startMinute = initialData.startDateTime.getMinutes();
      const endHour = initialData.endDateTime.getHours();
      const endMinute = initialData.endDateTime.getMinutes();

      console.log('Start time:', startHour, startMinute);
      console.log('End time:', endHour, endMinute);

      setStartTime(`${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`);
      setEndTime(`${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`);
      setSelectedEquipment(initialData.equipmentId);
    } else if (selectedCells.size > 0) {
      // 選択されたセルから時間を計算
      const cellIds = Array.from(selectedCells ?? []);
      const slots = cellIds.map(id => {
        const parts = id.split('-');
        return parseInt(parts[1]);
      }).sort((a, b) => a - b);

      const startSlot = Math.min(...slots);
      const endSlot = Math.max(...slots) + 1;

      const startHour = Math.floor(startSlot / 4);
      const startMinute = (startSlot % 4) * 15;
      const endHour = Math.floor(endSlot / 4);
      const endMinuteCalc = (endSlot % 4) * 15;

      setStartTime(`${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`);
      setEndTime(`${endHour.toString().padStart(2, '0')}:${endMinuteCalc.toString().padStart(2, '0')}`);

      // 最初の設備を選択
      if (equipments.length > 0) {
        const firstCellId = cellIds[0];
        const equipmentId = parseInt(firstCellId.split('-')[0]);
        setSelectedEquipment(equipmentId);
      }
    }
  }, [selectedCells, equipments, initialData]);

  const handleSave = () => {
    if (!selectedEquipment || !selectedEmployee || !purpose.trim() || !startTime || !endTime) {
      alert('すべての項目を入力してください。');
      return;
    }

    // 初期データがある場合はその日付を使用、ない場合はselectedDateを使用
    const baseDate = initialData ? initialData.startDateTime : selectedDate;
    
    // 日付部分を取得（時間はリセット）
    const baseDateOnly = new Date(baseDate);
    baseDateOnly.setHours(0, 0, 0, 0);
    
    const startDateTime = new Date(baseDateOnly);
    const [startHour, startMinute] = startTime.split(':').map(Number);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    const endDateTime = new Date(baseDateOnly);
    const [endHour, endMin] = endTime.split(':').map(Number);
    endDateTime.setHours(endHour, endMin, 0, 0);
    


    if (startDateTime >= endDateTime) {
      alert('終了時間は開始時間より後にしてください。');
      return;
    }

    const saveData = {
      equipment_id: selectedEquipment,
      employee_id: selectedEmployee,
      purpose: purpose.trim(),
      start_datetime: startDateTime.toISOString(),
      end_datetime: endDateTime.toISOString(),
      color: selectedColor
    };

    console.log('Calling onSave with data:', saveData);
    onSave(saveData);
  };

  return (
    <div className="equipment-reservation-modal-overlay">
      <div className="equipment-reservation-modal">
        <div className="modal-header">
          <h3>設備予約登録</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="tab-content">
          <div className="form-group">
            <label>日付:</label>
            <input 
              type="text" 
              value={initialData ? initialData.startDateTime.toLocaleDateString('ja-JP') : selectedDate.toLocaleDateString('ja-JP')} 
              readOnly 
              className="readonly-input"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>開始時間:</label>
              <input 
                type="time" 
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>終了時間:</label>
              <input 
                type="time" 
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>設備:</label>
            <select 
              value={selectedEquipment || ''} 
              onChange={(e) => setSelectedEquipment(Number(e.target.value))}
            >
              <option value="">設備を選択してください</option>
              {equipments.map(equipment => (
                <option key={equipment.id} value={equipment.id}>
                  {equipment.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>予約者:</label>
            <select 
              value={selectedEmployee || ''} 
              onChange={(e) => setSelectedEmployee(Number(e.target.value))}
            >
              <option value="">予約者を選択してください</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>目的:</label>
            <input 
              type="text" 
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="予約の目的を入力してください"
            />
          </div>

          <div className="form-group">
            <label>色:</label>
            <div className="color-picker">
              {colors.map((color, index) => (
                <button
                  key={index}
                  className={`color-btn ${selectedColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColor(color)}
                />
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button className="save-btn" onClick={handleSave}>
              保存
            </button>
            <button className="cancel-btn" onClick={onCancel}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentReservationModal; 