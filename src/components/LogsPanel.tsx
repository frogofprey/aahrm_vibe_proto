import React from 'react';
import { Terminal, Cpu } from 'lucide-react';

interface LogsPanelProps {
  logs: { id: number; message: string; timestamp: string }[];
  showSystemLogs: boolean;
  onToggleSystemLogs: () => void;
}

export const LogsPanel: React.FC<LogsPanelProps> = ({ logs, showSystemLogs, onToggleSystemLogs }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col h-[600px]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Console</h2>
        </div>
        <button 
          onClick={onToggleSystemLogs}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
            showSystemLogs 
              ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}
        >
          <Cpu className="w-3 h-3" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Verbose</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px] pr-2 custom-scrollbar">
        {logs.map((log) => {
          const isAi = log.message.startsWith('AI_') || log.message.startsWith('TELEMETRY');
          const isError = log.message.startsWith('ERROR');
          const isState = log.message.startsWith('STATE_CHANGE');
          
          return (
            <div key={log.id} className={`group flex gap-3 p-2 rounded border transition-colors ${
              isError ? 'bg-rose-500/5 border-rose-500/10 text-rose-400' :
              isAi ? 'bg-indigo-500/5 border-indigo-500/10 text-indigo-300' :
              isState ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300' :
              'bg-slate-800/30 border-slate-700/30 text-slate-400'
            }`}>
              <span className="opacity-30 select-none shrink-0">{log.timestamp}</span>
              <span className="break-all">{log.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
