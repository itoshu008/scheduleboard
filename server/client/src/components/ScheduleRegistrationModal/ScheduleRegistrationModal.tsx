import React, { useState, useEffect, useMemo } from 'react';
import { Employee, Equipment, Schedule } from '../../types';
import { api } from '../../api';
import { toServerISO } from '../../utils/datetime';

// ヘルパー関数
const addMinutes = (d: Date, mins: number) => new Date(d.getTime() + mins * 60000);
const pad = (n: number) => String(n).padStart(2, '0');
const HHmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const toHM = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toLocalYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const toOffsetISOString = (d: Date) => {
  const tz = -d.getTimezoneOffset();
  const sign = tz >= 0 ? "+" : "-";
  const hh = pad(Math.trunc(Math.abs(tz) / 60));
  const mm = pad(Math.abs(tz) % 60);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
  return `${local}${sign}${hh}:${mm}`;
};

interface ScheduleRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStart: Date;
  defaultEnd: Date;
  selectedDepartmentId: number;
  defaultEmployeeId?: number;
  employees?: Employee[];
  equipments?: Equipment[];
  colors?: string[];
  title?: string; // タイトルをカスタマイズ可能に
  initialValues?: {
    title?: string;
    description?: string;
    color?: string;
    scheduleId?: number;
  };
  onCreated: (created: any) => void;
}

// セルIDから日時を解析する関数（完全に作り直し）
const parseCellDateTime = (cellId: string, fallbackDate: Date, selectedCellsSize: number = 1, slotMinutes: number = 15) => {
  console.log('🔍 parseCellDateTime 開始:', { cellId, fallbackDate, selectedCellsSize, slotMinutes });
  
  const parts = cellId.split('-');
  console.log('🔍 セルID分割:', parts);
  
  if (parts.length < 4) {
    console.log('🔍 セルID形式が無効、フォールバックを使用');
    return {
      date: fallbackDate,
      startTime: '09:00',
      endTime: '10:00',
      dateYMD: toLocalYMD(fallbackDate)
    };
  }
  
  // セルID形式: YYYY-MM-DD-slot
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // 月は0から始まる
  const day = parseInt(parts[2]);
  const slot = parseInt(parts[3]);
  
  const date = new Date(year, month, day);
  
  // スロットから時間を計算（slot 0 = 0:00, slot 1 = 0:15, ...）
  const startHour = Math.floor(slot / 4);
  const startMinute = (slot % 4) * 15;
  
  // 選択されたセル数に基づいて終了時間を計算
  const totalMinutes = slotMinutes * selectedCellsSize;
  const startDateTime = new Date(date);
  startDateTime.setHours(startHour, startMinute, 0, 0);
  const endDateTime = addMinutes(startDateTime, totalMinutes);
  
  const result = {
    date,
    startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
    endTime: HHmm(endDateTime),
    dateYMD: toLocalYMD(date)
  };
  
  console.log('🔍 parseCellDateTime 結果:', {
    ...result,
    slot,
    startHour,
    startMinute,
    totalMinutes,
    endHour: endDateTime.getHours(),
    endMinute: endDateTime.getMinutes()
  });
  
  return result;
};

