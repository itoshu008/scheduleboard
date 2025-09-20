import api from '../lib/api';

export async function fetchTemplates() {
  try {
    const r = await api.get('/templates');
    return Array.isArray(r.data) ? r.data : [];
  } catch (e: any) {
    if (e.response?.status === 404) return [];
    throw e;
  }
}

export async function createTemplate(data: any) {
  try {
    const r = await api.post('/templates', data);
    return r.data;
  } catch (e: any) {
    if (e.response?.status === 404) return null;
    throw e;
  }
}

export async function updateTemplate(id: number, data: any) {
  try {
    const r = await api.put(`/templates/${id}`, data);
    return r.data;
  } catch (e: any) {
    if (e.response?.status === 404) return null;
    throw e;
  }
}

export async function deleteTemplate(id: number) {
  try {
    await api.delete(`/templates/${id}`);
    return true;
  } catch (e: any) {
    if (e.response?.status === 404) return false;
    throw e;
  }
}
