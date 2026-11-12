import React, { useRef, useEffect } from 'react';
import { Loader2, CheckCircle2, AlertTriangle, Zap, GitCommit, Split, Cpu, ShieldAlert } from 'lucide-react';
import { ProgressEvent } from '../types';

interface LiveProgressPanelProps {
  events: ProgressEvent[];
  isRunning: boolean;
  onDismiss: () => void;
}

export const LiveProgressPanel: React.FC<LiveProgressPanelProps> = ({ events, isRunning, onDismiss }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const latestPhase = [...events].reverse().find((e) => e.type === 'phase')?.phase || 'Initializing browser automation pool...';
  const hasError = events.some((e) => e.type === 'error');
  const isDone = events.some((e) => e.type === 'done');

  // Extract active agents
  const activeProviders = Array.from(
    new Set(events.filter((e) => e.provider).map((e) => e.provider as string))
  );

  return (
    <div className="my-4 border border-zinc-700/80 rounded-xl bg-zinc-900/95 overflow-hidden shadow-xl transition-all">
      {/* Header bar */}
      <div className="px-4 py-3 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {isRunning ? (
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
          ) : hasError ? (
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          )}

          <div>
            <span className="text-xs font-semibold text-zinc-200">
              {isRunning ? 'Multi-Agent Orchestration in Progress' : hasError ? 'Orchestration Paused' : 'Orchestration Pipeline Complete'}
            </span>
            <span className="text-[11px] text-zinc-400 ml-2 font-mono">
              {events.length} stream events
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeProviders.map((p) => (
            <span
              key={p}
              className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-300 uppercase"
            >
              {p}
            </span>
          ))}

          {!isRunning && (
            <button
              onClick={onDismiss}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* Current phase banner */}
      <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-zinc-300 font-medium">{latestPhase}</span>
        </div>
      </div>

      {/* Stream output terminal */}
      <div
        ref={scrollRef}
        className="p-3 max-h-56 overflow-y-auto space-y-2 font-mono text-[11px] text-zinc-300 bg-zinc-950/90"
      >
        {events.map((ev, idx) => {
          if (ev.type === 'phase') {
            return (
              <div key={idx} className="flex items-start gap-2 text-emerald-400/90">
                <GitCommit className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                <span>{ev.phase}</span>
              </div>
            );
          }
          if (ev.type === 'compression') {
            return (
              <div key={idx} className="flex items-start gap-2 text-cyan-300">
                <Cpu className="w-3 h-3 mt-0.5 shrink-0 text-cyan-400" />
                <span>{ev.phase}</span>
              </div>
            );
          }
          if (ev.type === 'agent_start') {
            return (
              <div key={idx} className="flex items-start gap-2 text-zinc-400">
                <span className="text-zinc-500">[{ev.provider?.toUpperCase()} · {ev.role}]</span>
                <span>{ev.phase}</span>
              </div>
            );
          }
          if (ev.type === 'agent_chunk') {
            return (
              <div key={idx} className="pl-5 text-zinc-400 border-l border-zinc-800 truncate">
                <span className="text-zinc-500">chunk:</span> {ev.content?.slice(-120)}
              </div>
            );
          }
          if (ev.type === 'agent_done') {
            return (
              <div key={idx} className="flex items-start gap-2 text-emerald-300">
                <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                <span>
                  [{ev.provider?.toUpperCase()} · {ev.role}] Complete. Tokens In: {ev.metadata?.tokenIn}, Out: {ev.metadata?.tokenOut}
                </span>
              </div>
            );
          }
          if (ev.type === 'error') {
            return (
              <div key={idx} className="flex items-start gap-2 text-rose-400 bg-rose-950/20 p-2 rounded border border-rose-800/40">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-rose-400" />
                <span>{ev.content}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
};
