import React, { useState } from 'react';
import { Plus, MessageSquare, Archive, RefreshCw, ChevronRight, Check } from 'lucide-react';
import { ToolSession } from '../types';

interface SessionSidebarProps {
  sessions: ToolSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onArchiveSession: (id: string) => void;
  onUnarchiveSession: (id: string) => void;
  loading: boolean;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onArchiveSession,
  onUnarchiveSession,
  loading,
}) => {
  const [filter, setFilter] = useState<'active' | 'archived'>('active');

  const filteredSessions = sessions.filter((s) => s.status === filter);

  return (
    <aside className="w-72 bg-zinc-950 border-r border-zinc-800 flex flex-col h-[calc(100vh-4rem)]">
      {/* Top action: New Session */}
      <div className="p-4 border-b border-zinc-800">
        <button
          onClick={onCreateSession}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs shadow-sm transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>New Session</span>
        </button>

        {/* Tab switcher: Active vs Archived */}
        <div className="flex items-center gap-1 mt-3 p-1 bg-zinc-900 rounded-md border border-zinc-800/80">
          <button
            onClick={() => setFilter('active')}
            className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'active'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Active ({sessions.filter((s) => s.status === 'active').length})
          </button>
          <button
            onClick={() => setFilter('archived')}
            className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
              filter === 'archived'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Archived ({sessions.filter((s) => s.status === 'archived').length})
          </button>
        </div>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MessageSquare className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">
              {filter === 'active' ? 'No active sessions yet' : 'No archived sessions'}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isSelected = session.id === activeSessionId;
            return (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
                    : 'bg-zinc-950 border-transparent hover:bg-zinc-900/40 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-snug text-zinc-200">
                      {session.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500">
                      <span>{new Date(session.last_used_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[10px] text-zinc-600">5 providers</span>
                    </div>
                  </div>

                  {filter === 'active' ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchiveSession(session.id);
                      }}
                      title="Archive session"
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800 transition-opacity"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnarchiveSession(session.id);
                      }}
                      title="Restore session"
                      className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-emerald-400 p-1 rounded hover:bg-zinc-800 transition-opacity"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer session info */}
      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/60 text-[11px] text-zinc-500 flex items-center justify-between">
        <span>Persistent Context: On</span>
        <span className="font-mono text-[10px]">Playwright Pool</span>
      </div>
    </aside>
  );
};
