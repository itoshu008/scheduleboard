import React, { useState, useEffect } from 'react';
import './ScheduleFormModal.css';

// 型定義
import { Schedule, Employee, SCHEDULE_COLORS } from '../../types';

// ユーティリティ
import { formatDate, formatTime } from '../../utils/dateUtils';

interface ScheduleFormModalProps {
  schedule: Schedule;
  employee?: Employee;
  colors?: string[];
  onSave: (scheduleData: Partial<Schedule>) => void;
  onCancel: () => void;
}

const ScheduleFormModal: React.FC<ScheduleFormModalProps> = ({
  schedule,
  employee,
  colors = SCHEDULE_COLORS,
  onSave,
  onCancel
}) => {
  // フォーム状態
  const [formData, setFormData] = useState({
    purpose: schedule.purpose || '',
    startDate: formatDate(new Date(schedule.start_datetime)),
    startTime: formatTime(new Date(schedule.start_datetime)),
    endDate: formatDate(new Date(schedule.end_datetime)),
    endTime: formatTime(new Date(schedule.end_datetime)),
    color: schedule.color || '#007bff'
  });

  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [activeTab, setActiveTab] = useState<'new' | 'template' | 'copy'>('new');

  // フォームデータ更新
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // エラーをクリア
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // バリデーション
  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.purpose.trim()) {
      newErrors.purpose = '用件は必須です';
    }

    if (!formData.startDate) {
      newErrors.startDate = '開始日は必須です';
    }

    if (!formData.startTime) {
      newErrors.startTime = '開始時間は必須です';
    }

    if (!formData.endDate) {
      newErrors.endDate = '終了日は必須です';
    }

    if (!formData.endTime) {
      newErrors.endTime = '終了時間は必須です';
    }

    // 開始時間と終了時間の妥当性チェック
    if (formData.startDate && formData.startTime && formData.endDate && formData.endTime) {
      const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
      const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

      if (startDateTime >= endDateTime) {
        newErrors.endTime = '終了時間は開始時間より後である必要があります';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 保存処理
  const handleSave = () => {
    if (!validateForm()) return;

    const startDateTime = new Date(`${formData.startDate}T${formData.startTime}`);
    const endDateTime = new Date(`${formData.endDate}T${formData.endTime}`);

    onSave({
      ...schedule,
      purpose: formData.purpose.trim(),
      start_datetime: startDateTime.toISOString(),
      end_datetime: endDateTime.toISOString(),
      color: formData.color
    });
  };

  // Escキーでキャンセル
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // 時間を15分刻みに調整
  const adjustTimeToQuarter = (time: string): string => {
    const [hours, minutes] = time.split(':').map(Number);
    const adjustedMinutes = Math.round(minutes / 15) * 15;
    
    if (adjustedMinutes === 60) {
      return `${String(hours + 1).padStart(2, '0')}:00`;
    } else {
      return `${String(hours).padStart(2, '0')}:${String(adjustedMinutes).padStart(2, '0')}`;
    }
  };

  // 時間変更時の15分刻み調整
  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const adjustedTime = adjustTimeToQuarter(value);
    handleInputChange(field, adjustedTime);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{schedule.id ? 'スケジュール編集' : 'スケジュール登録'}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        {/* タブ */}
        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
            onClick={() => setActiveTab('new')}
          >
            新規登録
          </button>
          <button
            className={`tab-btn ${activeTab === 'template' ? 'active' : ''}`}
            onClick={() => setActiveTab('template')}
            disabled
          >
            テンプレート
          </button>
          <button
            className={`tab-btn ${activeTab === 'copy' ? 'active' : ''}`}
            onClick={() => setActiveTab('copy')}
            disabled
          >
            コピー
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'new' && (
            <div className="form-content">
              {/* 社員情報 */}
              {employee && (
                <div className="employee-info">
                  <span className="employee-name">{employee.name}</span>
                  <span className="employee-number">（{employee.employee_number}）</span>
                </div>
              )}

              {/* 用件 */}
              <div className="form-group">
                <label className="form-label">用件 *</label>
                <input
                  type="text"
                  value={formData.purpose}
                  onChange={e => handleInputChange('purpose', e.target.value)}
                  className={`form-control ${errors.purpose ? 'error' : ''}`}
                  placeholder="用件を入力してください"
                  maxLength={200}
                />
                {errors.purpose && <div className="error-text">{errors.purpose}</div>}
              </div>

              {/* 開始日時 */}
              <div className="datetime-group">
                <div className="form-group">
                  <label className="form-label">開始日 *</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => handleInputChange('startDate', e.target.value)}
                    className={`form-control ${errors.startDate ? 'error' : ''}`}
                  />
                  {errors.startDate && <div className="error-text">{errors.startDate}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">開始時間 *</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={e => handleTimeChange('startTime', e.target.value)}
                    step="900"
                    className={`form-control ${errors.startTime ? 'error' : ''}`}
                  />
                  {errors.startTime && <div className="error-text">{errors.startTime}</div>}
                </div>
              </div>

              {/* 終了日時 */}
              <div className="datetime-group">
                <div className="form-group">
                  <label className="form-label">終了日 *</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={e => handleInputChange('endDate', e.target.value)}
                    className={`form-control ${errors.endDate ? 'error' : ''}`}
                  />
                  {errors.endDate && <div className="error-text">{errors.endDate}</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">終了時間 *</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={e => handleTimeChange('endTime', e.target.value)}
                    step="900"
                    className={`form-control ${errors.endTime ? 'error' : ''}`}
                  />
                  {errors.endTime && <div className="error-text">{errors.endTime}</div>}
                </div>
              </div>

              {/* カラー選択 */}
              <div className="form-group">
                <label className="form-label">色</label>
                <div className="color-palette">
                  {colors.map(color => (
                    <button
                      key={color}
                      type="button"
                      className={`color-option ${formData.color === color ? 'selected' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => handleInputChange('color', color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'template' && (
            <div className="form-content">
              <p className="coming-soon">テンプレート機能は近日実装予定です。</p>
            </div>
          )}

          {activeTab === 'copy' && (
            <div className="form-content">
              <p className="coming-soon">コピー機能は近日実装予定です。</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            キャンセル
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={activeTab !== 'new'}
          >
            登録
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleFormModal;