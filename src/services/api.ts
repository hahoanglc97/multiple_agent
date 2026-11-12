import { ToolSession, SessionMapping, Turn, ProviderConfig } from '../types';

export const api = {
  async getSessions(): Promise<ToolSession[]> {
    const res = await fetch('/api/sessions');
    if (!res.ok) throw new Error('Failed to load sessions');
    return res.json();
  },

  async createSession(title?: string): Promise<{ session_id: string; title: string }> {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error('Failed to create session');
    return res.json();
  },

  async getSessionDetails(id: string): Promise<{ session: ToolSession; mappings: SessionMapping[]; turns: Turn[] }> {
    const res = await fetch(`/api/sessions/${id}`);
    if (!res.ok) throw new Error('Failed to load session details');
    return res.json();
  },

  async archiveSession(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to archive session');
  },

  async unarchiveSession(id: string): Promise<void> {
    const res = await fetch(`/api/sessions/${id}/unarchive`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to restore session');
  },

  async askSession(
    sessionId: string,
    userInput: string,
    mode?: string,
    participants?: string[]
  ): Promise<{ message: string; session_id: string; mode: string; participants: string[]; reason: string }> {
    const res = await fetch(`/api/sessions/${sessionId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_input: userInput, mode, participants }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to process question' }));
      throw new Error(err.message || err.error || 'Failed to submit question');
    }
    return res.json();
  },

  async getTurns(sessionId: string): Promise<Turn[]> {
    const res = await fetch(`/api/sessions/${sessionId}/turns`);
    if (!res.ok) throw new Error('Failed to load turns');
    return res.json();
  },

  async getProviders(): Promise<ProviderConfig[]> {
    const res = await fetch('/api/providers');
    if (!res.ok) throw new Error('Failed to load providers');
    return res.json();
  },

  async loginProvider(name: string): Promise<{ message: string; logged_in: boolean }> {
    const res = await fetch(`/api/providers/${name}/login`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to authenticate provider');
    return res.json();
  },

  async toggleProviderLogin(name: string): Promise<{ logged_in: boolean }> {
    const res = await fetch(`/api/providers/${name}/toggle-login`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to toggle provider login');
    return res.json();
  },

  async updateSelectors(name: string, selectors: any, notes?: string): Promise<void> {
    const res = await fetch(`/api/providers/${name}/selectors`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectors, notes }),
    });
    if (!res.ok) throw new Error('Failed to update selectors');
  },

  async getTableData(table: string): Promise<any[]> {
    const res = await fetch(`/api/db/tables/${table}`);
    if (!res.ok) throw new Error(`Failed to load table ${table}`);
    return res.json();
  },
};
