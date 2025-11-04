import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { upsertEventIfChanged } from './utils/eventEquality';
import { normalizeEvent, eventSig } from './utils/timeQuant';
import dayjs from 'dayjs';
import './App.css';
import './styles/debug.css'; // デバッグ用CSS

// コンポーネント
import MonthlySchedule from './components/MonthlySchedule/MonthlySchedule';
import DailySchedule from './components/DailySchedule/DailySchedule';
import AllEmployeesSchedule from './components/AllEmployeesSchedule/AllEmployeesSchedule';
// import EquipmentReservation from './components/EquipmentReservation/EquipmentReservation';
import SimpleEquipmentReservation from './components/SimpleEquipmentReservation/SimpleEquipmentReservation';
import UserManagement from './components/UserManagement/UserManagement';
import ScaleControl from './components/ScaleControl/ScaleControl';
import Health from './pages/Health';


// 型定義
import { Department, Employee, Equipment, Schedule } from './types';

// API
import { departmentApi, employeeApi, equipmentApi, scheduleApi } from './utils/api';
import { checkApiHealth } from './utils/health';

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
        await checkApiHealth();

        // 並行してデータを取得（スケジュールは当月範囲で取得）
        console.log('App: Starting data loading...');
        const initYear = (new Date()).getFullYear();
        const initMonth = (new Date()).getMonth() + 1; // 1-12
        const initStartJst = new Date(`${initYear}-${String(initMonth).padStart(2, '0')}-01T00:00:00.000+09:00`);
        const initNextMonthJst = new Date(initStartJst);
        initNextMonthJst.setMonth(initNextMonthJst.getMonth() + 1);
        const initRangeParams: any = {
          start: initStartJst.toISOString(),
          end: initNextMonthJst.toISOString(),
          start_date: initStartJst.toISOString(),
          end_date: initNextMonthJst.toISOString(),
        };

        const [departmentsRes, employeesRes, equipmentRes, schedulesRes] = await Promise.all([
          departmentApi.getAll(),
          employeeApi.getAll(),
          equipmentApi.getAll(),
          scheduleApi.getAll(initRangeParams),
        ]);
        console.log('App: Data loading completed:', {
          departments: departmentsRes.data?.length || 0,
          employees: employeesRes.data?.length || 0,
          equipment: equipmentRes.data?.length || 0,
          schedules: schedulesRes.data?.length || 0
        });

        // データが配列でない場合は空配列を設定
        setDepartments(Array.isArray(departmentsRes.data) ? departmentsRes.data : []);
        setEmployees(Array.isArray(employeesRes.data) ? employeesRes.data : []);
        setEquipment(Array.isArray(equipmentRes.data) ? equipmentRes.data : []);
        setSchedules(Array.isArray(schedulesRes.data) ? schedulesRes.data : []);
        
        console.log('App: Initial data loaded - schedules:', schedulesRes.data?.length || 0);

        // デフォルト選択（データが無い場合でもアプリケーションを表示）
        if (departmentsRes.data.length > 0) {
          setSelectedDepartment(departmentsRes.data[0]);
          
          // 最初の部署の最初の社員を選択
          const firstDeptEmployees = employeesRes.data.filter(
            emp => emp.department_id === departmentsRes.data[0].id
          );
          if (firstDeptEmployees.length > 0) {
            setSelectedEmployee(firstDeptEmployees[0]);
          }
        } else {
          // データが無い場合はnullを設定
          setSelectedDepartment(null);
          setSelectedEmployee(null);
        }

        // 設備の初期選択は不要

      } catch (err: any) {
        console.error('初期データ読み込みエラー:', err);
        console.error('エラー詳細:', {
          message: err?.message || 'Unknown error',
          status: err?.response?.status,
          data: err?.response?.data
        });
        
        // エラーが発生してもアプリケーションを表示（データは空配列で初期化）
        setDepartments([]);
        setEmployees([]);
        setEquipment([]);
        setSchedules([]);
        setSelectedDepartment(null);
        setSelectedEmployee(null);
        
        // エラーは表示しない（データが無い場合でもアプリケーションを使用可能にする）
        console.log('App: Continuing with empty data due to error');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // 去重＆同値スキップ用のref
  const lastReqKeyRef = useRef<string>('');
  const inflightRef = useRef<AbortController | null>(null);
  const prevApiSigRef = useRef<string>('');

  // 月ビューの期間 & フィルタからリクエストキー作成（同一キーなら叩かない）
  const reqKey = useMemo(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;
    const rangeStart = dayjs(`${year}-${String(month).padStart(2,'0')}-01`).startOf('month').toISOString();
    const rangeEnd = dayjs(rangeStart).endOf('month').toISOString();
    return JSON.stringify({ 
      employeeId: selectedEmployee?.id, 
      departmentId: selectedDepartment?.id, 
      rangeStart, 
      rangeEnd 
    });
  }, [selectedEmployee?.id, selectedDepartment?.id, selectedDate]);

  // スケジュール再読み込み関数（去重＆同値スキップ）
  const reloadSchedules = useCallback(async () => {
    if (reqKey === lastReqKeyRef.current) {
      console.debug('🔄 App: skip reload (same reqKey)');
      return;
    }
    lastReqKeyRef.current = reqKey;

    // 既存リクエストは中断
    inflightRef.current?.abort();
    const ac = new AbortController();
    inflightRef.current = ac;

    console.log('🔄 App: reloadSchedules START', { 
      employeeId: selectedEmployee?.id, 
      departmentId: selectedDepartment?.id, 
      year: selectedDate.getFullYear(), 
      month: selectedDate.getMonth() + 1
    });

    try {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      const startJst = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00.000+09:00`);
      const nextMonthJst = new Date(startJst);
      nextMonthJst.setMonth(nextMonthJst.getMonth() + 1);
      
      const params: any = {
        start: startJst.toISOString(),
        end: nextMonthJst.toISOString(),
        start_date: startJst.toISOString(),
        end_date: nextMonthJst.toISOString()
      };
      if (selectedEmployee?.id) {
        params.employee_id = selectedEmployee.id;
      } else if (selectedDepartment?.id) {
        params.department_id = selectedDepartment.id;
      }

      const res = await scheduleApi.getAll(params);
      const raw = Array.isArray(res.data) ? res.data : [];
      const normalized = raw.map((e: any) => normalizeEvent(e) as Schedule);
      const apiSig = normalized.map(eventSig).sort().join('@@');

      // **内容が同じなら set しない**
      if (apiSig === prevApiSigRef.current) {
        console.debug('🔄 App: skip setSchedules (no content change)');
        return;
      }
      prevApiSigRef.current = apiSig;

      setSchedules(normalized);
      console.log('🔄 App: reloadSchedules DONE, count:', normalized.length);
    } catch (err) {
      console.error('❌ スケジュール読み込みエラー:', err);
    }
  }, [reqKey, selectedEmployee?.id, selectedDepartment?.id, selectedDate]);

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
    setSchedules(prev => upsertEventIfChanged(prev, schedule));
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
    setSchedules(prev => upsertEventIfChanged(prev, newSchedule));
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

  // 担当者/部署/日付が変わったら月別を再取得
  useEffect(() => {
    // Monthlyページ以外でも整合性を保つため常に更新
    reloadSchedules().catch(() => void 0);
  }, [selectedEmployee, selectedDepartment, selectedDate, reloadSchedules]);
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

  // データが無い場合でもアプリケーションを表示
  console.log('App: Rendering with data:', {
    departments: departments.length,
    employees: employees.length,
    equipment: equipment.length,
    schedules: schedules.length
  });

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
                    setSchedules(prev => upsertEventIfChanged(prev, schedule));
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
                <SimpleEquipmentReservation
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