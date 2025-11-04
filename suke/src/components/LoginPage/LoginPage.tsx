import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';

// API
import { employeeApi } from '../../utils/api';

// 型定義
import { Employee } from '../../types';

interface LoginPageProps {
  onLogin: (employee: Employee) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!employeeNumber.trim()) {
      setError('社員番号を入力してください。');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 社員番号で社員を検索
      const response = await employeeApi.getByEmployeeNumber(employeeNumber.trim());
      
      if (response.data) {
        const employee = response.data;
        onLogin(employee);
        // ログイン成功後、その社員の月別ページに遷移
        navigate('/monthly');
      } else {
        setError('社員番号が見つかりません。正しい社員番号を入力してください。');
      }
    } catch (err) {
      console.error('ログインエラー:', err);
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as any;
        if (axiosError.response?.status === 404) {
          setError('社員番号が見つかりません。正しい社員番号を入力してください。');
        } else {
          setError('ログインに失敗しました。再度お試しください。');
        }
      } else {
        setError('ログインに失敗しました。再度お試しください。');
      }
    } finally {
      setLoading(false);
    }
  };

  // 利用可能な社員番号を表示するデバッグ機能
  const [availableEmployees, setAvailableEmployees] = useState<Employee[]>([]);
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const response = await employeeApi.getAll();
        setAvailableEmployees(response.data || []);
      } catch (err) {
        console.error('社員一覧取得エラー:', err);
      }
    };
    loadEmployees();
  }, []);

  const handleRegisterClick = () => {
    navigate('/management');
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <h1>スケジュールボード</h1>
          <p>社員番号を入力してログインしてください</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="employeeNumber">社員番号</label>
            <input
              type="text"
              id="employeeNumber"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="社員番号を入力"
              disabled={loading}
              autoFocus
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <div className="register-section">
          <p>初めて使う方はこちら</p>
          <button 
            type="button" 
            className="register-btn"
            onClick={handleRegisterClick}
          >
            社員登録
          </button>
        </div>

        {/* デバッグ情報 */}
        <div className="debug-section">
          <button 
            type="button" 
            className="debug-btn"
            onClick={() => setShowDebug(!showDebug)}
          >
            {showDebug ? '利用可能社員を隠す' : '利用可能社員を表示'}
          </button>
          
          {showDebug && availableEmployees.length > 0 && (
            <div className="available-employees">
              <h4>利用可能な社員番号:</h4>
              <ul>
                {availableEmployees.map(emp => (
                  <li key={emp.id}>
                    <strong>{emp.employee_number}</strong> - {emp.name} ({emp.department_name})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
