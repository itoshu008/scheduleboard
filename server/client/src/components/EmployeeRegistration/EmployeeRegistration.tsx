import React, { useState, useEffect } from 'react';
import './EmployeeRegistration.css';
import { Employee, Department } from '../../types';
import { api } from '../../api';

interface EmployeeRegistrationProps {
  onClose: () => void;
}

const EmployeeRegistration: React.FC<EmployeeRegistrationProps> = ({ onClose }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    department_id: '',
    employee_number: ''
  });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [employeesResponse, departmentsResponse] = await Promise.all([
        api.get('/employees'),
        api.get('/departments')
      ]);
      setEmployees(employeesResponse.data);
      setDepartments(departmentsResponse.data);
    } catch (error) {
      console.error('データの読み込みエラー:', error);
      alert('データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newEmployee.name.trim() || !newEmployee.department_id || !newEmployee.employee_number.trim()) {
      alert('社員番号、社員名、部署を入力してください。');
      return;
    }

    try {
      await api.post('/employees', {
        employee_number: newEmployee.employee_number.trim(),
        name: newEmployee.name.trim(),
        department_id: parseInt(newEmployee.department_id)
      });
      setNewEmployee({ name: '', department_id: '', employee_number: '' });
      await loadData();
      alert('社員を登録しました。');
    } catch (error) {
      console.error('社員登録エラー:', error);
      alert('社員の登録に失敗しました。');
    }
  };

  const handleUpdate = async () => {
    if (!editingEmployee || !editingEmployee.name.trim() || !editingEmployee.department_id || !editingEmployee.employee_number.trim()) {
      alert('社員番号、社員名、部署を入力してください。');
      return;
    }

    try {
      await api.put(`/employees/${editingEmployee.id}`, {
        employee_number: editingEmployee.employee_number.trim(),
        name: editingEmployee.name.trim(),
        department_id: editingEmployee.department_id
      });
      setEditingEmployee(null);
      await loadData();
      alert('社員を更新しました。');
    } catch (error) {
      console.error('社員更新エラー:', error);
      alert('社員の更新に失敗しました。');
    }
  };

  const handleDelete = async (employeeId: number) => {
    if (!window.confirm('この社員を削除しますか？')) return;

    try {
      await api.delete(`/employees/${employeeId}`);
      await loadData();
      alert('社員を削除しました。');
    } catch (error) {
      console.error('社員削除エラー:', error);
      alert('社員の削除に失敗しました。');
    }
  };

  const startEdit = (employee: Employee) => {
    setEditingEmployee({ ...employee });
  };

  const cancelEdit = () => {
    setEditingEmployee(null);
  };

  const getDepartmentName = (departmentId: number) => {
    const department = departments.find(d => d.id === departmentId);
    return department ? department.name : '不明';
  };

  // 部署ごとに社員をグループ化
  const getEmployeesByDepartment = () => {
    const grouped: { [key: number]: Employee[] } = {};
    departments.forEach(dept => {
      grouped[dept.id] = employees.filter(emp => emp.department_id === dept.id);
    });
    return grouped;
  };

  // 順序を入れ替える関数
  const moveEmployee = (employeeId: number, direction: 'up' | 'down') => {
    const updatedEmployees = [...employees];
    const currentIndex = updatedEmployees.findIndex(emp => emp.id === employeeId);
    
    if (currentIndex === -1) return;

    const employee = updatedEmployees[currentIndex];
    const departmentEmployees = updatedEmployees.filter(emp => emp.department_id === employee.department_id);
    const departmentIndex = departmentEmployees.findIndex(emp => emp.id === employeeId);
    
    if (direction === 'up' && departmentIndex > 0) {
      // 上に移動
      const targetEmployee = departmentEmployees[departmentIndex - 1];
      const targetIndex = updatedEmployees.findIndex(emp => emp.id === targetEmployee.id);
      
      // 順序を入れ替え
      [updatedEmployees[currentIndex], updatedEmployees[targetIndex]] = 
      [updatedEmployees[targetIndex], updatedEmployees[currentIndex]];
      
      setEmployees(updatedEmployees);
    } else if (direction === 'down' && departmentIndex < departmentEmployees.length - 1) {
      // 下に移動
      const targetEmployee = departmentEmployees[departmentIndex + 1];
      const targetIndex = updatedEmployees.findIndex(emp => emp.id === targetEmployee.id);
      
      // 順序を入れ替え
      [updatedEmployees[currentIndex], updatedEmployees[targetIndex]] = 
      [updatedEmployees[targetIndex], updatedEmployees[currentIndex]];
      
      setEmployees(updatedEmployees);
    }
  };

  const employeesByDepartment = getEmployeesByDepartment();

  return (
    <div className="employee-registration">
      <div className="registration-modal">
        <div className="registration-header">
          <h2>社員登録・管理</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="registration-content">
          <div className="create-section">
            <h3>新規社員登録</h3>
            <div className="input-group">
              <input
                type="text"
                value={newEmployee.employee_number}
                onChange={(e) => setNewEmployee({
                  ...newEmployee,
                  employee_number: e.target.value
                })}
                placeholder="社員番号を入力"
                className="employee-number-input"
              />
              <input
                type="text"
                value={newEmployee.name}
                onChange={(e) => setNewEmployee({
                  ...newEmployee,
                  name: e.target.value
                })}
                placeholder="社員名を入力"
                className="employee-input"
              />
              <select
                value={newEmployee.department_id}
                onChange={(e) => setNewEmployee({
                  ...newEmployee,
                  department_id: e.target.value
                })}
                className="department-select"
              >
                <option value="">部署を選択</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <button onClick={handleCreate} className="create-btn">
                登録
              </button>
            </div>
          </div>

          <div className="list-section">
            <h3>社員一覧（部署別）</h3>
            {loading ? (
              <div className="loading">読み込み中...</div>
            ) : (
              <div className="department-groups">
                {departments.map(dept => {
                  const departmentEmployees = employeesByDepartment[dept.id] || [];
                  if (departmentEmployees.length === 0) return null;

                  return (
                    <div key={dept.id} className="department-group">
                      <div className="department-group-header">
                        <h4 className="department-group-title">{dept.name}</h4>
                      </div>
                      <div className="employee-list">
                        {departmentEmployees.map((employee, index) => (
                          <div key={employee.id} className="employee-item">
                            <div className="order-buttons">
                              <button
                                className="order-btn up-btn"
                                onClick={() => moveEmployee(employee.id, 'up')}
                                disabled={index === 0}
                                title="上に移動"
                              >
                                ↑
                              </button>
                              <button
                                className="order-btn down-btn"
                                onClick={() => moveEmployee(employee.id, 'down')}
                                disabled={index === departmentEmployees.length - 1}
                                title="下に移動"
                              >
                                ↓
                              </button>
                            </div>
                            {editingEmployee?.id === employee.id ? (
                              <div className="edit-group">
                                <input
                                  type="text"
                                  value={editingEmployee.employee_number}
                                  onChange={(e) => setEditingEmployee({
                                    ...editingEmployee,
                                    employee_number: e.target.value
                                  })}
                                  className="employee-number-input"
                                />
                                <input
                                  type="text"
                                  value={editingEmployee.name}
                                  onChange={(e) => setEditingEmployee({
                                    ...editingEmployee,
                                    name: e.target.value
                                  })}
                                  className="employee-input"
                                />
                                <select
                                  value={editingEmployee.department_id}
                                  onChange={(e) => setEditingEmployee({
                                    ...editingEmployee,
                                    department_id: parseInt(e.target.value)
                                  })}
                                  className="department-select"
                                >
                                  {departments.map(dept => (
                                    <option key={dept.id} value={dept.id}>
                                      {dept.name}
                                    </option>
                                  ))}
                                </select>
                                <button onClick={handleUpdate} className="update-btn">
                                  更新
                                </button>
                                <button onClick={cancelEdit} className="cancel-btn">
                                  キャンセル
                                </button>
                              </div>
                            ) : (
                              <div className="display-group">
                                <div className="employee-info">
                                  <span className="employee-number">{employee.employee_number}</span>
                                  <span className="employee-name">{employee.name}</span>
                                  <span className="department-name">
                                    {getDepartmentName(employee.department_id)}
                                  </span>
                                </div>
                                <div className="action-buttons">
                                  <button onClick={() => startEdit(employee)} className="edit-btn">
                                    編集
                                  </button>
                                  <button onClick={() => handleDelete(employee.id)} className="delete-btn">
                                    削除
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeRegistration;
