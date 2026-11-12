import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SessionSidebar } from './components/SessionSidebar';
import { StudioWorkspace } from './components/StudioWorkspace';
import { ProviderHub } from './components/ProviderHubModal';
import { DbInspectorView } from './components/DbInspectorView';
import { PythonCodeViewer } from './components/PythonCodeViewer';
import { api } from './services/api';
import { ToolSession, SessionMapping, Turn, ProviderConfig } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'workspace' | 'providers' | 'database' | 'code'>('workspace');
  const [sessions, setSessions] = useState<ToolSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<ToolSession | null>(null);
  const [mappings, setMappings] = useState<SessionMapping[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(false);

  // Load providers and sessions on initial mount
  useEffect(() => {
    loadProviders();
    loadSessions();
  }, []);

  const loadProviders = async () => {
    try {
      const p = await api.getProviders();
      setProviders(p);
    } catch (err) {
      console.error('Failed to load providers:', err);
    }
  };

  const loadSessions = async () => {
    try {
      const sessList = await api.getSessions();
      setSessions(sessList);

      if (sessList.length > 0 && !activeSessionId) {
        // select first active session
        const firstActive = sessList.find((s) => s.status === 'active') || sessList[0];
        setActiveSessionId(firstActive.id);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  };

  // Load active session details whenever activeSessionId changes
  useEffect(() => {
    if (activeSessionId) {
      loadSessionDetails(activeSessionId);
    } else {
      setCurrentSession(null);
      setMappings([]);
      setTurns([]);
    }
  }, [activeSessionId]);

  const loadSessionDetails = async (id: string) => {
    setLoading(true);
    try {
      const details = await api.getSessionDetails(id);
      setCurrentSession(details.session);
      setMappings(details.mappings);
      setTurns(details.turns);
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async () => {
    try {
      setLoading(true);
      const res = await api.createSession();
      await loadSessions();
      setActiveSessionId(res.session_id);
      setActiveTab('workspace');
    } catch (err) {
      console.error('Failed to create session:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveSession = async (id: string) => {
    try {
      await api.archiveSession(id);
      await loadSessions();
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id && s.status === 'active');
        setActiveSessionId(remaining[0]?.id || null);
      }
    } catch (err) {
      console.error('Failed to archive session:', err);
    }
  };

  const handleUnarchiveSession = async (id: string) => {
    try {
      await api.unarchiveSession(id);
      await loadSessions();
      setActiveSessionId(id);
    } catch (err) {
      console.error('Failed to unarchive session:', err);
    }
  };

  const handleLoginProvider = async (name: string) => {
    await api.loginProvider(name);
    await loadProviders();
  };

  const handleToggleLogin = async (name: string) => {
    await api.toggleProviderLogin(name);
    await loadProviders();
  };

  const handleUpdateSelectors = async (name: string, selectors: any, notes?: string) => {
    await api.updateSelectors(name, selectors, notes);
    await loadProviders();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        providers={providers}
      />

      {/* Main Content View */}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'workspace' && (
          <>
            <SessionSidebar
              sessions={sessions}
              activeSessionId={activeSessionId}
              onSelectSession={(id) => setActiveSessionId(id)}
              onCreateSession={handleCreateSession}
              onArchiveSession={handleArchiveSession}
              onUnarchiveSession={handleUnarchiveSession}
              loading={loading}
            />
            <StudioWorkspace
              session={currentSession}
              mappings={mappings}
              turns={turns}
              providers={providers}
              onReloadSession={() => activeSessionId && loadSessionDetails(activeSessionId)}
              onOpenProviderHub={() => setActiveTab('providers')}
            />
          </>
        )}

        {activeTab === 'providers' && (
          <div className="flex-1 overflow-y-auto">
            <ProviderHub
              providers={providers}
              onRefresh={loadProviders}
              onLogin={handleLoginProvider}
              onToggleLogin={handleToggleLogin}
              onUpdateSelectors={handleUpdateSelectors}
            />
          </div>
        )}

        {activeTab === 'database' && (
          <div className="flex-1 overflow-y-auto">
            <DbInspectorView />
          </div>
        )}

        {activeTab === 'code' && (
          <div className="flex-1 overflow-y-auto">
            <PythonCodeViewer />
          </div>
        )}
      </main>
    </div>
  );
}
