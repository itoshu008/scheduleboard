import React, { useState, useEffect } from 'react';
import './DepartmentRegistration.css';
import { Department } from '../../types';
import { departmentApi } from '../../utils/api';

interface DepartmentRegistrationProps {
  onClose: () => void;
  onDataRefresh?: () => void;
}

const DepartmentRegistration: React.FC<DepartmentRegistrationProps> = ({ onClose, onDataRefresh }) => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      const response = await departmentApi.getAll();
      setDepartments(response.data);
    } catch (error) {
      console.error('部署データの読み込みエラー:', error);
      alert('部署データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newDepartmentName.trim()) {
      alert('部署名を入力してください。');
      return;
    }

    try {
      await departmentApi.create({ name: newDepartmentName.trim() });
      setNewDepartmentName('');
      await loadDepartments();
      onDataRefresh?.();
      alert('部署を登録しました。');
    } catch (error) {
      console.error('部署登録エラー:', error);
      alert('部署の登録に失敗しました。');
    }
  };

  const handleUpdate = async () => {
    if (!editingDepartment || !editingDepartment.name.trim()) {
      alert('部署名を入力してください。');
      return;
    }

    try {
      await departmentApi.update(editingDepartment.id, { name: editingDepartment.name.trim() });
      setEditingDepartment(null);
      await loadDepartments();
      onDataRefresh?.();
      alert('部署を更新しました。');
    } catch (error) {
      console.error('部署更新エラー:', error);
      alert('部署の更新に失敗しました。');
    }
  };

  const handleDelete = async (departmentId: number) => {
    if (!window.confirm('この部署を削除しますか？')) return;

    try {
      await departmentApi.delete(departmentId);
      await loadDepartments();
      onDataRefresh?.();
      alert('部署を削除しました。');
    } catch (error) {
      console.error('部署削除エラー:', error);
      alert('部署の削除に失敗しました。');
    }
  };

  const startEdit = (department: Department) => {
    setEditingDepartment({ ...department });
  };

  const cancelEdit = () => {
    setEditingDepartment(null);
  };

  return (
    <div className="department-registration">
      <div className="registration-modal">
        <div className="registration-header">
          <h2>部署登録・管理</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="registration-content">
        <div className="create-section">
          <h3>新規部署登録</h3>
          <div className="input-group">
            <input
              type="text"
              value={newDepartmentName}
              onChange={(e) => setNewDepartmentName(e.target.value)}
              placeholder="部署名を入力"
              className="department-input"
            />
            <button onClick={handleCreate} className="create-btn">
              登録
            </button>
          </div>
        </div>

        <div className="list-section">
          <h3>部署一覧</h3>
          {loading ? (
            <div className="loading">読み込み中...</div>
          ) : (
            <div className="department-list">
              {departments.map(department => (
                <div key={department.id} className="department-item">
                  {editingDepartment?.id === department.id ? (
                    <div className="edit-group">
                      <input
                        type="text"
                        value={editingDepartment.name}
                        onChange={(e) => setEditingDepartment({
                          ...editingDepartment,
                          name: e.target.value
                        })}
                        className="department-input"
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
                      <span className="department-name">{department.name}</span>
                      <div className="action-buttons">
                        <button onClick={() => startEdit(department)} className="edit-btn">
                          編集
                        </button>
                        <button onClick={() => handleDelete(department.id)} className="delete-btn">
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

export default DepartmentRegistration;
