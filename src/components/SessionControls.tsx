import React from 'react';
import { Play, Square, Download, RefreshCw } from 'lucide-react';

interface SessionControlsProps {
  isSessionActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onDownload: () => void;
  onConnect: () => void;
}

export const SessionControls: React.FC<SessionControlsProps> = ({
  isSessionActive,
  onStart,
  onStop,
  onDownload,
  onConnect
}) => {
  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {!isSessionActive ? (
        <button
          onClick={onStart}
          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95 group"
        >
          <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
          <span className="uppercase tracking-widest text-sm">Initiate Session</span>
        </button>
      ) : (
        <button
          onClick={onStop}
          className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-rose-500/20 active:scale-95 group"
        >
          <Square className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
          <span className="uppercase tracking-widest text-sm">Terminate Session</span>
        </button>
      )}

      <button
        onClick={onDownload}
        className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold transition-all border border-slate-700 active:scale-95"
      >
        <Download className="w-5 h-5" />
        <span className="uppercase tracking-widest text-sm">Export Logs</span>
      </button>

      <button
        onClick={onConnect}
        className="flex items-center justify-center p-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl border border-slate-700 transition-all active:rotate-180"
        title="Reconnect Uplink"
      >
        <RefreshCw className="w-5 h-5" />
      </button>
    </div>
  );
};
