import axios from 'axios';
import api from '../lib/api';
import type {
  Template,
  CreateTemplateInput,
  UpdateTemplateInput
} from '../types';

export async function getAll(): Promise<Template[]> {
  try {
    const r = await api.get('/templates');
    // 万一サーバが余計/欠損フィールドでも UI を止めない
    return Array.isArray(r.data) ? r.data as Template[] : [];
  } catch (e: any) {
    if (axios.isAxiosError(e) && e.response?.status === 404) return [];
    throw e;
  }
}

export async function createTemplate(input: CreateTemplateInput): Promise<Template> {
  const r = await api.post('/templates', input);
  return r.data as Template;
}

export async function updateTemplate(id: number, input: UpdateTemplateInput): Promise<Template> {
  const r = await api.put(`/templates/${id}`, input);
  return r.data as Template;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/templates/${id}`);
}
