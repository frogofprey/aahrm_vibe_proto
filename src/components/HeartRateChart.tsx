import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { HeartRateData, ZoneConfig } from '../types';

interface HeartRateChartProps {
  dataPoints: HeartRateData[];
  zones: ZoneConfig[];
}

export const HeartRateChart: React.FC<HeartRateChartProps> = ({ dataPoints, zones }) => {
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 h-[400px] relative overflow-hidden group">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent" />
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Telemetry Stream</h2>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-rose-500/20 border border-rose-500/50 rounded-sm" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live HR</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={dataPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis 
            dataKey="timestamp" 
            stroke="#475569" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            domain={[40, 200]} 
            stroke="#475569" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            ticks={[40, 60, 80, 100, 120, 140, 160, 180, 200]}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px' }}
            itemStyle={{ color: '#f1f5f9' }}
          />
          <Area 
            type="monotone" 
            dataKey="hr" 
            stroke="#f43f5e" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorHr)" 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Zone Indicators */}
      <div className="absolute right-6 top-24 flex flex-col gap-1 pointer-events-none">
        {zones.slice().reverse().map((zone, idx) => (
          <div key={idx} className="flex items-center gap-2 justify-end opacity-40 hover:opacity-100 transition-opacity">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Z{zones.length - idx}</span>
            <div className={`w-1 h-4 rounded-full ${
              idx === 0 ? 'bg-rose-500' : 
              idx === 1 ? 'bg-orange-500' : 
              idx === 2 ? 'bg-yellow-500' : 
              idx === 3 ? 'bg-emerald-500' : 'bg-sky-500'
            }`} />
          </div>
        ))}
      </div>
    </div>
  );
};
