import React, { useState, useEffect } from 'react';
import './EquipmentRegistration.css';
import { Equipment } from '../../types';
import { api } from '../../api';

interface EquipmentRegistrationProps {
  onClose: () => void;
}

const EquipmentRegistration: React.FC<EquipmentRegistrationProps> = ({ onClose }) => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [newEquipment, setNewEquipment] = useState({
    name: '',
    description: ''
  });
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEquipment();
  }, []);

  const loadEquipment = async () => {
    try {
      setLoading(true);
      const response = await api.get('/equipment');
      setEquipment(response.data);
    } catch (error) {
      console.error('設備データの読み込みエラー:', error);
      alert('設備データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newEquipment.name.trim()) {
      alert('設備名を入力してください。');
      return;
    }

    try {
      await api.post('/equipment', {
        name: newEquipment.name.trim(),
        description: newEquipment.description.trim() || ''
      });
      setNewEquipment({ name: '', description: '' });
      await loadEquipment();
      alert('設備を登録しました。');
    } catch (error) {
      console.error('設備登録エラー:', error);
      alert('設備の登録に失敗しました。');
    }
  };

  const handleUpdate = async () => {
    if (!editingEquipment || !editingEquipment.name.trim()) {
      alert('設備名を入力してください。');
      return;
    }

    try {
      await api.put(`/equipment/${editingEquipment.id}`, {
        name: editingEquipment.name.trim(),
        description: editingEquipment.description?.trim() || ''
      });
      setEditingEquipment(null);
      await loadEquipment();
      alert('設備を更新しました。');
    } catch (error) {
      console.error('設備更新エラー:', error);
      alert('設備の更新に失敗しました。');
    }
  };

  const handleDelete = async (equipmentId: number) => {
    if (!window.confirm('この設備を削除しますか？')) return;

    try {
      await api.delete(`/equipment/${equipmentId}`);
      await loadEquipment();
      alert('設備を削除しました。');
    } catch (error) {
      console.error('設備削除エラー:', error);
      alert('設備の削除に失敗しました。');
    }
  };

  const startEdit = (equipment: Equipment) => {
    setEditingEquipment({ ...equipment });
  };

  const cancelEdit = () => {
    setEditingEquipment(null);
  };

  return (
    <div className="equipment-registration">
      <div className="registration-modal">
        <div className="registration-header">
          <h2>設備登録・管理</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="registration-content">
        <div className="create-section">
          <h3>新規設備登録</h3>
          <div className="input-group">
            <input
              type="text"
              value={newEquipment.name}
              onChange={(e) => setNewEquipment({
                ...newEquipment,
                name: e.target.value
              })}
              placeholder="設備名を入力"
              className="equipment-input"
            />
            <input
              type="text"
              value={newEquipment.description}
              onChange={(e) => setNewEquipment({
                ...newEquipment,
                description: e.target.value
              })}
              placeholder="説明（任意）"
              className="description-input"
            />
            <button onClick={handleCreate} className="create-btn">
              登録
            </button>
          </div>
        </div>

        <div className="list-section">
          <h3>設備一覧</h3>
          {loading ? (
            <div className="loading">読み込み中...</div>
          ) : (
            <div className="equipment-list">
              {equipment.map(equipment => (
                <div key={equipment.id} className="equipment-item">
                  {editingEquipment?.id === equipment.id ? (
                    <div className="edit-group">
                      <input
                        type="text"
                        value={editingEquipment.name}
                        onChange={(e) => setEditingEquipment({
                          ...editingEquipment,
                          name: e.target.value
                        })}
                        className="equipment-input"
                      />
                      <input
                        type="text"
                        value={editingEquipment.description}
                        onChange={(e) => setEditingEquipment({
                          ...editingEquipment,
                          description: e.target.value
                        })}
                        className="description-input"
                      />
                      <button onClick={handleUpdate} className="update-btn">
                        更新
                      </button>
                      <button onClick={cancelEdit} className="cancel-btn">
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <div className="display-group">
                      <div className="equipment-info">
                        <span className="equipment-name">{equipment.name}</span>
                        {equipment.description && (
                          <span className="equipment-description">
                            {equipment.description}
                          </span>
                        )}
                      </div>
                      <div className="action-buttons">
                        <button onClick={() => startEdit(equipment)} className="edit-btn">
                          編集
                        </button>
                        <button onClick={() => handleDelete(equipment.id)} className="delete-btn">
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
};

export default EquipmentRegistration;
