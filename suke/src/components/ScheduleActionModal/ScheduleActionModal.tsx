import React, { useState, useEffect } from 'react';
import './ScheduleActionModal.css';

// 型定義
import { Schedule } from '../../types';

// ユーティリティ
import { formatDateTime } from '../../utils/dateUtils';
import { safeHexColor } from '../../utils/color';

interface ScheduleActionModalProps {
  schedule: Schedule;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
  onCancel: () => void;
}

const ScheduleActionModal: React.FC<ScheduleActionModalProps> = ({
  schedule,
  onEdit,
  onDelete,
  onCopy,
  onCancel
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Escキーでキャンセル
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          setShowDeleteConfirm(false);
        } else {
          onCancel();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteConfirm, onCancel]);

  // 削除確認
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    onDelete();
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="action-modal-content" onClick={e => e.stopPropagation()}>
        {!showDeleteConfirm ? (
          <>
            {/* スケジュール情報表示 */}
            <div className="schedule-info">
              <div className="schedule-header">
                <div 
                  className="schedule-color-indicator" 
                  style={{ backgroundColor: safeHexColor(schedule.color) }}
                />
      <h3 className="schedule-title">{schedule.title || schedule.purpose}</h3>
              </div>
              
              <div className="schedule-details">
                <div className="detail-item">
                  <span className="detail-label">担当者:</span>
                  <span className="detail-value">
                    {schedule.employee_name} ({schedule.employee_number})
                  </span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">開始:</span>
                  <span className="detail-value">
                    {formatDateTime(new Date(schedule.start_datetime))}
                  </span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">終了:</span>
                  <span className="detail-value">
                    {formatDateTime(new Date(schedule.end_datetime))}
                  </span>
                </div>
                
                <div className="detail-item">
                  <span className="detail-label">期間:</span>
                  <span className="detail-value">
                    {calculateDuration(new Date(schedule.start_datetime), new Date(schedule.end_datetime))}
                  </span>
                </div>
              </div>
            </div>

            {/* アクションボタン */}
            <div className="action-buttons">
              <button className="action-btn edit-btn" onClick={onEdit}>
                <span className="btn-icon">✏️</span>
                変更
              </button>
              
              <button className="action-btn copy-btn" onClick={onCopy}>
                <span className="btn-icon">📋</span>
                コピー
              </button>
              
              <button className="action-btn delete-btn" onClick={handleDeleteClick}>
                <span className="btn-icon">🗑️</span>
                削除
              </button>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={onCancel}>
                キャンセル
              </button>
            </div>
          </>
        ) : (
          <>
            {/* 削除確認 */}
            <div className="delete-confirm">
              <div className="confirm-icon">⚠️</div>
              <h3>削除の確認</h3>
              <p>以下のスケジュールを削除してもよろしいですか？</p>
              
              <div className="confirm-schedule-info">
        <div className="confirm-title">{schedule.title || schedule.purpose}</div>
                <div className="confirm-datetime">
                  {formatDateTime(new Date(schedule.start_datetime))} - {formatDateTime(new Date(schedule.end_datetime))}
                </div>
              </div>
              
              <p className="warning-text">この操作は取り消せません。</p>
            </div>

            <div className="confirm-buttons">
              <button className="btn btn-secondary" onClick={handleDeleteCancel}>
                キャンセル
              </button>
              <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                削除する
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 期間計算ユーティリティ
const calculateDuration = (start: Date, end: Date): string => {
  const durationMs = end.getTime() - start.getTime();
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours === 0) {
    return `${minutes}分`;
  } else if (minutes === 0) {
    return `${hours}時間`;
  } else {
    return `${hours}時間${minutes}分`;
  }
};

export default ScheduleActionModal;