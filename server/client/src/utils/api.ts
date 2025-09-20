import { api } from '../lib/api';
import { 
  Department, 
  Employee, 
  Schedule, 
  Equipment, 
  EquipmentReservation,
  Template,
  CreateDepartmentForm,
  CreateEmployeeForm,
  CreateScheduleForm,
  CreateEquipmentForm,
  CreateEquipmentReservationForm,
  CreateTemplateForm
} from '../types';

// 日本時間を保持するための変換関数
const toLocalISOString = (date: Date) => {
  const tzoffset = date.getTimezoneOffset() * 60000; // オフセットをミリ秒に変換
  const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, -1);
  return localISOTime;
};

// 部署API
export const departmentApi = {
  getAll: async (): Promise<import('axios').AxiosResponse<Department[]>> => {
    return await api.get<Department[]>('/departments');
  },
  getById: async (id: number): Promise<import('axios').AxiosResponse<Department>> => {
    return await api.get<Department>(`/departments/${id}`);
  },
  create: async (data: CreateDepartmentForm): Promise<import('axios').AxiosResponse<Department>> => {
    return await api.post<Department>('/departments', data);
  },
  update: async (id: number, data: Partial<CreateDepartmentForm>): Promise<import('axios').AxiosResponse<Department>> => {
    return await api.put<Department>(`/departments/${id}`, data);
  },
  delete: async (id: number): Promise<import('axios').AxiosResponse<any>> => {
    return await api.delete(`/departments/${id}`);
  },
  move: async (id: number, direction: 'up' | 'down'): Promise<import('axios').AxiosResponse<Department>> => {
    return await api.put<Department>(`/departments/${id}/move`, { direction });
  },
  updateOrder: async (orders: { id: number; display_order: number }[]): Promise<import('axios').AxiosResponse<any>> => {
    return await api.put('/departments/order/update', { orders });
  },
};

// 社員API
export const employeeApi = {
  getAll: async (params?: { department_id?: number; order_by?: string }): Promise<import('axios').AxiosResponse<Employee[]>> => {
    return await api.get<Employee[]>('/employees', { params });
  },
  getById: async (id: number): Promise<import('axios').AxiosResponse<Employee>> => {
    return await api.get<Employee>(`/employees/${id}`);
  },
  getByEmployeeNumber: async (employeeNumber: string): Promise<import('axios').AxiosResponse<Employee>> => {
    return await api.get<Employee>(`/employees/number/${employeeNumber}`);
  },
  create: async (data: CreateEmployeeForm): Promise<import('axios').AxiosResponse<Employee>> => {
    return await api.post<Employee>('/employees', data);
  },
  update: async (id: number, data: Partial<CreateEmployeeForm>): Promise<import('axios').AxiosResponse<Employee>> => {
    return await api.put<Employee>(`/employees/${id}`, data);
  },
  delete: async (id: number): Promise<import('axios').AxiosResponse<any>> => {
    return await api.delete(`/employees/${id}`);
  },
  move: async (id: number, direction: 'up' | 'down'): Promise<import('axios').AxiosResponse<Employee>> => {
    return await api.put<Employee>(`/employees/${id}/move`, { direction });
  },
  updateOrder: async (orders: { id: number; display_order: number }[]): Promise<import('axios').AxiosResponse<any>> => {
    return await api.put('/employees/order/update', { orders });
  },
};

