import React, { useState, useEffect } from 'react';
import { Schedule, Employee } from '../../types';
import { api } from '../../api';
import { toServerISO } from '../../utils/datetime';

interface ScheduleEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: Schedule | null;
  employees: Employee[];
  onUpdated: (updatedSchedule: Schedule) => void;
}

const ScheduleEditModal: React.FC<ScheduleEditModalProps> = ({
  isOpen,
  onClose,
  schedule,
  employees,
  onUpdated
}) => {
  // モーダルの安定性を向上させるための状態
  const [isModalStable, setIsModalStable] = useState(false);
  // フォームの状態
  const [title, setTitle] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [color, setColor] = useState('#3498db');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 色の選択肢
  const colors = [
    '#3498db', '#e74c3c', '#2ecc71', '#f39c12', 
    '#9b59b6', '#1abc9c', '#34495e', '#e67e22'
  ];

  // モーダルが開いた時の安定化処理
  useEffect(() => {
    if (isOpen && schedule) {
      console.log('🔄 ScheduleEditModal: Modal opened, stabilizing...');
      setIsModalStable(false);
      
      // 少し遅延させてモーダルを安定化
      const stabilizeTimer = setTimeout(() => {
        console.log('✅ ScheduleEditModal: Modal stabilized');
        setIsModalStable(true);
      }, 100);
      
      return () => clearTimeout(stabilizeTimer);
    } else {
      setIsModalStable(false);
    }
  }, [isOpen, schedule]);

  // スケジュールが変更された時にフォームを初期化
  useEffect(() => {
    if (schedule && isOpen && isModalStable) {
      console.log('🔄 ScheduleEditModal: Initializing form with schedule:', schedule);
      
      // タイトル
      setTitle(schedule.title || '');
      
      // 担当者
      setSelectedEmployeeId(schedule.employee_id || null);
      
      // 開始日時
      const startDateTime = new Date(schedule.start_datetime);
      const startDateStr = startDateTime.toISOString().split('T')[0];
      const startTimeStr = startDateTime.toTimeString().slice(0, 5);
      setStartDate(startDateStr);
      setStartTime(startTimeStr);
      
      // 終了日時
      const endDateTime = new Date(schedule.end_datetime);
      const endDateStr = endDateTime.toISOString().split('T')[0];
      const endTimeStr = endDateTime.toTimeString().slice(0, 5);
      setEndDate(endDateStr);
      setEndTime(endTimeStr);
      
      // 色
      setColor(schedule.color || '#3498db');
      
      console.log('🔄 ScheduleEditModal: Form initialized:', {
        title,
        selectedEmployeeId,
        startDate,
        startTime,
        endDate,
        endTime,
        color
      });
    }
  }, [schedule, isOpen, isModalStable]);

  // 更新処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!schedule) {
      console.error('❌ ScheduleEditModal: No schedule to update');
      return;
    }

    if (!title.trim()) {
      alert('タイトルを入力してください');
      return;
    }

    if (!selectedEmployeeId) {
      alert('担当者を選択してください');
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('🚀 ScheduleEditModal: Starting update process');
      
      // 日時を結合してISO文字列に変換
      const startDateTime = new Date(`${startDate}T${startTime}:00`);
      const endDateTime = new Date(`${endDate}T${endTime}:00`);
      
      const payload = {
        title: title.trim(),
        employee_id: selectedEmployeeId,
        start_datetime: toServerISO(startDateTime),
        end_datetime: toServerISO(endDateTime),
        color: color
      };

      console.log('📝 ScheduleEditModal: Update payload:', payload);
      console.log('📝 ScheduleEditModal: Updating schedule ID:', schedule.id);

      const response = await api.put(`/schedules/${schedule.id}`, payload);
      const updatedSchedule = response.data;

      console.log('✅ ScheduleEditModal: Update successful:', updatedSchedule);

      // 親コンポーネントに更新を通知
      onUpdated(updatedSchedule);
      
      // モーダルを閉じる
      onClose();

    } catch (error) {
      console.error('❌ ScheduleEditModal: Update failed:', error);
      alert('スケジュールの更新に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !schedule || !isModalStable) {
    return null;
  }

  return (
    <div 
      className="modal-overlay" 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={(e) => {
        // オーバーレイクリック時のみ閉じる
        if (e.target === e.currentTarget) {
          console.log('🔄 ScheduleEditModal: Overlay clicked, closing modal');
          onClose();
        }
      }}
    >
      <div 
        className="modal-content" 
        style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          width: '90vw',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => {
          // モーダルコンテンツのクリックは伝播を停止
          e.stopPropagation();
        }}
      >
        {/* ヘッダー */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600', color: '#333' }}>
            ✏️ スケジュール編集
          </h2>
          <button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('🔄 ScheduleEditModal: Close button clicked');
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '4px'
            }}
          >
            ×
          </button>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', flex: 1, overflow: 'auto' }}>
          {/* タイトル */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              タイトル *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="スケジュールのタイトルを入力"
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          {/* 担当者 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              担当者 *
            </label>
            <select
              value={selectedEmployeeId || ''}
              onChange={(e) => setSelectedEmployeeId(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
              required
            >
              <option value="">担当者を選択してください</option>
              {employees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </div>

          {/* 開始日時 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              開始日時 *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                required
              />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          </div>

          {/* 終了日時 */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              終了日時 *
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                required
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '8px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                required
              />
            </div>
          </div>

          {/* 色選択 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#333' }}>
              色
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {colors.map(colorOption => (
                <button
                  key={colorOption}
                  type="button"
                  onClick={() => setColor(colorOption)}
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: color === colorOption ? '3px solid #333' : '2px solid #e0e0e0',
                    backgroundColor: colorOption,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                />
              ))}
            </div>
          </div>

          {/* ボタン */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🔄 ScheduleEditModal: Cancel button clicked');
                onClose();
              }}
              style={{
                padding: '12px 24px',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                backgroundColor: 'white',
                color: '#666',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                background: isSubmitting 
                  ? '#6c757d' 
                  : 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
                color: 'white',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontSize: '16px',
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(243, 156, 18, 0.3)',
                transition: 'all 0.3s ease'
              }}
            >
              {isSubmitting ? '更新中...' : '✨ 更新'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ScheduleEditModal;
