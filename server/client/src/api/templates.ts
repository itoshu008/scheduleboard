import axios from 'axios';
import api from '../lib/api';

export type Template = {
  id: number;
  name: string;
  title: string;
  color: string;
  duration_minutes: number;
};

export async function getAll(): Promise<Template[]> {
  try {
    const r = await api.get('/templates');
    return Array.isArray(r.data) ? r.data as Template[] : [];
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return []; // ← 404を空配列に
    throw e;
  }
}

export async function createTemplate(data: any) {
  try {
    const r = await api.post('/templates', data);
    return r.data;
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    throw e;
  }
}

export async function updateTemplate(id: number, data: any) {
  try {
    const r = await api.put(`/templates/${id}`, data);
    return r.data;
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return null;
    throw e;
  }
}

export async function deleteTemplate(id: number) {
  try {
    await api.delete(`/templates/${id}`);
    return true;
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return false;
    throw e;
  }
}
