import React, { useState, useEffect } from 'react';
import { Database, Download, RefreshCw, Search, Eye, Table } from 'lucide-react';
import { api } from '../services/api';

const TABLES = [
  { id: 'tool_session', name: 'tool_session', desc: 'Active and archived orchestrator sessions' },
  { id: 'session_mapping', name: 'session_mapping', desc: '1:1 mapping of tool session to provider conversation URLs (5 rows per session)' },
  { id: 'turn', name: 'turn', desc: 'User questions, mode decisions, and synthesized answers' },
  { id: 'agent_call', name: 'agent_call', desc: 'Granular logs of every Playwright model interaction & token counts' },
  { id: 'summary_cache', name: 'summary_cache', desc: 'SHA256-keyed semantic compression cache' },
  { id: 'provider_config', name: 'provider_config', desc: 'Chat URLs and DOM selector configurations' },
];

export const DbInspectorView: React.FC = () => {
  const [activeTable, setActiveTable] = useState('session_mapping');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedRow, setSelectedRow] = useState<any | null>(null);

  const loadTable = async (tableName: string) => {
    setLoading(true);
    try {
      const rows = await api.getTableData(tableName);
      setData(rows || []);
    } catch (err) {
      console.error(err);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTable(activeTable);
  }, [activeTable]);

  const filteredData = data.filter((row) => {
    if (!search) return true;
    const json = JSON.stringify(row).toLowerCase();
    return json.includes(search.toLowerCase());
  });

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <Database className="w-6 h-6 text-indigo-400" />
            <span>SQLite Database Inspector</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Section 4 &amp; 14.6: Live relational tables with schema enforcement, session mappings, and summary caches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadTable(activeTable)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href="/api/db/export"
            download="multi_agent_orchestrator.sql"
            className="flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export SQLite .sql Dump</span>
          </a>
        </div>
      </div>

      {/* Table selector tabs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {TABLES.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTable(t.id)}
            className={`text-left p-3 rounded-lg border transition-all ${
              activeTable === t.id
                ? 'bg-zinc-900 border-indigo-500/80 text-zinc-100 shadow-md'
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold">{t.name}</span>
              <Table className="w-3 h-3 text-zinc-500" />
            </div>
            <p className="text-[10px] text-zinc-500 mt-1 line-clamp-1">{t.desc}</p>
          </button>
        ))}
      </div>

      {/* Table search & count */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={`Search across ${activeTable}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="text-xs text-zinc-400 font-mono">
          Showing {filteredData.length} of {data.length} records
        </div>
      </div>

      {/* Table Data View */}
      <div className="bg-zinc-900/90 border border-zinc-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-16 text-center text-xs text-zinc-400">Loading SQLite data...</div>
        ) : filteredData.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500 italic">No records found in {activeTable}.</div>
        ) : (
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-left font-mono text-xs divide-y divide-zinc-800">
              <thead className="bg-zinc-950/90 sticky top-0 z-10 text-zinc-400 text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 w-10">#</th>
                  {columns.map((col) => (
                    <th key={col} className="py-2.5 px-3 uppercase tracking-wider font-semibold">
                      {col}
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2 px-3 text-zinc-500 text-[10px]">{idx + 1}</td>
                    {columns.map((col) => {
                      const val = row[col];
                      const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val ?? '');
                      return (
                        <td
                          key={col}
                          className="py-2 px-3 max-w-[260px] truncate"
                          title={valStr}
                        >
                          {col === 'status' ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] ${
                                val === 'success' || val === 'active'
                                  ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-800/40'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {val}
                            </span>
                          ) : col === 'provider' ? (
                            <span className="font-semibold text-emerald-400 uppercase">
                              {val}
                            </span>
                          ) : (
                            valStr
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 text-right">
                      <button
                        onClick={() => setSelectedRow(row)}
                        className="text-zinc-400 hover:text-indigo-400 p-1 rounded hover:bg-zinc-800 transition-colors"
                        title="View Full JSON Record"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Row JSON Inspection Modal */}
      {selectedRow && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-sm text-zinc-100 font-mono">
                {activeTable} Record Details
              </h3>
              <button
                onClick={() => setSelectedRow(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <pre className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 overflow-x-auto text-xs font-mono text-zinc-200 max-h-[70vh]">
              {JSON.stringify(selectedRow, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
