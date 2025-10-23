export type DragMode = 'move' | 'resize-start' | 'resize-end';

export interface SlotDragState {
  mode: DragMode;
  initialClientY: number;
  startSlot: number;     // 開始スロット（ドラッグ開始時）
  endSlot: number;       // 終了スロット（ドラッグ開始時, 排他）
  offsetPx: number;      // move時: バー上端から掴んだ位置までのオフセット
  slotMinutes: number;   // 例: 15
  totalSlots: number;    // 例: 96 (24h * 60 / 15)
}

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function getContainerMetrics(container: HTMLElement) {
  const rect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;
  const scrollLeft = container.scrollLeft;
  return { rect, scrollTop, scrollLeft };
}

export function getSlotHeightPx(container: HTMLElement, fallback = 20) {
  const cell = container.querySelector<HTMLElement>('.slot-cell'); // 各15分セルにこのclassを付与
  if (!cell) return fallback;
  return cell.getBoundingClientRect().height;
}

/** clientY -> container内px -> スロットindex(丸め) */
export function clientYToSlot(
  clientY: number,
  container: HTMLElement,
  slotHeight: number,
  totalSlots: number
) {
  const { rect, scrollTop } = getContainerMetrics(container);
  const yInContainer = clientY - rect.top + scrollTop;
  const raw = yInContainer / slotHeight;
  return clamp(Math.round(raw), 0, totalSlots - 1);
}

/** move: 掴んだオフセットを保ったまま、新しいstartSlotを算出 */
export function computeMoveSlots(
  e: PointerEvent,
  container: HTMLElement,
  state: SlotDragState,
  slotHeight: number
) {
  const { rect, scrollTop } = getContainerMetrics(container);
  const yInContainer = e.clientY - rect.top + scrollTop;
  const topPx = clamp(
    yInContainer - state.offsetPx,
    0,
    state.totalSlots * slotHeight - (state.endSlot - state.startSlot) * slotHeight
  );
  const newStart = clamp(Math.round(topPx / slotHeight), 0, state.totalSlots - 1);
  const len = state.endSlot - state.startSlot;
  const newEnd = clamp(newStart + len, newStart + 1, state.totalSlots);
  return { startSlot: newStart, endSlot: newEnd };
}

/** resize-start: 上端をドラッグ */
export function computeResizeStart(
  e: PointerEvent,
  container: HTMLElement,
  state: SlotDragState,
  slotHeight: number,
  minSlots = 1
) {
  const slot = clientYToSlot(e.clientY, container, slotHeight, state.totalSlots);
  const newStart = clamp(slot, 0, state.endSlot - minSlots);
  return { startSlot: newStart, endSlot: state.endSlot };
}

/** resize-end: 下端をドラッグ（排他的endSlot） */
export function computeResizeEnd(
  e: PointerEvent,
  container: HTMLElement,
  state: SlotDragState,
  slotHeight: number,
  minSlots = 1
) {
  const slot = clientYToSlot(e.clientY, container, slotHeight, state.totalSlots);
  const newEnd = clamp(slot, state.startSlot + minSlots, state.totalSlots);
  return { startSlot: state.startSlot, endSlot: newEnd };
}

// 横方向（月表示用）のユーティリティ
export function clientXToSlot(
  clientX: number,
  container: HTMLElement,
  slotWidth: number,
  totalSlots: number
) {
  const { rect, scrollLeft } = getContainerMetrics(container);
  const xInContainer = clientX - rect.left + scrollLeft;
  const raw = xInContainer / slotWidth;
  return clamp(Math.round(raw), 0, totalSlots - 1);
}

export function getSlotWidthPx(container: HTMLElement, fallback = 20) {
  const cell = container.querySelector<HTMLElement>('.slot-cell');
  if (!cell) return fallback;
  return cell.getBoundingClientRect().width;
}

/** move: 横方向のドラッグ */
export function computeMoveSlotsX(
  e: PointerEvent,
  container: HTMLElement,
  state: SlotDragState,
  slotWidth: number
) {
  const { rect, scrollLeft } = getContainerMetrics(container);
  const xInContainer = e.clientX - rect.left + scrollLeft;
  const leftPx = clamp(
    xInContainer - state.offsetPx,
    0,
    state.totalSlots * slotWidth - (state.endSlot - state.startSlot) * slotWidth
  );
  const newStart = clamp(Math.round(leftPx / slotWidth), 0, state.totalSlots - 1);
  const len = state.endSlot - state.startSlot;
  const newEnd = clamp(newStart + len, newStart + 1, state.totalSlots);
  return { startSlot: newStart, endSlot: newEnd };
}

/** resize-start: 左端をドラッグ（横方向） */
export function computeResizeStartX(
  e: PointerEvent,
  container: HTMLElement,
  state: SlotDragState,
  slotWidth: number,
  minSlots = 1
) {
  const slot = clientXToSlot(e.clientX, container, slotWidth, state.totalSlots);
  const newStart = clamp(slot, 0, state.endSlot - minSlots);
  return { startSlot: newStart, endSlot: state.endSlot };
}

/** resize-end: 右端をドラッグ（横方向） */
export function computeResizeEndX(
  e: PointerEvent,
  container: HTMLElement,
  state: SlotDragState,
  slotWidth: number,
  minSlots = 1
) {
  const slot = clientXToSlot(e.clientX, container, slotWidth, state.totalSlots);
  const newEnd = clamp(slot, state.startSlot + minSlots, state.totalSlots);
  return { startSlot: state.startSlot, endSlot: newEnd };
}
