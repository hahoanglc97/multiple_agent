import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, ExternalLink, Settings, RefreshCw, KeyRound, Check, X, Chrome, Terminal } from 'lucide-react';
import { ProviderConfig } from '../types';

interface ProviderHubProps {
  providers: ProviderConfig[];
  onRefresh: () => void;
  onLogin: (name: string) => Promise<void>;
  onToggleLogin: (name: string) => Promise<void>;
  onUpdateSelectors: (name: string, selectors: any, notes?: string) => Promise<void>;
}

export const ProviderHub: React.FC<ProviderHubProps> = ({
  providers,
  onRefresh,
  onLogin,
  onToggleLogin,
  onUpdateSelectors,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [editingSelectors, setEditingSelectors] = useState<any>(null);
  const [notes, setNotes] = useState<string>('');
  const [loginModalProvider, setLoginModalProvider] = useState<ProviderConfig | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleEditClick = (provider: ProviderConfig) => {
    setSelectedProvider(provider);
    setEditingSelectors({ ...provider.selectors });
    setNotes(provider.notes || '');
  };

  const handleSaveSelectors = async () => {
    if (!selectedProvider || !editingSelectors) return;
    try {
      await onUpdateSelectors(selectedProvider.provider, editingSelectors, notes);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulateLogin = async (providerName: string) => {
    setIsLoggingIn(true);
    try {
      await onLogin(providerName);
      setLoginModalProvider(null);
      onRefresh();
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex items-start justify-between border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span>Browser Profiles & Provider Adapters</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Section 5: Playwright persistent contexts (<code className="text-zinc-300 font-mono">.browser_profiles/&lt;provider&gt;</code>) for all 5 frontier AI web interfaces without API keys.
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-lg transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Provider Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {providers.map((p) => {
          const isAuthed = p.logged_in;
          return (
            <div
              key={p.provider}
              className={`bg-zinc-900/90 border rounded-xl p-5 flex flex-col justify-between transition-all ${
                isAuthed ? 'border-zinc-800 shadow-sm' : 'border-amber-700/60 bg-amber-950/10 shadow-md'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-sm text-zinc-100">{p.name}</h3>
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wide">
                      {p.provider}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium border ${
                      isAuthed
                        ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60'
                        : 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                    }`}
                  >
                    {isAuthed ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Authenticated</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="w-3 h-3 text-amber-400" />
                        <span>Login Required</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-zinc-400 my-4 bg-zinc-950/70 p-3 rounded-lg border border-zinc-800/80 font-mono">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Chat URL:</span>
                    <a
                      href={p.chat_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-zinc-300 hover:text-emerald-400 truncate max-w-[180px] flex items-center gap-1"
                    >
                      <span>{p.chat_url}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Profile Dir:</span>
                    <span className="text-zinc-400">.browser_profiles/{p.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500">Updated:</span>
                    <span className="text-zinc-500">{new Date(p.updated_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <p className="text-xs text-zinc-400 italic mb-4 leading-relaxed">
                  {p.notes}
                </p>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleEditClick(p)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors border border-zinc-700/60"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>Selectors</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onToggleLogin(p.provider)}
                    title="Toggle auth state to test LoginRequiredError handling (§10)"
                    className="px-2 py-1.5 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded border border-zinc-700/40"
                  >
                    Toggle
                  </button>

                  {!isAuthed && (
                    <button
                      onClick={() => setLoginModalProvider(p)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-200 bg-amber-600 hover:bg-amber-500 rounded-md shadow-sm transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Manual Login</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Manual Login Modal (§5.5) */}
      {loginModalProvider && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Chrome className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-zinc-100">
                    Authenticate {loginModalProvider.name}
                  </h3>
                  <p className="text-xs text-zinc-400">Playwright Persistent Headed Context (§5.5)</p>
                </div>
              </div>
              <button
                onClick={() => setLoginModalProvider(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-zinc-300 space-y-2">
              <p>
                As required in Section 5.5 of the instructions:
              </p>
              <ul className="list-disc list-inside text-zinc-400 space-y-1">
                <li>Automated credential injection is prohibited.</li>
                <li>Persistent context loads from <code className="text-zinc-300 font-mono">.browser_profiles/{loginModalProvider.provider}</code>.</li>
                <li>Session cookies and tokens persist locally in SQLite and Chromium state.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                onClick={() => setLoginModalProvider(null)}
                className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSimulateLogin(loginModalProvider.provider)}
                disabled={isLoggingIn}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {isLoggingIn ? 'Launching Headed Browser...' : 'Open Browser & Complete Authentication'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selectors Configuration Editor Modal (§5.4) */}
      {selectedProvider && editingSelectors && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-base text-zinc-100 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>DOM Selectors: {selectedProvider.name}</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Section 5.4: Configurable runtime DOM selectors stored in SQLite table <code className="text-zinc-300 font-mono">provider_config</code>.
                </p>
              </div>
              <button
                onClick={() => setSelectedProvider(null)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs max-h-[60vh] overflow-y-auto pr-1">
              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">input_box:</label>
                <input
                  type="text"
                  value={editingSelectors.input_box || ''}
                  onChange={(e) => setEditingSelectors({ ...editingSelectors, input_box: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">send_button:</label>
                <input
                  type="text"
                  value={editingSelectors.send_button || ''}
                  onChange={(e) => setEditingSelectors({ ...editingSelectors, send_button: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">stop_button:</label>
                <input
                  type="text"
                  value={editingSelectors.stop_button || ''}
                  onChange={(e) => setEditingSelectors({ ...editingSelectors, stop_button: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">new_chat_button:</label>
                <input
                  type="text"
                  value={editingSelectors.new_chat_button || ''}
                  onChange={(e) => setEditingSelectors({ ...editingSelectors, new_chat_button: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">last_message_container:</label>
                <input
                  type="text"
                  value={editingSelectors.last_message_container || ''}
                  onChange={(e) => setEditingSelectors({ ...editingSelectors, last_message_container: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 block mb-1">Notes / Version overrides:</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
              {saveSuccess ? (
                <span className="text-xs text-emerald-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Saved to SQLite DB
                </span>
              ) : (
                <span className="text-[11px] text-zinc-500">Stored in provider_config</span>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedProvider(null)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSelectors}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors"
                >
                  Save Selectors
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
