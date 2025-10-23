# ReusableEventBar & useScheduleDragResize

月別スケジュールで完成したドラッグ・リサイズ機能を他のページでも使えるように抽出したコンポーネントとフック。

## 特徴

✅ **左ハンドルで左に伸ばせる** - 正しい方向のリサイズ  
✅ **右ハンドルで右に伸ばせる** - 直感的な操作  
✅ **マウスボタンを離した時に確定** - 明確な操作タイミング  
✅ **リサイズ中のドラッグ干渉防止** - 操作の混在を防ぐ  
✅ **美しいハンドル表示** - 選択時のみ表示、ホバー効果付き  
✅ **不要なログやゴーストなし** - クリーンな操作感  

## 構成

### 1. ReusableEventBar.tsx
スケジュールアイテムの表示とリサイズハンドルを含むコンポーネント

### 2. useScheduleDragResize.ts
ドラッグ・リサイズのロジックを管理するカスタムフック

## 使用方法

### 基本統合

```tsx
import ReusableEventBar from '../ReusableEventBar/ReusableEventBar';
import { useScheduleDragResize } from '../../hooks/useScheduleDragResize';

const YourScheduleComponent: React.FC = () => {
  // 1. カスタムフックを使用
  const {
    dragData,
    dragGhost,
    resizeData,
    resizeGhost,
    isResizing,
    mousePosition,
    handleScheduleMouseDown,
    handleResizeMouseDown
  } = useScheduleDragResize({
    scaledCellWidth: CELL_WIDTH_PX * (scheduleScale / 100),
    scaledRowHeight: ROW_HEIGHT_PX * (scheduleScale / 100),
    onUpdateSchedule: async (scheduleId, updateData) => {
      await scheduleApi.update(scheduleId, updateData);
    },
    onReloadSchedules: async () => {
      await reloadSchedules();
    }
  });

  // 2. スケジュール描画部分でReusableEventBarを使用
  return (
    <div className="schedule-grid">
      {schedules.map(schedule => {
        const originalStartSlot = getTimeSlot(new Date(schedule.start_datetime));
        
        return (
          <ReusableEventBar
            key={schedule.id}
            schedule={schedule}
            isSelected={selectedSchedule?.id === schedule.id}
            isResizing={isResizing}
            resizeGhost={resizeGhost}
            scaledCellWidth={scaledCellWidth}
            slot={slot} // 現在のセルのスロット番号
            originalStartSlot={originalStartSlot}
            onMouseDown={handleScheduleMouseDown}
            onDoubleClick={(schedule, e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedSchedule(schedule);
              setShowScheduleForm(true);
            }}
            onContextMenu={(schedule, e) => {
              e.preventDefault();
              e.stopPropagation();
              // コンテキストメニュー処理
            }}
            onResizeMouseDown={handleResizeMouseDown}
          />
        );
      })}
    </div>
  );
};
```

### 必要な設定

#### 1. スケジュール選択の無効化
リサイズ中はスケジュール選択を無効化する必要があります：

```tsx
const handleScheduleClick = (schedule: Schedule, e: React.MouseEvent) => {
  // リサイズ中は選択を無効化
  if (isResizing || resizeData) {
    console.log('🚫 リサイズ中のため選択を無効化');
    return;
  }
  
  setSelectedSchedule(schedule);
};
```

#### 2. 必要なユーティリティ関数
以下の関数が必要です：

```tsx
import { 
  getTimeSlot,           // 時刻からスロット番号を取得
  getEndTimeSlot,        // 終了時刻のスロット番号を取得
  createTimeFromSlot,    // スロット番号から時刻を作成
  formatTime             // 時刻をフォーマット
} from '../../utils/dateUtils';

import { 
  lightenColor,          // 色を明るく/暗くする
  toApiColor            // APIで使用する色形式に変換
} from '../../utils/colorUtils';
```

#### 3. CSS設定
リサイズハンドルのスタイルが適用されるように、以下のCSSクラスが必要です：

```css
.schedule-item {
  position: relative;
}

.resize-handle {
  position: absolute;
  cursor: ew-resize;
  user-select: none;
}

.resize-handle:hover {
  background-color: rgba(255, 255, 255, 0.6) !important;
}
```

## 統合チェックリスト

- [ ] `ReusableEventBar`コンポーネントをインポート
- [ ] `useScheduleDragResize`フックをインポート  
- [ ] 必要なユーティリティ関数をインポート
- [ ] フックに必要なパラメータを渡す
- [ ] 既存のスケジュール描画を`ReusableEventBar`に置き換え
- [ ] リサイズ中の他操作を無効化
- [ ] CSS設定を追加
- [ ] 動作テスト（左右リサイズ、ドラッグ、確定タイミング）

## 注意点

1. **スロット計算**: 各ページの時間スロット計算ロジックに合わせる必要があります
2. **スケール対応**: `scaledCellWidth`と`scaledRowHeight`を正しく計算してください  
3. **API呼び出し**: `onUpdateSchedule`と`onReloadSchedules`を適切に実装してください
4. **状態管理**: 既存の`selectedSchedule`状態と連携してください

## トラブルシューティング

### 左ハンドルが右に伸びる
- `leftOffset`の計算を確認
- `resizeGhost.edge === 'start'`の条件分岐を確認

### リサイズが確定されない  
- `handleMouseUp`が呼ばれているか確認
- `onUpdateSchedule`と`onReloadSchedules`の実装を確認

### ハンドルが表示されない
- `isSelected`プロパティが正しく渡されているか確認
- CSS の`opacity`設定を確認
