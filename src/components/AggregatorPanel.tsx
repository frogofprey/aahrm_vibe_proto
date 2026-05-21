import React from 'react';
import { MinuteSummary } from '../types';

interface AggregatorPanelProps {
  summaries: MinuteSummary[];
  introText?: string | null;
  finalReportText?: string | null;
}

const AggregatorPanel: React.FC<AggregatorPanelProps> = ({ summaries, introText, finalReportText }) => {
  return (
    <div className="w-full bg-slate-950/40 border border-cyan-500/30 p-4 rounded-sm backdrop-blur-sm relative overflow-hidden">
      {/* Visual Accent */}
      <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
      
      <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-2">
        <h2 className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-black">
          Aggregated Biometric Summaries // Bio-Analyst Engine
        </h2>
        <div className="flex items-center gap-4">
          <span className="text-[9px] text-cyan-600 font-mono uppercase tracking-widest animate-pulse">
            {summaries.length === 0 ? "DIAGNOSTIC_MODE_ACTIVE" : "NOMINAL_UPLINK"}
          </span>
          <span className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">
            History: {summaries.length}/3
          </span>
        </div>
      </div>

      <div className="space-y-4 font-mono">
        {finalReportText && (
           <div className="flex flex-col p-4 bg-emerald-500/5 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] gap-3 mb-4 animate-in fade-in slide-in-from-top-2 duration-700">
               <div className="flex items-center justify-between border-b border-emerald-500/10 pb-2">
                   <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">MISSION DEBRIEF</span>
                   <span className="text-[9px] text-emerald-700 font-mono uppercase">STATUS: COMPLETE</span>
               </div>
               <div className="flex items-start gap-3">
                   <div className="text-[9px] uppercase font-black text-emerald-600 tracking-tighter bg-emerald-500/10 px-1.5 py-0.5 mt-0.5">FINAL_DIAGNOSTIC</div>
                   <p className="text-[11px] text-emerald-100/90 leading-relaxed italic whitespace-pre-wrap">
                       {finalReportText}
                   </p>
               </div>
           </div>
        )}
        
        {summaries.length === 0 ? (
          introText ? (
            <div className="flex flex-col p-4 bg-cyan-500/5 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)] gap-3 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="flex items-center justify-between border-b border-cyan-500/10 pb-2">
                    <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-widest">SESSION INITIALIZED</span>
                    <span className="text-[9px] text-cyan-700 font-mono uppercase">AI_UPLINK: ACTIVE</span>
                </div>
                <div className="flex items-start gap-3">
                     <div className="text-[9px] uppercase font-black text-cyan-600 tracking-tighter bg-cyan-500/10 px-1.5 py-0.5 mt-0.5">BIO-ANALYST</div>
                     <p className="text-[11px] text-cyan-100/90 leading-relaxed italic">
                        {introText}
                     </p>
                </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 border border-cyan-500/10 bg-cyan-500/[0.02] space-y-4">
              <div className="flex gap-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="w-2 h-2 bg-cyan-500/50 animate-bounce" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
              <div className="text-[10px] text-cyan-500 font-bold uppercase tracking-[0.2em]">
                Initial Diagnostic Phase Initialized...
              </div>
              <div className="text-[8px] text-cyan-700 uppercase tracking-widest text-center max-w-xs">
                Synchronizing with primary sensor array. Buffering telemetry for 60s baseline analysis.
              </div>
            </div>
          )
        ) : (
          summaries.map((s) => (
            <div 
              key={s.id} 
              className="flex flex-col p-3 bg-cyan-500/5 border border-cyan-500/10 hover:border-cyan-400/30 transition-all gap-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="text-cyan-500 font-bold text-xs">[{s.timestamp}]</span>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-cyan-700 uppercase tracking-tighter font-black leading-none mb-1">PKT_TYPE: MINUTE_SUMMARY</span>
                    <span className="text-[7px] text-slate-500 uppercase tracking-widest">
                      SAMPLES: {s.sampleCount}
                      {s.llmLatency !== undefined && ` | LLM: ${(s.llmLatency/1000).toFixed(2)}s`}
                      {s.ttsLatency !== undefined && ` | TTS: ${(s.ttsLatency/1000).toFixed(2)}s`}
                    </span>
                  </div>
                </div>
                
                <div className="flex gap-8">
                  <div className="flex flex-col">
                    <span className="text-[8px] text-cyan-600 uppercase font-black">Average</span>
                    <span className="text-sm text-white font-bold">{s.avg}<span className="text-[10px] ml-0.5 text-slate-500">BPM</span></span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-emerald-600 uppercase font-black">Max</span>
                    <span className="text-sm text-emerald-400 font-bold">{s.max}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] text-orange-600 uppercase font-black">Min</span>
                    <span className="text-sm text-orange-400 font-bold">{s.min}</span>
                  </div>
                </div>
                
                <div className="hidden lg:block">
                  <div className="flex items-center gap-3">
                    {s.sampleCount >= 45 && (
                      <span className="text-[7px] px-1.5 py-0.5 border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-black tracking-tighter">DATA_INTEGRITY: VERIFIED</span>
                    )}
                    <div className="flex items-center gap-1">
                      <div className={`w-1 h-1 rounded-full ${s.isAnalyzing ? 'bg-amber-500 animate-ping' : 'bg-cyan-500'}`} />
                      <div className="w-1 h-1 bg-cyan-500/50 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio-Analyst Insight Section */}
              <div className="border-t border-white/5 pt-3">
                <div className="flex items-start gap-3">
                  <div className="text-[9px] uppercase font-black text-cyan-600 tracking-tighter bg-cyan-500/10 px-1.5 py-0.5 mt-0.5">BIO-ANALYST</div>
                  <div className="flex-1">
                    {s.isAnalyzing ? (
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 bg-cyan-500/40 rounded-full animate-pulse" />
                         <span className="text-[10px] text-slate-600 italic animate-pulse">Analyzing minute telemetry patterns...</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-cyan-100/90 leading-relaxed italic">
                        {s.insight || "Telemetry captured. Analysis pending logic update."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex justify-between items-center opacity-30">
        <span className="text-[8px] text-cyan-300 font-mono uppercase">Status: {summaries.length === 3 ? "History_Max" : "Accumulating"}</span>
        <div className="flex gap-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`w-1 h-1 rounded-full ${i < summaries.length ? 'bg-cyan-500' : 'bg-slate-800'}`} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AggregatorPanel;