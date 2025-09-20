import React, { useState, useEffect, useCallback } from 'react';
import './ScheduleRegistrationModal.css';

// 型定義
import { Employee, Schedule, ScheduleParticipant, Equipment, Template } from '../../types';

// 重複チェック用ユーティリティ
import { checkAllParticipantsOverlap } from '../../utils/overlapUtils';
import { getAll as getTemplates } from '../../api/templates';

interface ScheduleRegistrationModalProps {
  selectedCells: Set<string>;
  employees: Employee[];
  equipments?: Equipment[]; // 設備リスト
  selectedDate: Date;
  colors: string[];
  initialData?: {
    startDateTime: Date;
    endDateTime: Date;
    employeeId: number;
  } | null;
  existingSchedules?: Schedule[]; // 重複チェック用
  title?: string; // カスタムタイトル
  onSave: (scheduleData: Partial<Schedule>) => void;
  onCancel: () => void;
}

const ScheduleRegistrationModal: React.FC<ScheduleRegistrationModalProps> = ({
  selectedCells,
  employees,
  equipments = [],
  selectedDate,
  colors,
  initialData,
  existingSchedules = [],
  title = 'スケジュール登録',
  onSave,
  onCancel
}) => {
  // 基本情報
  const [purpose, setPurpose] = useState('新規スケジュール');
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  
  // 担当者選択（デフォルトで最初の社員を選択）
  const [assigneeId, setAssigneeId] = useState<number | null>(
    initialData?.employeeId || (employees.length > 0 ? employees[0].id : null)
  );
  
  // 参加者管理
  const [participants, setParticipants] = useState<Employee[]>([]);
  const [participantSearchTerm, setParticipantSearchTerm] = useState('');
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  
  // 重複検出と表示
  const [participantOverlaps, setParticipantOverlaps] = useState<{ employee: Employee; overlappingSchedules: Schedule[] }[]>([]);

  // 設備管理
  const [selectedEquipments, setSelectedEquipments] = useState<Equipment[]>([]);
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState('');
  const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  
  // 重複実行防止
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // ドラッグ機能は削除
  
  // 現在時刻と現在時刻+15分を計算
  const getCurrentTime = () => {
    const now = new Date();
    const startTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const endTime = new Date(now.getTime() + 15 * 60000); // +15分
    const endTimeStr = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`;
    
    return { startTime, endTimeStr };
  };

  const { startTime: currentStartTime, endTimeStr: currentEndTime } = getCurrentTime();

  const [scheduleEntries, setScheduleEntries] = useState([
    {
      id: 1,
      date: initialData ? new Date(initialData.startDateTime.getFullYear(), initialData.startDateTime.getMonth(), initialData.startDateTime.getDate()) : new Date(), // 仮の日付、useEffectで正しい日付に更新
      startTime: initialData ? '' : currentStartTime,
      endTime: initialData ? '' : currentEndTime
    }
  ]);
  
  // テンプレート読み込み（一時的に無効化）
  useEffect(() => {
    console.log('Template loading disabled - setting empty array');
    setTemplates([]); // 一時的に空配列を設定
  }, []);

  // initialDataの処理
  useEffect(() => {
    if (initialData) {
      console.log('ScheduleRegistrationModal: Processing initialData');
      const startHour = initialData.startDateTime.getHours();
      const startMinute = initialData.startDateTime.getMinutes();
      const endHour = initialData.endDateTime.getHours();
      const endMinute = initialData.endDateTime.getMinutes();
      setScheduleEntries([{
        id: 1,
        date: new Date(initialData.startDateTime.getFullYear(), initialData.startDateTime.getMonth(), initialData.startDateTime.getDate()),
        startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
      }]);
    }
  }, [initialData]);

  // selectedCellsの処理
  useEffect(() => {
    if (selectedCells.size > 0) {
      const cellIds = Array.from(selectedCells ?? []);
      // セルIDから日付情報を取得（月別スケジュール形式: YYYY-MM-DD-slot）
      const firstCellId = cellIds[0];
      const parts = firstCellId.split('-');
      
      let cellDate: Date;
      if (parts.length >= 4) {
        // 月別スケジュール形式の場合
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // 0ベース
        const day = parseInt(parts[2]);
        cellDate = new Date(year, month, day);
        
        
        const slots = cellIds.map(id => parseInt(id.split('-')[3])).sort((a, b) => a - b);
        const startSlot = Math.min(...slots);
        const endSlot = Math.max(...slots) + 1;
        const startHour = Math.floor(startSlot / 4);
        const startMinute = (startSlot % 4) * 15;
        const endHour = Math.floor(endSlot / 4);
        const endMinuteCalc = (endSlot % 4) * 15;
        
        setScheduleEntries([{
          id: 1,
          date: cellDate,
          startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
          endTime: `${endHour.toString().padStart(2, '0')}:${endMinuteCalc.toString().padStart(2, '0')}`
        }]);
      } else {
        // 他のスケジュール形式の場合（従来の処理）
        cellDate = new Date(); // 現在の日付をデフォルトとして使用
        const slots = cellIds.map(id => parseInt(id.split('-')[1])).sort((a, b) => a - b);
        const startSlot = Math.min(...slots);
        const endSlot = Math.max(...slots) + 1;
        const startHour = Math.floor(startSlot / 4);
        const startMinute = (startSlot % 4) * 15;
        const endHour = Math.floor(endSlot / 4);
        const endMinuteCalc = (endSlot % 4) * 15;
        
        setScheduleEntries([{
          id: 1,
          date: cellDate,
          startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
          endTime: `${endHour.toString().padStart(2, '0')}:${endMinuteCalc.toString().padStart(2, '0')}`
        }]);
      }
    }
  }, [selectedCells]);

  // selectedDateのフォールバック処理（初回のみ）
  useEffect(() => {
    if (selectedCells.size === 0 && !initialData) {
      setScheduleEntries([{
        id: 1,
        date: selectedDate,
        startTime: currentStartTime,
        endTime: currentEndTime
      }]);
    }
  }, [selectedDate, initialData]); // selectedCells.sizeを削除

  // 参加者関連の関数
  const addParticipant = (employee: Employee) => {
    if (!participants.some(p => p.id === employee.id) && employee.id !== assigneeId) {
      setParticipants([...participants, employee]);
    }
    setParticipantSearchTerm('');
    setShowParticipantDropdown(false);
  };

  const removeParticipant = (employeeId: number) => {
    setParticipants(participants.filter(p => p.id !== employeeId));
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(participantSearchTerm.toLowerCase()) &&
    !participants.some(p => p.id === emp.id) &&
    emp.id !== assigneeId
  );

  // 設備関連の関数
  const addEquipment = (equipment: Equipment) => {
    if (!selectedEquipments.some(e => e.id === equipment.id)) {
      setSelectedEquipments([...selectedEquipments, equipment]);
    }
    setEquipmentSearchTerm('');
    setShowEquipmentDropdown(false);
  };

  const removeEquipment = (equipmentId: number) => {
    setSelectedEquipments(selectedEquipments.filter(e => e.id !== equipmentId));
  };

  const filteredEquipments = equipments.filter(eq => 
    eq.name.toLowerCase().includes(equipmentSearchTerm.toLowerCase()) &&
    !selectedEquipments.some(selected => selected.id === eq.id)
  );

  // 参加者重複チェック
  const checkParticipantOverlaps = useCallback(() => {
    if (!assigneeId || scheduleEntries.length === 0) {
      setParticipantOverlaps([]);
      return;
    }

    const entry = scheduleEntries[0]; // 最初のエントリで重複チェック
    if (!entry.startTime || !entry.endTime) {
      setParticipantOverlaps([]);
      return;
    }

    const startDateTime = new Date(entry.date);
    const [startHour, startMinute] = entry.startTime.split(':').map(Number);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    const endDateTime = new Date(entry.date);
    const [endHour, endMin] = entry.endTime.split(':').map(Number);
    endDateTime.setHours(endHour, endMin, 0, 0);

    const scheduleData = {
      assignee_id: assigneeId,
      start_datetime: startDateTime.toISOString(),
      end_datetime: endDateTime.toISOString()
    };

    const overlaps = checkAllParticipantsOverlap(
      scheduleData,
      participants,
      existingSchedules,
      employees
    );

    setParticipantOverlaps(overlaps);
  }, [assigneeId, participants, existingSchedules, employees]);

  // スケジュール時間や参加者が変更された時に重複チェック
  // 一時的に無効化して無限ループを防ぐ
  /*
  useEffect(() => {
    checkParticipantOverlaps();
  }, [checkParticipantOverlaps, scheduleEntries]);
  */

  const handleSave = async () => {
    // 重複実行を防止
    if (isSubmitting) {
      console.log('スケジュール登録処理中です。重複実行を防止します。');
      return;
    }
    
    if (!purpose.trim() || !assigneeId) {
      alert('用件が未入力です。');
      return;
    }

    console.log('スケジュール登録開始:', {
      scheduleEntriesCount: scheduleEntries.length,
      scheduleEntries: scheduleEntries,
      assigneeId: assigneeId,
      purpose: purpose
    });

    // 各エントリーをチェック
    for (const entry of scheduleEntries) {
      if (!entry.startTime || !entry.endTime) {
        alert('時間が未入力です。');
        return;
      }

      const startDateTime = new Date(entry.date);
      const [startHour, startMinute] = entry.startTime.split(':').map(Number);
      startDateTime.setHours(startHour, startMinute, 0, 0);

      const endDateTime = new Date(entry.date);
      const [endHour, endMin] = entry.endTime.split(':').map(Number);
      endDateTime.setHours(endHour, endMin, 0, 0);

      if (startDateTime >= endDateTime) {
        alert('終了時間は開始時間より後にしてください。');
        return;
      }
    }

    setIsSubmitting(true);
    
    try {
      // 各エントリーを順次保存（非同期処理を順次実行）
      for (const entry of scheduleEntries) {
        const startDateTime = new Date(entry.date);
        const [startHour, startMinute] = entry.startTime.split(':').map(Number);
        startDateTime.setHours(startHour, startMinute, 0, 0);

        const endDateTime = new Date(entry.date);
        const [endHour, endMin] = entry.endTime.split(':').map(Number);
        endDateTime.setHours(endHour, endMin, 0, 0);

        const saveData = {
          employee_id: assigneeId!,
          title: purpose.trim(),
          start_datetime: startDateTime.toISOString(),
          end_datetime: endDateTime.toISOString(),
          color: selectedColor,
          assignee_id: assigneeId,
          // participant_ids: participants.map(p => p.id), // 参加者機能無効化
          equipment_ids: selectedEquipments.map(e => e.id) // 設備IDリスト
        };

        console.log('スケジュール保存中:', saveData);
        await onSave(saveData);
        console.log('スケジュール保存完了');
      }
    } catch (error) {
      console.error('スケジュール登録エラー:', error);
      alert('スケジュールの登録に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addScheduleEntry = () => {
    const newId = Math.max(...scheduleEntries.map(entry => entry.id)) + 1;
    const firstEntry = scheduleEntries[0];
    setScheduleEntries([...scheduleEntries, {
      id: newId,
      date: new Date(firstEntry.date.getFullYear(), firstEntry.date.getMonth(), firstEntry.date.getDate()),
      startTime: firstEntry.startTime,
      endTime: firstEntry.endTime
    }]);
  };

  const removeScheduleEntry = (id: number) => {
    if (scheduleEntries.length > 1) {
      setScheduleEntries(scheduleEntries.filter(entry => entry.id !== id));
    }
  };

  const updateScheduleEntry = (id: number, field: 'date' | 'startTime' | 'endTime', value: string | Date) => {
    setScheduleEntries(scheduleEntries.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  // ドラッグ機能は削除



  return (
    <div className="schedule-registration-modal-overlay">
      <div className="schedule-registration-modal">
        <div className="modal-header">
          <h3 className="header-title-left">{title}</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>



        <div className="tab-content">
          {/* 担当者選択 */}
              <div className="form-row">
                <div className="form-group">
                  <label>担当者:</label>
                  <select 
                    value={assigneeId || ''} 
                    onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">担当者を選択してください</option>
                    {employees
                      .sort((a, b) => (a.employee_number || '').localeCompare(b.employee_number || ''))
                      .map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employee_number})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="schedule-entries">
              {scheduleEntries.map((entry, index) => (
                <div key={entry.id} className="schedule-entry">
                  <div className="entry-header">
                    <span className="entry-number">スケジュール {index + 1}</span>
                    {scheduleEntries.length > 1 && (
                      <button 
                        className="remove-entry-btn" 
                        onClick={() => removeScheduleEntry(entry.id)}
                        title="削除"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>日付:</label>
                                              <input
                          type="date" 
                          value={`${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, '0')}-${String(entry.date.getDate()).padStart(2, '0')}`} 
                          onChange={(e) => {
                            // タイムゾーンオフセットを考慮して日付を正しく設定（ローカル）
                            const [year, month, day] = e.target.value.split('-').map(Number);
                            updateScheduleEntry(entry.id, 'date', new Date(year, month - 1, day));
                          }} 
                        />
                    </div>
                  </div>
                  <div className="time-fields-row">
                    <div className="form-group">
                      <label>開始時間:</label>
                      <input 
                        type="time" 
                        value={entry.startTime} 
                        onChange={(e) => updateScheduleEntry(entry.id, 'startTime', e.target.value)} 
                      />
                    </div>
                    <div className="form-group">
                      <label>終了時間:</label>
                      <input 
                        type="time" 
                        value={entry.endTime} 
                        onChange={(e) => updateScheduleEntry(entry.id, 'endTime', e.target.value)} 
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="add-entry-section">
                <button className="add-entry-btn" onClick={addScheduleEntry}>
                  <span>+</span> スケジュールを追加
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>用件:</label>
                <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="用件を入力してください" maxLength={50} />
                {/* テンプレート選択 */}
                <div style={{ marginTop: 8 }}>
                  <label style={{ marginRight: 8 }}>テンプレート:</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const tid = e.target.value;
                      setSelectedTemplateId(tid);
                      const tpl = templates.find(t => String(t.id) === tid);
                      if (tpl) {
                        setPurpose(tpl.title);
                        // 色も合わせる
                        if (tpl.color) setSelectedColor(tpl.color);
                      }
                    }}
                  >
                    <option value="">未選択</option>
                    {templates.map(t => (
                      <option key={t.id} value={String(t.id)}>{t.name}（{t.title}）</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>色:</label>
                <div className="color-palette">
                  {colors.map((color, index) => (
                    <button key={`${color}-${index}`} className={`color-btn ${selectedColor === color ? 'selected' : ''}`} style={{ backgroundColor: color }} onClick={() => setSelectedColor(color)} />
                  ))}
                </div>
              </div>
            </div>

            {/* 参加者・設備予約BOX */}
            <div className="participants-equipment-container">
              {/* 参加者BOX（左側） - 非表示 */}
              {false && (
                <div className="participants-box">
                  <h4>参加者 ({participants.length}人)</h4>
                
                {/* 重複警告表示 */}
                {participantOverlaps.length > 0 && (
                  <div className="overlap-warning">
                    <div className="overlap-header">
                      <span className="warning-icon">⚠️</span>
                      <span className="warning-text">スケジュール重複が検出されました</span>
                    </div>
                    <div className="overlap-details">
                      {participantOverlaps.map(overlap => (
                        <div key={overlap.employee.id} className="overlap-item">
                          <span className="overlap-employee">{overlap.employee.name}</span>
                          <span className="overlap-count">
                            {overlap.overlappingSchedules.length}件の重複
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 参加者追加 */}
                <div className="participant-add-section">
                  <div className="participant-search">
                    <input
                      type="text"
                      placeholder="社員名で検索..."
                      value={participantSearchTerm}
                      onChange={(e) => {
                        setParticipantSearchTerm(e.target.value);
                        setShowParticipantDropdown(e.target.value.length > 0);
                      }}
                      onFocus={() => setShowParticipantDropdown(participantSearchTerm.length > 0)}
                    />
                    <button 
                      className="add-participant-btn"
                      onClick={() => setShowParticipantDropdown(!showParticipantDropdown)}
                    >
                      + 参加者を追加
                    </button>
                  </div>
                  
                  {showParticipantDropdown && (
                    <div className="participant-dropdown">
                      {filteredEmployees.length > 0 ? (
                        filteredEmployees.slice(0, 10).map(emp => (
                          <div 
                            key={emp.id} 
                            className="participant-option"
                            onClick={() => addParticipant(emp)}
                          >
                            <span className="emp-name">{emp.name}</span>
                            <span className="emp-number">({emp.employee_number})</span>
                            <span className="emp-dept">{emp.department_name}</span>
                          </div>
                        ))
                      ) : (
                        <div className="no-options">該当する社員が見つかりません</div>
                      )}
                    </div>
                  )}
                </div>

                {/* 参加者リスト */}
                <div className="participants-list">
                  {participants.length === 0 ? (
                    <div className="no-participants">参加者が設定されていません</div>
                  ) : (
                    participants.map(participant => (
                      <div key={participant.id} className="participant-item">
                        <div className="participant-info">
                          <span className="participant-name">{participant.name}</span>
                          <span className="participant-number">({participant.employee_number})</span>
                          <span className="participant-dept">{participant.department_name}</span>
                        </div>
                        <button 
                          className="remove-participant-btn"
                          onClick={() => removeParticipant(participant.id)}
                          title="参加者から削除"
                        >
                          ×
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
              )}

            {/* 設備予約BOX（右側） */}
            <div className="equipment-box">
              <h4>設備予約 ({selectedEquipments.length}件)</h4>
              
              {/* 設備追加 */}
              <div className="equipment-add-section">
                <div className="equipment-search">
                  <input
                    type="text"
                    placeholder="設備名で検索..."
                    value={equipmentSearchTerm}
                    onChange={(e) => {
                      setEquipmentSearchTerm(e.target.value);
                      setShowEquipmentDropdown(e.target.value.length > 0);
                    }}
                    onFocus={() => setShowEquipmentDropdown(equipmentSearchTerm.length > 0)}
                  />
                  <button 
                    className="add-equipment-btn"
                    onClick={() => setShowEquipmentDropdown(!showEquipmentDropdown)}
                  >
                    + 設備を追加
                  </button>
                </div>
                
                {showEquipmentDropdown && (
                  <div className="equipment-dropdown">
                    {filteredEquipments.length > 0 ? (
                      filteredEquipments.slice(0, 10).map(eq => (
                        <div 
                          key={eq.id} 
                          className="equipment-option"
                          onClick={() => addEquipment(eq)}
                        >
                          <span className="eq-name">{eq.name}</span>
                          <span className="eq-desc">{eq.description}</span>
                        </div>
                      ))
                    ) : (
                      <div className="no-options">該当する設備が見つかりません</div>
                    )}
                  </div>
                )}
              </div>

              {/* 設備リスト */}
              <div className="equipment-list">
                {selectedEquipments.length === 0 ? (
                  <div className="no-equipments">設備が設定されていません</div>
                ) : (
                  selectedEquipments.map(equipment => (
                    <div key={equipment.id} className="equipment-item">
                      <div className="equipment-info">
                        <span className="equipment-name">{equipment.name}</span>
                        <span className="equipment-desc">{equipment.description}</span>
                      </div>
                      <button 
                        className="remove-equipment-btn"
                        onClick={() => removeEquipment(equipment.id)}
                        title="設備から削除"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

            <div className="form-actions">
              <button 
                className="cancel-btn" 
                onClick={onCancel}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
              <button 
                className="save-btn" 
                onClick={handleSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? '登録中...' : '登録'}
              </button>
            </div>
        </div>
      </div>


    </div>
  );
};

export default ScheduleRegistrationModal;