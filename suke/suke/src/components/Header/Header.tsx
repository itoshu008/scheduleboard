import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Header.css';

// 型定義
import { Department, Employee, Equipment, PageType } from '../../types';

// ユーティリティ
import { formatDate, getJapaneseDateString } from '../../utils/dateUtils';

interface HeaderProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
  departments: Department[];
  employees: Employee[];
  equipment: Equipment[];
  selectedDepartment: Department | null;
  selectedEmployee: Employee | null;
  selectedEquipment: Equipment | null;
  selectedDate: Date;
  onDepartmentChange: (department: Department) => void;
  onEmployeeChange: (employee: Employee) => void;
  onEquipmentChange: (equipment: Equipment) => void;
  onDateChange: (date: Date) => void;
}

const Header: React.FC<HeaderProps> = ({
  currentPage,
  onPageChange,
  departments,
  employees,
  equipment,
  selectedDepartment,
  selectedEmployee,
  selectedEquipment,
  selectedDate,
  onDepartmentChange,
  onEmployeeChange,
  onEquipmentChange,
  onDateChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();


  // ページナビゲーション
  const handlePageNavigation = (page: PageType) => {
    onPageChange(page);
    switch (page) {
      case 'monthly':
        navigate('/monthly');
        break;
      case 'daily':
        navigate('/daily');
        break;
      case 'all-employees':
        navigate('/all-employees');
        break;
      case 'equipment':
        navigate('/equipment');
        break;
    }
  };



  // 部署の社員リストを取得
  const getDepartmentEmployees = (departmentId: number): Employee[] => {
    return employees.filter(emp => emp.department_id === departmentId);
  };

  // 日付変更
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // タイムゾーンオフセットを考慮して日付を正しく設定
    const [year, month, day] = e.target.value.split('-').map(Number);
    const newDate = new Date(year, month - 1, day);
    onDateChange(newDate);
  };

  // 仕様: 矢印2個が月移動、矢印1個が日移動
  const handlePrevMonth = () => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() - 1);
    onDateChange(d);
  };

  const handleNextMonth = () => {
    const d = new Date(selectedDate);
    d.setMonth(d.getMonth() + 1);
    onDateChange(d);
  };

  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    onDateChange(d);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    onDateChange(d);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  return (
    <header className="header">
      <div className="header-container">
        {/* タイトル */}
        <div className="header-title">
          <h1>スケジュール管理ソフト</h1>
        </div>
        
        {/* ナビゲーションボタン */}
        <nav className="header-nav">
          <button
            className={`nav-btn ${currentPage === 'monthly' ? 'active' : ''}`}
            onClick={() => handlePageNavigation('monthly')}
          >
            月別
          </button>
          <button
            className={`nav-btn ${currentPage === 'daily' ? 'active' : ''}`}
            onClick={() => handlePageNavigation('daily')}
          >
            日別
          </button>
          <button
            className={`nav-btn ${currentPage === 'all-employees' ? 'active' : ''}`}
            onClick={() => handlePageNavigation('all-employees')}
          >
            全社員
          </button>
          <button
            className={`nav-btn ${currentPage === 'equipment' ? 'active' : ''}`}
            onClick={() => handlePageNavigation('equipment')}
          >
            設備
          </button>

        </nav>

        {/* コントロールエリア */}
        <div className="header-controls">
          {/* 日付ナビゲーション */}
          <div className="date-controls">
            {/* 月移動（ダブル矢印） */}
            <button className="date-nav-btn" onClick={handlePrevMonth} title="前月">
              ⟪
            </button>
            {/* 日移動（シングル矢印） */}
            <button className="date-nav-btn" onClick={handlePrevDay} title="前日">
              ◀
            </button>
            <div className="date-display">
              <input
                type="date"
                value={formatDate(selectedDate)}
                onChange={handleDateChange}
                className="date-input"
              />
              <div className="date-text">
                {getJapaneseDateString(selectedDate)}
              </div>
            </div>
            <button className="date-nav-btn" onClick={handleNextDay} title="翌日">
              ▶
            </button>
            <button className="date-nav-btn" onClick={handleNextMonth} title="翌月">
              ⟫
            </button>
            <button className="today-btn" onClick={handleToday}>
              今日
            </button>
          </div>

          {/* 部署・社員・設備選択 */}
          {location.pathname !== '/management' && (
            <div className="selection-controls">
              {/* 部署選択（月別・日別ページ）をボタン化 */}
              {(currentPage === 'monthly' || currentPage === 'daily') && (
                <div className="selection-group">
                  <label>部署:</label>
                  <div className="department-buttons">
                    {departments.map(dept => (
                      <button
                        key={dept.id}
                        className={`dept-btn ${selectedDepartment?.id === dept.id ? 'active' : ''}`}
                        onClick={() => onDepartmentChange(dept)}
                      >
                        {dept.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 社員選択（月別ページ） */}
              {currentPage === 'monthly' && selectedDepartment && (
                <div className="selection-group">
                  <label>社員:</label>
                  <select
                    value={selectedEmployee?.id || ''}
                    onChange={(e) => {
                      const emp = employees.find(emp => emp.id === parseInt(e.target.value));
                      if (emp) onEmployeeChange(emp);
                    }}
                    className="selection-dropdown"
                  >
                    <option value="">社員を選択</option>
                    {getDepartmentEmployees(selectedDepartment.id).map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 設備選択（設備予約ページ） */}
              {currentPage === 'equipment' && (
                <div className="selection-group">
                  <label>設備:</label>
                  <select
                    value={selectedEquipment?.id || ''}
                    onChange={(e) => {
                      const equip = equipment.find(eq => eq.id === parseInt(e.target.value));
                      if (equip) onEquipmentChange(equip);
                    }}
                    className="selection-dropdown"
                  >
                    <option value="">設備を選択</option>
                    {equipment.map(equip => (
                      <option key={equip.id} value={equip.id}>
                        {equip.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </header>
  );
};

export default Header;