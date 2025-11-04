import React from 'react';
import './OverlapConfirmationDialog.css';

interface OverlapInfo {
  type: 'schedule' | 'equipment';
  overlappingItems: Array<{
    id: number;
    title?: string;
    purpose?: string;
    start_datetime: string;
    end_datetime: string;
    employee_name?: string;
    equipment_name?: string;
  }>;
}

interface OverlapConfirmationDialogProps {
  isOpen: boolean;
  overlapInfo: OverlapInfo;
  onConfirm: () => void;
  onCancel: () => void;
  isEquipment?: boolean;
}

const OverlapConfirmationDialog: React.FC<OverlapConfirmationDialogProps> = ({
  isOpen,
  overlapInfo,
  onConfirm,
  onCancel,
  isEquipment = false
}) => {
  if (!isOpen) return null;

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return date.toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="overlap-dialog-overlay">
      <div className="overlap-dialog">
        <div className="overlap-dialog-header">
          <h3>⚠️ {isEquipment ? '設備予約の重複' : 'スケジュール重複の確認'}</h3>
        </div>
        
        <div className="overlap-dialog-content">
          <p className="overlap-message">
            {isEquipment 
              ? '設備の予約時間が重複しています。設備予約は重複できません。'
              : '以下のスケジュールと時間が重複しています。このまま登録しますか？'
            }
          </p>
          
          <div className="overlap-list">
            {overlapInfo.overlappingItems.map((item, index) => (
              <div key={index} className="overlap-item">
                <div className="overlap-item-title">
                  {item.title || item.purpose || '無題'}
                </div>
                <div className="overlap-item-time">
                  {formatDateTime(item.start_datetime)} - {formatDateTime(item.end_datetime)}
                </div>
                {item.employee_name && (
                  <div className="overlap-item-person">担当: {item.employee_name}</div>
                )}
                {item.equipment_name && (
                  <div className="overlap-item-equipment">設備: {item.equipment_name}</div>
                )}
              </div>
            ))}
          </div>
          
          {!isEquipment && (
            <div className="overlap-warning">
              <small>※ 重複を許可した場合、スケジュールに警告マークが表示されます</small>
            </div>
          )}
        </div>
        
        <div className="overlap-dialog-actions">
          <button className="overlap-btn overlap-btn-cancel" onClick={onCancel}>
            {isEquipment ? '閉じる' : 'キャンセル'}
          </button>
          {!isEquipment && (
            <button className="overlap-btn overlap-btn-confirm" onClick={onConfirm}>
              重複を許可して登録
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OverlapConfirmationDialog;
