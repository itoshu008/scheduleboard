import { useState, useEffect, useCallback } from 'react'
import { useRealTimeData } from './useRealTimeData'

interface Notification {
  id: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: Date
}

export function useRealTimeIntegration() {
  const realTimeData = useRealTimeData()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(false)

  // 通知を追加
  const addNotification = useCallback((message: string, type: Notification['type']) => {
    const notification: Notification = {
      id: Date.now().toString(),
      message,
      type,
      timestamp: new Date(),
    }
    
    setNotifications(prev => [...prev, notification])
    
    // 自動削除（5秒後）
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
    }, 5000)
  }, [])

  // 通知を削除
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // リアルタイム更新の開始/停止
  const toggleRealTime = useCallback(() => {
    if (isRealTimeEnabled) {
      realTimeData.stopRealTimeUpdates()
      setIsRealTimeEnabled(false)
      addNotification('リアルタイム更新を停止しました', 'info')
    } else {
      realTimeData.startRealTimeUpdates(5000) // 5秒間隔
      setIsRealTimeEnabled(true)
      addNotification('リアルタイム更新を開始しました（5秒間隔）', 'success')
    }
  }, [isRealTimeEnabled, realTimeData, addNotification])

  // 手動更新
  const manualRefresh = useCallback(async () => {
    try {
      await realTimeData.manualRefresh()
      addNotification('データを手動更新しました', 'success')
    } catch (error) {
      addNotification('データ更新に失敗しました', 'error')
    }
  }, [realTimeData, addNotification])

  // データ変更の監視
  useEffect(() => {
    let previousScheduleCount = realTimeData.schedules.length
    let previousDepartmentCount = realTimeData.departments.length
    let previousEmployeeCount = realTimeData.employees.length
    let previousEquipmentCount = realTimeData.equipment.length

    // データ変更の検出
    if (realTimeData.lastUpdated) {
      const scheduleChanged = realTimeData.schedules.length !== previousScheduleCount
      const departmentChanged = realTimeData.departments.length !== previousDepartmentCount
      const employeeChanged = realTimeData.employees.length !== previousEmployeeCount
      const equipmentChanged = realTimeData.equipment.length !== previousEquipmentCount

      if (scheduleChanged) {
        const diff = realTimeData.schedules.length - previousScheduleCount
        addNotification(
          `スケジュールが更新されました (${diff > 0 ? '+' : ''}${diff})`,
          'info'
        )
      }

      if (departmentChanged) {
        const diff = realTimeData.departments.length - previousDepartmentCount
        addNotification(
          `部署が更新されました (${diff > 0 ? '+' : ''}${diff})`,
          'info'
        )
      }

      if (employeeChanged) {
        const diff = realTimeData.employees.length - previousEmployeeCount
        addNotification(
          `社員が更新されました (${diff > 0 ? '+' : ''}${diff})`,
          'info'
        )
      }

      if (equipmentChanged) {
        const diff = realTimeData.equipment.length - previousEquipmentCount
        addNotification(
          `設備が更新されました (${diff > 0 ? '+' : ''}${diff})`,
          'info'
        )
      }

      // 前回の値を更新
      previousScheduleCount = realTimeData.schedules.length
      previousDepartmentCount = realTimeData.departments.length
      previousEmployeeCount = realTimeData.employees.length
      previousEquipmentCount = realTimeData.equipment.length
    }
  }, [realTimeData.lastUpdated, realTimeData.schedules.length, realTimeData.departments.length, realTimeData.employees.length, realTimeData.equipment.length, addNotification])

  // 接続エラーの監視
  useEffect(() => {
    if (realTimeData.connectionError && isRealTimeEnabled) {
      addNotification(realTimeData.connectionError, 'error')
    }
  }, [realTimeData.connectionError, isRealTimeEnabled, addNotification])

  return {
    // Real-time data
    realTimeData,
    
    // Notifications
    notifications,
    addNotification,
    removeNotification,
    
    // Controls
    isRealTimeEnabled,
    toggleRealTime,
    manualRefresh,
  }
}
