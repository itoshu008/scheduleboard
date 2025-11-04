# UniversalEventBar & UniversalDragResize

日別スケジュールのリサイズと移動機能を全社員スケジュールと設備予約に移植するための共通コンポーネントとフックです。

## ファイル構成

- `UniversalEventBar.tsx` - 共通イベントバーコンポーネント
- `useUniversalDragResize.ts` - 共通ドラッグ・リサイズフック
- `UniversalDragGhost.tsx` - 共通ドラッグゴーストコンポーネント

## 使用方法

### 1. 全社員スケジュール (AllEmployeesSchedule) での使用

```tsx
import UniversalEventBar from '../UniversalEventBar/UniversalEventBar';
import UniversalDragGhost from '../UniversalDragGhost/UniversalDragGhost';
import { useUniversalDragResize } from '../../hooks/useUniversalDragResize';

// フック使用
const {
  dragData,
  dragGhost,
  resizeData,
  resizeGhost,
  isResizing,
  mousePosition,
  handleScheduleMouseDown,
  handleResizeMouseDown
} = useUniversalDragResize({
  scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
  scaledRowHeight: 40 * scheduleScale,
  onUpdateSchedule: async (scheduleId: number, updateData: any) => {
    await api.put(`/schedules/${scheduleId}`, updateData);
  },
  onReloadSchedules: async () => {
    await loadSchedules();
  },
  employees: employees, // 全社員リスト
  getEmployeeIdFromDelta: (originalEmployeeId: number, delta: number) => {
    const currentIndex = employees.findIndex(emp => emp.id === originalEmployeeId);
    if (currentIndex === -1) return originalEmployeeId;
    const newIndex = Math.max(0, Math.min(employees.length - 1, currentIndex + delta));
    return employees[newIndex].id;
  },
  enableVerticalMovement: true, // 社員間移動を有効
  scheduleType: 'allEmployees'
});

// イベントバーレンダリング
<UniversalEventBar
  schedule={schedule}
  isSelected={selectedSchedule?.id === schedule.id}
  isResizing={isResizing}
  resizeData={resizeData}
  scaledCellWidth={CELL_WIDTH_PX * scheduleScale}
  scheduleScale={scheduleScale}
  onMouseDown={handleScheduleMouseDown}
  onDoubleClick={(schedule) => handleScheduleDoubleClick(schedule)}
  onContextMenu={(schedule) => handleScheduleContextMenu(schedule)}
  onResizeMouseDown={handleResizeMouseDown}
  startSlot={startSlot}
  width={width}
  left={left}
  top={2}
  height={36}
/>

// ドラッグゴースト
{dragData && dragGhost && mousePosition && (
  <UniversalDragGhost
    dragData={dragData}
    dragGhost={dragGhost}
    mousePosition={mousePosition}
    scheduleScale={scheduleScale}
    scheduleType="allEmployees"
    employees={employees}
    getEmployeeIdFromDelta={getEmployeeIdFromDelta}
  />
)}
```

### 2. 設備予約 (EquipmentReservation) での使用

