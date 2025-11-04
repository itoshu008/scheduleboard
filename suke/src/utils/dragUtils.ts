import { Schedule } from '../types';

// 高精度ドラッグシステムのユーティリティ

export interface DragState {
  schedule: Schedule;
  startX: number;
  startY: number;
  originalStart: Date;
  originalEnd: Date;
  startSlot: number;
  startDate: Date;
}

export interface ResizeState {
  schedule: Schedule;
  edge: 'start' | 'end';
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

export interface DragGhost {
  schedule: Schedule;
  newStart: Date;
  newEnd: Date;
  newSlot: number;
  newDate: Date;
  deltaX: number;
  deltaY: number;
}

export interface ResizeGhost {
  schedule: Schedule;
  newStart: Date;
  newEnd: Date;
  edge: 'start' | 'end';
}

// 高精度スロット計算（1分単位）
export const timeToSlot = (date: Date): number => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return hours * 60 + minutes; // 1分単位のスロット
};

export const slotToTime = (baseDate: Date, slot: number): Date => {
  const hours = Math.floor(slot / 60);
  const minutes = slot % 60;
  return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes);
};

// ピクセル位置からスロットに変換（高精度）
export const pixelToSlot = (pixelX: number, cellWidth: number): number => {
  const slotPosition = pixelX / cellWidth;
  return Math.round(slotPosition * 60) / 60; // 1分単位にスナップ
};

// スロットからピクセル位置に変換
export const slotToPixel = (slot: number, cellWidth: number): number => {
  return slot * cellWidth;
};

// 日付の移動計算
export const calculateDateMove = (deltaY: number, rowHeight: number): number => {
  return Math.round(deltaY / rowHeight);
};

// スケジュールの持続時間を計算
export const calculateDuration = (start: Date, end: Date): number => {
  return end.getTime() - start.getTime();
};

// 新しい開始時刻を計算（ドラッグ用）
export const calculateNewStart = (originalStart: Date, slotDelta: number, dateDelta: number): Date => {
  const newDate = new Date(originalStart);
  newDate.setDate(newDate.getDate() + dateDelta);
  
  const newSlot = timeToSlot(originalStart) + slotDelta;
  return slotToTime(newDate, newSlot);
};

// 新しい終了時刻を計算（ドラッグ用）
export const calculateNewEnd = (newStart: Date, duration: number): Date => {
  return new Date(newStart.getTime() + duration);
};

// リサイズ時の新しい時刻を計算
export const calculateResizeTime = (
  originalTime: Date, 
  slotDelta: number, 
  edge: 'start' | 'end',
  otherTime: Date
): Date => {
  const newSlot = timeToSlot(originalTime) + slotDelta;
  const newTime = slotToTime(originalTime, newSlot);
  
  // 最小/最大制限
  if (edge === 'start') {
    // 開始時刻は終了時刻より1分前まで
    const maxTime = new Date(otherTime.getTime() - 60 * 1000);
    return newTime > maxTime ? maxTime : newTime;
  } else {
    // 終了時刻は開始時刻より1分後まで
    const minTime = new Date(otherTime.getTime() + 60 * 1000);
    return newTime < minTime ? minTime : newTime;
  }
};

// スケジュールの境界チェック
export const isWithinBounds = (slot: number): boolean => {
  return slot >= 0 && slot < 1440; // 0分から1439分（23:59）まで
};

// ドラッグゴーストの位置計算
export const calculateGhostPosition = (
  dragState: DragState,
  mouseX: number,
  mouseY: number,
  cellWidth: number,
  rowHeight: number
): DragGhost => {
  const deltaX = mouseX - dragState.startX;
  const deltaY = mouseY - dragState.startY;
  
  const slotDelta = pixelToSlot(deltaX, cellWidth);
  const dateDelta = calculateDateMove(deltaY, rowHeight);
  
  const newStart = calculateNewStart(dragState.originalStart, slotDelta, dateDelta);
  const duration = calculateDuration(dragState.originalStart, dragState.originalEnd);
  const newEnd = calculateNewEnd(newStart, duration);
  
  const newSlot = timeToSlot(newStart);
  const newDate = new Date(newStart.getFullYear(), newStart.getMonth(), newStart.getDate());
  
  return {
    schedule: dragState.schedule,
    newStart,
    newEnd,
    newSlot,
    newDate,
    deltaX,
    deltaY
  };
};

// リサイズゴーストの計算
export const calculateResizeGhost = (
  resizeState: ResizeState,
  mouseX: number,
  cellWidth: number
): ResizeGhost => {
  const deltaX = mouseX - resizeState.startX;
  const slotDelta = pixelToSlot(deltaX, cellWidth);
  
  let newStart = new Date(resizeState.originalStart);
  let newEnd = new Date(resizeState.originalEnd);
  
  if (resizeState.edge === 'start') {
    newStart = calculateResizeTime(resizeState.originalStart, slotDelta, 'start', resizeState.originalEnd);
  } else {
    newEnd = calculateResizeTime(resizeState.originalEnd, slotDelta, 'end', resizeState.originalStart);
  }
  
  return {
    schedule: resizeState.schedule,
    newStart,
    newEnd,
    edge: resizeState.edge
  };
};
