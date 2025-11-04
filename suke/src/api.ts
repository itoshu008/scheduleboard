import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

if (process.env.NODE_ENV === 'development') console.log("🔗 api.baseURL =", api.defaults.baseURL);

// 設備予約関連の関数
export const updateEquipmentReservation = async (id: number, data: any) => {
  return await api.put(`/equipment-reservations/${id}`, data);
};

export const createEquipmentReservation = async (data: any) => {
  return await api.post('/equipment-reservations', data);
};