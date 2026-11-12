import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, Bot, AlertTriangle, ExternalLink, Link2, HelpCircle, Layers, Check, ShieldAlert } from 'lucide-react';
import { ToolSession, SessionMapping, Turn, ProgressEvent, ProviderConfig } from '../types';
import { TurnCard } from './TurnCard';
import { LiveProgressPanel } from './LiveProgressPanel';
import { api } from '../services/api';

interface StudioWorkspaceProps {
  session: ToolSession | null;
  mappings: SessionMapping[];
  turns: Turn[];
  providers: ProviderConfig[];
  onReloadSession: () => void;
  onOpenProviderHub: () => void;
}

const EXAMPLE_PROMPTS = [
  {
    title: 'Quantum Shor vs RSA',
    text: "Will Shor's algorithm render 2048-bit RSA obsolete within the next 7 years, and what post-quantum algorithms are already production-ready?",
    suggestedMode: 'DEBATE',
  },
  {
    title: 'Architecture Trade-offs',
    text: 'Evaluate the architectural trade-offs between Monorepos (Turborepo) vs Multi-repos for a fast-growing 50-engineer software team.',
    suggestedMode: 'PARALLEL',
  },
  {
    title: 'Verification & Fact-Check',
    text: 'Fact-check and verify whether FlashAttention-3 achieves exact theoretical memory bandwidth bounds on Hopper H100 GPUs.',
    suggestedMode: 'VERIFY',
  },
  {
    title: 'Single Expert Query',
    text: 'Explain how Playwright persistent browser contexts manage session cookies and local storage tokens without credentials.',
    suggestedMode: 'SINGLE',
  },
];