// スケジュールAPI
export const scheduleApi = {
  getAll: async (params?: {
    employee_id?: number;
    department_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<import('axios').AxiosResponse<Schedule[]>> => {
    return await api.get<Schedule[]>('/schedules', { params });
  },
  getById: async (id: number): Promise<import('axios').AxiosResponse<Schedule>> => {
    return await api.get<Schedule>(`/schedules/${id}`);
  },
  getMonthly: async (employeeId: number, year: number, month: number): Promise<import('axios').AxiosResponse<Schedule[]>> => {
    return await api.get<Schedule[]>(`/schedules/monthly/${employeeId}/${year}/${month}`);
  },
  getMonthlyByDepartment: async (departmentId: number, year: number, month: number): Promise<import('axios').AxiosResponse<Schedule[]>> => {
    return await api.get<Schedule[]>(`/schedules/monthly/department/${departmentId}/${year}/${month}`);
  },
  getMonthlyAll: async (year: number, month: number): Promise<import('axios').AxiosResponse<Schedule[]>> => {
    return await api.get<Schedule[]>(`/schedules/monthly/all/${year}/${month}`);
  },
  getDailyByDepartment: async (departmentId: number, date: string): Promise<import('axios').AxiosResponse<Schedule[]>> => {
    const timestamp = Date.now();
    return await api.get<Schedule[]>(`/schedules/daily/department/${departmentId}/${date}?_t=${timestamp}`);
  },
  getDailyAll: async (date: string): Promise<import('axios').AxiosResponse<Schedule[]>> => {
    return await api.get<Schedule[]>(`/schedules/daily/all/${date}`);
  },
  create: async (data: CreateScheduleForm): Promise<import('axios').AxiosResponse<Schedule>> => {
    const payload = {
      ...data,
      start_datetime: toLocalISOString(data.start_datetime),
      end_datetime: toLocalISOString(data.end_datetime),
    };
    return await api.post<Schedule>('/schedules', payload);
  },
  update: async (id: number, data: Partial<CreateScheduleForm>): Promise<import('axios').AxiosResponse<Schedule>> => {
    const payload = {
      ...data,
      start_datetime: data.start_datetime ? toLocalISOString(data.start_datetime) : undefined,
      end_datetime: data.end_datetime ? toLocalISOString(data.end_datetime) : undefined,
    };
    return await api.put<Schedule>(`/schedules/${id}`, payload);
  },
  delete: async (id: number): Promise<import('axios').AxiosResponse<any>> => {
    return await api.delete(`/schedules/${id}`);
  },
  copy: async (sourceId: number, targetEmployeeId: number, targetStartTime: Date): Promise<import('axios').AxiosResponse<Schedule>> => {
    return await api.post<Schedule>(`/schedules/${sourceId}/copy`, {
      target_employee_id: targetEmployeeId,
      target_start_datetime: toLocalISOString(targetStartTime),
    });
  },
  checkConflict: async (data: {
    employee_id: number;
    start_datetime: Date;
    end_datetime: Date;
    exclude_id?: number;
  }): Promise<import('axios').AxiosResponse<{ hasConflict: boolean; conflicts: Schedule[] }>> => {
    const payload = {
      ...data,
      start_datetime: toLocalISOString(data.start_datetime),
      end_datetime: toLocalISOString(data.end_datetime),
    };
    return await api.post<{ hasConflict: boolean; conflicts: Schedule[] }>(
      '/schedules/check-conflict',
      payload
    );
  },
};

// 設備API
export const equipmentApi = {
  getAll: async (): Promise<import('axios').AxiosResponse<Equipment[]>> => {
    return await api.get<Equipment[]>('/equipment');
  },
  getById: async (id: number): Promise<import('axios').AxiosResponse<Equipment>> => {
    return await api.get<Equipment>(`/equipment/${id}`);
  },
  create: async (data: CreateEquipmentForm): Promise<import('axios').AxiosResponse<Equipment>> => {
    return await api.post<Equipment>('/equipment', data);
  },
  update: async (id: number, data: Partial<CreateEquipmentForm>): Promise<import('axios').AxiosResponse<Equipment>> => {
    return await api.put<Equipment>(`/equipment/${id}`, data);
  },
  delete: async (id: number): Promise<import('axios').AxiosResponse<any>> => {
    return await api.delete(`/equipment/${id}`);
  },
  move: async (id: number, direction: 'up' | 'down'): Promise<import('axios').AxiosResponse<Equipment>> => {
    return await api.put<Equipment>(`/equipment/${id}/move`, { direction });
  },
  updateOrder: async (orders: { id: number; display_order: number }[]): Promise<import('axios').AxiosResponse<any>> => {
    return await api.put('/equipment/order/update', { orders });
  },
};

// テンプレートAPIは src/api/templates.ts に移動済み

// 設備予約API
export const equipmentReservationApi = {
  getAll: async (params?: {
    equipment_id?: number;
    employee_id?: number;
    start_date?: string;
    end_date?: string;
  }): Promise<import('axios').AxiosResponse<EquipmentReservation[]>> => {
    return await api.get<EquipmentReservation[]>('/equipment-reservations', { params });
  },
  getById: async (id: number): Promise<import('axios').AxiosResponse<EquipmentReservation>> => {
    return await api.get<EquipmentReservation>(`/equipment-reservations/${id}`);
  },
  getMonthly: async (equipmentId: number, year: number, month: number): Promise<import('axios').AxiosResponse<EquipmentReservation[]>> => {
    return await api.get<EquipmentReservation[]>(`/equipment-reservations/monthly/${equipmentId}/${year}/${month}`);
  },
  create: async (data: CreateEquipmentReservationForm): Promise<import('axios').AxiosResponse<EquipmentReservation>> => {
    const payload = {
      ...data,
      start_datetime: toLocalISOString(data.start_datetime),
      end_datetime: toLocalISOString(data.end_datetime),
    };
    return await api.post<EquipmentReservation>('/equipment-reservations', payload);
  },
  update: async (id: number, data: Partial<CreateEquipmentReservationForm>): Promise<import('axios').AxiosResponse<EquipmentReservation>> => {
    const payload = {
      ...data,
      start_datetime: data.start_datetime ? toLocalISOString(data.start_datetime) : undefined,
      end_datetime: data.end_datetime ? toLocalISOString(data.end_datetime) : undefined,
    };
    return await api.put<EquipmentReservation>(`/equipment-reservations/${id}`, payload);
  },
  delete: async (id: number): Promise<import('axios').AxiosResponse<any>> => {
    return await api.delete(`/equipment-reservations/${id}`);
  },
  copy: async (sourceId: number, targetEquipmentId: number, targetStartTime: Date): Promise<import('axios').AxiosResponse<EquipmentReservation>> => {
    return await api.post<EquipmentReservation>(`/equipment-reservations/${sourceId}/copy`, {
      target_equipment_id: targetEquipmentId,
      target_start_datetime: toLocalISOString(targetStartTime),
    });
  },
  checkConflict: async (data: {
    equipment_id: number;
    start_datetime: Date;
    end_datetime: Date;
    exclude_id?: number;
  }): Promise<import('axios').AxiosResponse<{ hasConflict: boolean; conflicts: EquipmentReservation[] }>> => {
    const payload = {
      ...data,
      start_datetime: toLocalISOString(data.start_datetime),
      end_datetime: toLocalISOString(data.end_datetime),
    };
    return await api.post<{ hasConflict: boolean; conflicts: EquipmentReservation[] }>(
      '/equipment-reservations/check-conflict',
      payload
    );
  },
};

export default api;