const ScheduleRegistrationModal: React.FC<ScheduleRegistrationModalProps> = ({
  isOpen,
  onClose,
  defaultStart,
  defaultEnd,
  selectedDepartmentId,
  defaultEmployeeId,
  employees = [],
  equipments = [],
  colors = ['#3174ad', '#ff9800', '#4caf50', '#e91e63', '#9c27b0', '#607d8b', '#795548', '#ff5722'],
  title,
  initialValues,
  onCreated
}) => {
  console.log('🚀 ScheduleRegistrationModal 初期化:', {
    isOpen,
    defaultStart,
    defaultEnd,
    selectedDepartmentId,
    defaultEmployeeId
  });

  // 編集モードの判定を安定させる（初期値で固定）
  const isEditMode = useMemo(() => {
    const editMode = !!(initialValues?.scheduleId);
    console.log('🔒 ScheduleRegistrationModal: Edit mode locked to:', editMode, 'scheduleId:', initialValues?.scheduleId);
    return editMode;
  }, [initialValues?.scheduleId]);

  // 基本情報（編集モードの場合は初期値を設定）
  const [purpose, setPurpose] = useState(initialValues?.title || '新規スケジュール');
  const [selectedColor, setSelectedColor] = useState(initialValues?.color || '#3498db');
  
  // purposeの変更を追跡
  React.useEffect(() => {
    console.log('📝 ScheduleRegistrationModal: Purpose changed to:', purpose);
  }, [purpose]);
  
  console.log('🔄 ScheduleRegistrationModal: Component initialized with:', {
    initialValues,
    purpose,
    selectedColor,
    isEditMode,
    hasScheduleId: !!initialValues?.scheduleId,
    scheduleIdValue: initialValues?.scheduleId,
    titleValue: initialValues?.title
  });
  
  // 編集モードの詳細確認
  if (isEditMode) {
    console.log('✅ ScheduleRegistrationModal: EDIT MODE DETECTED');
    console.log('✅ ScheduleRegistrationModal: Schedule ID:', initialValues?.scheduleId);
    console.log('✅ ScheduleRegistrationModal: Initial title:', initialValues?.title);
  } else {
    console.log('❌ ScheduleRegistrationModal: NEW MODE');
    console.log('❌ ScheduleRegistrationModal: initialValues:', initialValues);
  }
  
  // 担当者は参加者の最初の人を自動設定
  
  // 参加者管理
  const [participants, setParticipants] = useState<{ id: number; name: string }[]>([]);
  const [participantSearchTerm, setParticipantSearchTerm] = useState('');
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  
  // 設備管理
  const [selectedEquipments, setSelectedEquipments] = useState<{ id: number; name: string }[]>([]);
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  
  // 重複実行防止
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // タブ管理
  const [activeTab, setActiveTab] = useState<'participants' | 'equipment'>('participants');
  
  // 選択中の状態管理（タブ固定用）
  const [isSelectingParticipants, setIsSelectingParticipants] = useState(false);
  const [isSelectingEquipments, setIsSelectingEquipments] = useState(false);
  
  // スクロール中の状態管理
  const [isScrollingParticipants, setIsScrollingParticipants] = useState(false);
  const [isScrollingEquipments, setIsScrollingEquipments] = useState(false);

  // 入力state（完全制御）
  const [dateYMD, setDateYMD] = React.useState<string>(toYMD(defaultStart));
  const [startHM, setStartHM] = React.useState<string>(toHM(defaultStart));
  const [endHM, setEndHM] = React.useState<string>(toHM(defaultEnd));

  // モーダルopen/選択変更で再初期化
  React.useEffect(() => {
    console.log('🔄 ScheduleRegistrationModal: useEffect triggered', { 
      isOpen, 
      initialValues,
      hasInitialValues: !!initialValues,
      scheduleId: initialValues?.scheduleId 
    });
    
    if (!isOpen) {
      console.log('🔄 ScheduleRegistrationModal: Modal is closed, skipping initialization');
      return;
    }
    
    setDateYMD(toYMD(defaultStart));
    setStartHM(toHM(defaultStart));
    setEndHM(toHM(defaultEnd));
    
    // 編集モードの場合は初期値を再設定
    if (isEditMode && initialValues) {
      console.log('🔄 ScheduleRegistrationModal: Setting initial values for edit mode:', initialValues);
      console.log('🔥 ScheduleRegistrationModal: Setting purpose to:', initialValues.title);
      console.log('🔥 ScheduleRegistrationModal: Purpose value details:', {
        originalTitle: initialValues.title,
        titleType: typeof initialValues.title,
        titleLength: initialValues.title?.length,
        willSetTo: initialValues.title || '新規スケジュール'
      });
      setPurpose(initialValues.title || '新規スケジュール');
      setSelectedColor(initialValues.color || '#3498db');
    } else {
      console.log('🔄 ScheduleRegistrationModal: Setting default values for new mode');
      console.log('🔥 ScheduleRegistrationModal: initialValues was:', initialValues);
      setPurpose('新規スケジュール');
      setSelectedColor('#3498db');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialValues]);

  // 開始時間変更時の処理（15分刻み制約を解除）
  const onStartChange = (v: string) => {
    setStartHM(v);
    const [sh, sm] = v.split(':').map(Number);
    const [eh, em] = endHM.split(':').map(Number);
    const startM = sh*60+sm, endM = eh*60+em;
    
    // 終了時間が開始時間以下の場合のみ、最小1分後に調整
    if (endM <= startM) {
      const mm = startM + 1; // 最小1分後
      setEndHM(`${pad(Math.floor(mm/60)%24)}:${pad(mm%60)}`);
    }
  };

  // defaultEmployeeIdが設定されている場合、自動的に参加者に追加
  useEffect(() => {
    if (participants.length > 0) return;
    if (employees.length === 0) return;
    const targetId = defaultEmployeeId ?? employees[0].id;
    const target = employees.find(emp => emp.id === targetId) || employees[0];
    if (target) {
      setParticipants([{ id: target.id, name: target.name }]);
    }
  }, [defaultEmployeeId, employees, participants.length]);

  // 保存処理
  const submit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      console.log(isEditMode ? '🚀 更新処理開始' : '🚀 登録処理開始');
      
      if (participants.length === 0) {
        alert('参加者を1人以上選択してください');
        return;
      }
      
      // Date のまま構築し、送信直前だけ ISO 化（UTC）
      const [y, m, d] = dateYMD.split('-').map(Number);
      const [sh, sm] = startHM.split(':').map(Number);
      const [eh, em] = endHM.split(':').map(Number);
      const startDate = new Date(y, (m || 1) - 1, d || 1, sh || 0, sm || 0, 0, 0);
      const endDate   = new Date(y, (m || 1) - 1, d || 1, eh || 0, em || 0, 0, 0);
      const startISO = toServerISO(startDate);
      const endISO   = toServerISO(endDate);
      
      const payload = {
        title: purpose,
        purpose: purpose,
        employee_id: participants[0].id, // 参加者の最初の人を担当者に設定
        equipment_id: 0,
        start_datetime: startISO,
        end_datetime: endISO,
        color: selectedColor,
        department_id: selectedDepartmentId,
      };
      
      console.log('📝 ScheduleRegistrationModal: Form values at submit:', {
        purpose,
        selectedColor,
        participants: participants.map(p => ({ id: p.id, name: p.name })),
        startISO,
        endISO,
        selectedDepartmentId,
        isEditMode,
        scheduleId: initialValues?.scheduleId,
        originalTitle: initialValues?.title,
        newTitle: purpose
      });
      
      console.log(isEditMode ? '🚀 更新ペイロード(form):' : '🚀 登録ペイロード(form):', payload);
      
      // 編集モードかどうかで処理を分岐
      console.log('🔥 ScheduleRegistrationModal: Checking edit mode - isEditMode:', isEditMode);
      console.log('🔥 ScheduleRegistrationModal: initialValues:', initialValues);
      
      if (isEditMode && initialValues?.scheduleId) {
        // 編集モード: 更新API呼び出し
        console.log('✅ ScheduleRegistrationModal: EDIT MODE - Changing schedule:', initialValues.scheduleId);
        console.log('🔄 ScheduleRegistrationModal: Change payload:', payload);
        console.log('🔄 ScheduleRegistrationModal: Initial values:', initialValues);
        console.log('🔄 ScheduleRegistrationModal: API URL:', `/schedules/${initialValues.scheduleId}`);
        console.log('🔄 ScheduleRegistrationModal: Request method: PUT');
        
        const response = await api.put(`/schedules/${initialValues.scheduleId}`, payload);
        const updated = response.data;
        console.log('🔄 ScheduleRegistrationModal: Change response:', updated);
        console.log('🔄 ScheduleRegistrationModal: Response status:', response.status);
        console.log('🔄 ScheduleRegistrationModal: Full response object:', response);
        console.log('🔄 ScheduleRegistrationModal: Response data type:', typeof updated);
        console.log('🔄 ScheduleRegistrationModal: Response data keys:', Object.keys(updated || {}));
        
        // 編集モードであることを明示するためにフラグを追加
        const updatedWithFlag = { ...updated, _wasUpdated: true };
        console.log('🔄 ScheduleRegistrationModal: Calling onCreated with changed data:', updatedWithFlag);
        onCreated(updatedWithFlag);
      } else {
        // 新規登録モード: 作成API呼び出し
        console.log('❌ ScheduleRegistrationModal: NEW SCHEDULE MODE - Creating schedule (SHOULD BE EDIT!)');
        console.log('❌ ScheduleRegistrationModal: Why is this NEW mode? initialValues:', initialValues);
        const response = await api.post('/schedules', payload);
        const created = response.data;
        console.log('✨ ScheduleRegistrationModal: Create response:', created);
        onCreated(created);
      }
      onClose();
    } catch (error) {
      console.error('❌ 保存例外:', error);
      const errorMessage = isEditMode 
        ? 'スケジュールの更新に失敗しました' 
        : 'スケジュールの登録に失敗しました';
      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div className="modal-content" style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
        width: '90vw',
        maxWidth: '1200px',
        height: '80vh',
        maxHeight: '700px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* ヘッダー */}
        <div className="modal-header" style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          padding: '20px 30px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTopLeftRadius: '16px',
          borderTopRightRadius: '16px'
        }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
          ✨ {initialValues?.scheduleId ? 'スケジュール変更' : (title || 'スケジュール登録')}
        </h2>
          <button 
            className="close-button" 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ×
          </button>
        </div>
        
        {/* メインコンテンツ - 横向きレイアウト */}
        <div className="modal-body" style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden'
        }}>
          {/* 左側: 基本情報 */}
          <div className="left-panel" style={{
            width: '50%',
            padding: '30px',
            borderRight: '1px solid #e9ecef',
            overflowY: 'auto',
            background: '#f8f9fa'
          }}>
            <div style={{ marginBottom: '25px' }}>
              <h3 style={{ 
                margin: '0 0 15px 0', 
                color: '#495057', 
                fontSize: '18px',
                fontWeight: '600',
                borderBottom: '2px solid #667eea',
                paddingBottom: '8px'
              }}>
                📝 基本情報
              </h3>
            </div>

            {/* 担当者名（色の上に表示） */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '6px', 
                fontWeight: '600', 
                color: '#495057' 
              }}>
                担当者
              </label>
              <div style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #e9ecef',
                borderRadius: '8px',
                fontSize: '14px',
                background: '#fff',
                color: '#333'
              }}>
                {participants.length > 0 ? participants[0].name : '未選択'}
              </div>
            </div>

            {/* 色選択（一番先頭） */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#495057' 
              }}>
                色
              </label>
              <div className="color-picker" style={{ 
                display: 'flex', 
                gap: '8px', 
                flexWrap: 'wrap' 
              }}>
                {colors.map(color => (
                  <button
                    key={color}
                    className={`color-option ${selectedColor === color ? 'selected' : ''}`}
                    style={{ 
                      backgroundColor: color,
                      width: '32px',
                      height: '32px',
                      border: selectedColor === color ? '3px solid #333' : '2px solid #e9ecef',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      transform: selectedColor === color ? 'scale(1.1)' : 'scale(1)'
                    }}
                    onClick={() => setSelectedColor(color)}
                  />
                ))}
              </div>
            </div>

            {/* テンプレートボタン */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#495057' 
              }}>
                テンプレート
              </label>
              <button
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #28a745',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #28a745 0%, #34ce57 100%)',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 2px 4px rgba(40, 167, 69, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(40, 167, 69, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(40, 167, 69, 0.3)';
                }}
              >
                📋 テンプレートから選択
              </button>
            </div>

            {/* 目的 */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#495057' 
              }}>
                目的
              </label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => {
                  console.log('📝 ScheduleRegistrationModal: Purpose changed from', purpose, 'to', e.target.value);
                  setPurpose(e.target.value);
                }}
                placeholder="スケジュールの目的を入力"
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e9ecef',
                  borderRadius: '8px',
                  fontSize: '14px',
                  transition: 'border-color 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
              />
            </div>
            
            {/* 日時 */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '8px', 
                fontWeight: '600', 
                color: '#495057' 
              }}>
                日付
              </label>
              <input
                type="date"
                value={dateYMD}
                onChange={(e) => setDateYMD(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '2px solid #e9ecef',
                  borderRadius: '8px',
                  fontSize: '14px',
                  transition: 'border-color 0.3s ease',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#495057' 
                }}>
                  開始時間
                </label>
                <input
                  type="time"
                  value={startHM}
                  onChange={(e) => onStartChange(e.target.value)}
                  step={60}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'border-color 0.3s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                />
              </div>
              
              <div className="form-group" style={{ flex: 1 }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#495057' 
                }}>
                  終了時間
                </label>
                <input
                  type="time"
                  value={endHM}
                  onChange={(e) => setEndHM(e.target.value)}
                  step={60}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    border: '2px solid #e9ecef',
                    borderRadius: '8px',
                    fontSize: '14px',
                    transition: 'border-color 0.3s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#667eea'}
                  onBlur={(e) => e.target.style.borderColor = '#e9ecef'}
                />
              </div>
            </div>
            
            {/* 担当者欄は削除 - 参加者の最初の人が自動的に担当者になります */}
            
          </div>

          {/* 右側: タブコンテンツ */}
          <div className="right-panel" style={{
            width: '50%',
            display: 'flex',
            flexDirection: 'column',
            background: 'white'
          }}>
            {/* 参加者・設備管理セクション（2段横並び） */}
            <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
              {/* 参加者管理セクション */}
              <div className="management-section" style={{
                flex: 1,
                border: '2px solid #e9ecef',
                borderRadius: '12px',
                background: 'white',
                overflow: 'hidden',
                minHeight: '600px'
              }}>
                <div className="section-header" style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  padding: '15px 20px',
                  fontWeight: '600',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  👥 参加者管理
                </div>
                <div className="section-content" style={{ padding: '20px', minHeight: '500px' }}>
                {/* 参加者検索・追加 */}
                <div style={{ marginBottom: '15px', position: 'relative' }}>
                  <input
                    type="text"
                    value={participantSearchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      console.log('🔍 参加者検索入力:', {
                        value: value,
                        showDropdown: value.length > 0
                      });
                      setParticipantSearchTerm(value);
                      setShowParticipantDropdown(value.length > 0);
                    }}
                    placeholder="参加者を検索..."
                    style={{
                      width: '100%',
                      padding: '10px 15px',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#667eea';
                      setShowParticipantDropdown(true);
                      setIsSelectingParticipants(true);
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e9ecef';
                      // 少し遅延させてドロップダウンを閉じる
                      setTimeout(() => {
                        setShowParticipantDropdown(false);
                        setIsSelectingParticipants(false);
                      }, 200);
                    }}
                  />
                  
                  {/* 参加者ドロップダウン */}
                  {showParticipantDropdown && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #e9ecef',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000,
                        maxHeight: '800px',
                        overflowY: 'auto',
                        marginTop: '4px'
                      }}
                      onScroll={() => setIsScrollingParticipants(true)}
                      onMouseDown={() => setIsScrollingParticipants(true)}
                      onMouseUp={() => setIsScrollingParticipants(false)}
                      onTouchStart={() => setIsScrollingParticipants(true)}
                      onTouchEnd={() => setIsScrollingParticipants(false)}
                      onMouseLeave={() => setIsScrollingParticipants(false)}
                    >
                      {(() => {
                        const filtered = employees
                          .filter(emp => 
                            emp.name.toLowerCase().includes(participantSearchTerm.toLowerCase()) &&
                            !participants.find(p => p.id === emp.id)
                          );
                        console.log('参加者フィルタリング結果:', filtered);
                        console.log('参加者全データ:', employees.map(emp => ({ id: emp.id, name: emp.name })));
                        console.log('検索条件:', participantSearchTerm.toLowerCase());
                        return filtered.map(employee => (
                          <div
                            key={employee.id}
                            style={{
                              padding: '12px 16px',
                              cursor: 'pointer',
                              transition: 'background-color 0.3s ease',
                              borderBottom: '1px solid #f8f9fa'
                            }}
                            onClick={() => {
                              setParticipants([...participants, employee]);
                              setParticipantSearchTerm('');
                              setShowParticipantDropdown(false);
                              setIsSelectingParticipants(false);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                          >
                            {employee.name}
                          </div>
                        ));
                      })()}
                      {(() => {
                        return employees.filter(emp => 
                          emp.name.toLowerCase().includes(participantSearchTerm.toLowerCase()) &&
                          !participants.find(p => p.id === emp.id)
                        ).length === 0;
                      })() && (
                        <div style={{
                          padding: '12px 16px',
                          color: '#6c757d',
                          fontStyle: 'italic',
                          textAlign: 'center'
                        }}>
                          該当する参加者が見つかりません
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* 参加者リスト */}
                <div 
                  className="participants-list" 
                  style={{
                    maxHeight: '600px',
                    overflowY: 'auto',
                    border: '1px solid #e9ecef',
                    borderRadius: '8px',
                    background: '#f8f9fa'
                  }}
                  onScroll={() => setIsScrollingParticipants(true)}
                  onMouseDown={() => setIsScrollingParticipants(true)}
                  onMouseUp={() => setIsScrollingParticipants(false)}
                  onTouchStart={() => setIsScrollingParticipants(true)}
                  onTouchEnd={() => setIsScrollingParticipants(false)}
                  onMouseLeave={() => setIsScrollingParticipants(false)}
                >
                  {participants.map(participant => (
                    <div key={participant.id} style={{
                      padding: '10px 15px',
                      borderBottom: '1px solid #e9ecef',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'white'
                    }}>
                      <span style={{ fontWeight: '500' }}>{participant.name}</span>
                      <button
                        onClick={() => setParticipants(participants.filter(p => p.id !== participant.id))}
                        style={{
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'background 0.3s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#c82333'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#dc3545'}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  {participants.length === 0 && (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: '#6c757d',
                      fontStyle: 'italic'
                    }}>
                      参加者が選択されていません
                    </div>
                  )}
                </div>
                </div>
              </div>

              {/* 設備管理セクション */}
              <div className="management-section" style={{
                flex: 1,
                border: '2px solid #e9ecef',
                borderRadius: '12px',
                background: 'white',
                overflow: 'hidden',
                minHeight: '600px'
              }}>
                <div className="section-header" style={{
                  background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                  color: 'white',
                  padding: '15px 20px',
                  fontWeight: '600',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  🏢 設備管理
                </div>
                <div className="section-content" style={{ padding: '20px', minHeight: '500px' }}>
                {/* 設備検索・追加 */}
                <div style={{ marginBottom: '15px', position: 'relative' }}>
                  <input
                    type="text"
                    value={equipmentSearchTerm}
                    onChange={(e) => {
                      const value = e.target.value;
                      console.log('🔍 設備検索入力:', {
                        value: value,
                        showDropdown: value.length > 0
                      });
                      setEquipmentSearchTerm(value);
                      setShowEquipmentDropdown(value.length > 0);
                    }}
                    placeholder="設備を検索..."
                    style={{
                      width: '100%',
                      padding: '10px 15px',
                      border: '2px solid #e9ecef',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#28a745';
                      setShowEquipmentDropdown(true);
                      setIsSelectingEquipments(true);
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e9ecef';
                      // 少し遅延させてドロップダウンを閉じる
                      setTimeout(() => {
                        setShowEquipmentDropdown(false);
                        setIsSelectingEquipments(false);
                      }, 200);
                    }}
                  />
                  
                  {/* 設備ドロップダウン */}
                  {showEquipmentDropdown && (
                    <div 
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #e9ecef',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000,
                        maxHeight: '800px',
                        overflowY: 'auto',
                        marginTop: '4px'
                      }}
                      onScroll={() => setIsScrollingEquipments(true)}
                      onMouseDown={() => setIsScrollingEquipments(true)}
                      onMouseUp={() => setIsScrollingEquipments(false)}
                      onTouchStart={() => setIsScrollingEquipments(true)}
                      onTouchEnd={() => setIsScrollingEquipments(false)}
                      onMouseLeave={() => setIsScrollingEquipments(false)}
                    >
                      {(() => {
                        const filtered = equipments
                          .filter(eq => 
                            eq.name.toLowerCase().includes(equipmentSearchTerm.toLowerCase()) &&
                            !selectedEquipments.find(e => e.id === eq.id)
                          );
                        console.log('設備フィルタリング結果:', filtered);
                        console.log('設備全データ:', equipments.map(eq => ({ id: eq.id, name: eq.name })));
                        console.log('設備検索条件:', equipmentSearchTerm.toLowerCase());
                        return filtered.map(equipment => (
                          <div
                            key={equipment.id}
                            style={{
                              padding: '12px 16px',
                              cursor: 'pointer',
                              transition: 'background-color 0.3s ease',
                              borderBottom: '1px solid #f8f9fa'
                            }}
                            onClick={() => {
                              setSelectedEquipments([...selectedEquipments, equipment]);
                              setEquipmentSearchTerm('');
                              setShowEquipmentDropdown(false);
                              setIsSelectingEquipments(false);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                          >
                            {equipment.name}
                          </div>
                        ));
                      })()}
                      {(() => {
                        return equipments.filter(eq => 
                          eq.name.toLowerCase().includes(equipmentSearchTerm.toLowerCase()) &&
                          !selectedEquipments.find(e => e.id === eq.id)
                        ).length === 0;
                      })() && (
                        <div style={{
                          padding: '12px 16px',
                          color: '#6c757d',
                          fontStyle: 'italic',
                          textAlign: 'center'
                        }}>
                          該当する設備が見つかりません
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {/* 設備リスト */}
                <div 
                  className="equipment-list" 
                  style={{
                    maxHeight: '600px',
                    overflowY: 'auto',
                    border: '1px solid #e9ecef',
                    borderRadius: '8px',
                    background: '#f8f9fa'
                  }}
                  onScroll={() => setIsScrollingEquipments(true)}
                  onMouseDown={() => setIsScrollingEquipments(true)}
                  onMouseUp={() => setIsScrollingEquipments(false)}
                  onTouchStart={() => setIsScrollingEquipments(true)}
                  onTouchEnd={() => setIsScrollingEquipments(false)}
                  onMouseLeave={() => setIsScrollingEquipments(false)}
                >
                  {selectedEquipments.map(equipment => (
                    <div key={equipment.id} style={{
                      padding: '10px 15px',
                      borderBottom: '1px solid #e9ecef',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'white'
                    }}>
                      <span style={{ fontWeight: '500' }}>{equipment.name}</span>
                      <button
                        onClick={() => setSelectedEquipments(selectedEquipments.filter(e => e.id !== equipment.id))}
                        style={{
                          background: '#dc3545',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          transition: 'background 0.3s ease'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#c82333'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#dc3545'}
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  {selectedEquipments.length === 0 && (
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: '#6c757d',
                      fontStyle: 'italic'
                    }}>
                      設備が選択されていません
                    </div>
                  )}
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* フッター */}
        <div className="modal-footer" style={{
          padding: '20px 30px',
          borderTop: '1px solid #e9ecef',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '15px',
          background: '#f8f9fa'
        }}>
          <button 
            className="cancel-button" 
            onClick={onClose}
            style={{
              padding: '12px 24px',
              border: '2px solid #6c757d',
              borderRadius: '8px',
              background: 'white',
              color: '#6c757d',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#6c757d';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.color = '#6c757d';
            }}
          >
            キャンセル
          </button>
          <button 
            className="save-button" 
            onClick={submit}
            disabled={isSubmitting}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: isSubmitting 
                ? '#6c757d' 
                : (isEditMode 
                    ? 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)' 
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
              color: 'white',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              transition: 'all 0.3s ease',
              boxShadow: isEditMode 
                ? '0 4px 12px rgba(243, 156, 18, 0.3)' 
                : '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = isEditMode 
                  ? '0 6px 16px rgba(243, 156, 18, 0.4)' 
                  : '0 6px 16px rgba(102, 126, 234, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isEditMode 
                  ? '0 4px 12px rgba(243, 156, 18, 0.3)' 
                  : '0 4px 12px rgba(102, 126, 234, 0.3)';
              }
            }}
          >
            {isSubmitting 
              ? (isEditMode ? '更新中...' : '登録中...') 
              : (isEditMode ? '✨ 更新' : '✨ 登録')
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScheduleRegistrationModal;