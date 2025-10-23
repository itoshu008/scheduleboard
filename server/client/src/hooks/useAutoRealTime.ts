import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import type { Department, Employee, Equipment, Schedule } from '../types'
import { normalizeSchedule } from '../utils/normalize'

interface AutoRealTimeState {
  departments: Department[]
  employees: Employee[]
  equipment: Equipment[]
  schedules: Schedule[]
  lastUpdated: Date | null
}

// 先頭付近にユーティリティを追加
const fmtYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getMonthRange = (base = new Date()) => {
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last  = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return { start_date: fmtYMD(first), end_date: fmtYMD(last) };
};

export function useAutoRealTime(intervalMs: number = 3000, selectedDate?: Date) {
  const [state, setState] = useState<AutoRealTimeState>({
    departments: [],
    employees: [],
    equipment: [],
    schedules: [],
    lastUpdated: null,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isInitializedRef = useRef(false)

  // データ取得関数（サイレント）
  const fetchDataSilently = useCallback(async () => {
    try {
        const range = getMonthRange(selectedDate ?? new Date());
        
        const [departmentsRes, employeesRes, equipmentRes, schedulesRes] = await Promise.all([
          api.get('/departments'),
          api.get('/employees'),
          api.get('/equipment'),
          api.get('/schedules', { params: range }), // ★ここだけパラメータ必須
        ])

      const newState = {
        departments: Array.isArray(departmentsRes.data) ? departmentsRes.data : [],
        employees: Array.isArray(employeesRes.data) ? employeesRes.data : [],
        equipment: Array.isArray(equipmentRes.data) ? equipmentRes.data : [],
        schedules: Array.isArray(schedulesRes.data) ? schedulesRes.data.map(normalizeSchedule) : [],
        lastUpdated: new Date(),
      }

      setState(newState)

      // 初回のみログ出力
      if (!isInitializedRef.current) {
        console.log('🔄 Auto real-time updates started:', {
          departments: newState.departments.length,
          employees: newState.employees.length,
          equipment: newState.equipment.length,
          schedules: newState.schedules.length,
          interval: `${intervalMs}ms`,
        })
        isInitializedRef.current = true
      }

      return newState

    } catch (error) {
      // サイレントエラー（ログのみ、UIには表示しない）
      console.warn('⚠️ Auto real-time update failed (silent):', error)
      return null
    }
  }, [intervalMs, selectedDate])

  // 自動更新開始
  useEffect(() => {
    // 初回データ取得
    fetchDataSilently()

    // 定期更新開始
    intervalRef.current = setInterval(() => {
      fetchDataSilently()
    }, intervalMs)

    // クリーンアップ
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [fetchDataSilently, intervalMs])

  // 手動更新（必要に応じて）
  const forceRefresh = useCallback(async () => {
    console.log('🔄 Force refresh triggered')
    return await fetchDataSilently()
  }, [fetchDataSilently])

  return {
    // Data (always up-to-date)
    departments: state.departments,
    employees: state.employees,
    equipment: state.equipment,
    schedules: state.schedules,
    lastUpdated: state.lastUpdated,
    
    // Actions
    forceRefresh,
  }
}
