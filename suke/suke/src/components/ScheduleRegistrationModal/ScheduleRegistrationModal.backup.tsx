import React, { useState, useEffect, useCallback } from 'react';
import './ScheduleRegistrationModal.css';

// 型定義
import { Employee, Schedule, ScheduleParticipant, Equipment, Template } from '../../types';

// 重複チェック用ユーティリティ
import { checkAllParticipantsOverlap } from '../../utils/overlapUtils';

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
  
  // 🔍 デバッグ：プロパティの詳細ログ
  console.log('🔍 ScheduleRegistrationModal: Props received:', {
    selectedCellsSize: selectedCells.size,
    selectedCellsArray: Array.from(selectedCells),
    selectedDate: selectedDate.toDateString(),
    selectedDateISO: selectedDate.toISOString(),
    initialData: initialData,
    initialDataExists: !!initialData,
    employeesCount: employees.length
  });
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
  
  // getCurrentTime関数を削除（フォールバック処理で直接計算するため）

  // 強制的に現在時刻を計算する関数
  const getCurrentTimeEntry = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = Math.floor(now.getMinutes() / 15) * 15;
    
    const startTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const endHour = currentMinute === 45 ? currentHour + 1 : currentHour;
    const endMinute = currentMinute === 45 ? 0 : currentMinute + 15;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    return {
      id: 1,
      date: selectedDate,
      startTime: startTime,
      endTime: endTime
    };
  };

  const [scheduleEntries, setScheduleEntries] = useState(() => {
    const initialEntry = getCurrentTimeEntry();
    
    console.log('🔍 ScheduleRegistrationModal: Initial scheduleEntries created with current time:', {
      entry: initialEntry,
      selectedDate: selectedDate.toDateString(),
      selectedDateISO: selectedDate.toISOString(),
      currentTime: new Date().toTimeString(),
      calculatedStartTime: initialEntry.startTime,
      calculatedEndTime: initialEntry.endTime
    });
    return [initialEntry];
  });
  
  // テンプレート読み込み（一時的に無効化）
  useEffect(() => {
    console.log('Template loading disabled - setting empty array');
    setTemplates([]); // 一時的に空配列を設定
  }, []);

  // 🚨 統合されたuseEffect：すべての日時設定ロジックを1つにまとめる
  useEffect(() => {
    console.log('🔍 ScheduleRegistrationModal: UNIFIED useEffect triggered');
    console.log('🔍 ScheduleRegistrationModal: Conditions:', {
      selectedCellsSize: selectedCells.size,
      initialDataExists: !!initialData,
      selectedDate: selectedDate.toDateString()
    });
    
    let newEntry: any = null;
    
    // 1. initialDataが存在する場合（最優先）
    if (initialData) {
      console.log('🔍 ScheduleRegistrationModal: Processing initialData (PRIORITY 1)');
      const startHour = initialData.startDateTime.getHours();
      const startMinute = initialData.startDateTime.getMinutes();
      const endHour = initialData.endDateTime.getHours();
      const endMinute = initialData.endDateTime.getMinutes();
      const calculatedDate = new Date(initialData.startDateTime.getFullYear(), initialData.startDateTime.getMonth(), initialData.startDateTime.getDate());
      
      newEntry = {
        id: 1,
        date: calculatedDate,
        startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
      };
      console.log('🔍 ScheduleRegistrationModal: initialData entry created:', newEntry);
    }
    // 2. selectedCellsが存在する場合（セル選択からの登録）
    else if (selectedCells.size > 0) {
      console.log('🔍 ScheduleRegistrationModal: Processing selectedCells (PRIORITY 2)');
      const cellIds = Array.from(selectedCells);
      const cellId = cellIds[0];
      const parts = cellId.split('-');
      
      let cellDate: Date;
      if (parts.length >= 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        cellDate = new Date(year, month, day);
      } else {
        cellDate = selectedDate;
      }
      
      const slot = parseInt(parts[parts.length - 1]);
      const startHour = Math.floor(slot / 4) + 8;
      const startMinute = (slot % 4) * 15;
      const endHour = startMinute === 45 ? startHour + 1 : startHour;
      const endMinute = startMinute === 45 ? 0 : startMinute + 15;
      
      newEntry = {
        id: 1,
        date: cellDate,
        startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`
      };
      console.log('🔍 ScheduleRegistrationModal: selectedCells entry created:', newEntry);
    }
    // 3. フォールバック：管理タブからの登録（現在時刻を使用）
    else {
      console.log('🔍 ScheduleRegistrationModal: Using fallback - current time (PRIORITY 3)');
      newEntry = getCurrentTimeEntry();
      console.log('🔍 ScheduleRegistrationModal: fallback entry created:', newEntry);
    }
    
    // エントリが作成された場合のみ更新
    if (newEntry) {
      console.log('🔍 ScheduleRegistrationModal: UNIFIED - Setting scheduleEntries:', newEntry);
      setScheduleEntries([newEntry]);
    }
  }, [selectedCells, initialData, selectedDate]); // 依存配列を統一

  // 🚨 重複するuseEffectを削除（統合されたuseEffectで処理済み）

  // selectedCellsの処理（initialDataがnullの場合のフォールバック）
  useEffect(() => {
    console.log('🔍 ScheduleRegistrationModal: selectedCells useEffect triggered');
    console.log('🔍 ScheduleRegistrationModal: selectedCells useEffect - initialData:', initialData, 'selectedCells.size:', selectedCells.size);
    console.log('🔍 ScheduleRegistrationModal: Current scheduleEntries before selectedCells processing:', scheduleEntries);
    
    if (selectedCells.size > 0 && !initialData) {
      console.log('🔍 ScheduleRegistrationModal: Processing selectedCells (initialData is null)');
      const cellIds = Array.from(selectedCells ?? []);
      console.log('ScheduleRegistrationModal: cellIds =', cellIds);
      
      // セルIDから日付情報を取得
      const firstCellId = cellIds[0];
      const parts = firstCellId.split('-');
      console.log('ScheduleRegistrationModal: parts =', parts);
      
      let cellDate: Date;
      let slots: number[];
      
      if (parts.length === 4) {
        // 月別スケジュール形式: YYYY-MM-DD-slot
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // 0ベース
        const day = parseInt(parts[2]);
        cellDate = new Date(year, month, day);
        slots = cellIds.map(id => parseInt(id.split('-')[3])).sort((a, b) => a - b);
        
        console.log('ScheduleRegistrationModal: Monthly schedule format date calculation:', {
          year,
          month,
          day,
          cellDate: cellDate.toDateString(),
          cellDateISO: cellDate.toISOString()
        });
      } else if (parts.length === 5) {
        // 日別・全社員・設備予約形式: YYYY-MM-DD-employeeId/equipmentId-slot
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // 0ベース
        const day = parseInt(parts[2]);
        cellDate = new Date(year, month, day);
        slots = cellIds.map(id => parseInt(id.split('-')[4])).sort((a, b) => a - b);
        
        console.log('ScheduleRegistrationModal: 5-part format date calculation:', {
          year,
          month,
          day,
          cellDate: cellDate.toDateString(),
          cellDateISO: cellDate.toISOString()
        });
      } else {
        // 旧形式の場合（後方互換性）
        console.log('ScheduleRegistrationModal: Using selectedDate as fallback');
        cellDate = selectedDate || new Date();
        slots = cellIds.map(id => {
          const idParts = id.split('-');
          return parseInt(idParts[idParts.length - 1]); // 最後の部分をslotとして使用
        }).sort((a, b) => a - b);
        
        console.log('ScheduleRegistrationModal: Fallback date:', {
          cellDate: cellDate.toDateString(),
          cellDateISO: cellDate.toISOString()
        });
      }
      
      const startSlot = Math.min(...slots);
      const endSlot = Math.max(...slots) + 1;
      const startHour = Math.floor(startSlot / 4);
      const startMinute = (startSlot % 4) * 15;
      const endHour = Math.floor(endSlot / 4);
      const endMinuteCalc = (endSlot % 4) * 15;
      
      console.log('ScheduleRegistrationModal: Time calculation:', {
        cellDate: cellDate.toDateString(),
        startSlot,
        endSlot,
        startHour,
        startMinute,
        endHour,
        endMinuteCalc
      });
      
      setScheduleEntries([{
        id: 1,
        date: cellDate,
        startTime: `${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
        endTime: `${endHour.toString().padStart(2, '0')}:${endMinuteCalc.toString().padStart(2, '0')}`
      }]);
    }
  }, [selectedCells, selectedDate, initialData]);

  // selectedDateのフォールバック処理（初回のみ）
  useEffect(() => {
    console.log('ScheduleRegistrationModal: Fallback useEffect triggered');
    console.log('ScheduleRegistrationModal: selectedCells.size =', selectedCells.size);
    console.log('ScheduleRegistrationModal: initialData exists =', !!initialData);
    
    if (selectedCells.size === 0 && !initialData) {
      console.log('🔍 ScheduleRegistrationModal: Using fallback - selectedDate with current time');
      
      // 現在時刻を取得（毎回最新の時刻を計算）
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = Math.floor(now.getMinutes() / 15) * 15; // 15分単位に丸める
      
      console.log('🔍 ScheduleRegistrationModal: Current time calculation:', {
        now: now.toTimeString(),
        currentHour,
        rawMinutes: now.getMinutes(),
        roundedMinutes: currentMinute
      });
      
      const startTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      const endHour = currentMinute === 45 ? currentHour + 1 : currentHour;
      const endMinute = currentMinute === 45 ? 0 : currentMinute + 15;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      console.log('🔍 ScheduleRegistrationModal: Calculated times:', {
        startTime,
        endTime,
        endHour,
        endMinute
      });
      
      // selectedDateが今日の場合は明日を使用、それ以外はselectedDateを使用
      const today = new Date();
      today.setHours(0, 0, 0, 0); // 時間部分をリセット
      
      const selectedDateOnly = new Date(selectedDate);
      selectedDateOnly.setHours(0, 0, 0, 0); // 時間部分をリセット
      
      let targetDate = selectedDate;
      if (selectedDateOnly.getTime() === today.getTime()) {
        // selectedDateが今日の場合は明日を使用
        targetDate = new Date(today);
        targetDate.setDate(today.getDate() + 1);
        console.log('🔍 ScheduleRegistrationModal: selectedDate is today, using tomorrow:', targetDate.toDateString());
      } else {
        console.log('🔍 ScheduleRegistrationModal: selectedDate is not today, using selectedDate:', selectedDate.toDateString());
      }
      
      const fallbackEntry = {
        id: 1,
        date: targetDate, // 今日の場合は明日、それ以外はselectedDate
        startTime: startTime,
        endTime: endTime
      };
      
      console.log('🔍 ScheduleRegistrationModal: Setting fallback entry:', {
        fallbackEntry,
        selectedDate: selectedDate.toDateString(),
        selectedDateISO: selectedDate.toISOString(),
        currentTime: now.toTimeString(),
        calculatedStartTime: startTime,
        calculatedEndTime: endTime
      });
      
      setScheduleEntries([fallbackEntry]);
    }
  }, [selectedDate, initialData, selectedCells.size]);

  // 強制的にフォールバック処理を実行（デバッグ用）
  useEffect(() => {
    console.log('🔍 ScheduleRegistrationModal: Force fallback useEffect triggered');
    console.log('🔍 ScheduleRegistrationModal: Conditions check:', {
      selectedCellsSize: selectedCells.size,
      initialDataExists: !!initialData,
      shouldExecuteFallback: selectedCells.size === 0 && !initialData
    });
    
    if (selectedCells.size === 0 && !initialData) {
      console.log('🔍 ScheduleRegistrationModal: FORCE EXECUTING fallback processing');
      
      // 現在時刻を取得（毎回最新の時刻を計算）
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = Math.floor(now.getMinutes() / 15) * 15; // 15分単位に丸める
      
      console.log('🔍 ScheduleRegistrationModal: FORCE Current time calculation:', {
        now: now.toTimeString(),
        currentHour,
        rawMinutes: now.getMinutes(),
        roundedMinutes: currentMinute
      });
      
      const startTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      const endHour = currentMinute === 45 ? currentHour + 1 : currentHour;
      const endMinute = currentMinute === 45 ? 0 : currentMinute + 15;
      const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
      
      console.log('🔍 ScheduleRegistrationModal: FORCE Calculated times:', {
        startTime,
        endTime,
        endHour,
        endMinute
      });
      
      // selectedDateをそのまま使用（カレンダーで表示されている日付）
      const targetDate = selectedDate;
      console.log('🔍 ScheduleRegistrationModal: FORCE Using selectedDate from calendar:', targetDate.toDateString());
      
      const fallbackEntry = {
        id: 1,
        date: targetDate, // カレンダーで表示されている日付
        startTime: startTime,
        endTime: endTime
      };
      
      console.log('🔍 ScheduleRegistrationModal: FORCE Setting fallback entry:', {
        fallbackEntry,
        selectedDate: selectedDate.toDateString(),
        selectedDateISO: selectedDate.toISOString(),
        currentTime: now.toTimeString(),
        calculatedStartTime: startTime,
        calculatedEndTime: endTime
      });
      
      setScheduleEntries([fallbackEntry]);
    } else {
      console.log('🔍 ScheduleRegistrationModal: FORCE Fallback conditions not met');
    }
  }, [selectedCells, initialData, selectedDate]); // より明確な依存配列

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
          start_datetime: startDateTime.toISOString(), // ISO文字列に変換
          end_datetime: endDateTime.toISOString(),     // ISO文字列に変換
          color: selectedColor,
          assignee_id: assigneeId,
          // participant_ids: participants.map(p => p.id), // 参加者機能無効化
          equipment_ids: selectedEquipments.map(e => e.id) // 設備IDリスト
        };

        console.log('スケジュール保存中:', saveData);
        console.log('スケジュール保存中 - 日時詳細:', {
          startDateTime_local: startDateTime.toString(),
          endDateTime_local: endDateTime.toString(),
          startDateTime_iso: saveData.start_datetime,
          endDateTime_iso: saveData.end_datetime
        });
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