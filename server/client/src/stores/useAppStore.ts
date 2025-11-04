import { create } from 'zustand'
import type { Department, Employee, Equipment, Schedule } from '../types'

interface AppState {
  // Data
  departments: Department[]
  employees: Employee[]
  equipment: Equipment[]
  schedules: Schedule[]
  
  // Selected items
  selectedDepartment: Department | null
  selectedEmployee: Employee | null
  selectedDate: Date
  
  // Loading states
  loading: boolean
  error: string | null
  
  // Actions
  setDepartments: (departments: Department[]) => void
  setEmployees: (employees: Employee[]) => void
  setEquipment: (equipment: Equipment[]) => void
  setSchedules: (schedules: Schedule[]) => void
  setSelectedDepartment: (department: Department | null) => void
  setSelectedEmployee: (employee: Employee | null) => void
  setSelectedDate: (date: Date) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  
  // Reset
  reset: () => void
}

const initialState = {
  departments: [],
  employees: [],
  equipment: [],
  schedules: [],
  selectedDepartment: null,
  selectedEmployee: null,
  selectedDate: new Date(),
  loading: false,
  error: null,
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  
  // Actions
  setDepartments: (departments) => set({ departments }),
  setEmployees: (employees) => set({ employees }),
  setEquipment: (equipment) => set({ equipment }),
  setSchedules: (schedules) => set({ schedules }),
  setSelectedDepartment: (selectedDepartment) => set({ selectedDepartment }),
  setSelectedEmployee: (selectedEmployee) => set({ selectedEmployee }),
  setSelectedDate: (selectedDate) => set({ selectedDate }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  // Reset
  reset: () => set(initialState),
}))