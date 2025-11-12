import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { api } from '../api'
import type { Department, Employee, Equipment, Schedule } from '../types'
import { normalizeSchedule } from '../utils/normalize'

interface WebSocketState {
  departments: Department[]
  employees: Employee[]
  equipment: Equipment[]
  schedules: Schedule[]
  lastUpdated: Date | null
  connected: boolean
}

// 先頭付近にユーティリティを追加
const fmtYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getMonthRange = (base = new Date()) => {
  // タイムゾーン変換を考慮して前後1日広げる
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  first.setDate(first.getDate() - 1); // 前月末も含める
  const last  = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  last.setDate(last.getDate() + 1); // 翌月1日も含める
  return { start_date: fmtYMD(first), end_date: fmtYMD(last) };
};

// より広い範囲でスケジュールを取得（全ページで共有するため）
// 勤怠アプリに影響を与えないよう、ScheduleBoard専用API（/admin/schedules）のみを使用
const getWideRange = (base = new Date()) => {
  // 過去2年分と未来1年分を含める（過去に登録されたすべてのスケジュールを確実に取得）
  const first = new Date(base.getFullYear() - 2, 0, 1); // 2年前の1月1日
  const last = new Date(base.getFullYear() + 1, 11, 31); // 1年後の12月31日
  return { start_date: fmtYMD(first), end_date: fmtYMD(last) };
};

export function useWebSocket(selectedDate?: Date) {
  const [state, setState] = useState<WebSocketState>({
    departments: [],
    employees: [],
    equipment: [],
    schedules: [],
    lastUpdated: null,
    connected: false,
  })

  const socketRef = useRef<Socket | null>(null)
  const isInitializedRef = useRef(false)
  const selectedDateRef = useRef(selectedDate)

  // selectedDateの参照を更新
  useEffect(() => {
    selectedDateRef.current = selectedDate
  }, [selectedDate])

  // データ取得関数（依存配列を最適化）
  const fetchData = useCallback(async () => {
    console.log('🔄 useWebSocket.fetchData() started')
    try {
      // より広い範囲でスケジュールを取得（全ページで共有するため）
      const range = getWideRange(selectedDateRef.current ?? new Date());
      console.log('📅 Fetching schedules with range:', range)
      
      const [departmentsRes, employeesRes, equipmentRes, schedulesRes] = await Promise.all([
        api.get('/admin/departments'),
        api.get('/admin/employees'),
        api.get('/admin/equipment'),
        api.get('/admin/schedules', { params: range }),
      ])

      console.log('📊 WebSocket fetchData results:', {
        departments: departmentsRes.data?.length || 0,
        employees: employeesRes.data?.length || 0,
        equipment: equipmentRes.data?.length || 0,
        schedules: schedulesRes.data?.length || 0
      })

      setState(prev => {
        const newState = {
          departments: Array.isArray(departmentsRes.data) ? departmentsRes.data : [],
          employees: Array.isArray(employeesRes.data) ? employeesRes.data : [],
          equipment: Array.isArray(equipmentRes.data) ? equipmentRes.data : [],
          schedules: Array.isArray(schedulesRes.data) ? schedulesRes.data.map(normalizeSchedule) : [],
          lastUpdated: new Date(),
          connected: prev.connected, // 既存の接続状態を保持
        }

        console.log('✅ useWebSocket state updated:', {
          schedules: newState.schedules.length,
          lastUpdated: newState.lastUpdated?.toISOString()
        })

        // 初回のみログ出力
        if (!isInitializedRef.current) {
          console.log('🔄 WebSocket real-time updates started:', {
            departments: newState.departments.length,
            employees: newState.employees.length,
            equipment: newState.equipment.length,
            schedules: newState.schedules.length,
          })
          isInitializedRef.current = true
        }

        return newState
      })

      return null
    } catch (error) {
      console.warn('⚠️ WebSocket data fetch failed:', error)
      return null
    }
  }, []) // 依存配列を空にして、接続の再作成を防ぐ

  // WebSocket接続とイベントハンドラ（一度だけ実行）
  useEffect(() => {
    // 既存の接続があれば再利用
    if (socketRef.current?.connected) {
      return
    }

    // Socket.IO接続
    const socket = io({
      path: '/api/scheduleboard/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
      autoConnect: true,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('✅ WebSocket connected:', socket.id)
      setState(prev => ({ ...prev, connected: true }))
      // 接続時にデータを取得
      fetchData()
    })

    socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason)
      setState(prev => ({ ...prev, connected: false }))
    })

    socket.on('connect_error', (error) => {
      console.warn('⚠️ WebSocket connection error:', error)
      setState(prev => ({ ...prev, connected: false }))
    })

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 WebSocket reconnected after', attemptNumber, 'attempts')
      setState(prev => ({ ...prev, connected: true }))
      fetchData()
    })

    // データ変更通知のデバウンス用
    let dataChangeTimeout: NodeJS.Timeout | null = null
    
    // データ変更通知を受信
    socket.on('data:change', async (payload: { type: string; data: any; timestamp: string }) => {
      console.log('📨 WebSocket data:change received:', {
        type: payload.type,
        data: payload.data,
        timestamp: payload.timestamp,
        socketId: socket.id
      })
      
      // 既存のタイマーをクリア
      if (dataChangeTimeout) {
        clearTimeout(dataChangeTimeout)
      }
      
      // 300ms後に実行（連続通知をまとめる）
      dataChangeTimeout = setTimeout(() => {
        console.log('🔄 Triggering fetchData() after data:change...')
        fetchData().then(() => {
          console.log('✅ fetchData() completed after data:change')
        }).catch(err => {
          console.warn('⚠️ fetchData() failed after data:change:', err)
        })
        dataChangeTimeout = null
      }, 300)
    })

    // クリーンアップ
    return () => {
      // コンポーネントのアンマウント時のみ切断
      if (socket && socket.connected) {
        socket.disconnect()
        socketRef.current = null
      }
    }
  }, []) // 依存配列を空にして、一度だけ実行

  // 日付が変わったらデータを再取得（デバウンス付き）
  const lastFetchDateRef = useRef<string | null>(null)
  useEffect(() => {
    if (!state.connected) return
    
    const currentDateKey = selectedDate 
      ? `${selectedDate.getFullYear()}-${selectedDate.getMonth()}`
      : null
    
    // 同じ月の場合は再取得しない
    if (currentDateKey === lastFetchDateRef.current) {
      return
    }
    
    lastFetchDateRef.current = currentDateKey
    // 少し遅延させて連続実行を防ぐ
    const timeoutId = setTimeout(() => {
      fetchData()
    }, 100)
    
    return () => clearTimeout(timeoutId)
  }, [selectedDate?.getMonth(), selectedDate?.getFullYear(), state.connected, fetchData])

  // 手動更新
  const forceRefresh = useCallback(async () => {
    console.log('🔄 Force refresh triggered')
    return await fetchData()
  }, [fetchData])

  return {
    // Data (always up-to-date)
    departments: state.departments,
    employees: state.employees,
    equipment: state.equipment,
    schedules: state.schedules,
    lastUpdated: state.lastUpdated,
    connected: state.connected,
    
    // Actions
    forceRefresh,
  }
}