```tsx
import UniversalEventBar from '../UniversalEventBar/UniversalEventBar';
import UniversalDragGhost from '../UniversalDragGhost/UniversalDragGhost';
import { useUniversalDragResize } from '../../hooks/useUniversalDragResize';

// フック使用
const {
  dragData,
  dragGhost,
  resizeData,
  resizeGhost,
  isResizing,
  mousePosition,
  handleScheduleMouseDown,
  handleResizeMouseDown
} = useUniversalDragResize({
  scaledCellWidth: CELL_WIDTH_PX * scheduleScale,
  scaledRowHeight: 40 * scheduleScale,
  onUpdateSchedule: async (scheduleId: number, updateData: any) => {
    await api.put(`/schedules/${scheduleId}`, updateData);
  },
  onReloadSchedules: async () => {
    await loadReservations();
  },
  equipments: equipments, // 設備リスト
  getEquipmentIdFromDelta: (originalEquipmentId: number, delta: number) => {
    const currentIndex = equipments.findIndex(eq => eq.id === originalEquipmentId);
    if (currentIndex === -1) return originalEquipmentId;
    const newIndex = Math.max(0, Math.min(equipments.length - 1, currentIndex + delta));
    return equipments[newIndex].id;
  },
  enableVerticalMovement: true, // 設備間移動を有効
  scheduleType: 'equipment'
});

// イベントバーレンダリング
<UniversalEventBar
  schedule={schedule}
  isSelected={selectedSchedule?.id === schedule.id}
  isResizing={isResizing}
  resizeData={resizeData}
  scaledCellWidth={CELL_WIDTH_PX * scheduleScale}
  scheduleScale={scheduleScale}
  onMouseDown={handleScheduleMouseDown}
  onDoubleClick={(schedule) => handleScheduleDoubleClick(schedule)}
  onContextMenu={(schedule) => handleScheduleContextMenu(schedule)}
  onResizeMouseDown={handleResizeMouseDown}
  startSlot={startSlot}
  width={width}
  left={left}
  top={2}
  height={36}
/>

// ドラッグゴースト
{dragData && dragGhost && mousePosition && (
  <UniversalDragGhost
    dragData={dragData}
    dragGhost={dragGhost}
    mousePosition={mousePosition}
    scheduleScale={scheduleScale}
    scheduleType="equipment"
    equipments={equipments}
    getEquipmentIdFromDelta={getEquipmentIdFromDelta}
  />
)}
```

## プロパティ詳細

### useUniversalDragResize

| プロパティ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| scaledCellWidth | number | ✅ | セル幅（スケール適用済み） |
| scaledRowHeight | number | ✅ | 行高さ（スケール適用済み） |
| onUpdateSchedule | function | ✅ | スケジュール更新API関数 |
| onReloadSchedules | function | ✅ | スケジュール再読み込み関数 |
| employees | array | ❌ | 社員リスト（社員移動用） |
| equipments | array | ❌ | 設備リスト（設備移動用） |
| getEmployeeIdFromDelta | function | ❌ | 社員ID計算関数 |
| getEquipmentIdFromDelta | function | ❌ | 設備ID計算関数 |
| enableVerticalMovement | boolean | ❌ | 縦移動を有効にするか（デフォルト: false） |
| scheduleType | string | ❌ | スケジュールタイプ（'daily' \| 'allEmployees' \| 'equipment'） |

### UniversalEventBar

| プロパティ | 型 | 必須 | 説明 |
|-----------|----|----|------|
| schedule | Schedule | ✅ | スケジュールオブジェクト |
| isSelected | boolean | ✅ | 選択状態 |
| scaledCellWidth | number | ✅ | セル幅 |
| scheduleScale | number | ✅ | スケール |
| onMouseDown | function | ✅ | ドラッグ開始ハンドラー |
| onDoubleClick | function | ✅ | ダブルクリックハンドラー |
| onContextMenu | function | ✅ | 右クリックハンドラー |
| onResizeMouseDown | function | ✅ | リサイズ開始ハンドラー |
| startSlot | number | ✅ | 開始スロット |
| width | number | ✅ | 幅 |
| left | number | ✅ | 左位置 |
| top | number | ❌ | 上位置（デフォルト: 2） |
| height | number | ❌ | 高さ（デフォルト: 36） |

## 機能

✅ **横移動**: 時間軸での移動（全スケジュールタイプ対応）  
✅ **縦移動**: 社員間・設備間移動（enableVerticalMovement=trueで有効）  
✅ **リサイズ**: 左右ハンドルでの時間調整  
✅ **ドラッグゴースト**: マウス追従の視覚フィードバック  
✅ **詳細ログ**: デバッグ用の詳細ログ出力  
✅ **エラーハンドリング**: API失敗時のアラート表示  

## 移植手順

1. 既存のイベントバーレンダリングを `UniversalEventBar` に置き換え
2. 既存のドラッグ・リサイズロジックを `useUniversalDragResize` に置き換え
3. ドラッグゴーストとして `UniversalDragGhost` を追加
4. 必要に応じて `scheduleType` と縦移動設定を調整

これにより、日別スケジュールと同等のドラッグ・リサイズ機能を他のページでも利用できます。
