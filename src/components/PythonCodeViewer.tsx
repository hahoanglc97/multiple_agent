import React, { useState } from 'react';
import { FileCode, Copy, Check, FolderTree, Terminal } from 'lucide-react';
import { PYTHON_CODEBASE, PythonFile } from '../data/pythonCodebase';

export const PythonCodeViewer: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<PythonFile>(PYTHON_CODEBASE[0]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <FileCode className="w-6 h-6 text-amber-400" />
            <span>Python Playwright Orchestrator Codebase</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Section 3: Production repository structure with async Playwright adapters, SQLite session mapping, and semantic summarizer.
          </p>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 rounded-lg text-xs font-medium transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy File Code</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* File tree sidebar */}
        <div className="md:col-span-1 bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 px-2 py-1.5 border-b border-zinc-800/80 mb-2">
            <FolderTree className="w-3.5 h-3.5 text-amber-400" />
            <span>Repository Files</span>
          </div>

          {PYTHON_CODEBASE.map((file) => {
            const isSelected = selectedFile.path === file.path;
            return (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono transition-all ${
                  isSelected
                    ? 'bg-zinc-800 text-amber-300 font-semibold shadow-sm border border-zinc-700/60'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`}
              >
                <div className="truncate">{file.path}</div>
              </button>
            );
          })}
        </div>

        {/* Code view */}
        <div className="md:col-span-3 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden shadow-xl flex flex-col">
          <div className="bg-zinc-900/90 px-4 py-2.5 border-b border-zinc-800 flex items-center justify-between text-xs font-mono">
            <span className="text-zinc-200 font-semibold">{selectedFile.path}</span>
            <span className="text-zinc-500">{selectedFile.description}</span>
          </div>

          <pre className="p-5 overflow-x-auto font-mono text-xs text-zinc-300 leading-relaxed max-h-[650px] bg-zinc-950">
            <code>{selectedFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
