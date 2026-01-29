
import React from 'react';
import { ZoneConfig } from '../types';

interface HeartRateDisplayProps {
  hr: number | null;
  zone: ZoneConfig | null;
  elapsedTime: string;
}

const HeartRateDisplay: React.FC<HeartRateDisplayProps> = ({ hr, zone, elapsedTime }) => {
  const displayValue = hr !== null ? hr : '--';
  
  // Neutral fallbacks for when no zone is matched or no data is present
  const defaultBorder = 'border-slate-800';
  const defaultGlow = 'shadow-none';
  const defaultLabel = 'Live Heart Rate (BPM)';
  const defaultTextColor = 'text-slate-700';

  // Pulse duration calculation: 60 / HR
  const pulseDuration = hr && hr > 0 ? `${60 / hr}s` : '1.5s';

  return (
    <div className={`h-full flex flex-col justify-center items-center p-8 bg-slate-950/40 border transition-all duration-700 backdrop-blur-sm relative overflow-hidden
      ${zone ? zone.borderClass : defaultBorder} 
      ${zone ? zone.glowClass : defaultGlow}`}
    >
      {/* Dynamic Background Accent */}
      {zone && (
        <div 
          className="absolute inset-0 opacity-5 transition-opacity duration-1000"
          style={{ background: `radial-gradient(circle at center, ${zone.color} 0%, transparent 70%)` }}
        />
      )}

      {/* Visceral Pulse Icon */}
      <div className="absolute top-6 right-6 z-20">
        <div 
          className="w-4 h-4 rounded-full animate-heartbeat"
          style={{ 
            backgroundColor: zone ? zone.color : (hr ? '#ff003c' : '#1e293b'),
            animationDuration: pulseDuration,
            boxShadow: `0 0 10px ${zone ? zone.color : '#ff003c'}`
          }}
        />
      </div>

      <div className={`text-xs uppercase tracking-widest font-bold mb-4 z-10 transition-colors duration-500 ${zone ? zone.textClass : 'text-slate-500 opacity-70'}`}>
        {zone ? zone.label : defaultLabel}
      </div>
      
      <div className="flex items-baseline gap-2 z-10">
        <span className={`text-9xl font-black font-mono tracking-tighter transition-all duration-500 ${hr !== null ? (zone ? 'text-white' : 'text-slate-400') : defaultTextColor}`}>
          {displayValue}
        </span>
        <span className={`text-2xl font-bold uppercase transition-colors duration-500 ${zone ? zone.textClass : 'text-slate-700'}`}>BPM</span>
      </div>

      {/* Session Timer */}
      <div className="mt-6 z-10 flex flex-col items-center">
        <span className="text-[9px] text-slate-500 uppercase tracking-[0.2em] mb-1">Session Timer</span>
        <div className={`text-xl font-mono font-bold tracking-widest ${elapsedTime !== "00:00:00" ? 'text-white' : 'text-slate-600'}`}>
            {elapsedTime}
        </div>
      </div>

      <div className="mt-8 flex gap-2 w-full max-w-[200px] z-10">
        {[...Array(12)].map((_, i) => (
          <div 
            key={i} 
            className="h-1 flex-1 transition-all duration-300" 
            style={{ 
              backgroundColor: hr && hr > 0 && i < (hr/15) ? (zone ? zone.color : '#334155') : '#0f172a' 
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default HeartRateDisplay;
