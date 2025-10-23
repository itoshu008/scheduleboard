import React, { useState, useEffect } from 'react';
import { Equipment, Employee } from '../../types';
import { api } from '../../api';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import axios from 'axios';

dayjs.extend(isSameOrBefore);

interface EquipmentReservationFormProps {
  selectedDate: Date;
  equipments: Equipment[];
  employees: Employee[];
  reservations: any[];
  initialData?: {
    selectedDate: Date;
    selectedEquipmentId: number;
    startTime: string;
    endTime: string;
  };
  onClose: () => void;
  onSave: () => void;
}

const API_BASE = 'http://127.0.0.1:4001/api';
const SLOT_MINUTES = 15;

const slotToDateTime = (dateYMD: string, slot: number) =>
  dayjs(dateYMD).startOf('day').add(slot * SLOT_MINUTES, 'minute');

const EquipmentReservationForm: React.FC<EquipmentReservationFormProps> = ({
  selectedDate,
  equipments,
  employees,
  reservations,
  initialData,
  onClose,
  onSave
}) => {
  // フォーム状態
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [title, setTitle] = useState(''); // 内部的には title だが、API では purpose として送信
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  // 日付フォーマット
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [selectedDateStr, setSelectedDateStr] = useState(formatDateForInput(selectedDate));

  // 初期値設定
  useEffect(() => {
    console.log('🔍 EquipmentReservationForm: Initial data received', initialData);
    if (initialData) {
      console.log('🔍 EquipmentReservationForm: Setting initial values', {
        selectedDate: formatDateForInput(initialData.selectedDate),
        selectedEquipmentId: initialData.selectedEquipmentId,
        startTime: initialData.startTime,
        endTime: initialData.endTime
      });
      setSelectedDateStr(formatDateForInput(initialData.selectedDate));
      setSelectedEquipmentId(initialData.selectedEquipmentId);
      setStartTime(initialData.startTime);
      setEndTime(initialData.endTime);
      // 目的フィールドにデフォルト値を設定
      if (!title.trim()) {
        setTitle('設備使用');
      }
    }
  }, [initialData]);

  // 重複チェック関数
  const checkConflict = () => {
    if (!selectedEquipmentId || !selectedDateStr || !startTime || !endTime) {
      setHasConflict(false);
      setConflictMessage('');
      return;
    }

    const startDateTime = new Date(`${selectedDateStr}T${startTime}:00`);
    const endDateTime = new Date(`${selectedDateStr}T${endTime}:00`);

    // 同じ設備で時間が重複する予約をチェック
    const conflicts = reservations.filter(reservation => {
      if (reservation.equipment_id !== selectedEquipmentId) return false;

      const resStartTime = new Date(reservation.start_datetime);
      const resEndTime = new Date(reservation.end_datetime);
      
      // 時間の重複チェック
      return (
        (startDateTime < resEndTime && endDateTime > resStartTime)
      );
    });

    if (conflicts.length > 0) {
      setHasConflict(true);
      const conflictTimes = conflicts.map(c => 
        `${new Date(c.start_datetime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'})} - ${new Date(c.end_datetime).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'})}`
      ).join(', ');
      setConflictMessage(`この時間帯は既に予約されています: ${conflictTimes}`);
    } else {
      setHasConflict(false);
      setConflictMessage('');
    }
  };

  // フォーム値変更時に重複チェック
  useEffect(() => {
    checkConflict();
  }, [selectedEquipmentId, selectedDateStr, startTime, endTime, reservations]);

  // 保存処理
  const handleSave = async () => {
    console.log('🔍 EquipmentReservationForm: handleSave called', {
      selectedEquipmentId,
      selectedEmployeeId,
      title,
      hasConflict,
      selectedDateStr,
      startTime,
      endTime
    });

    // 時間をスロットに変換（15分単位）
    const startSlot = Math.floor((parseInt(startTime.split(':')[0]) * 60 + parseInt(startTime.split(':')[1])) / SLOT_MINUTES);
    const endSlot = Math.floor((parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1])) / SLOT_MINUTES);

    // 日時の確定
    const startDt = slotToDateTime(selectedDateStr, startSlot);
    const endDt = slotToDateTime(selectedDateStr, endSlot);

    // employee_id の既定（UI未実装なら、とりあえず既存社員の先頭など）
    const fallbackEmployeeId = (Array.isArray(employees) && employees[0]?.id) || 1;
    const employee_id = Number(selectedEmployeeId ?? fallbackEmployeeId);

    // 必須を snake_case で揃える（型も number に）
    const payload = {
      title: (title ?? '機材予約').trim(),
      start_datetime: startDt.format('YYYY-MM-DDTHH:mm:ss'),
      end_datetime: endDt.format('YYYY-MM-DDTHH:mm:ss'),
      equipment_id: Number(selectedEquipmentId),
      employee_id, // ★必須
    };

    // 送る前に自己チェック（これで 400 を未然に防ぐ）
    if (!payload.title || !payload.start_datetime || !payload.end_datetime ||
        !payload.equipment_id || !payload.employee_id) {
      console.error('❌ 必須項目不足 payload:', payload);
      alert('タイトル/開始/終了/機材/担当者 は必須です');
      return;
    }
    if (dayjs(payload.end_datetime).isSameOrBefore(payload.start_datetime)) {
      alert('終了は開始より後にしてください');
      return;
    }

    if (hasConflict) {
      console.log('❌ EquipmentReservationForm: Validation failed - conflict detected');
      alert('設備の予約時間が重複しています。別の時間を選択してください。');
      return;
    }

    console.log('🚀 EquipmentReservation 保存payload:', payload);

    try {
      // エンドポイント：サーバが /equipment-reservations を用意している
      const url = `${API_BASE}/equipment-reservations`;

      const res = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
      });

      console.log('✅ EquipmentReservationForm: Save successful', res.data);
      console.log('🔄 EquipmentReservationForm: Calling onSave to reload data');
      
      // 成功したら state へ反映＆選択クリア
      onSave();
    } catch (error: any) {
      console.error('❌ EquipmentReservationForm: Save error:', error);
      if (error?.response) {
        console.error('❌ Error response:', error.response.data);
        console.error('❌ Error status:', error.response.status);
        alert(`保存に失敗しました。エラー: ${error.response.data?.error || error.response.status}`);
      } else {
        alert('保存に失敗しました。');
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 日付 */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          📅 日付
        </label>
        <input
          type="date"
          value={selectedDateStr}
          onChange={(e) => setSelectedDateStr(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
      </div>

      {/* 時間 */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <div style={{ flex: 1 }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600', 
            color: '#495057' 
          }}>
            🕐 開始時間
          </label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e9ecef',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600', 
            color: '#495057' 
          }}>
            🕐 終了時間
          </label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e9ecef',
              borderRadius: '8px',
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* 担当者 */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          👤 担当者
        </label>
        <select
          value={selectedEmployeeId || ''}
          onChange={(e) => setSelectedEmployeeId(Number(e.target.value) || null)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        >
          <option value="">担当者を選択してください</option>
          {employees.map(employee => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </div>

      {/* 設備 */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          🏢 設備名
        </label>
        <select
          value={selectedEquipmentId || ''}
          onChange={(e) => setSelectedEquipmentId(Number(e.target.value) || null)}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: hasConflict ? '2px solid #dc3545' : '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        >
          <option value="">設備を選択してください</option>
          {equipments.map(equipment => (
            <option key={equipment.id} value={equipment.id}>
              {equipment.name}
            </option>
          ))}
        </select>
        {hasConflict && (
          <div style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            color: '#721c24',
            fontSize: '14px'
          }}>
            ⚠️ {conflictMessage}
          </div>
        )}
      </div>

      {/* タイトル */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          📝 使用目的
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="使用目的を入力してください"
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '14px'
          }}
        />
      </div>

      {/* ボタン */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginTop: '20px',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={onClose}
          style={{
            padding: '12px 24px',
            border: '2px solid #6c757d',
            borderRadius: '8px',
            backgroundColor: 'white',
            color: '#6c757d',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={hasConflict || !selectedEquipmentId || !selectedEmployeeId || !title.trim()}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: hasConflict ? '#6c757d' : '#dc3545',
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: hasConflict ? 'not-allowed' : 'pointer',
            opacity: hasConflict || !selectedEquipmentId || !selectedEmployeeId || !title.trim() ? 0.6 : 1
          }}
        >
          📝 登録
        </button>
      </div>
    </div>
  );
};

export default EquipmentReservationForm;
