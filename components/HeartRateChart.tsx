
import React, { useMemo } from 'react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Area, 
  AreaChart 
} from 'recharts';
import { HeartRateData, ZoneConfig } from '../types';

interface HeartRateChartProps {
  data: HeartRateData[];
  activeColor?: string;
  age: number;
  zones: ZoneConfig[];
}

const HeartRateChart: React.FC<HeartRateChartProps> = ({ data, activeColor = '#ff003c', age, zones }) => {
  // Calculate dynamic domain
  const yDomain = useMemo(() => {
    if (data.length === 0) return [60, 200];
    
    const hrs = data.map(d => d.hr);
    const minHR = Math.min(...hrs);
    const maxHR = Math.max(...hrs);
    
    // Default range is 60 to Max Biological Heart Rate (220-age)
    const biologicalMax = 220 - age;
    
    // Ensure we start at 60 but drop if data goes lower
    const floor = Math.min(60, minHR - 5);
    
    // Ensure we see the zones, but expand if data exceeds them
    const ceiling = Math.max(biologicalMax, maxHR + 10);
    
    return [floor, ceiling];
  }, [data, age]);

  return (
    <div className="h-[460px] w-full p-4 bg-slate-950/40 aether-border backdrop-blur-sm relative">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs uppercase tracking-widest text-slate-400 font-bold">
          Temporal Bio-Feedback Stream // Scale: {Math.round(yDomain[0])}-{Math.round(yDomain[1])}
        </h2>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: activeColor }}></div>
             <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: activeColor }}>Data Relay Active</span>
           </div>
           <div className="h-3 w-px bg-white/10" />
           <span className="text-[9px] text-slate-600 font-mono uppercase">Floor: 60 BPM</span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={activeColor} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={activeColor} stopOpacity={0}/>
            </linearGradient>
            {/* Background reference zones */}
            {zones.map((z, idx) => (
              <linearGradient key={`zone-${idx}`} id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={z.color} stopOpacity={0.05}/>
                <stop offset="100%" stopColor={z.color} stopOpacity={0}/>
              </linearGradient>
            ))}
          </defs>
          
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
          
          <XAxis 
            dataKey="timestamp" 
            stroke="#475569" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false}
            minTickGap={40}
          />
          
          <YAxis 
            stroke="#475569" 
            fontSize={10} 
            tickLine={false} 
            axisLine={false} 
            domain={yDomain}
            allowDataOverflow={false}
          />
          
          <Tooltip 
            contentStyle={{ backgroundColor: '#0f172a', borderColor: activeColor, borderRadius: '2px', fontSize: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
            itemStyle={{ color: activeColor }}
            cursor={{ stroke: activeColor, strokeWidth: 1 }}
          />
          
          <Area 
            type="monotone" 
            dataKey="hr" 
            stroke={activeColor} 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorHr)" 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Visual baseline marker */}
      <div className="absolute left-12 right-4 bottom-[44px] border-t border-white/5 pointer-events-none" />
    </div>
  );
};

export default HeartRateChart;
