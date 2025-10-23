import React, { useState, useEffect } from 'react';
import { Equipment, Employee } from '../../types';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import axios from 'axios';
import { api } from '../../api';
import { employeeApi } from '../../utils/api';

dayjs.extend(isSameOrBefore);

interface EquipmentScheduleFormProps {
  selectedDate: Date;
  equipments: Equipment[];
  employees: Employee[];
  reservations: any[];
  // 列（セル）から判定された既定の担当者（あれば優先採用）
  defaultEmployeeId?: number;
  defaultDepartmentId?: number;
  initialValues?: {
    initialStart?: Date;
    initialEnd?: Date;
    selectedCellsSize?: number;
    equipmentId?: number;
    selectedDate?: Date;
    slotMinutes?: number;
    selectedKey?: string;
    startTime?: string;
    endTime?: string;
    purpose?: string;
    reservationId?: number;
  } | null;
  onClose: () => void;
  onSave: (createdEvent?: any) => void;
}

const API_BASE = 'http://127.0.0.1:4001/api';

const EquipmentScheduleForm: React.FC<EquipmentScheduleFormProps> = ({
  selectedDate,
  equipments,
  employees,
  reservations,
  defaultEmployeeId,
  defaultDepartmentId,
  initialValues,
  onClose,
  onSave
}) => {
  // フォーム状態
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState('');
  // 親から社員配列が渡らない場合のフェールセーフ取得
  const [fallbackEmployees, setFallbackEmployees] = useState<Employee[]>([]);
  useEffect(() => {
    const fetchIfEmpty = async () => {
      if (!employees || employees.length === 0) {
        try {
          const res = await employeeApi.getAll();
          const list = Array.isArray(res.data) ? res.data : [];
          setFallbackEmployees(list);
          if (!selectedEmployeeId && list.length > 0) {
            setSelectedEmployeeId(list[0].id);
            setSelectedDepartmentId(list[0].department_id || null);
          }
        } catch (e) {
          // 取得失敗はスルー（フォームを開けることを優先）
        }
      }
    };
    fetchIfEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const employeesEffective: Employee[] = (employees && employees.length > 0) ? employees : fallbackEmployees;
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [purpose, setPurpose] = useState('');
  const [hasConflict, setHasConflict] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 日付フォーマット
  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 時間フォーマット関数
  const formatTimeForInput = (date: Date) => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // 初期値設定
  useEffect(() => {
    console.log('🔍 EquipmentScheduleForm: Initial values received', {
      initialValues,
      hasInitialStart: !!initialValues?.initialStart,
      hasInitialEnd: !!initialValues?.initialEnd,
      hasStartTime: !!initialValues?.startTime,
      hasEndTime: !!initialValues?.endTime,
      equipmentId: initialValues?.equipmentId
    });
    
    if (initialValues) {
      // 初期値がある場合は、それを使用
      if (initialValues.selectedDate) {
        setSelectedDateStr(formatDateForInput(initialValues.selectedDate));
      } else {
        setSelectedDateStr(formatDateForInput(selectedDate));
      }
      
      if (initialValues.equipmentId) {
        console.log('🔍 Setting equipment ID:', initialValues.equipmentId);
        setSelectedEquipmentId(initialValues.equipmentId);
      }
      
      // 優先順位: initialStart/initialEnd > startTime/endTime
      if (initialValues.initialStart) {
        const timeStr = formatTimeForInput(initialValues.initialStart);
        setStartTime(timeStr);
        console.log('🔍 Setting start time from initialStart:', timeStr, initialValues.initialStart.toISOString());
      } else if (initialValues.startTime) {
        setStartTime(initialValues.startTime);
        console.log('🔍 Setting start time from startTime:', initialValues.startTime);
      }
      
      if (initialValues.initialEnd) {
        const timeStr = formatTimeForInput(initialValues.initialEnd);
        setEndTime(timeStr);
        console.log('🔍 Setting end time from initialEnd:', timeStr, initialValues.initialEnd.toISOString());
      } else if (initialValues.endTime) {
        setEndTime(initialValues.endTime);
        console.log('🔍 Setting end time from endTime:', initialValues.endTime);
      }

      if (initialValues.purpose) {
        setPurpose(initialValues.purpose);
        console.log('🔍 Setting purpose:', initialValues.purpose);
      }
    } else {
      // 初期値がない場合はデフォルト値を使用
      console.log('🔍 No initial values, using defaults');
      setSelectedDateStr(formatDateForInput(selectedDate));
    }
    
    // 既定の担当者（列のユーザー）を最優先で反映
    const initialEmpId = (initialValues as any)?.employeeId
      ?? (initialValues as any)?.defaultEmployeeId
      ?? defaultEmployeeId
      ?? null;
    if (initialEmpId && !selectedEmployeeId) {
      setSelectedEmployeeId(initialEmpId);
      const dept = employeesEffective.find(e => e.id === initialEmpId)?.department_id || defaultDepartmentId || null;
      setSelectedDepartmentId(dept ?? null);
    }

    // デフォルトで最初の設備と社員を選択（初期値がない/既定がない場合）
    if (equipments.length > 0 && !selectedEquipmentId && !initialValues?.equipmentId) {
      setSelectedEquipmentId(equipments[0].id);
    }
    if (employeesEffective.length > 0 && !selectedEmployeeId && !initialEmpId) {
      setSelectedEmployeeId(employeesEffective[0].id);
      const dept = employeesEffective[0]?.department_id || null;
      setSelectedDepartmentId(dept);
    }
  }, [selectedDate, equipments, employees, employeesEffective, initialValues, defaultEmployeeId, defaultDepartmentId]);

  // 後から社員リストが揃った場合にも既定を適用
  useEffect(() => {
    if (!selectedEmployeeId && employeesEffective.length > 0) {
      const empId = defaultEmployeeId ?? (initialValues as any)?.employeeId ?? (initialValues as any)?.defaultEmployeeId ?? employeesEffective[0].id;
      setSelectedEmployeeId(empId);
      const dept = employeesEffective.find(e => e.id === empId)?.department_id || defaultDepartmentId || employeesEffective[0]?.department_id || null;
      setSelectedDepartmentId(dept ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeesEffective.length]);

  // シンプルな重複チェック（無効化）
  const checkConflict = () => {
    // 重複チェックを無効化してシンプルに
    setHasConflict(false);
    setConflictMessage('');
  };

  // フォーム値変更時に重複チェック
  useEffect(() => {
    checkConflict();
  }, [selectedEquipmentId, selectedDateStr, startTime, endTime, reservations]);

  // 部署から担当者の絞り込み（部署名を正しく表示）
  const departmentOptions = React.useMemo(() => {
    const map = new Map<number, string>();
    employeesEffective.forEach(e => {
      if (e.department_id) {
        const name = (e as any).department_name || `部署 ${e.department_id}`;
        if (!map.has(e.department_id)) {
          map.set(e.department_id, name);
        }
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [employeesEffective]);

  const filteredEmployees = selectedDepartmentId
    ? employeesEffective.filter(e => e.department_id === selectedDepartmentId)
    : employeesEffective;

  // 保存処理
  const handleSubmit = async () => {
    if (!selectedEquipmentId || !selectedEmployeeId || !purpose.trim()) {
      alert('すべての項目を入力してください');
      return;
    }

    if (hasConflict) {
      alert('設備の予約時間が重複しています。別の時間を選択してください。');
      return;
    }

    if (dayjs(`${selectedDateStr} ${endTime}`).isSameOrBefore(`${selectedDateStr} ${startTime}`)) {
      alert('終了時刻は開始時刻より後にしてください');
      return;
    }

    setIsSubmitting(true);

    try {
      // シンプルな時間計算
      const dateStr = dayjs(selectedDate).format('YYYY-MM-DD');
      const startDateTime = `${dateStr}T${startTime}:00`;
      const endDateTime = `${dateStr}T${endTime}:00`;

      const payload = {
        title: purpose.trim() || '新規予約',
        purpose: purpose.trim() || '新規予約',
        equipment_id: Number(selectedEquipmentId),
        employee_id: Number(selectedEmployeeId),
        start_datetime: startDateTime,
        end_datetime: endDateTime,
        color: '#dc3545'
      };

      console.log('予約作成:', payload);

      // シンプルなAPI呼び出し
      const response = await api.post('/equipment-reservations', payload);
      
      console.log('作成完了:', response.data);
      onSave(response.data);
      
      // フォームをリセット
      setPurpose('');
      setStartTime('09:00');
      setEndTime('10:00');
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      console.error('[POST ERROR]', status, data);
      console.error('❌ Full error details:', err);
      
      if (status === 409 && data?.error === 'EQUIPMENT_CONFLICT') {
        // 厳格な設備重複エラー
        console.error('🚨 設備重複エラー:', data);
        
        const conflictDetails = data.details?.conflictingReservations || [];
        const conflictMessages = conflictDetails.map((c: any) => 
          `予約ID: ${c.id}, 目的: ${c.purpose}, 時間: ${c.timeRange.start} - ${c.timeRange.end}`
        ).join('\n');
        
        setHasConflict(true);
        setConflictMessage(`🚨 設備の重複予約が検出されました\n\n${data.message}`);
        
        alert(`🚨 設備の重複予約エラー\n\n${data.message}\n\n重複している予約:\n${conflictMessages}\n\n別の時間帯を選択してください。`);
      } else if (status === 409) {
        // 従来の重複エラー
        const conflictMessage = data?.message || 'Time range overlaps with existing reservation';
        setHasConflict(true);
        setConflictMessage('指定された時間帯に既に予約があります。別の時間を選択してください。');
        alert(`⚠️ 重複警告: ${conflictMessage}\n\n別の時間帯を選択してください。`);
      } else {
        const msg = data?.message || data?.error || 'Unknown error';
        console.error('❌ EquipmentScheduleForm: Save error:', err);
        alert(`保存失敗(${status}): ${msg}\n詳細: ${JSON.stringify(data)}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // 予約削除（編集モード時のみ）
  const handleDelete = async () => {
    const reservationId = initialValues?.reservationId;
    if (!reservationId) return;
    const ok = window.confirm('この設備予約を削除しますか？');
    if (!ok) return;
    setIsSubmitting(true);
    try {
      await api.delete(`/equipment-reservations/${reservationId}`);
      onSave?.();
      onClose?.();
    } catch (err) {
      console.error('削除失敗', err);
      alert('削除に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '20px',
      padding: '20px',
      backgroundColor: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      maxWidth: '600px',
      width: '100%'
    }}>
      {/* 設備選択 */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          🏢 設備
        </label>
        <select
          value={selectedEquipmentId || ''}
          onChange={(e) => setSelectedEquipmentId(Number(e.target.value))}
          style={{
            width: '100%',
            padding: '12px 16px',
            border: hasConflict ? '2px solid #dc3545' : '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '14px',
            backgroundColor: hasConflict ? '#fff5f5' : 'white',
            transition: 'all 0.2s ease'
          }}
          required
        >
          <option value="">設備を選択してください</option>
          {equipments.map(equipment => (
            <option key={equipment.id} value={equipment.id}>
              {equipment.name}
            </option>
          ))}
        </select>
      </div>

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
          required
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
            🕐 開始時刻
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
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '8px', 
            fontWeight: '600', 
            color: '#495057' 
          }}>
            🕐 終了時刻
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
            required
          />
        </div>
      </div>

      {/* 担当者（部署→スタッフの順に選択） */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          👤 担当者
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>部署</div>
            <select
              value={selectedDepartmentId ?? ''}
              onChange={(e) => setSelectedDepartmentId(e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e9ecef',
                borderRadius: '8px',
                fontSize: '14px'
              }}
            >
              <option value="">部署を選択してください</option>
              {departmentOptions.map(({ id, name }) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>スタッフ</div>
            <select
              value={selectedEmployeeId || ''}
              onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e9ecef',
                borderRadius: '8px',
                fontSize: '14px'
              }}
              required
            >
              <option value="">担当者を選択してください</option>
              {filteredEmployees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 使用目的 */}
      <div>
        <label style={{ 
          display: 'block', 
          marginBottom: '8px', 
          fontWeight: '600', 
          color: '#495057' 
        }}>
          📝 使用目的
        </label>
        <textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          placeholder="使用目的を入力してください"
          style={{
            width: '100%',
            padding: '12px 16px',
            border: '2px solid #e9ecef',
            borderRadius: '8px',
            fontSize: '14px',
            minHeight: '80px',
            resize: 'vertical'
          }}
          required
        />
      </div>

      {/* 重複警告 */}
      {hasConflict && (
        <div style={{
          padding: '12px',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '8px',
          color: '#721c24',
          fontSize: '14px'
        }}>
          ⚠️ {conflictMessage}
        </div>
      )}

      {/* ボタン */}
      <div style={{ 
        display: 'flex', 
        gap: '15px', 
        marginTop: '20px',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        {/* 左側：削除（編集時のみ表示） */}
        {initialValues?.reservationId && (
          <button
            onClick={handleDelete}
            disabled={isSubmitting}
            style={{
              padding: '12px 20px',
              border: 'none',
              borderRadius: '8px',
              backgroundColor: '#dc3545',
              color: 'white',
              fontSize: '14px',
              fontWeight: 700,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            削除
          </button>
        )}

        {/* 右側：キャンセル/保存 */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          style={{
            padding: '12px 24px',
            border: '2px solid #6c757d',
            borderRadius: '8px',
            backgroundColor: 'white',
            color: '#6c757d',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.6 : 1
          }}
        >
          キャンセル
        </button>
        
        <button
          onClick={handleSubmit}
          disabled={hasConflict || !selectedEquipmentId || !selectedEmployeeId || !purpose.trim() || isSubmitting}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: hasConflict || !selectedEquipmentId || !selectedEmployeeId || !purpose.trim() ? '#6c757d' : '#dc3545', // 赤色の登録バー
            color: 'white',
            fontSize: '14px',
            fontWeight: '600',
            cursor: hasConflict || !selectedEquipmentId || !selectedEmployeeId || !purpose.trim() || isSubmitting ? 'not-allowed' : 'pointer',
            opacity: hasConflict || !selectedEquipmentId || !selectedEmployeeId || !purpose.trim() || isSubmitting ? 0.6 : 1,
            transition: 'all 0.2s ease'
          }}
        >
          {isSubmitting ? '登録中...' : '🔴 登録'}
        </button>
      </div>
    </div>
  );
};

export default EquipmentScheduleForm;
