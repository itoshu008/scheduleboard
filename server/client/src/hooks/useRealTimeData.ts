import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'
import type { Department, Employee, Equipment, Schedule } from '../types'

interface RealTimeDataState {
  departments: Department[]
  employees: Employee[]
  equipment: Equipment[]
  schedules: Schedule[]
  lastUpdated: Date | null
  isConnected: boolean
  connectionError: string | null
}

export function useRealTimeData() {
  const [state, setState] = useState<RealTimeDataState>({
    departments: [],
    employees: [],
    equipment: [],
    schedules: [],
    lastUpdated: null,
    isConnected: false,
    connectionError: null,
  })

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const retryCountRef = useRef(0)
  const maxRetries = 5

  // データ取得関数
  const fetchAllData = useCallback(async () => {
    try {
      console.log('🔄 Fetching real-time data...')
      
      const [departmentsRes, employeesRes, equipmentRes, schedulesRes] = await Promise.all([
        api.get('/departments'),
        api.get('/employees'),
        api.get('/equipment'),
        api.get('/schedules'),
      ])

      const newState = {
        departments: Array.isArray(departmentsRes.data) ? departmentsRes.data : [],
        employees: Array.isArray(employeesRes.data) ? employeesRes.data : [],
        equipment: Array.isArray(equipmentRes.data) ? equipmentRes.data : [],
        schedules: Array.isArray(schedulesRes.data) ? schedulesRes.data : [],
        lastUpdated: new Date(),
        isConnected: true,
        connectionError: null,
      }

      setState(newState)
      retryCountRef.current = 0
      
      console.log('✅ Real-time data updated:', {
        departments: newState.departments.length,
        employees: newState.employees.length,
        equipment: newState.equipment.length,
        schedules: newState.schedules.length,
        timestamp: newState.lastUpdated?.toLocaleTimeString(),
      })

      return newState

    } catch (error: any) {
      console.error('❌ Failed to fetch real-time data:', error.message)
      
      retryCountRef.current++
      
      setState(prev => ({
        ...prev,
        isConnected: false,
        connectionError: `接続エラー (${retryCountRef.current}/${maxRetries}): ${error.message}`,
      }))

      // 最大リトライ回数に達した場合は停止
      if (retryCountRef.current >= maxRetries) {
        console.error('🚨 Max retries reached, stopping real-time updates')
        stopRealTimeUpdates()
      }

      throw error
    }
  }, [])

  // リアルタイム更新開始
  const startRealTimeUpdates = useCallback((intervalMs: number = 10000) => {
    console.log(`🚀 Starting real-time updates (${intervalMs}ms interval)`)
    
    // 初回データ取得
    fetchAllData()

    // 定期更新開始
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }

    intervalRef.current = setInterval(() => {
      fetchAllData().catch(() => {
        // エラーは fetchAllData 内で処理済み
      })
    }, intervalMs)

  }, [fetchAllData])

  // リアルタイム更新停止
  const stopRealTimeUpdates = useCallback(() => {
    console.log('🛑 Stopping real-time updates')
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
    }))
  }, [])

  // 手動更新
  const manualRefresh = useCallback(async () => {
    console.log('🔄 Manual refresh triggered')
    return await fetchAllData()
  }, [fetchAllData])

  // 特定データの更新
  const refreshSchedules = useCallback(async () => {
    try {
      const response = await api.get('/schedules')
      const newSchedules = Array.isArray(response.data) ? response.data : []
      
      setState(prev => ({
        ...prev,
        schedules: newSchedules,
        lastUpdated: new Date(),
      }))

      console.log('✅ Schedules refreshed:', newSchedules.length, 'items')
      return newSchedules
    } catch (error) {
      console.error('❌ Failed to refresh schedules:', error)
      throw error
    }
  }, [])

  // データ変更の検出
  const hasDataChanged = useCallback((newData: Partial<RealTimeDataState>) => {
    if (newData.schedules && newData.schedules.length !== state.schedules.length) {
      return true
    }
    
    if (newData.departments && newData.departments.length !== state.departments.length) {
      return true
    }

    if (newData.employees && newData.employees.length !== state.employees.length) {
      return true
    }

    if (newData.equipment && newData.equipment.length !== state.equipment.length) {
      return true
    }

    return false
  }, [state])

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    // Data
    ...state,
    
    // Actions
    startRealTimeUpdates,
    stopRealTimeUpdates,
    manualRefresh,
    refreshSchedules,
    hasDataChanged,
    
    // Status
    retryCount: retryCountRef.current,
    maxRetries,
  }
}
