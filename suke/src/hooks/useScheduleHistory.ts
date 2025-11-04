import { useState, useCallback, useRef, useEffect } from 'react';
import { Schedule } from '../types';

export interface HistoryState {
  schedules: Schedule[];
  timestamp: number;
  action: string;
}

export interface UseScheduleHistoryReturn {
  currentSchedules: Schedule[];
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushHistory: (schedules: Schedule[], action: string) => void;
  clearHistory: () => void;
  getHistoryInfo: () => { current: number; total: number; action?: string };
}

const MAX_HISTORY_SIZE = 50;

export function useScheduleHistory(initialSchedules: Schedule[] = []): UseScheduleHistoryReturn {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isUpdatingRef = useRef(false);

  // 初期化（初回のみ）
  useEffect(() => {
    if (history.length === 0 && initialSchedules.length > 0) {
      setHistory([{
        schedules: initialSchedules,
        timestamp: Date.now(),
        action: '初期状態'
      }]);
    }
  }, [initialSchedules, history.length]);

  const currentSchedules = history[currentIndex]?.schedules || initialSchedules;

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const pushHistory = useCallback((schedules: Schedule[], action: string) => {
    if (isUpdatingRef.current) return; // 履歴更新中は無視

    const newState: HistoryState = {
      schedules: [...schedules],
      timestamp: Date.now(),
      action
    };

    setHistory(prev => {
      // 現在の位置より後ろの履歴を削除（新しい変更があった場合）
      const newHistory = prev.slice(0, currentIndex + 1);
      
      // 新しい状態を追加
      newHistory.push(newState);
      
      // 最大サイズを超えた場合は古い履歴を削除
      if (newHistory.length > MAX_HISTORY_SIZE) {
        newHistory.shift();
        return newHistory;
      }
      
      return newHistory;
    });

    setCurrentIndex(prev => {
      const newIndex = Math.min(prev + 1, MAX_HISTORY_SIZE - 1);
      return newIndex;
    });

    console.log('📚 HISTORY_PUSH:', {
      action,
      schedulesCount: schedules.length,
      newIndex: Math.min(currentIndex + 1, MAX_HISTORY_SIZE - 1)
    });
  }, [currentIndex]);

  // 外部からのschedules変更を監視して履歴を更新
  useEffect(() => {
    if (initialSchedules.length > 0 && !isUpdatingRef.current) {
      // 外部からの更新（APIからの新しいデータ）
      const currentState = history[currentIndex];
      if (!currentState || JSON.stringify(currentState.schedules) !== JSON.stringify(initialSchedules)) {
        console.log('📚 HISTORY_EXTERNAL_UPDATE:', {
          from: currentState?.schedules.length || 0,
          to: initialSchedules.length
        });
        
        // 新しい履歴エントリを追加
        pushHistory(initialSchedules, '外部更新');
      }
    }
  }, [initialSchedules, history, currentIndex, pushHistory]);

  const undo = useCallback(() => {
    if (!canUndo) return;

    isUpdatingRef.current = true;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    
    console.log('↶ UNDO:', {
      from: currentIndex,
      to: newIndex,
      action: history[newIndex]?.action
    });

    // 少し遅延してからフラグをリセット
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [canUndo, currentIndex, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;

    isUpdatingRef.current = true;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    
    console.log('↷ REDO:', {
      from: currentIndex,
      to: newIndex,
      action: history[newIndex]?.action
    });

    // 少し遅延してからフラグをリセット
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [canRedo, currentIndex, history]);

  const clearHistory = useCallback(() => {
    setHistory([{
      schedules: currentSchedules,
      timestamp: Date.now(),
      action: '履歴クリア'
    }]);
    setCurrentIndex(0);
    console.log('🗑️ HISTORY_CLEAR');
  }, [currentSchedules]);

  const getHistoryInfo = useCallback(() => ({
    current: currentIndex + 1,
    total: history.length,
    action: history[currentIndex]?.action
  }), [currentIndex, history]);

  return {
    currentSchedules,
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
    clearHistory,
    getHistoryInfo
  };
}
