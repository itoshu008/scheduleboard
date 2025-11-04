import { useState, useEffect, useCallback } from 'react'
import { useAutoRealTime } from './useAutoRealTime'
import type { Department, Employee, Equipment, Schedule } from '../types'
import { fromYMDLocal, todayLocal } from '../utils/dateUtils'
import { normalizeSchedule } from '../utils/normalize'

export function useAppData() {
  // UI State
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(fromYMDLocal(todayLocal()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // リアルタイムデータ（常に最新、3秒間隔で自動更新）
  const realTimeData = useAutoRealTime(3000, selectedDate)

  // 初期化処理（リアルタイムデータの準備を待つ）
  useEffect(() => {
    if (realTimeData.lastUpdated) {
      setLoading(false)
      setError(null)
      console.log('🔄 Auto real-time data integration active')
    }
  }, [realTimeData.lastUpdated])

  // Handle department change
  const handleDepartmentChange = useCallback(async (department: Department | null) => {
    setSelectedDepartment(department)
    
    if (department) {
      const deptEmployees = realTimeData.employees.filter(
        emp => emp.department_id === department.id
      )
      
      if (deptEmployees.length > 0) {
        setSelectedEmployee(deptEmployees[0])
      } else {
        setSelectedEmployee(null)
      }
    } else {
      setSelectedEmployee(null)
    }
  }, [realTimeData.employees])

  // Handle employee change
  const handleEmployeeChange = useCallback((employee: Employee) => {
    setSelectedEmployee(employee)
    
    const employeeDepartment = realTimeData.departments.find(
      (dept: Department) => dept.id === employee.department_id
    )
    if (employeeDepartment && employeeDepartment.id !== selectedDepartment?.id) {
      setSelectedDepartment(employeeDepartment)
    }
  }, [realTimeData.departments, selectedDepartment])

  // Reload schedules (リアルタイム強制更新)
  const reloadSchedules = useCallback(async () => {
    console.log('App: Force refresh triggered')
    await realTimeData.forceRefresh()
  }, [realTimeData])

  // Reload all data (リアルタイム強制更新)
  const reloadAllData = useCallback(async () => {
    console.log('App: Force refresh all data')
    await realTimeData.forceRefresh()
  }, [realTimeData])

  // Schedule handlers (リアルタイムデータには直接影響しないが、次回更新で反映される)
  const handleScheduleCreate = useCallback(async (scheduleData: any): Promise<void> => {
    console.log('Schedule created, will be reflected in next real-time update')
    // リアルタイム更新で自動的に反映されるため、ローカル状態は更新しない
  }, [])

  const handleScheduleUpdate = useCallback((schedule: Schedule) => {
    console.log('Schedule updated, will be reflected in next real-time update')
    // リアルタイム更新で自動的に反映されるため、ローカル状態は更新しない
  }, [])

  const handleScheduleDelete = useCallback((scheduleId: number) => {
    console.log('Schedule deleted, will be reflected in next real-time update')
    // リアルタイム更新で自動的に反映されるため、ローカル状態は更新しない
  }, [])

  // Set default selections when real-time data is loaded
  useEffect(() => {
    if (realTimeData.departments.length > 0 && !selectedDepartment) {
      setSelectedDepartment(realTimeData.departments[0])
      
      const firstDeptEmployees = realTimeData.employees.filter(
        emp => emp.department_id === realTimeData.departments[0].id
      )
      if (firstDeptEmployees.length > 0) {
        setSelectedEmployee(firstDeptEmployees[0])
      }
    }
  }, [realTimeData.departments, realTimeData.employees, selectedDepartment])

  return {
    // Real-time data (always up-to-date)
    departments: realTimeData.departments,
    employees: realTimeData.employees,
    equipment: realTimeData.equipment,
    schedules: realTimeData.schedules,
    
    // UI State
    selectedDepartment,
    selectedEmployee,
    selectedDate,
    loading,
    error,
    
    // Real-time info
    lastUpdated: realTimeData.lastUpdated,
    
    // Actions
    setSelectedDate,
    handleDepartmentChange,
    handleEmployeeChange,
    reloadSchedules,
    reloadAllData,
    handleScheduleCreate,
    handleScheduleUpdate,
    handleScheduleDelete,
  }
}
