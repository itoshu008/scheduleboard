import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// コンポーネント
import MonthlySchedule from './components/MonthlySchedule/MonthlySchedule';
import DailySchedule from './components/DailySchedule/DailySchedule';
import AllEmployeesSchedule from './components/AllEmployeesSchedule/AllEmployeesSchedule';
import EquipmentReservation from './components/EquipmentReservation/EquipmentReservation';
import UserManagement from './components/UserManagement/UserManagement';
import ScaleControl from './components/ScaleControl/ScaleControl';
import Health from './pages/Health';


// 型定義
import { Department, Employee, Equipment, Schedule } from './types';

// API
import { departmentApi, employeeApi, equipmentApi, scheduleApi } from './utils/api';
import { logHealthCheck } from './utils/health';

// AppContentコンポーネント（Router内部で動作）
const AppContent: React.FC = () => {
  
  // 状態管理
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初期データ読み込み
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        // APIヘルスチェック
        await logHealthCheck();

        // 並行してデータを取得（スケジュールも含める）
        const [departmentsRes, employeesRes, equipmentRes, schedulesRes] = await Promise.all([
          departmentApi.getAll(),
          employeeApi.getAll(),
          equipmentApi.getAll(),
          scheduleApi.getAll(),
        ]);

        // データが配列でない場合は空配列を設定
        setDepartments(Array.isArray(departmentsRes.data) ? departmentsRes.data : []);
        setEmployees(Array.isArray(employeesRes.data) ? employeesRes.data : []);
        setEquipment(Array.isArray(equipmentRes.data) ? equipmentRes.data : []);
        setSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
        
        console.log('App: Initial data loaded - schedules:', schedulesRes.data?.length || 0);

        // デフォルト選択
        if (departmentsRes.data.length > 0) {
          setSelectedDepartment(departmentsRes.data[0]);
          
          // 最初の部署の最初の社員を選択
          const firstDeptEmployees = employeesRes.data.filter(
            emp => emp.department_id === departmentsRes.data[0].id
          );
          if (firstDeptEmployees.length > 0) {
            setSelectedEmployee(firstDeptEmployees[0]);
          }
        }

        // 設備の初期選択は不要

      } catch (err) {
        console.error('初期データ読み込みエラー:', err);
        setError('データの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // スケジュール再読み込み関数
  const reloadSchedules = async () => {
    try {
      console.log('App: reloadSchedules called');
      const schedulesRes = await scheduleApi.getAll();
      console.log('App: scheduleApi.getAll response:', schedulesRes.status, schedulesRes.data?.length);
      const newSchedules = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];
      console.log('App: Setting schedules count:', newSchedules.length);
      setSchedules(newSchedules);
      console.log('App: reloadSchedules completed');
    } catch (err) {
      console.error('スケジュール読み込みエラー:', err);
    }
  };

  // 部署変更時の処理
  const handleDepartmentChange = async (department: Department | null) => {
    setSelectedDepartment(department);
    
    if (department) {
      try {
        const employeesRes = await employeeApi.getAll({ department_id: department.id });
        const deptEmployees = Array.isArray(employeesRes.data) ? employeesRes.data : [];
        
        if (deptEmployees.length > 0) {
          setSelectedEmployee(deptEmployees[0]);
        } else {
          setSelectedEmployee(null);
        }
      } catch (err) {
        console.error('社員データ取得エラー:', err);
      }
    } else {
      // 部署がnullの場合は、全社員を表示対象とする
      setSelectedEmployee(null);
    }
  };

  // 社員変更時の処理
  const handleEmployeeChange = (employee: Employee) => {
    setSelectedEmployee(employee);
    
    // 社員の部署も更新
    const employeeDepartment = departments.find(dept => dept.id === employee.department_id);
    if (employeeDepartment && employeeDepartment.id !== selectedDepartment?.id) {
      setSelectedDepartment(employeeDepartment);
    }
  };

  // スケジュール関連のハンドラー
  const handleScheduleUpdate = (schedule: Schedule) => {
    setSchedules(prev => prev.map(s => s.id === schedule.id ? schedule : s));
  };

  const handleScheduleDelete = (scheduleId: number) => {
    setSchedules(prev => prev.filter(s => s.id !== scheduleId));
  };

  const handleScheduleCreate = (scheduleData: any) => {
    const newSchedule: Schedule = {
      id: Date.now(), // 仮のID
      employee_id: scheduleData.employee_id,
      title: scheduleData.title || scheduleData.purpose,
      start_datetime: scheduleData.start_datetime,
      end_datetime: scheduleData.end_datetime,
      color: scheduleData.color || '#FFA502',
      employee_name: employees.find(emp => emp.id === scheduleData.employee_id)?.name || '',
      hasOverlap: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    setSchedules(prev => [...prev, newSchedule]);
  };

  // 部署データ更新の処理
  const handleDepartmentDataRefresh = async () => {
    try {
      const departmentsRes = await departmentApi.getAll();
      setDepartments(Array.isArray(departmentsRes.data) ? departmentsRes.data : []);
      
      // 現在選択中の部署が削除された場合の処理
      if (selectedDepartment && !departmentsRes.data.find(dept => dept.id === selectedDepartment.id)) {
        if (departmentsRes.data.length > 0) {
          setSelectedDepartment(departmentsRes.data[0]);
        } else {
          setSelectedDepartment(null);
        }
      }
    } catch (err) {
      // 部署データ更新エラーはサイレントに処理
    }
  };





  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>データを読み込んでいます...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <h2>エラーが発生しました</h2>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          再読み込み
        </button>
      </div>
    );
  }

  return (
    <div className="app">

        {/* スケール制御 */}
        <ScaleControl 
          onScaleChange={(scale) => {
            console.log('Scale changed to:', scale);
          }}
        />
        
        <main className="app-main">
          <Routes>
            <Route 
              path="/" 
              element={<Navigate to="/monthly" replace />} 
            />
            <Route 
              path="/monthly" 
              element={
                <MonthlySchedule
                  selectedDepartment={selectedDepartment}
                  selectedEmployee={selectedEmployee}
                  selectedDate={selectedDate}
                  schedules={schedules}
                  equipments={equipment}
                  onDateChange={setSelectedDate}
                  departments={departments}
                  employees={employees}
                  onDepartmentChange={handleDepartmentChange}
                  onEmployeeChange={handleEmployeeChange}
                  reloadSchedules={reloadSchedules}
                  onScheduleCreate={(schedule) => {
                    // 即時反映（同月フィルタはMonthly側が実施）
                    setSchedules(prev => [...prev, schedule]);
                  }}
                />
              } 
            />
            <Route 
              path="/daily" 
              element={
                <DailySchedule
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  departments={departments}
                  employees={employees}
                  onDepartmentChange={handleDepartmentChange}
                  onEmployeeChange={handleEmployeeChange}
                />
              } 
            />
            <Route 
              path="/all-employees" 
              element={
                <AllEmployeesSchedule
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  departments={departments}
                  employees={employees}
                  onDepartmentChange={handleDepartmentChange}
                  onEmployeeChange={handleEmployeeChange}
                />
              } 
            />
            <Route 
              path="/equipment" 
              element={
                <EquipmentReservation
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  equipments={equipment}
                />
              } 
            />
            <Route 
              path="/management" 
              element={
                <UserManagement
                  departments={departments}
                  employees={employees}
                  equipment={equipment}
                  onDataRefresh={() => {
                    // データを再読み込み
                    const loadInitialData = async () => {
                      try {
                        const [departmentsRes, employeesRes, equipmentRes] = await Promise.all([
                          departmentApi.getAll(),
                          employeeApi.getAll(),
                          equipmentApi.getAll(),
                        ]);

                        // データが配列でない場合は空配列を設定
                        setDepartments(Array.isArray(departmentsRes.data) ? departmentsRes.data : []);
                        setEmployees(Array.isArray(employeesRes.data) ? employeesRes.data : []);
                        setEquipment(Array.isArray(equipmentRes.data) ? equipmentRes.data : []);
                      } catch (err) {
                        console.error('データ再読み込みエラー:', err);
                      }
                    };
                    loadInitialData();
                  }}
                />
              } 
            />
            <Route 
              path="/health" 
              element={<Health />} 
            />
          </Routes>
        </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppContent />
    </Router>
  );
};

export default App;