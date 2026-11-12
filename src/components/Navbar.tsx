import React from 'react';
import { Layers, ShieldCheck, Database, FileCode, AlertCircle, Bot } from 'lucide-react';
import { ProviderConfig } from '../types';

interface NavbarProps {
  activeTab: 'workspace' | 'providers' | 'database' | 'code';
  setActiveTab: (tab: 'workspace' | 'providers' | 'database' | 'code') => void;
  providers: ProviderConfig[];
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, providers }) => {
  const unauthenticatedProviders = providers.filter((p) => !p.logged_in);

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-semibold text-sm tracking-wide text-zinc-100">
              Multi-Agent Web UI Orchestrator
            </h1>
            <span className="text-[11px] text-zinc-500 font-mono">v1.0</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span>Playwright Browser Automation</span>
            <span aria-hidden="true">·</span>
            <span>ChatGPT Brain</span>
            <span aria-hidden="true">·</span>
            <span>Zero API Keys</span>
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg border border-zinc-800">
        <button
          onClick={() => setActiveTab('workspace')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'workspace'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
          <span>Orchestration Studio</span>
        </button>

        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'providers'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
          <span>Provider Profiles</span>
          {unauthenticatedProviders.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Login required" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'database'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span>SQLite Tables</span>
        </button>

        <button
          onClick={() => setActiveTab('code')}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            activeTab === 'code'
              ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
          }`}
        >
          <FileCode className="w-3.5 h-3.5 text-amber-400" />
          <span>Python Playwright Repo</span>
        </button>
      </nav>

      <div className="flex items-center gap-3">
        {unauthenticatedProviders.length > 0 ? (
          <button
            onClick={() => setActiveTab('providers')}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 rounded-md hover:bg-amber-900/40 transition-colors"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>{unauthenticatedProviders.length} Login Required</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded-md">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>All 5 Providers Active</span>
          </div>
        )}
      </div>
    </header>
  );
};
