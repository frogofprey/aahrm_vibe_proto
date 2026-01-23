
import React, { useRef } from 'react';

interface LogEntry {
  id: number;
  message: string;
  timestamp: string;
}

interface DebugLogProps {
  logs: LogEntry[];
  onClose?: () => void;
}

const DebugLog: React.FC<DebugLogProps> = ({ logs, onClose }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full flex flex-col h-[350px] bg-black border-t border-[#ff003c]/40 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-slate-900/40">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-[#ff003c] rounded-full shadow-[0_0_5px_#ff003c]"></div>
          <span className="text-[10px] uppercase tracking-[0.3em] font-black text-white">System Console // Active Uplink</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Buffer: {logs.length}/100</span>
          {onClose && (
            <button 
              onClick={onClose}
              className="text-slate-500 hover:text-[#ff003c] transition-colors"
              title="Close Panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-[#050608]"
      >
        {logs.length === 0 ? (
          <div className="text-slate-700 italic h-full flex items-center justify-center uppercase tracking-widest text-[10px]">
            Waiting for biometric synchronization...
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="group flex gap-3 border-l-2 border-transparent hover:border-[#ff003c]/40 hover:bg-white/[0.02] pl-2 transition-colors">
              <span className="text-slate-600 flex-shrink-0 select-none">[{log.timestamp}]</span>
              <span className={`break-all whitespace-pre-wrap ${log.message.startsWith('SYSTEM') ? 'text-blue-400 font-bold' : log.message.startsWith('ERROR') || log.message.startsWith('FATAL') ? 'text-red-500' : log.message.includes('[DEBUG_PROMPT_START]') ? 'text-amber-500 font-bold' : 'text-slate-300'}`}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
      
      <div className="px-6 py-2 bg-slate-900/80 flex justify-between items-center border-t border-white/5">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
            <span className="text-[8px] text-slate-500 uppercase tracking-tighter">System Info</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
            <span className="text-[8px] text-slate-500 uppercase tracking-tighter">Raw Data</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 bg-amber-500 rounded-full"></div>
            <span className="text-[8px] text-slate-500 uppercase tracking-tighter">Prompt Trace</span>
          </div>
        </div>
        <span className="text-[8px] text-slate-600 font-bold uppercase tracking-[0.2em]">AES-256 Link Active</span>
      </div>
    </div>
  );
};

export default DebugLog;
