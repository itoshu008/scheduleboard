import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { upsertEventIfChanged } from './utils/eventEquality';
import { normalizeEvent, eventSig } from './utils/timeQuant';
import { markOverlappingSchedules } from './utils/overlapUtils';
import dayjs from 'dayjs';
import './App.css';
import './styles/debug.css'; // イベントバー表示用CSS

// コンポーネント
import MonthlySchedule from './components/MonthlySchedule/MonthlySchedule';
import DailySchedule from './components/DailySchedule/DailySchedule';
import AllEmployeesSchedule from './components/AllEmployeesSchedule/AllEmployeesSchedule';
// import EquipmentReservation from './components/EquipmentReservation/EquipmentReservation';
import SimpleEquipmentReservation from './components/SimpleEquipmentReservation/SimpleEquipmentReservation';
import UserManagement from './components/UserManagement/UserManagement';
import Health from './pages/Health';


// 型定義
import { Department, Employee, Equipment, Schedule } from './types';

// API
import { departmentApi, employeeApi, equipmentApi, scheduleApi } from './utils/api';
import { checkApiHealth } from './utils/health';
import { initializeHolidayData, formatDate } from './utils/dateUtils';
import { useWebSocket } from './hooks/useWebSocket';

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
  const [dailySchedules, setDailySchedules] = useState<Schedule[]>([]); // 日別・全社員用
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // リアルタイム反映機能（WebSocket）
  const realTimeData = useWebSocket(selectedDate);

  // リアルタイムデータを反映（即座に更新、無限ループ防止）
  const lastUpdateTimeRef = useRef<Date | null>(null);
  useEffect(() => {
    if (realTimeData.lastUpdated) {
      // 同じ更新時刻ならスキップ（無限ループ防止）
      if (lastUpdateTimeRef.current && 
          lastUpdateTimeRef.current.getTime() === realTimeData.lastUpdated.getTime()) {
        return;
      }
      lastUpdateTimeRef.current = realTimeData.lastUpdated;
      
      console.log('🔔 App.tsx: realTimeData updated:', {
        lastUpdated: realTimeData.lastUpdated.toISOString(),
        schedulesCount: realTimeData.schedules.length,
        departmentsCount: realTimeData.departments.length,
        employeesCount: realTimeData.employees.length
      });
      
      // リアルタイムデータが更新されたら即座に反映
      if (realTimeData.departments.length > 0) {
        setDepartments(realTimeData.departments);
      }
      if (realTimeData.employees.length > 0) {
        setEmployees(realTimeData.employees);
      }
      if (realTimeData.equipment.length > 0) {
        setEquipment(realTimeData.equipment);
      }
      // スケジュールは常に更新（空配列でも更新）
      console.log('📝 App.tsx: Updating schedules state with', realTimeData.schedules.length, 'items');
      setSchedules(realTimeData.schedules);
      
      // 日別・全社員スケジュールも即座に更新（選択日を含む月全体のスケジュールをフィルタリング）
      // 勤怠アプリに影響を与えないよう、ScheduleBoard専用API（/admin/schedules）のみを使用
      const dateStr = formatDate(selectedDate);
      // 選択日を含む月の開始日と終了日を計算
      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 0, 0, 0);
      const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59);
      
      const dailyScheds = realTimeData.schedules.filter((s: Schedule) => {
        const startTime = new Date(s.start_datetime);
        const endTime = new Date(s.end_datetime);
        // スケジュールが選択月と重複しているかチェック（月全体のスケジュールを表示）
        return startTime <= monthEnd && endTime >= monthStart;
      });
      console.log('📅 App.tsx: Updating dailySchedules for month', dateStr, 'with', dailyScheds.length, 'items');
      console.log('📅 App.tsx: dailyScheds details:', dailyScheds.map((s: Schedule) => ({
        id: s.id,
        title: s.title,
        employee_id: s.employee_id,
        start_datetime: s.start_datetime,
        end_datetime: s.end_datetime
      })));
      setDailySchedules(markOverlappingSchedules(dailyScheds));
    }
  }, [realTimeData.lastUpdated, realTimeData.schedules, selectedDate]);

  // 初期データ読み込み
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        setError(null);

        // APIヘルスチェック
        await checkApiHealth();

        // 祝日データを初期化
        await initializeHolidayData();

        // 並行してデータを取得（スケジュールは過去2年分と未来1年分を取得）
        // 勤怠アプリに影響を与えないよう、ScheduleBoard専用API（/admin/schedules）のみを使用
        const now = new Date();
        const initStart = new Date(now.getFullYear() - 2, 0, 1); // 2年前の1月1日
        const initEnd = new Date(now.getFullYear() + 1, 11, 31); // 1年後の12月31日
        const initRangeParams: any = {
          start: initStart.toISOString(),
          end: initEnd.toISOString(),
          start_date: initStart.toISOString(),
          end_date: initEnd.toISOString(),
        };

        const [departmentsRes, employeesRes, equipmentRes, schedulesRes] = await Promise.all([
          departmentApi.getAll(),
          employeeApi.getAll(),
          equipmentApi.getAll(),
          scheduleApi.getAll(initRangeParams),
        ]);

        // データが配列でない場合は空配列を設定
        const depts = Array.isArray(departmentsRes.data) ? departmentsRes.data : [];
        const emps = Array.isArray(employeesRes.data) ? employeesRes.data : [];
        const equips = Array.isArray(equipmentRes.data) ? equipmentRes.data : [];
        const scheds = Array.isArray(schedulesRes.data) ? schedulesRes.data : [];
        
        setDepartments(depts);
        setEmployees(emps);
        setEquipment(equips);
        setSchedules(scheds);

        // デフォルト選択（データが無い場合でもアプリケーションを表示）
        if (depts.length > 0) {
          setSelectedDepartment(depts[0]);
          
          // 最初の部署の最初の社員を選択
          const firstDeptEmployees = emps.filter(
            emp => emp.department_id === depts[0].id
          );
          if (firstDeptEmployees.length > 0) {
            setSelectedEmployee(firstDeptEmployees[0]);
          }
        } else {
          // データが無い場合はnullを設定
          console.warn('⚠️ No departments found');
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

  // 全スケジュール読み込み関数（WebSocket経由で全データ取得）
  // これにより、月別・日別・全社員で共有される広範囲のスケジュールが取得される
  const reloadSchedulesRef = useRef<string>('');
  const reloadSchedules = useCallback(async () => {
    const now = Date.now().toString();
    // 500ms以内の連続呼び出しを防ぐ（無限ループ防止）
    if (reloadSchedulesRef.current && Date.now() - parseInt(reloadSchedulesRef.current) < 500) {
      console.log('⏭️ App: reloadSchedules skipped (too frequent)');
      return;
    }
    reloadSchedulesRef.current = now;
    console.log('🔄 App: reloadSchedules -> calling WebSocket forceRefresh');
    return await realTimeData.forceRefresh();
  }, [realTimeData.forceRefresh]);

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

  // 日別スケジュール読み込み関数
  const reloadDailySchedules = useCallback(async () => {
    try {
      const dateStr = formatDate(selectedDate);
      const response = await scheduleApi.getDailyAll(dateStr);
      const dailyScheds = Array.isArray(response.data) ? response.data : [];
      const normalized = dailyScheds.map((e: any) => normalizeEvent(e) as Schedule);
      setDailySchedules(markOverlappingSchedules(normalized));
    } catch (err) {
      console.error('❌ 日別スケジュール読み込みエラー:', err);
    }
  }, [selectedDate]);

  // 担当者/部署/日付が変わったら全データを再取得（無限ループ防止 + デバウンス）
  const lastRefreshKeyRef = useRef<string>('');
  const lastRefreshTimeRef = useRef<number>(0);
  useEffect(() => {
    const refreshKey = `${selectedEmployee?.id ?? 'all'}_${selectedDepartment?.id ?? 'all'}_${selectedDate.getFullYear()}_${selectedDate.getMonth()}`;
    // 同じキーならスキップ（無限ループ防止）
    if (refreshKey === lastRefreshKeyRef.current) {
      return;
    }
    
    // 500ms以内の連続実行を防ぐ（デバウンス）
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 500) {
      return;
    }
    lastRefreshTimeRef.current = now;
    lastRefreshKeyRef.current = refreshKey;
    
    console.log('🔄 App.tsx: Triggering forceRefresh for:', refreshKey);
    // WebSocketのforceRefreshを使って全データを取得（月別・日別・全社員で共有）
    realTimeData.forceRefresh().catch(() => void 0);
  }, [selectedEmployee?.id, selectedDepartment?.id, selectedDate, realTimeData.forceRefresh]);
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
  return (
    <div className="app">
        <main className="app-main">
          <Routes>
            <Route 
              path="/" 
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
                    setSchedules(prev => upsertEventIfChanged(prev, schedule));
                  }}
                />
              }
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
                  schedules={dailySchedules}
                  onDepartmentChange={handleDepartmentChange}
                  onEmployeeChange={handleEmployeeChange}
                />
              } 
            />
            <Route 
              path="/day" 
              element={
                <DailySchedule
                  selectedDate={selectedDate}
                  onDateChange={setSelectedDate}
                  departments={departments}
                  employees={employees}
                  schedules={dailySchedules}
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
                  schedules={dailySchedules}
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

// エラーバウンダリー
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌❌❌ React Error Caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '50px',
          backgroundColor: 'red',
          color: 'white',
          fontSize: '20px',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap'
        }}>
          <h1>🚨 REACT ERROR DETECTED 🚨</h1>
          <h2>Error: {this.state.error?.message}</h2>
          <pre>{this.state.error?.stack}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Router basename="/scheduleboard" future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AppContent />
      </Router>
    </ErrorBoundary>
  );
};

export default App;
