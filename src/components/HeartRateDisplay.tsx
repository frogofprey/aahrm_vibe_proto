import React from 'react';
import { ZoneConfig } from '../types';

interface HeartRateDisplayProps {
  hr: number | null;
  zone: ZoneConfig | null;
  elapsedTime: string;
  activeTime: string;
  latestInsight?: string;
  isFullScreen?: boolean;
  hrTrend?: string;
  intervalCount?: number;
  compliantMinutes?: number;
  performanceMinutes?: number;
  complianceThresholdPct?: number;
}

const HeartRateDisplay: React.FC<HeartRateDisplayProps> = ({ 
  hr, 
  zone, 
  elapsedTime, 
  activeTime, 
  latestInsight, 
  isFullScreen, 
  hrTrend, 
  intervalCount,
  compliantMinutes = 0,
  performanceMinutes = 0,
  complianceThresholdPct = 80
}) => {
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
        <div className="flex flex-col">
          <span className={`text-2xl font-bold uppercase transition-colors duration-500 ${zone ? zone.textClass : 'text-slate-700'}`}>BPM</span>
          {hrTrend && (
            <span className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${
              hrTrend.includes('Increase') ? 'text-red-500' : 
              hrTrend.includes('Decrease') ? 'text-blue-500' : 
              'text-slate-500'
            }`}>
              {hrTrend}
            </span>
          )}
        </div>
      </div>

      {/* Session Timer */}
      <div className="mt-6 z-10 flex flex-col items-center">
        <span className="text-[9px] text-slate-500 uppercase tracking-[0.2em] mb-1">Session Timer</span>
        <div className={`text-xl font-mono font-bold tracking-widest ${elapsedTime !== "00:00:00" ? 'text-white' : 'text-slate-600'}`}>
            {elapsedTime}
        </div>
        {activeTime !== "00:00" && (
          <div className="mt-2 flex flex-col items-center">
            <span className="text-[9px] text-cyan-500/70 uppercase tracking-[0.2em] mb-1">Active Time</span>
            <div className="text-2xl font-mono font-bold tracking-widest text-cyan-400">
                {activeTime}
            </div>
          </div>
        )}
        {intervalCount !== undefined && intervalCount > 0 && (
          <div className="mt-2 flex flex-col items-center">
            <span className="text-[9px] text-orange-500/70 uppercase tracking-[0.2em] mb-1">Intervals</span>
            <div className="text-2xl font-mono font-bold tracking-widest text-orange-400">
                {intervalCount}
            </div>
          </div>
        )}

        {/* Live Compliance HUD (Full Screen & Debugging) */}
        {isFullScreen && (
          <div className="mt-4 flex flex-col items-center bg-black/40 border border-slate-800/80 px-4 py-2 rounded-sm backdrop-blur-md">
            <span className="text-[9px] text-slate-500 uppercase tracking-[0.2em] mb-1">Live Compliance (HUD)</span>
            <div className="flex items-center gap-2 font-mono">
              {(() => {
                const ratioPct = performanceMinutes > 0 ? (compliantMinutes / performanceMinutes) * 100 : 100;
                const isPassing = ratioPct >= complianceThresholdPct;
                return (
                  <>
                    <span className={`text-xs px-2 py-0.5 rounded-xs font-bold uppercase tracking-wider ${
                      isPassing ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {performanceMinutes === 0 ? 'READY' : (isPassing ? 'PASS' : 'FAIL')}
                    </span>
                    <span className="text-sm font-bold text-slate-300">
                      {compliantMinutes.toFixed(1)} / {performanceMinutes.toFixed(1)} min
                    </span>
                    <span className={`text-xs font-semibold ${isPassing ? 'text-emerald-400' : 'text-red-400'}`}>
                      ({performanceMinutes > 0 ? ratioPct.toFixed(1) : '100.0'}%)
                    </span>
                    <span className="text-[10px] text-slate-600">
                      [Goal: &ge;{complianceThresholdPct}%]
                    </span>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Full Screen Insight Overlay */}
      {isFullScreen && latestInsight && (
        <div className="mt-6 z-10 max-w-4xl text-center px-6 animate-pulse duration-[3000ms]">
          <div className="text-sm md:text-base text-cyan-500/70 uppercase tracking-widest mb-3 font-bold">
            {latestInsight === 'Awaiting Feedback' ? 'Analyst Uplink // Syncing' : 'Analyst Uplink'}
          </div>
          <p className={`text-3xl md:text-4xl font-medium ${latestInsight === 'Awaiting Feedback' ? 'not-italic font-mono text-cyan-400 flex items-center justify-center gap-3' : `italic leading-relaxed ${zone ? zone.textClass : 'text-slate-300'}`} transition-colors duration-500`}>
            {latestInsight === 'Awaiting Feedback' ? (
              <>
                <span className="inline-block w-4 h-4 rounded-full bg-cyan-400 animate-ping mr-2" />
                Awaiting Feedback
              </>
            ) : (
              `"${latestInsight}"`
            )}
          </p>
        </div>
      )}

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