export const StudioWorkspace: React.FC<StudioWorkspaceProps> = ({
  session,
  mappings,
  turns,
  providers,
  onReloadSession,
  onOpenProviderHub,
}) => {
  const [input, setInput] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>('AUTO');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([
    'claude',
    'gemini',
    'grok',
    'deepseek',
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [streamEvents, setStreamEvents] = useState<ProgressEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const turnsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest turn
  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, streamEvents]);

  const toggleParticipant = (p: string) => {
    if (selectedParticipants.includes(p)) {
      if (selectedParticipants.length > 1) {
        setSelectedParticipants(selectedParticipants.filter((item) => item !== p));
      }
    } else {
      setSelectedParticipants([...selectedParticipants, p]);
    }
  };

  const handleAsk = async (promptText?: string) => {
    const text = promptText || input;
    if (!text.trim() || !session || isRunning) return;

    setErrorMessage(null);
    setIsRunning(true);
    setStreamEvents([]);

    // Check if ChatGPT is logged in
    const chatgpt = providers.find((p) => p.provider === 'chatgpt');
    if (!chatgpt?.logged_in) {
      setErrorMessage('LoginRequiredError: ChatGPT (Brain Orchestrator) is not authenticated. Please log in first via Provider Profiles.');
      setIsRunning(false);
      return;
    }

    try {
      const modeParam = selectedMode === 'AUTO' ? undefined : selectedMode;
      const res = await api.askSession(session.id, text, modeParam, selectedParticipants);
      setInput('');

      // Connect to SSE stream
      let eventSource: EventSource | null = null;
      let activeTurnId = '';

      // Fallback polling loop while streaming completes
      const pollInterval = setInterval(async () => {
        try {
          const updatedTurns = await api.getTurns(session.id);
          if (updatedTurns.length > turns.length) {
            onReloadSession();
          }
        } catch (e) {
          // ignore
        }
      }, 1500);

      // Listen to SSE progress
      const currentTurnId = (res as any).turn_id || 'stream_' + Date.now();
      eventSource = new EventSource(`/api/turns/${currentTurnId}/stream`);

      eventSource.onmessage = (event) => {
        try {
          const parsed: ProgressEvent = JSON.parse(event.data);
          setStreamEvents((prev) => [...prev, parsed]);

          if (parsed.type === 'error') {
            setErrorMessage(parsed.content || 'An error occurred during orchestration');
            setIsRunning(false);
            clearInterval(pollInterval);
            eventSource?.close();
          } else if (parsed.type === 'done') {
            setIsRunning(false);
            clearInterval(pollInterval);
            eventSource?.close();
            onReloadSession();
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      eventSource.onerror = () => {
        // Fallback: poll turns and finish
        setTimeout(async () => {
          clearInterval(pollInterval);
          setIsRunning(false);
          eventSource?.close();
          onReloadSession();
        }, 3000);
      };
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to dispatch orchestration request');
      setIsRunning(false);
    }
  };

  if (!session) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <p className="text-sm">Select or create a session to start orchestrating.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-zinc-950">
      {/* Session Top Bar: Session Title & 5 Provider Mapping Chips (§4.2 & §6.2) */}
      <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
              <span>{session.title}</span>
              <span className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60">
                {session.id}
              </span>
            </h2>
            <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
              <span>Created {new Date(session.created_at).toLocaleDateString()}</span>
              <span aria-hidden="true">·</span>
              <span>Context Continuity: 1:1 on all 5 Providers</span>
            </div>
          </div>
        </div>

        {/* 5 Provider Mappings (§4.2) */}
        <div className="flex items-center gap-1.5">
          {mappings.map((m) => (
            <div
              key={m.provider}
              title={`Provider ref: ${m.provider_session_ref}`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300"
            >
              <Link2 className="w-2.5 h-2.5 text-zinc-500" />
              <span className="font-semibold uppercase text-emerald-400">{m.provider}</span>
              <span className="text-zinc-600 text-[9px] max-w-[80px] truncate">
                {m.provider_session_ref.split('/').pop()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Turns Feed */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-4xl mx-auto">
          {turns.length === 0 && !isRunning && (
            <div className="py-12 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-emerald-400">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-zinc-200">
                  Ready for Multi-Agent Synthesis
                </h3>
                <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1 leading-relaxed">
                  Enter your question below. ChatGPT will act as the brain orchestrator, selecting between DEBATE, PARALLEL, VERIFY, or SINGLE modes with DeepSeek semantic compression.
                </p>
              </div>

              {/* Example Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl mx-auto pt-2 text-left">
                {EXAMPLE_PROMPTS.map((ex, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setInput(ex.text);
                      setSelectedMode(ex.suggestedMode);
                    }}
                    className="p-3 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 hover:border-zinc-700 text-left transition-all"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-zinc-200 mb-1">
                      <span>{ex.title}</span>
                      <span className="text-[10px] font-mono text-emerald-400">{ex.suggestedMode}</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
                      {ex.text}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Render Completed Turns */}
          {turns.map((turn) => (
            <TurnCard key={turn.id} turn={turn} />
          ))}

          {/* Render Active Progress Panel */}
          {isRunning && (
            <LiveProgressPanel
              events={streamEvents}
              isRunning={isRunning}
              onDismiss={() => setIsRunning(false)}
            />
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="my-4 p-4 rounded-xl bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-amber-300">Action Required</p>
                  <p className="mt-0.5 text-zinc-300 leading-relaxed">{errorMessage}</p>
                </div>
              </div>
              <button
                onClick={onOpenProviderHub}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium text-xs whitespace-nowrap transition-colors"
              >
                Authenticate in Profiles
              </button>
            </div>
          )}

          <div ref={turnsEndRef} />
        </div>
      </div>

      {/* Bottom Input Area */}
      <div className="p-4 border-t border-zinc-800 bg-zinc-950/90 shrink-0">
        <div className="max-w-4xl mx-auto space-y-3">
          {/* Controls: Mode Selector & Participants */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Mode selection buttons */}
            <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
              <span className="text-[11px] text-zinc-500 font-mono px-2">Pipeline:</span>
              {(['AUTO', 'DEBATE', 'PARALLEL', 'VERIFY', 'SINGLE'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMode(m)}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    selectedMode === m
                      ? 'bg-zinc-800 text-emerald-400 shadow-sm border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {m === 'AUTO' ? 'Auto (Brain)' : m}
                </button>
              ))}
            </div>

            {/* Participant selector toggles */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 font-mono">Participants:</span>
              {['claude', 'gemini', 'grok', 'deepseek'].map((p) => {
                const isSelected = selectedParticipants.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleParticipant(p)}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-all ${
                      isSelected
                        ? 'bg-zinc-800 text-zinc-100 border-zinc-700'
                        : 'bg-zinc-950 text-zinc-600 border-zinc-800/80 hover:text-zinc-400'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Textarea & Send button */}
          <div className="relative bg-zinc-900 rounded-xl border border-zinc-800 focus-within:border-emerald-500/80 transition-all shadow-inner">
            <textarea
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask a question across all frontier models... (Press Cmd+Enter to dispatch)"
              className="w-full bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none"
            />

            <div className="px-3 py-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-2 text-[11px]">
                <span>DeepSeek semantic compression enabled (~50% DETAILED / ~80% SUMMARY)</span>
              </div>

              <button
                onClick={() => handleAsk()}
                disabled={!input.trim() || isRunning}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
              >
                <span>Dispatch</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
