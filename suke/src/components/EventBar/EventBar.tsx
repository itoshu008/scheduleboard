import React, { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { Schedule } from '../../types';
import { safeHexColor } from '../../utils/color';
import './EventBarGhost.css';

type DragMode = 'none' | 'move' | 'resize-left' | 'resize-right';

interface EventBarProps {
  schedule: Schedule;

  // Position/size in px
  startPx: number;
  widthPx: number;
  height: number;
  topPx?: number;
  laneIndex?: number;
  laneHeight?: number;

  // Limits
  maxTimelinePx?: number;
  maxLaneIndex?: number;

  // UI
  fontSize?: number;
  isSelected?: boolean;
  showGhost?: boolean;              // ゴースト表示の有効化
  ghostOpacity?: number;            // ゴーストの透明度
  ghostMessage?: string;            // ゴーストに表示するメッセージ
  ghostSubMessage?: string;         // ゴーストのサブメッセージ

  // Snapping & container metrics
  snapSizeX?: number;                 // default 20
  containerSelector?: string;         // default '.schedule-table-container'
  headerHeightPx?: number;            // default 32
  dateColumnWidthPx?: number;         // default 120

  // Callbacks
  onResize?: (id: number, newWidthPx: number, newStartPx: number) => void;
  onResizeCommit?: (id: number, newWidthPx: number, newStartPx: number) => void;
  onMove?: (id: number, newStartPx: number, newLaneIndex: number) => void;
  onMoveCommit?: (id: number, newStartPx: number, newLaneIndex: number) => void;
  onClick?: (e: React.MouseEvent, schedule: Schedule) => void;
  onDoubleClick?: (e: React.MouseEvent, schedule: Schedule) => void;
  onContextMenu?: (e: React.MouseEvent, schedule: Schedule) => void;

  // External overrides to bypass internal drag logic
  onBarMouseDownOverride?: (e: React.MouseEvent, schedule: Schedule) => void;
  onResizeLeftMouseDownOverride?: (e: React.MouseEvent, schedule: Schedule) => void;
  onResizeRightMouseDownOverride?: (e: React.MouseEvent, schedule: Schedule) => void;

  debug?: boolean;
}

interface DragState {
  mode: DragMode;
  startX: number;
  startY: number;
  initialStartPx: number;
  initialWidthPx: number;
  initialLaneIndex: number;
}

const EventBar: React.FC<EventBarProps> = ({
  schedule,
  startPx,
  widthPx,
  height,
  topPx = 0,
  laneIndex = 0,
  laneHeight = 40,
  maxTimelinePx = 2000,
  maxLaneIndex = 31,

  fontSize = 12,
  isSelected = false,
  showGhost = false,
  ghostOpacity = 0.8,
  ghostMessage,
  ghostSubMessage,

  snapSizeX = 20,
  containerSelector = '.schedule-table-container',
  headerHeightPx = 32,
  dateColumnWidthPx = 120,

  onResize,
  onResizeCommit,
  onMove,
  onMoveCommit,
  onClick,
  onDoubleClick,
  onContextMenu,

  onBarMouseDownOverride,
  onResizeLeftMouseDownOverride,
  onResizeRightMouseDownOverride,

  debug = false,
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [currentStartPx, setCurrentStartPx] = useState(startPx);
  const [currentWidthPx, setCurrentWidthPx] = useState(widthPx);
  const [currentLaneIndex, setCurrentLaneIndex] = useState(laneIndex);
  const barRef = useRef<HTMLDivElement>(null);

  // Tooltip content: 設備・時間・登録者・用件
  const tooltipTitle = useMemo(() => {
    try {
      const startDate = new Date(schedule.start_datetime);
      const endDate = new Date(schedule.end_datetime);
      const startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
      const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;

      const equipmentLabel = (schedule as any).equipment_name || (schedule as any).equipmentId || (schedule as any).equipment_id || '-';
      // 担当者は必ず名前を優先（ID表示は避ける）
      const registrantLabel = (schedule as any).employee_name || '-';
      const purposeLabel = (schedule as any).title || (schedule as any).purpose || '無題';

      return `設備: ${equipmentLabel}\n時間: ${startTime} - ${endTime}\n登録者: ${registrantLabel}\n用件: ${purposeLabel}`;
    } catch {
      return undefined;
    }
  }, [schedule]);

  // Props変更時の同期（ドラッグ中でない場合のみ）
  useEffect(() => {
    if (!dragState) {
      setCurrentStartPx(startPx);
      setCurrentWidthPx(widthPx);
      setCurrentLaneIndex(laneIndex);
      // デバッグ出力無効化
      // if (debug) { console.log('🔄 EventBar props sync:', ...); }
    }
  }, [startPx, widthPx, laneIndex, dragState, schedule.id, debug]);

  // より精密なスナップ処理（15分単位）
  const snap = (v: number) => {
    const slot = Math.round(v / snapSizeX);
    return slot * snapSizeX;
  };
  
  // より滑らかなクランプ処理
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  
  // 時間スロット基準のスナップ（より正確・安定）
  const snapToTimeSlot = (pixelValue: number) => {
    // より細かい精度でスナップ計算
    const exactSlot = pixelValue / snapSizeX;
    const slot = Math.round(exactSlot);
    const clampedSlot = Math.max(0, Math.min(95, slot)); // 0:00-23:45の範囲
    const snappedValue = clampedSlot * snapSizeX;
    
    // デバッグ出力無効化
    // if (debug) { console.log('🎯 snapToTimeSlot:', ...); }
    
    return snappedValue;
  };

  const getContainer = (): HTMLElement | null => {
    const local = barRef.current?.closest(containerSelector) as HTMLElement | null;
    const fallback = document.querySelector(containerSelector) as HTMLElement | null;
    const result = local ?? fallback;
    
    // デバッグ出力無効化
    // if (debug) { console.log('EventBar getContainer:', ...); }
    
    return result;
  };

  // Convert client coordinates => cell coordinates (accounts for scroll + header + date column)
  const getCellRelative = (clientX: number, clientY: number) => {
    const container = getContainer();
    if (!container) return { x: 0, y: 0, container: null };

    const rect = container.getBoundingClientRect();
    
    // より正確な座標計算（小数点精度を保持）
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;
    
    const x = (clientX - rect.left - dateColumnWidthPx + scrollLeft);
    const y = (clientY - rect.top - headerHeightPx + scrollTop);
    
    // デバッグ出力無効化
    // if (debug) { console.log('🎯 getCellRelative PRECISE:', ...); }
    
    return { x, y, container };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, mode: DragMode) => {
    // コールバックが未定義の場合はドラッグを無効化
    if (mode === 'move' && (!onMove || !onMoveCommit)) {
      return; // 移動コールバックが未定義の場合は何もしない
    }
    if ((mode === 'resize-left' || mode === 'resize-right') && (!onResize || !onResizeCommit)) {
      return; // リサイズコールバックが未定義の場合は何もしない
    }
    
    e.preventDefault();
    e.stopPropagation();

    setDragState({
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initialStartPx: currentStartPx,
      initialWidthPx: currentWidthPx,
      initialLaneIndex: currentLaneIndex,
    });

    // より正確なカーソル制御
    document.body.style.userSelect = 'none';
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'col-resize';
    // pointerEventsの設定を削除（スクロール機能を阻害しないため）

    // デバッグ出力無効化
    // if (debug) { console.log('DRAG_START_PRECISE', ...); }
  }, [currentStartPx, currentWidthPx, currentLaneIndex, debug, schedule.id, onMove, onMoveCommit, onResize, onResizeCommit]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // 超高精度マウス座標処理（小数点精度を保持）
    const { x, y } = getCellRelative(e.clientX, e.clientY);
    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    // デバッグ出力無効化
    // if (debug) { console.log('🎯 handleMouseMove ULTRA-PRECISE:', ...); }

    if (dragState.mode === 'move') {
      // 超高精度移動計算（1px単位の精密制御）
      const rawNewStartPx = dragState.initialStartPx + deltaX;
      
      // より精密なスナップ処理（閾値を小さくして精度向上）
      const exactSlot = rawNewStartPx / snapSizeX;
      const snapThreshold = 0.3; // スナップ閾値を小さく（より精密）
      const fractionalPart = exactSlot - Math.floor(exactSlot);
      let snappedX: number;
      
      if (fractionalPart < snapThreshold) {
        snappedX = Math.floor(exactSlot) * snapSizeX;
      } else if (fractionalPart > (1 - snapThreshold)) {
        snappedX = Math.ceil(exactSlot) * snapSizeX;
      } else {
        snappedX = rawNewStartPx; // スナップしない（自由移動）
      }
      
      const newStartPx = clamp(snappedX, 0, maxTimelinePx - currentWidthPx);
      
      // 垂直移動も高精度化
      const exactLane = (dragState.initialLaneIndex * laneHeight + deltaY) / laneHeight;
      const newLane = clamp(Math.round(exactLane), 0, maxLaneIndex);
      
      // デバッグ出力無効化
      // if (debug) { console.log('🎯 ultra-precise move:', ...); }
      
      // リアルタイム更新（遅延なし）
      setCurrentStartPx(newStartPx);
      setCurrentLaneIndex(newLane);
      onMove?.(schedule.id, newStartPx, newLane);
      return;
    }

    if (dragState.mode === 'resize-left') {
      // 超高精度左端リサイズ（縦方向移動は無視、行変更なし）
      const fixedRightPx = dragState.initialStartPx + dragState.initialWidthPx;
      const rawNewLeft = dragState.initialStartPx + deltaX;
      
      // 高精度スナップ処理
      const exactSlot = rawNewLeft / snapSizeX;
      const snapThreshold = 0.2; // リサイズ時はより精密
      const fractionalPart = exactSlot - Math.floor(exactSlot);
      let snappedLeft: number;
      
      if (fractionalPart < snapThreshold) {
        snappedLeft = Math.floor(exactSlot) * snapSizeX;
      } else if (fractionalPart > (1 - snapThreshold)) {
        snappedLeft = Math.ceil(exactSlot) * snapSizeX;
      } else {
        snappedLeft = rawNewLeft; // 自由リサイズ
      }
      
      const minLeft = 0;
      const maxLeft = fixedRightPx - (snapSizeX * 0.5); // 最小幅を緩和
      const newLeft = clamp(snappedLeft, minLeft, maxLeft);
      const newWidth = fixedRightPx - newLeft;

      // デバッグ出力無効化
      // if (debug) { console.log('🎯 ultra-precise resize-left (行変更なし):', ...); }

      // 最小幅チェック（行は変更しない）
      if (newWidth >= (snapSizeX * 0.5)) { // 最小幅を緩和
        setCurrentStartPx(newLeft);
        setCurrentWidthPx(newWidth);
        onResize?.(schedule.id, newWidth, newLeft);
      }
      return;
    }

    if (dragState.mode === 'resize-right') {
      // 超高精度右端リサイズ（縦方向移動は無視、行変更なし）
      const fixedLeftPx = dragState.initialStartPx;
      const rawNewRight = fixedLeftPx + dragState.initialWidthPx + deltaX;
      
      // 高精度スナップ処理
      const exactSlot = rawNewRight / snapSizeX;
      const snapThreshold = 0.2; // リサイズ時はより精密
      const fractionalPart = exactSlot - Math.floor(exactSlot);
      let snappedRight: number;
      
      if (fractionalPart < snapThreshold) {
        snappedRight = Math.floor(exactSlot) * snapSizeX;
      } else if (fractionalPart > (1 - snapThreshold)) {
        snappedRight = Math.ceil(exactSlot) * snapSizeX;
      } else {
        snappedRight = rawNewRight; // 自由リサイズ
      }
      
      const minRight = fixedLeftPx + (snapSizeX * 0.5); // 最小幅を緩和
      const maxRight = maxTimelinePx;
      const clampedRight = clamp(snappedRight, minRight, maxRight);
      const newWidth = clampedRight - fixedLeftPx;

      // デバッグ出力無効化
      // if (debug) { console.log('🎯 ultra-precise resize-right (行変更なし):', ...); }

      // 最小幅チェック（行は変更しない）
      if (newWidth >= (snapSizeX * 0.5)) { // 最小幅を緩和
        setCurrentWidthPx(newWidth);
        onResize?.(schedule.id, newWidth, fixedLeftPx);
      }
      return;
    }
  }, [
    dragState, laneHeight, maxLaneIndex, maxTimelinePx, currentWidthPx,
    snapSizeX, onMove, onResize, schedule.id, debug
  ]);

  const handleMouseUp = useCallback(() => {
    if (!dragState) return;

    // 最終確定時により正確な値を使用
    if (dragState.mode === 'move') {
      onMoveCommit?.(schedule.id, currentStartPx, currentLaneIndex);
    } else if (dragState.mode === 'resize-left' || dragState.mode === 'resize-right') {
      // リサイズ時は行変更を防止（初期行インデックスを保持）
      const finalLaneIndex = dragState.initialLaneIndex; // 初期行を強制保持
      onResizeCommit?.(schedule.id, currentWidthPx, currentStartPx);
      
      // デバッグ出力無効化
      // if (debug) { console.log('🔧 EventBar リサイズ確定（行変更なし）:', ...); }
    }

    // 状態をクリーンアップ
    setDragState(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // pointerEventsの復元を削除（スクロール機能を阻害しないため）

    // デバッグ出力無効化
    // if (debug) { console.log('DRAG_END_PRECISE', ...); }
  }, [dragState, currentStartPx, currentWidthPx, currentLaneIndex, onMoveCommit, onResizeCommit, schedule.id, debug]);

  useEffect(() => {
    if (!dragState) return;
    const move = (e: MouseEvent) => handleMouseMove(e);
    const up = () => handleMouseUp();
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [dragState, handleMouseMove, handleMouseUp]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    console.log('🎯 EventBar handleClick called:', { 
      scheduleId: schedule.id, 
      clientX: e.clientX, 
      clientY: e.clientY,
      onClick: !!onClick 
    });
    
    e.stopPropagation();
    // 後方互換性のためのシム
    try {
      onClick?.(e, schedule);
    } catch (error) {
      // 古いシグネチャを試す
      (onClick as any)?.(schedule);
    }
  }, [onClick, schedule]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 後方互換性のためのシム
    try {
      onDoubleClick?.(e, schedule);
    } catch (error) {
      // 古いシグネチャを試す
      (onDoubleClick as any)?.(schedule);
    }
  }, [onDoubleClick, schedule]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 後方互換性のためのシム
    try {
      onContextMenu?.(e, schedule);
    } catch (error) {
      // 古いシグネチャを試す
      (onContextMenu as any)?.(schedule, e);
    }
  }, [onContextMenu, schedule]);

  // topPxは既に正確な位置を含んでいるので、laneIndexの追加計算は不要
  const calculatedTop = topPx ?? 0;
  
  // デバッグ出力を無効化（シンプル化）
  // if (debug) { ... }
  
  const barStyle: React.CSSProperties = useMemo(() => {
    // 統一されたイベントバースタイル
    const baseColor = safeHexColor(schedule.color || '#3498db');

    return {
      position: 'absolute',
      left: `${currentStartPx}px`,
      top: `${calculatedTop}px`,
      width: `${currentWidthPx}px`,
      height: `${height}px`,
      // 統一されたグラデーション背景
      background: showGhost 
        ? `${baseColor}80` // ゴースト時は半透明
        : `linear-gradient(180deg, ${lightenColor(baseColor, 0.15)} 0%, ${baseColor} 100%)`,
      border: showGhost 
        ? '2px dashed #333' // ゴースト時は点線
        : `1px solid ${lightenColor(baseColor, -0.10)}`, // 通常時は濃い色の境界線
      borderRadius: 4,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontSize: `${fontSize}px`,
      fontWeight: 700,
      textAlign: 'center',
      overflow: 'hidden',
      userSelect: 'none',
      pointerEvents: showGhost ? 'none' : 'auto',
      cursor: 'pointer',
      // スケジュールコンテナ直上に配置（モーダル/タブより下）
      zIndex: 10,
      // シンプルなシャドウ
      boxShadow: showGhost ? 'none' : '0 1px 3px rgba(0,0,0,0.2)',
      opacity: showGhost ? 0.7 : 1,
    };
  }, [currentStartPx, calculatedTop, currentWidthPx, height, schedule.color, showGhost, fontSize]);

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    width: 12, // シンプルなサイズ
    height: '100%',
    cursor: 'col-resize',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.6)',
    borderRadius: 2,
    opacity: isSelected ? 1 : 0,
    zIndex: 15,
    transition: 'opacity 0.2s ease',
  };

  return (
    <div
      ref={barRef}
      className={`${showGhost ? 'event-bar event-bar-ghost' : 'event-bar'} schedule-item ${isSelected ? 'selected' : ''}`}
      style={{
        ...barStyle
      }}
      title={tooltipTitle}
      onMouseDown={(e) => {
        if (onBarMouseDownOverride) {
          onBarMouseDownOverride(e, schedule);
          return;
        }
        // 移動コールバックが未定義の場合はドラッグを無効化
        if (!onMove || !onMoveCommit) {
          return;
        }
        handleMouseDown(e, 'move');
      }}
      onClick={(e) => {
        handleClick(e);
      }}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable={false}
    >
      <div
        className={`${showGhost ? 'ghost-handle' : ''} resize-handle`}
        style={{ ...handleStyle, left: -8 }}
        onMouseDown={(e) => {
          if (onResizeLeftMouseDownOverride) {
            onResizeLeftMouseDownOverride(e, schedule);
            return;
          }
          // リサイズコールバックが未定義の場合はリサイズを無効化
          if (!onResize || !onResizeCommit) {
            return;
          }
          e.stopPropagation();
          handleMouseDown(e, 'resize-left');
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
      <div
        style={{
          padding: showGhost ? '4px 8px' : '2px 8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: showGhost ? 'normal' : 'nowrap',
          pointerEvents: 'none',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: showGhost ? '2px' : '0',
        }}
      >
        {showGhost ? (
          <>
            <div style={{ 
              fontSize: `${fontSize}px`, 
              fontWeight: 700,
              color: 'white',
              lineHeight: '1.2',
              textAlign: 'center'
            }}>
              {schedule.title || '無題'}
            </div>
            {ghostSubMessage && (
              <div style={{ 
                fontSize: `${Math.max(fontSize - 1, 8)}px`, 
                fontWeight: 600,
                color: 'white',
                lineHeight: '1.1',
                textAlign: 'center',
                marginTop: '2px'
              }}>
                {ghostSubMessage}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <div style={{ 
              fontSize: `${Math.max(fontSize, 10)}px`, 
              fontWeight: 700,
              color: 'white',
              textShadow: '0 1px 2px rgba(0,0,0,0.4)',
              textAlign: 'center',
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              width: '100%',
              marginBottom: '2px'
            }}>
              {schedule.title || '無題'}
            </div>
            <div style={{ 
              fontSize: `${Math.max(fontSize - 2, 9)}px`, 
              fontWeight: 600,
              color: 'rgba(255,255,255,0.95)',
              textShadow: '0 1px 2px rgba(0,0,0,0.35)',
              lineHeight: '1.1',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              width: '100%'
            }}>
              {(() => {
                const startDate = new Date(schedule.start_datetime);
                const endDate = new Date(schedule.end_datetime);
                const startTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;
                const endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
                return `${startTime} - ${endTime}`;
              })()}
            </div>
          </div>
        )}
      </div>
      <div
        className={`${showGhost ? 'ghost-handle' : ''} resize-handle`}
        style={{ ...handleStyle, right: -8 }}
        onMouseDown={(e) => {
          if (onResizeRightMouseDownOverride) {
            onResizeRightMouseDownOverride(e, schedule);
            return;
          }
          // リサイズコールバックが未定義の場合はリサイズを無効化
          if (!onResize || !onResizeCommit) {
            return;
          }
          e.stopPropagation();
          handleMouseDown(e, 'resize-right');
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    </div>
  );
};

export default memo(EventBar);