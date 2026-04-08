import React from 'react';
import { Heart } from 'lucide-react';

interface HeartRateDisplayProps {
  currentHR: number | null;
  hrTrend: string;
}

export const HeartRateDisplay: React.FC<HeartRateDisplayProps> = ({ currentHR, hrTrend }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />
      
      <div className="flex items-center gap-2 mb-2">
        <Heart className={`w-4 h-4 text-rose-500 ${currentHR ? 'animate-pulse' : ''}`} />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Heart Rate</span>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-7xl font-mono font-black text-slate-100 tracking-tighter tabular-nums">
          {currentHR || '--'}
        </span>
        <span className="text-xl font-bold text-slate-500 uppercase tracking-tight">BPM</span>
      </div>

      <div className="mt-4 flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-full border border-slate-700/50">
        <div className={`w-1.5 h-1.5 rounded-full ${
          hrTrend.includes('Increase') ? 'bg-emerald-400 animate-pulse' : 
          hrTrend.includes('Decrease') ? 'bg-rose-400 animate-pulse' : 'bg-slate-500'
        }`} />
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trend: {hrTrend}</span>
      </div>
    </div>
  );
};
