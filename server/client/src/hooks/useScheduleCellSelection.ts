import { useState, useCallback, useRef } from 'react';
import { Schedule, Employee } from '../types';
import { getTimeFromSlot, getTimeSlot, getEndTimeSlot } from '../utils/dateUtils';

export interface CellSelectionState {
  selectedCells: Set<string>;
  isSelecting: boolean;
  selectionAnchor: { employeeId: number; slot: number } | null;
  selectedSchedule: Schedule | null;
  dragData: {
    schedule: Schedule;
    startX: number;
    startY: number;
    originalStart: Date;
    originalEnd: Date;
  } | null;
  dragGhost: {
    schedule: Schedule;
    start: Date;
    end: Date;
  } | null;
  mousePosition: { x: number; y: number } | null;
}

export interface CellSelectionActions {
  setSelectedCells: (cells: Set<string>) => void;
  setIsSelecting: (selecting: boolean) => void;
  setSelectionAnchor: (anchor: { employeeId: number; slot: number } | null) => void;
  setSelectedSchedule: (schedule: Schedule | null) => void;
  setDragData: (data: CellSelectionState['dragData']) => void;
  setDragGhost: (ghost: CellSelectionState['dragGhost']) => void;
  setMousePosition: (position: { x: number; y: number } | null) => void;
  handleCellMouseDown: (employeeId: number, slot: number, selectedDate: Date) => void;
  handleCellMouseEnter: (employeeId: number, slot: number, selectedDate: Date) => void;
  handleCellMouseUp: () => void;
  handleCellDoubleClick: (employeeId: number, slot: number, selectedDate: Date) => void;
  getSelectedCellDateTime: (employees: Employee[], selectedDate: Date) => {
    startDateTime: Date;
    endDateTime: Date;
    employeeId: number;
  } | null;
  clearSelection: () => void;
}

export const useScheduleCellSelection = (): CellSelectionState & CellSelectionActions => {
  // 状態管理
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionAnchor, setSelectionAnchor] = useState<{ employeeId: number; slot: number } | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [dragData, setDragData] = useState<{
    schedule: Schedule;
    startX: number;
    startY: number;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    schedule: Schedule;
    start: Date;
    end: Date;
  } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);

  // セルID生成（統一形式）
  const generateCellId = useCallback((employeeId: number, slot: number, selectedDate: Date) => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}-${employeeId}-${slot}`;
  }, []);

  // セルマウスダウン
  const handleCellMouseDown = useCallback((employeeId: number, slot: number, selectedDate: Date) => {
    if (dragData) return; // ドラッグ中は選択無効

    const cellId = generateCellId(employeeId, slot, selectedDate);
    console.log('🔍 CellSelection: handleCellMouseDown', { employeeId, slot, cellId });

    // スケジュール選択をクリア
    setSelectedSchedule(null);

    // セル選択開始
    setSelectedCells(new Set([cellId]));
    setIsSelecting(true);
    setSelectionAnchor({ employeeId, slot });
  }, [dragData, generateCellId]);

  // セルマウスエンター（複数選択）
  const handleCellMouseEnter = useCallback((employeeId: number, slot: number, selectedDate: Date) => {
    if (!isSelecting || !selectionAnchor) return;

    const newSelectedCells = new Set<string>();
    const startEmployee = Math.min(selectionAnchor.employeeId, employeeId);
    const endEmployee = Math.max(selectionAnchor.employeeId, employeeId);
    const startSlot = Math.min(selectionAnchor.slot, slot);
    const endSlot = Math.max(selectionAnchor.slot, slot);

    // 選択範囲のセルを生成
    for (let empId = startEmployee; empId <= endEmployee; empId++) {
      for (let s = startSlot; s <= endSlot; s++) {
        const cellId = generateCellId(empId, s, selectedDate);
        newSelectedCells.add(cellId);
      }
    }

    setSelectedCells(newSelectedCells);
  }, [isSelecting, selectionAnchor, generateCellId]);

  // セルマウスアップ
  const handleCellMouseUp = useCallback(() => {
    setIsSelecting(false);
    setSelectionAnchor(null);
  }, []);

  // セルダブルクリック（新規登録）
  const handleCellDoubleClick = useCallback((employeeId: number, slot: number, selectedDate: Date) => {
    const cellId = generateCellId(employeeId, slot, selectedDate);
    console.log('🔍 CellSelection: handleCellDoubleClick', { employeeId, slot, cellId });
    setSelectedCells(new Set([cellId]));
    setSelectedSchedule(null);
  }, [generateCellId]);

  // 選択セル日時取得
  const getSelectedCellDateTime = useCallback((employees: Employee[], selectedDate: Date) => {
    if (selectedCells.size === 0) return null;

    // 選択されたセルから時間スロットを抽出し、ソート
    const cellIds = Array.from(selectedCells);
    const slots = cellIds.map(id => {
      const parts = id.split('-');
      // 新形式: YYYY-MM-DD-employeeId-slot の場合
      if (parts.length === 5) {
        return { employeeId: parseInt(parts[3]), slot: parseInt(parts[4]) };
      }
      // 旧形式: employeeId-slot の場合（後方互換性）
      const [employeeId, slot] = parts.map(Number);
      return { employeeId, slot };
    }).sort((a, b) => a.slot - b.slot);

    const firstSlot = slots[0];
    const lastSlot = slots[slots.length - 1];
    const employee = employees.find(emp => emp.id === firstSlot.employeeId);
    if (!employee) return null;

    const startTime = getTimeFromSlot(firstSlot.slot);
    const endTime = getTimeFromSlot(lastSlot.slot + 1); // 最後のセルの終了時刻

    return {
      startDateTime: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), startTime.hour, startTime.minute),
      endDateTime: new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), endTime.hour, endTime.minute),
      employeeId: firstSlot.employeeId
    };
  }, [selectedCells]);

  // 選択クリア
  const clearSelection = useCallback(() => {
    setSelectedCells(new Set());
    setSelectedSchedule(null);
    setIsSelecting(false);
    setSelectionAnchor(null);
  }, []);

  return {
    // 状態
    selectedCells,
    isSelecting,
    selectionAnchor,
    selectedSchedule,
    dragData,
    dragGhost,
    mousePosition,
    // アクション
    setSelectedCells,
    setIsSelecting,
    setSelectionAnchor,
    setSelectedSchedule,
    setDragData,
    setDragGhost,
    setMousePosition,
    handleCellMouseDown,
    handleCellMouseEnter,
    handleCellMouseUp,
    handleCellDoubleClick,
    getSelectedCellDateTime,
    clearSelection
  };
};
