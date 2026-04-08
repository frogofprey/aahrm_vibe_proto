import React from 'react';
import { Flame, Zap, CheckCircle, Clock } from 'lucide-react';

interface MetricsGridProps {
  calories: number;
  heartPoints: number;
  compliantMinutes: number;
  performanceMinutes: number;
  intervalCount: number;
  intervalCountGoal: number;
  isIntervalStrategy: boolean;
}

export const MetricsGrid: React.FC<MetricsGridProps> = ({
  calories,
  heartPoints,
  compliantMinutes,
  performanceMinutes,
  intervalCount,
  intervalCountGoal,
  isIntervalStrategy
}) => {
  const compliancePercent = performanceMinutes > 0 
    ? Math.round((compliantMinutes / performanceMinutes) * 100) 
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center group hover:border-orange-500/30 transition-colors">
        <div className="p-2 bg-orange-500/10 rounded-lg mb-2 group-hover:scale-110 transition-transform">
          <Flame className="w-4 h-4 text-orange-400" />
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Calories</span>
        <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">{Math.round(calories)}</span>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center group hover:border-emerald-500/30 transition-colors">
        <div className="p-2 bg-emerald-500/10 rounded-lg mb-2 group-hover:scale-110 transition-transform">
          <Zap className="w-4 h-4 text-emerald-400" />
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Heart Points</span>
        <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">{heartPoints}</span>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center group hover:border-indigo-500/30 transition-colors">
        <div className="p-2 bg-indigo-500/10 rounded-lg mb-2 group-hover:scale-110 transition-transform">
          <CheckCircle className="w-4 h-4 text-indigo-400" />
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Compliance</span>
        <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">{compliancePercent}%</span>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center group hover:border-sky-500/30 transition-colors">
        <div className="p-2 bg-sky-500/10 rounded-lg mb-2 group-hover:scale-110 transition-transform">
          <Clock className="w-4 h-4 text-sky-400" />
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
          {isIntervalStrategy ? 'Intervals' : 'Active Mins'}
        </span>
        <span className="text-2xl font-mono font-bold text-slate-100 tabular-nums">
          {isIntervalStrategy ? `${intervalCount}/${intervalCountGoal}` : Math.floor(performanceMinutes)}
        </span>
      </div>
    </div>
  );
};
