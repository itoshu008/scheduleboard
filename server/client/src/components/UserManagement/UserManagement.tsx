import React, { useState } from 'react';
import './UserManagement.css';

// 型定義
import { Department, Employee, Equipment } from '../../types';

// API
import { departmentApi, employeeApi, equipmentApi } from '../../utils/api';

interface UserManagementProps {
  departments: Department[];
  employees: Employee[];
  equipment: Equipment[];
  onDataRefresh: () => void;
}

// フォーム用の型定義
interface DepartmentForm {
  name: string;
}

interface EmployeeForm {
  employee_number: string;
  name: string;
  department_id: number;
}

interface EquipmentForm {
  name: string;
  description: string;
}



const UserManagement: React.FC<UserManagementProps> = ({
  departments,
  employees,
  equipment,
  onDataRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'departments' | 'employees' | 'equipment'>('departments');
  
  // モーダル状態
  const [showDepartmentModal, setShowDepartmentModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  
  // 編集モード
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  
  // フォーム状態
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>({
    name: ''
  });
  
  const [employeeForm, setEmployeeForm] = useState<EmployeeForm>({
    employee_number: '',
    name: '',
    department_id: 0
  });
  
  const [equipmentForm, setEquipmentForm] = useState<EquipmentForm>({
    name: '',
    description: ''
  });
  
  // ローディング状態
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 部署関連の処理
  const handleDepartmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      if (editingDepartment) {
        await departmentApi.update(editingDepartment.id, departmentForm);
      } else {
        await departmentApi.create(departmentForm);
      }
      
      onDataRefresh();
      handleCloseDepartmentModal();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentDelete = async (id: number) => {
    if (!window.confirm('この部署を削除しますか？')) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await departmentApi.delete(id);
      onDataRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDepartmentEdit = (department: Department) => {
    setEditingDepartment(department);
    setDepartmentForm({
      name: department.name
    });
    setShowDepartmentModal(true);
  };

  const handleCloseDepartmentModal = () => {
    setShowDepartmentModal(false);
    setEditingDepartment(null);
    setDepartmentForm({ name: '' });
    setError(null);
  };

  // 部署の移動
  const handleDepartmentMove = async (id: number, direction: 'up' | 'down') => {
    setLoading(true);
    setError(null);
    
    try {
      await departmentApi.move(id, direction);
      onDataRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || '移動に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 社員関連の処理
  const handleEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      if (editingEmployee) {
        await employeeApi.update(editingEmployee.id, employeeForm);
      } else {
        await employeeApi.create(employeeForm);
      }
      
      onDataRefresh();
      handleCloseEmployeeModal();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeDelete = async (id: number) => {
    if (!window.confirm('この社員を削除しますか？')) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await employeeApi.delete(id);
      onDataRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({
      employee_number: employee.employee_number,
      name: employee.name,
      department_id: employee.department_id || 0
    });
    setShowEmployeeModal(true);
  };

  const handleCloseEmployeeModal = () => {
    setShowEmployeeModal(false);
    setEditingEmployee(null);
    setEmployeeForm({ employee_number: '', name: '', department_id: 0 });
    setError(null);
  };

  // 社員の移動
  const handleEmployeeMove = async (id: number, direction: 'up' | 'down') => {
    setLoading(true);
    setError(null);
    
    try {
      await employeeApi.move(id, direction);
      onDataRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || '移動に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 設備関連の処理
  const handleEquipmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      if (editingEquipment) {
        await equipmentApi.update(editingEquipment.id, equipmentForm);
      } else {
        await equipmentApi.create(equipmentForm);
      }
      
      onDataRefresh();
      handleCloseEquipmentModal();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleEquipmentDelete = async (id: number) => {
    if (!window.confirm('この設備を削除しますか？')) return;
    
    setLoading(true);
    setError(null);
    
    try {
      await equipmentApi.delete(id);
      onDataRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || 'エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };



  const handleEquipmentEdit = (equipment: Equipment) => {
    setEditingEquipment(equipment);
    setEquipmentForm({
      name: equipment.name,
      description: equipment.description || ''
    });
    setShowEquipmentModal(true);
  };

  const handleCloseEquipmentModal = () => {
    setShowEquipmentModal(false);
    setEditingEquipment(null);
    setEquipmentForm({ name: '', description: '' });
    setError(null);
  };

  // 設備の移動
  const handleEquipmentMove = async (id: number, direction: 'up' | 'down') => {
    setLoading(true);
    setError(null);
    
    try {
      await equipmentApi.move(id, direction);
      onDataRefresh();
    } catch (err: any) {
      setError(err.response?.data?.error || '移動に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="user-management">
      <div className="management-header">
        <h2>登録管理</h2>
        <p>部署、社員、設備の登録と管理を行います</p>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* タブ */}
      <div className="management-tabs">
        <button
          className={`tab-btn ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          部署登録
        </button>
        <button
          className={`tab-btn ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          社員登録
        </button>
        <button
          className={`tab-btn ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={() => setActiveTab('equipment')}
        >
          設備登録
        </button>

      </div>

      <div className="management-content">
        {activeTab === 'departments' && (
          <div className="tab-content">
            <h3>部署管理</h3>
            <div className="section-description">
              <p>部署の登録、編集、削除、並び替えを行います</p>
            </div>
            
            <div className="data-list">
              <div className="list-header">
                <h4>登録済み部署一覧</h4>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowDepartmentModal(true)}
                  disabled={loading}
                >
                  新規部署追加
                </button>
              </div>
              
              {departments.length === 0 ? (
                <div className="empty-state">
                  <p>部署が登録されていません</p>
                </div>
              ) : (
                <div className="data-table">
                  <div className="table-header">
                    <div className="col-name">部署名</div>
                    <div className="col-actions">操作</div>
                  </div>
                  {departments.map((dept, index) => (
                    <div key={dept.id} className="table-row">
                      <div className="col-name">{dept.name}</div>
                      <div className="col-actions">
                        <div className="action-buttons">
                          <div className="move-buttons">
                            <button 
                              className="btn-small btn-move"
                              onClick={() => handleDepartmentMove(dept.id, 'up')}
                              disabled={loading || index === 0}
                              title="上に移動"
                            >
                              ↑
                            </button>
                            <button 
                              className="btn-small btn-move"
                              onClick={() => handleDepartmentMove(dept.id, 'down')}
                              disabled={loading || index === departments.length - 1}
                              title="下に移動"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="edit-buttons">
                            <button 
                              className="btn-small btn-secondary"
                              onClick={() => handleDepartmentEdit(dept)}
                              disabled={loading}
                            >
                              編集
                            </button>
                            <button 
                              className="btn-small btn-danger"
                              onClick={() => handleDepartmentDelete(dept.id)}
                              disabled={loading}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'employees' && (
          <div className="tab-content">
            <h3>社員管理</h3>
            <div className="section-description">
              <p>社員の登録、編集、削除を行います</p>
            </div>
            
            <div className="data-list">
              <div className="list-header">
                <h4>登録済み社員一覧</h4>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowEmployeeModal(true)}
                  disabled={loading}
                >
                  新規社員追加
                </button>
              </div>
              
              {employees.length === 0 ? (
                <div className="empty-state">
                  <p>社員が登録されていません</p>
                </div>
              ) : (
                <div className="data-table">
                  <div className="table-header">
                    <div className="col-number">社員番号</div>
                    <div className="col-name">氏名</div>
                    <div className="col-department">部署</div>
                    <div className="col-actions">操作</div>
                  </div>
                  {employees.map((emp, index) => (
                    <div key={emp.id} className="table-row">
                      <div className="col-number">{emp.employee_number}</div>
                      <div className="col-name">{emp.name}</div>
                      <div className="col-department">{emp.department_name}</div>
                      <div className="col-actions">
                        <div className="action-buttons">
                          <div className="move-buttons">
                            <button 
                              className="btn-small btn-move"
                              onClick={() => handleEmployeeMove(emp.id, 'up')}
                              disabled={loading || index === 0}
                              title="上に移動"
                            >
                              ↑
                            </button>
                            <button 
                              className="btn-small btn-move"
                              onClick={() => handleEmployeeMove(emp.id, 'down')}
                              disabled={loading || index === employees.length - 1}
                              title="下に移動"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="edit-buttons">
                            <button 
                              className="btn-small btn-secondary"
                              onClick={() => handleEmployeeEdit(emp)}
                              disabled={loading}
                            >
                              編集
                            </button>
                            <button 
                              className="btn-small btn-danger"
                              onClick={() => handleEmployeeDelete(emp.id)}
                              disabled={loading}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'equipment' && (
          <div className="tab-content">
            <h3>設備管理</h3>
            <div className="section-description">
              <p>設備の登録、編集、削除、並び替えを行います</p>
            </div>
            
            <div className="data-list">
              <div className="list-header">
                <h4>登録済み設備一覧</h4>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowEquipmentModal(true)}
                  disabled={loading}
                >
                  新規設備追加
                </button>
              </div>
              
              {equipment.length === 0 ? (
                <div className="empty-state">
                  <p>設備が登録されていません</p>
                </div>
              ) : (
                <div className="data-table">
                  <div className="table-header">
                    <div className="col-name">設備名</div>
                    <div className="col-description">説明</div>
                    <div className="col-actions">操作</div>
                  </div>
                  {equipment.map((equip, index) => (
                    <div key={equip.id} className="table-row">
                      <div className="col-name">{equip.name}</div>
                      <div className="col-description">{equip.description || '-'}</div>
                      <div className="col-actions">
                        <div className="action-buttons">
                          <div className="move-buttons">
                            <button 
                              className="btn-small btn-move"
                              onClick={() => handleEquipmentMove(equip.id, 'up')}
                              disabled={loading || index === 0}
                              title="上に移動"
                            >
                              ↑
                            </button>
                            <button 
                              className="btn-small btn-move"
                              onClick={() => handleEquipmentMove(equip.id, 'down')}
                              disabled={loading || index === equipment.length - 1}
                              title="下に移動"
                            >
                              ↓
                            </button>
                          </div>
                          <div className="edit-buttons">
                            <button 
                              className="btn-small btn-secondary"
                              onClick={() => handleEquipmentEdit(equip)}
                              disabled={loading}
                            >
                              編集
                            </button>
                            <button 
                              className="btn-small btn-danger"
                              onClick={() => handleEquipmentDelete(equip.id)}
                              disabled={loading}
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}


      </div>

      {/* 部署モーダル */}
      {showDepartmentModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingDepartment ? '部署編集' : '新規部署追加'}</h3>
              <button className="modal-close" onClick={handleCloseDepartmentModal}>×</button>
            </div>
            <form onSubmit={handleDepartmentSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>部署名 *</label>
                  <input
                    type="text"
                    value={departmentForm.name}
                    onChange={(e) => setDepartmentForm({...departmentForm, name: e.target.value})}
                    required
                    disabled={loading}
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseDepartmentModal} disabled={loading}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '処理中...' : (editingDepartment ? '更新' : '登録')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 社員モーダル */}
      {showEmployeeModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingEmployee ? '社員編集' : '新規社員追加'}</h3>
              <button className="modal-close" onClick={handleCloseEmployeeModal}>×</button>
            </div>
            <form onSubmit={handleEmployeeSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>社員番号 *</label>
                  <input
                    type="text"
                    value={employeeForm.employee_number}
                    onChange={(e) => setEmployeeForm({...employeeForm, employee_number: e.target.value})}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>氏名 *</label>
                  <input
                    type="text"
                    value={employeeForm.name}
                    onChange={(e) => setEmployeeForm({...employeeForm, name: e.target.value})}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>部署 *</label>
                  <select
                    value={employeeForm.department_id}
                    onChange={(e) => setEmployeeForm({...employeeForm, department_id: parseInt(e.target.value)})}
                    required
                    disabled={loading}
                  >
                    <option value="">部署を選択</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseEmployeeModal} disabled={loading}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '処理中...' : (editingEmployee ? '更新' : '登録')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 設備モーダル */}
      {showEquipmentModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingEquipment ? '設備編集' : '新規設備追加'}</h3>
              <button className="modal-close" onClick={handleCloseEquipmentModal}>×</button>
            </div>
            <form onSubmit={handleEquipmentSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>設備名 *</label>
                  <input
                    type="text"
                    value={equipmentForm.name}
                    onChange={(e) => setEquipmentForm({...equipmentForm, name: e.target.value})}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>説明</label>
                  <textarea
                    value={equipmentForm.description}
                    onChange={(e) => setEquipmentForm({...equipmentForm, description: e.target.value})}
                    disabled={loading}
                    rows={3}
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseEquipmentModal} disabled={loading}>
                  キャンセル
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? '処理中...' : (editingEquipment ? '更新' : '登録')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


    </div>
  );
};

export default UserManagement;