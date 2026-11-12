import React, { useState } from 'react';
import { User, Bot, Clock, ChevronDown, ChevronUp, Cpu, MessageSquare, Layers, ShieldCheck, Check, AlertCircle } from 'lucide-react';
import { Turn, AgentCall } from '../types';

interface TurnCardProps {
  turn: Turn;
}

export const TurnCard: React.FC<TurnCardProps> = ({ turn }) => {
  const [showTranscript, setShowTranscript] = useState(false);
  const [activeTranscriptTab, setActiveTranscriptTab] = useState<'round1' | 'compression' | 'critiques' | 'agent_calls'>('round1');

  const calls = turn.agent_calls || [];
  const round1Calls = calls.filter((c) => c.role === 'answer');
  const compressionCalls = calls.filter((c) => c.role === 'summarize');
  const critiqueCalls = calls.filter((c) => c.role === 'critique');
  const judgeCalls = calls.filter((c) => c.role === 'judge' || c.role === 'synthesis');

  const totalTokensIn = calls.reduce((acc, c) => acc + (c.token_est_in || 0), 0);
  const totalTokensOut = calls.reduce((acc, c) => acc + (c.token_est_out || 0), 0);

  // Format mode color
  const modeColors: Record<string, string> = {
    DEBATE: 'text-purple-400 bg-purple-950/40 border-purple-800/50',
    PARALLEL: 'text-blue-400 bg-blue-950/40 border-blue-800/50',
    VERIFY: 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50',
    SINGLE: 'text-zinc-400 bg-zinc-900 border-zinc-800',
  };

  return (
    <div className="space-y-4 my-6">
      {/* 1. User Input Box */}
      <div className="flex items-start gap-3 bg-zinc-900/60 border border-zinc-800/90 rounded-xl p-4">
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-300 shrink-0">
          <User className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-zinc-300">You</span>
            <div className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span>{new Date(turn.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <span aria-hidden="true">·</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${modeColors[turn.mode] || modeColors.SINGLE}`}>
                {turn.mode} Mode
              </span>
            </div>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed font-sans">{turn.user_input}</p>
        </div>
      </div>

      {/* 2. Orchestrated Response Box */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
        {/* Top meta strip */}
        <div className="px-5 py-3 bg-zinc-950/80 border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Bot className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-semibold text-zinc-200">ChatGPT Orchestrator Brain</span>
              <span className="text-zinc-500 text-[11px] ml-2 font-mono">
                Participants: {turn.participants.join(', ')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span>{(turn.duration_ms / 1000).toFixed(1)}s</span>
            </div>
            <span aria-hidden="true">·</span>
            <span>{totalTokensIn + totalTokensOut} tokens</span>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              <span>{showTranscript ? 'Hide Debate Transcript' : 'View Debate Transcript'}</span>
              {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Final Synthesized Content */}
        <div className="p-5 text-sm leading-relaxed text-zinc-200 prose prose-invert max-w-none">
          <div className="whitespace-pre-wrap font-sans space-y-3">
            {turn.final_answer}
          </div>
        </div>

        {/* 3. Expandable Debate Transcript & Agent Calls Viewer */}
        {showTranscript && (
          <div className="border-t border-zinc-800 bg-zinc-950/95 p-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
              <div className="flex items-center gap-2 text-xs">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-zinc-200">Orchestration & Debate Pipeline Inspector</span>
              </div>

              {/* Subtabs */}
              <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
                <button
                  onClick={() => setActiveTranscriptTab('round1')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeTranscriptTab === 'round1' ? 'bg-zinc-800 text-zinc-100 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Round 1 Answers ({round1Calls.length})
                </button>
                <button
                  onClick={() => setActiveTranscriptTab('compression')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeTranscriptTab === 'compression' ? 'bg-zinc-800 text-cyan-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Compression ({compressionCalls.length})
                </button>
                <button
                  onClick={() => setActiveTranscriptTab('critiques')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeTranscriptTab === 'critiques' ? 'bg-zinc-800 text-purple-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Round 2 Critiques ({critiqueCalls.length})
                </button>
                <button
                  onClick={() => setActiveTranscriptTab('agent_calls')}
                  className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                    activeTranscriptTab === 'agent_calls' ? 'bg-zinc-800 text-indigo-300 font-medium' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Raw Agent Calls ({calls.length})
                </button>
              </div>
            </div>

            {/* Subtab Contents */}
            {activeTranscriptTab === 'round1' && (
              <div className="space-y-3">
                <div className="text-[11px] text-zinc-400">
                  Each participant model answered the user question independently via its persistent Playwright browser session:
                </div>
                {round1Calls.map((call) => (
                  <div key={call.id} className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-mono font-semibold text-emerald-400 uppercase">
                        {call.provider}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        Tokens: {call.token_est_out} out · Status: {call.status}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                      {call.response_text}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeTranscriptTab === 'compression' && (
              <div className="space-y-3">
                <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>
                    DeepSeek semantic compressor filtered filler & hedging, maintaining core conclusions & facts:
                  </span>
                  <span className="text-cyan-400 font-mono text-[10px]">
                    SHA256 Cache Active
                  </span>
                </div>
                {compressionCalls.length === 0 ? (
                  <div className="text-xs text-zinc-500 italic py-2">
                    No compression required for this mode.
                  </div>
                ) : (
                  compressionCalls.map((call) => {
                    const saved = Math.max(0, (call.token_est_in || 0) - (call.token_est_out || 0));
                    const ratio = call.token_est_in ? Math.round((saved / call.token_est_in) * 100) : 0;
                    return (
                      <div key={call.id} className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-mono font-semibold text-cyan-400 uppercase">
                            DeepSeek Compression
                          </span>
                          <span className="text-[10px] text-cyan-300 font-mono">
                            {ratio}% Tokens Saved ({saved} tokens saved)
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500 mb-1 font-mono truncate">
                          Prompt: {call.prompt_sent}
                        </div>
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap bg-zinc-950/70 p-2 rounded border border-zinc-800">
                          {call.response_text}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTranscriptTab === 'critiques' && (
              <div className="space-y-3">
                <div className="text-[11px] text-zinc-400">
                  Round 2: Models reviewed each other's compressed perspectives and offered counter-arguments:
                </div>
                {critiqueCalls.length === 0 ? (
                  <div className="text-xs text-zinc-500 italic py-2">
                    No critiques in this mode.
                  </div>
                ) : (
                  critiqueCalls.map((call) => (
                    <div key={call.id} className="p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono font-semibold text-purple-400 uppercase">
                          {call.provider} Critique
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {call.token_est_out} tokens
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {call.response_text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTranscriptTab === 'agent_calls' && (
              <div className="space-y-2">
                <div className="text-[11px] text-zinc-400">
                  SQLite <code className="text-indigo-300 font-mono">agent_call</code> records persisted for this turn (§4.4):
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-500">
                        <th className="py-1.5 px-2">Provider</th>
                        <th className="py-1.5 px-2">Role</th>
                        <th className="py-1.5 px-2">Tokens In/Out</th>
                        <th className="py-1.5 px-2">Status</th>
                        <th className="py-1.5 px-2">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {calls.map((call) => (
                        <tr key={call.id} className="hover:bg-zinc-900/60">
                          <td className="py-1.5 px-2 font-semibold text-zinc-200 uppercase">{call.provider}</td>
                          <td className="py-1.5 px-2 text-zinc-400">{call.role}</td>
                          <td className="py-1.5 px-2 text-zinc-400">{call.token_est_in} / {call.token_est_out}</td>
                          <td className="py-1.5 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              call.status === 'success' ? 'text-emerald-400 bg-emerald-950/40' : 'text-rose-400 bg-rose-950/40'
                            }`}>
                              {call.status}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-zinc-500">
                            {new Date(call.started_at).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
