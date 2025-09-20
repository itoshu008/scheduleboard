import React, { useState, useEffect } from 'react';
import './CurrentTimeLine.css';
import { isCurrentTimeInDate } from '../../utils/dateUtils';

interface CurrentTimeLineProps {
  selectedDate: Date;
  cellHeight: number;
  startHour: number;
  endHour: number;
  cellWidth?: number;
  timeColumnWidth?: number;
  pageType?: 'daily' | 'monthly' | 'all-employees' | 'equipment';
  gridContainerRef?: React.RefObject<HTMLElement>;
  // 新しく追加: 社員/設備のID（日別・全社員・設備ページ用）
  targetId?: number;
}

// 新しいラッパーコンポーネント: 複数のCurrentTimeLineを管理
interface CurrentTimeLineWrapperProps {
  selectedDate: Date;
  cellHeight: number;
  startHour: number;
  endHour: number;
  cellWidth?: number;
  timeColumnWidth?: number;
  pageType?: 'daily' | 'monthly' | 'all-employees' | 'equipment';
  gridContainerRef?: React.RefObject<HTMLElement>;
  // 社員/設備のリスト（日別・全社員・設備ページ用）
  targetIds?: number[];
}

export const CurrentTimeLineWrapper: React.FC<CurrentTimeLineWrapperProps> = ({
  selectedDate,
  cellHeight,
  startHour,
  endHour,
  cellWidth,
  timeColumnWidth,
  pageType = 'daily',
  gridContainerRef,
  targetIds = []
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [domReady, setDomReady] = useState(false);

  useEffect(() => {
    const updateCurrentTime = () => {
      setCurrentTime(new Date());
    };

    updateCurrentTime();
    const interval = setInterval(updateCurrentTime, 10000);

    return () => clearInterval(interval);
  }, []);

  // 設備データが読み込まれた後にDOMが完全にレンダリングされるまで待つ
  useEffect(() => {
    if (pageType === 'equipment' && targetIds.length > 0) {
      const checkDomReady = () => {
        if (gridContainerRef?.current) {
          const equipmentRows = gridContainerRef.current.querySelectorAll('tr[data-equipment-id]');
          if (equipmentRows.length === targetIds.length) {
            setDomReady(true);
          } else {
            setTimeout(checkDomReady, 100); // 100ms後に再チェック
          }
        }
      };
      
      checkDomReady();
    } else {
      setDomReady(true);
    }
  }, [pageType, targetIds, gridContainerRef]);

  // 今日かどうかチェック（デバッグ用に常に表示）
  const isToday = isCurrentTimeInDate(selectedDate);
  const forceShow = true; // 開発中は常に表示

  if (!isToday && !forceShow) {
    return null;
  }

  // 現在時刻の取得
  const now = currentTime;
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();

  // 時間スロットの計算（96スロット = 24時間 × 4）
  const timeSlot = currentHour * 4 + Math.floor(currentMinutes / 15);
  
  // 位置の計算（全社員スケジュール用）
  const employeeColumnWidth = 150; // 社員列の幅
  const slotWidth = 20; // 各スロットの幅（AllEmployeesScheduleも20px）
  const minutesInSlot = currentMinutes % 15; // 15分以内の分数
  const subSlotOffset = (minutesInSlot / 15) * slotWidth; // 15分以内のオフセット
  
  // 最終的な左位置
  const leftPosition = employeeColumnWidth + (timeSlot * slotWidth) + subSlotOffset;



  // 月別スケジュール: 単一の線
  if (pageType === 'monthly') {
    return (
      <CurrentTimeLine
        selectedDate={selectedDate}
        cellHeight={cellHeight}
        startHour={startHour}
        endHour={endHour}
        cellWidth={cellWidth}
        timeColumnWidth={timeColumnWidth}
        pageType={pageType}
        gridContainerRef={gridContainerRef}
      />
    );
  }

  // 設備スケジュール: 各設備ごとに線を表示（per equipment）
  if (pageType === 'equipment') {
    // DOMが準備完了するまで待つ
    if (!domReady) {
      return null;
    }

    return (
      <>

        {/* 各設備の行に現在時刻の赤い線を表示 */}
        {targetIds.map((targetId, index) => {
          // 設備の行の位置を取得
          let equipmentRowTop = 40 + (index * 40); // テーブルヘッダー（40px）+ 設備行の高さ
          let equipmentRowHeight = 40; // デフォルト高さ

          // 実際のDOM要素から位置を取得
          if (gridContainerRef?.current) {
            const equipmentRow = gridContainerRef.current.querySelector(
              `tr[data-equipment-id="${targetId}"]`
            ) as HTMLElement;

            if (equipmentRow) {
              const containerRect = gridContainerRef.current.getBoundingClientRect();
              const rowRect = equipmentRow.getBoundingClientRect();
              
              // スクロール位置を考慮した位置計算
              let calculatedRowTop = rowRect.top - containerRect.top + gridContainerRef.current.scrollTop;
              
              // 負の位置の場合、デフォルト位置を使用
              if (calculatedRowTop < 0) {
                calculatedRowTop = 40 + (index * 40); // テーブルヘッダー分を考慮
              }
              
              equipmentRowTop = calculatedRowTop;
              equipmentRowHeight = rowRect.height || 40;
            }
          }

          return (
            <div
              key={`equipment-timeline-${targetId}`}
              style={{
                position: 'absolute',
                left: `${leftPosition}px`,
                top: `${equipmentRowTop}px`,
                width: '2px',
                height: `${equipmentRowHeight}px`,
                backgroundColor: '#ff0000',
                zIndex: 1000,
                pointerEvents: 'none',
                boxShadow: '0 0 4px rgba(255, 0, 0, 0.6)',
                borderRadius: '1px'
              }}
            />
          );
        })}
      </>
    );
  }

  // 日別・全社員・設備スケジュール: 各社員/設備ごとに線を表示（per user/equipment）
  const isEquipment = (pageType as string) === 'equipment';
  
  // 社員/設備データが空の場合は何も表示しない
  if (targetIds.length === 0) {
    return null;
  }
  
  return (
    <>
      {/* 各社員/設備の行に現在時刻の赤い線を表示 */}
      {targetIds.map((targetId, index) => {
        // 行の位置を取得（日別と設備で統一）
        let rowTop = 156 + (index * 40) - 114; // 全社員と同じ位置計算
        
        let rowHeight = 40; // デフォルト高さ

        // 実際のDOM要素から位置を取得
        if (gridContainerRef?.current) {
          const selector = isEquipment 
            ? `tr[data-equipment-id="${targetId}"]`
            : `tr[data-employee-id="${targetId}"]`;
          
          const row = gridContainerRef.current.querySelector(selector) as HTMLElement;

          if (row) {
            const containerRect = gridContainerRef.current.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            
            // 位置計算を修正：コンテナのスクロール位置を考慮
            rowTop = rowRect.top - containerRect.top + gridContainerRef.current.scrollTop;
            rowHeight = rowRect.height || 40;
            
            // 負の値になった場合は、デフォルト位置を使用（全社員と同じ位置）
            if (rowTop < 0) {
              rowTop = 156 + (index * 40) - 114; // 全社員と同じ位置
            } else {
              // 正の値の場合も8px上げる（より上に移動）
              rowTop -= 8;
            }
          }
        }

        return (
          <div
            key={`${pageType}-timeline-${targetId}`}
            style={{
              position: 'absolute',
              left: `${leftPosition}px`,
              top: `${rowTop}px`,
              width: '2px',
              height: pageType === 'daily' ? `${rowHeight - 1}px` : `${rowHeight - 1}px`,
              backgroundColor: '#ff0000',
              zIndex: 1000,
              pointerEvents: 'none',
              boxShadow: '0 0 4px rgba(255, 0, 0, 0.6)',
              borderRadius: '1px'
            }}
          />
        );
      })}
    </>
  );
};

const CurrentTimeLine: React.FC<CurrentTimeLineProps> = ({
  selectedDate,
  cellHeight,
  startHour,
  endHour,
  cellWidth = 20,
  timeColumnWidth = 120,
  pageType = 'daily',
  gridContainerRef,
  targetId
}) => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    const updateCurrentTime = () => {
      // システムの現在時刻を取得
      const now = new Date();
      const isToday = isCurrentTimeInDate(selectedDate);
      
      setCurrentTime(now);
      setIsVisible(isToday);
      
      console.log(`CurrentTimeLine Update - ${pageType}:`, {
        currentTime: now.toLocaleTimeString(),
        isToday,
        targetId,
        hour: now.getHours(),
        minute: now.getMinutes()
      });
    };

    // 初期更新
    updateCurrentTime();

    // 10秒ごとに更新（現在時刻の赤い線を動かすため）
    const interval = setInterval(updateCurrentTime, 10000);

    // スクロールイベントリスナーを追加（position: fixed 使用時の位置更新）
    const handleScroll = () => {
      // 強制的に再レンダリングを促す
      setCurrentTime(new Date());
    };

    window.addEventListener('scroll', handleScroll);
    const currentGridContainer = gridContainerRef?.current;
    if (currentGridContainer) {
      currentGridContainer.addEventListener('scroll', handleScroll);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('scroll', handleScroll);
      if (currentGridContainer) {
        currentGridContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [selectedDate, targetId, pageType, gridContainerRef]);

  // 常に表示する
  const forceShow = true;
  
  // デバッグ情報を追加
  console.log('CurrentTimeLine Render Debug:', {
    pageType,
    isVisible,
    forceShow,
    currentTime: currentTime.toLocaleTimeString(),
    selectedDate: selectedDate.toLocaleDateString(),
    willRender: isVisible || forceShow
  });
  
  if (!isVisible && !forceShow) {
    console.log('CurrentTimeLine: Not rendering due to visibility check');
    return null;
  }

  // 現在時刻から時間と分を取得（ローカル時間を使用）
  const currentHour = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  
  // 月別スケジュールでは24時間表示、その他は表示時間範囲内のみ
  const isInTimeRange = pageType === 'monthly' || (currentHour >= startHour && currentHour < endHour);
  
  // 時間範囲チェックを緩和
  const forceTimeRange = true;
  
  // デバッグ情報を追加
  console.log('CurrentTimeLine Time Range Debug:', {
    pageType,
    currentHour,
    currentMinutes,
    startHour,
    endHour,
    isInTimeRange,
    forceTimeRange,
    willRender: isInTimeRange || forceTimeRange
  });
  
  if (!isInTimeRange && !forceTimeRange) {
    console.log('CurrentTimeLine: Not rendering due to time range check');
    return null;
  }
  
  // 各ページタイプに応じた位置計算
  const getPositionForPageType = () => {
    let cellPosition: number;
    
    if (pageType === 'monthly') {
      // 月別スケジュール: 0:00から始まるスロット（0-95）
      cellPosition = (currentHour * 4) + Math.floor(currentMinutes / 15);
    } else {
      // その他: 96スロット構造に合わせる
      cellPosition = (currentHour * 4) + Math.floor(currentMinutes / 15);
    }
    
    // デバッグログは削除（パフォーマンス改善）
    
    // ページタイプに応じて実際のセル幅を取得
    let actualCellWidth = cellWidth;
    switch (pageType) {
      case 'monthly':
        actualCellWidth = 20; // 月別は20px（CSS設定に合わせる）
        break;
      case 'daily':
      case 'all-employees':
      case 'equipment':
        actualCellWidth = 20; // その他も20px（96スロット構造に合わせる）
        break;
      default:
        actualCellWidth = cellWidth;
    }
    
    // 実際のグリッドから位置を取得
    let actualLeft = timeColumnWidth + cellPosition * actualCellWidth; // デフォルト計算
    
    // 15分セル内での細かい位置調整（1分ごとの動きを実現）
    const minuteInSlot = currentMinutes % 15;
    const minuteOffset = (minuteInSlot / 15) * actualCellWidth;
    actualLeft += minuteOffset;
    
    if (gridContainerRef?.current) {
      // ページタイプに応じてセルセレクタを使い分け
      const cellSelector = pageType === 'monthly' ? '.schedule-cell-15min' : '.time-cell-15min';
      const cells = gridContainerRef.current.querySelectorAll(cellSelector);
      if (cells.length > 0) {
        const targetSlot = Math.floor(cellPosition);
        const targetCell = Array.from(cells ?? []).find(cell => {
          const slot = parseInt(cell.getAttribute('data-slot') || '0');
          return slot === targetSlot;
        }) as HTMLElement;
        
        if (targetCell) {
          // 完全固定位置で表示（スクロールについてこない）
          const cellLeft = targetCell.getAttribute('data-cell-left');
          if (cellLeft) {
            actualLeft = parseInt(cellLeft);
          } else {
            // フォールバック: 固定計算値
            actualLeft = timeColumnWidth + cellPosition * actualCellWidth;
          }
          
          // 15分セル内での細かい位置調整（1分ごとの動きを実現）
          const minuteInSlot = currentMinutes % 15;
          const minuteOffset = (minuteInSlot / 15) * actualCellWidth;
          actualLeft += minuteOffset;
          
          console.log(`Cell Position Debug (${pageType}):`, {
            targetSlot,
            actualLeft,
            minuteInSlot,
            minuteOffset,
            finalLeft: actualLeft,
            currentTime: currentTime.toLocaleTimeString(),
            cellFound: !!targetCell
          });
        }
      }
    }
    
    console.log('Position Calculation Debug:', {
      cellPosition,
      actualCellWidth,
      timeColumnWidth,
      actualLeft,
      targetSlot: Math.floor(cellPosition)
    });
    
    // グリッドコンテナの高さを取得（動的高さ対応）
    let gridHeight = gridContainerRef?.current ? 
      gridContainerRef.current.scrollHeight : 
      600;
    
    // 最大高さを制限（画面の高さを超えないように）
    if (typeof gridHeight === 'number') {
      const maxHeight = window.innerHeight - 200; // ヘッダーやマージンを考慮
      gridHeight = Math.min(gridHeight, maxHeight);
    }
    
    const baseLeft = actualLeft;
    
    switch (pageType) {
      case 'monthly':
        // 月別: 完全固定位置で表示（スクロールについてこない）
        {
          // 月別スケジュールの固定位置
          const fixedTop = 120;        // ヘッダー分の固定位置
          const fixedHeight = 40;      // 1行分の固定高さ
          
          return {
            left: baseLeft,
            top: fixedTop,
            height: fixedHeight
          };
        }
      
      case 'daily':
        // 日別: 特定の社員の行に表示（per user）
        {
          let headerHeight = 40; // デフォルト
          if (gridContainerRef?.current) {
            const firstHeader = gridContainerRef.current.querySelector('thead') as HTMLElement | null;
            if (firstHeader) {
              headerHeight = firstHeader.offsetHeight || headerHeight;
            }
          }
          
          // 特定の社員の行の位置を計算
          let employeeRowTop = headerHeight;
          let employeeRowHeight = cellHeight;
          if (targetId && gridContainerRef?.current) {
            const employeeRow = gridContainerRef.current.querySelector(`tr[data-employee-id="${targetId}"]`) as HTMLElement | null;
            console.log('Daily Schedule Debug:', { 
              targetId, 
              employeeRow, 
              gridContainerRef: gridContainerRef.current,
              allRows: gridContainerRef.current.querySelectorAll('tbody tr').length,
              allEmployeeRows: gridContainerRef.current.querySelectorAll('tr[data-employee-id]').length
            });
            
            if (employeeRow) {
              // より確実な位置計算方法
              const tbody = gridContainerRef.current.querySelector('tbody');
              if (tbody) {
                const allRows = Array.from(tbody.querySelectorAll('tr') ?? []);
                const rowIndex = allRows.findIndex(row => row.getAttribute('data-employee-id') === targetId.toString());
                
                if (rowIndex !== -1) {
                  // 行のインデックスを使用して位置を計算
                  // ヘッダーの高さを加算して、グリッド内の正しい位置に配置
                  employeeRowTop = headerHeight + (rowIndex * cellHeight);
                  employeeRowHeight = cellHeight;
                  
                  console.log('Daily Schedule Calculated Position:', { 
                    rowIndex, 
                    employeeRowTop, 
                    employeeRowHeight,
                    headerHeight,
                    cellHeight
                  });
                }
              }
            }
          }
          
          // 時間線がヘッダーの上に表示されないように、最小値を設定
          const minTop = headerHeight;
          const finalTop = Math.max(employeeRowTop, minTop);
          
          return {
            left: baseLeft,
            top: finalTop,
            height: employeeRowHeight - 1 // 1px短縮して他のページと統一
          };
        }
      
      case 'all-employees':
        // 全社員: 特定の社員の行に表示（per user）
        {
          let headerHeight = 40; // デフォルト
          if (gridContainerRef?.current) {
            const firstHeader = gridContainerRef.current.querySelector('thead') as HTMLElement | null;
            if (firstHeader) {
              headerHeight = firstHeader.offsetHeight || headerHeight;
            }
          }
          
          // 特定の社員の行の位置を計算
          let employeeRowTop = headerHeight;
          let employeeRowHeight = cellHeight;
          if (targetId && gridContainerRef?.current) {
            const employeeRow = gridContainerRef.current.querySelector(`tr[data-employee-id="${targetId}"]`) as HTMLElement | null;
            console.log('All Employees Schedule Debug:', { 
              targetId, 
              employeeRow, 
              gridContainerRef: gridContainerRef.current,
              allRows: gridContainerRef.current.querySelectorAll('tbody tr').length,
              allEmployeeRows: gridContainerRef.current.querySelectorAll('tr[data-employee-id]').length
            });
            
            if (employeeRow) {
              // より確実な位置計算方法
              const tbody = gridContainerRef.current.querySelector('tbody');
              if (tbody) {
                const allRows = Array.from(tbody.querySelectorAll('tr') ?? []);
                const rowIndex = allRows.findIndex(row => row.getAttribute('data-employee-id') === targetId.toString());
                
                if (rowIndex !== -1) {
                  // 行のインデックスを使用して位置を計算
                  employeeRowTop = headerHeight + (rowIndex * cellHeight);
                  employeeRowHeight = cellHeight;
                  
                  console.log('All Employees Schedule Calculated Position:', { 
                    rowIndex, 
                    employeeRowTop, 
                    employeeRowHeight,
                    headerHeight,
                    cellHeight
                  });
                }
              }
            }
          }
          
          return {
            left: 150 + baseLeft, // 社員列150px + 時間列120px + 時間軸の位置
            top: employeeRowTop,
            height: employeeRowHeight // 実際の行の高さを使用
          };
        }
      
      case 'equipment':
        // 設備: その日の時間を表す単一の線（time of that day）
        {
          let headerHeight = 40; // デフォルト
          if (gridContainerRef?.current) {
            const firstHeader = gridContainerRef.current.querySelector('thead') as HTMLElement | null;
            if (firstHeader) {
              headerHeight = firstHeader.offsetHeight || headerHeight;
            }
          }
          
          // 設備の行の高さを計算
          let equipmentRowHeight = cellHeight;
          if (gridContainerRef?.current) {
            const equipmentRows = gridContainerRef.current.querySelectorAll('tbody tr');
            if (equipmentRows.length > 0) {
              equipmentRowHeight = (equipmentRows[0] as HTMLElement).offsetHeight;
            }
          }
          
          return {
            left: 150 + baseLeft, // 設備列150px + 時間列120px + 時間軸の位置
            top: headerHeight,
            height: Math.max(gridHeight - headerHeight, equipmentRowHeight) // 設備行の高さを考慮
          };
        }
      
      default:
        return {
          left: baseLeft,
          top: 0,
          height: gridHeight
        };
    }
  };

  const position = getPositionForPageType();
  
  console.log(`CurrentTimeLine Final Position (${pageType}):`, {
    targetId,
    currentTime: currentTime.toLocaleTimeString(),
    position,
    finalStyle: {
      left: typeof position.left === 'number' ? `${position.left}px` : position.left,
      top: typeof position.top === 'number' ? `${position.top}px` : position.top,
      height: typeof position.height === 'number' ? `${position.height}px` : position.height
    },
    windowScroll: {
      x: window.pageXOffset,
      y: window.pageYOffset
    }
  });

  // 最終的なレンダリング情報をログ
  console.log('CurrentTimeLine Final Render:', {
    pageType,
    position,
    finalStyle: {
      left: typeof position.left === 'number' ? `${position.left}px` : position.left,
      top: typeof position.top === 'number' ? `${position.top}px` : position.top,
      height: typeof position.height === 'number' ? `${position.height}px` : position.height
    }
  });

  return (
    <div 
      className="current-time-line"
      style={{ 
        left: typeof position.left === 'number' ? `${position.left}px` : position.left,
        top: typeof position.top === 'number' ? `${position.top}px` : position.top,
        height: typeof position.height === 'number' ? `${position.height}px` : position.height
      }}
    />
  );
};

export default CurrentTimeLine;
