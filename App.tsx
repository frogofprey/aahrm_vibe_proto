
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ConnectionStatus, HeartRateData, ZoneConfig, MinuteSummary } from './types';
import DashboardHeader from './components/DashboardHeader';
import HeartRateDisplay from './components/HeartRateDisplay';
import HeartRateChart from './components/HeartRateChart';
import StatusBadge from './components/StatusBadge';
import DebugLog from './components/DebugLog';
import AggregatorPanel from './components/AggregatorPanel';

/**
 * SECURE CONFIGURATION BLOCK
 * These values look for environment variables during build/deploy,
 * but can be overridden by the user in the UI and persisted to LocalStorage.
 */
const ENV_WS_URL = (process.env as any).WS_URL || 'ws://localhost:8765';
const ENV_DEVICE_HEX = (process.env as any).DEVICE_ID || '00:00:00:00:00:00';
const ENV_DEFAULT_AGE = parseInt((process.env as any).DEFAULT_AGE || '30');

const STORAGE_KEYS = {
  WS: 'aetheraegis_ws_url',
  HEX: 'aetheraegis_device_hex',
  AGE: 'aetheraegis_subject_age'
};

const MAX_DATA_POINTS = 50;
const MAX_LOG_ENTRIES = 100;
const HR_MIN_VALID = 40;
const HR_MAX_VALID = 220;

const BIO_ANALYST_PERSONA = `Persona: You are the AetherAegis Bio-Analyst, a high-performance fitness coach specializing in cardiovascular efficiency and recovery.
Data Input: You will receive "Minute Packets" containing an array of raw BPM samples, an average, and a Max/Min.
Core Constraints:
PII Isolation: Do not attempt to guess the user's age or identity. Use the provided "Zone" context (derived from a local placeholder) as the absolute truth for intensity.
Signal Noise: Be aware that "spikes" (sudden jumps of 20+ BPM in 1 second) may be sensor artifacts. Prioritize trends over individual samples.
The 'Adversarial' Edge: If the user's heart rate remains elevated with low variability, challenge them to focus on breathing or recovery. If the heart rate drops too slowly after an interval, flag it as a potential fatigue warning.
Goal: Provide a concise (1-sentence) insight after each packet that helps the user optimize their current session.`;

const App: React.FC = () => {
  // --- Persistent State Initialization ---
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.WS) || ENV_WS_URL);
  const [deviceIdHex, setDeviceIdHex] = useState(() => localStorage.getItem(STORAGE_KEYS.HEX) || ENV_DEVICE_HEX);
  const [age, setAge] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.AGE) || String(ENV_DEFAULT_AGE)));

  const [dataPoints, setDataPoints] = useState<HeartRateData[]>([]);
  const [currentHR, setCurrentHR] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: number; message: string; timestamp: string }[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showRawTelemetry, setShowRawTelemetry] = useState(false);
  
  const [summaries, setSummaries] = useState<MinuteSummary[]>([]);
  const currentMinuteRef = useRef<number[]>([]);
  const lastSummaryTimeRef = useRef<number>(Date.now());
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);

  const zones: ZoneConfig[] = useMemo(() => {
    const maxHR = 220 - age;
    return [
      { min: maxHR * 0.5, max: maxHR * 0.6, label: 'Zone 1: Warm Up', color: '#64748b', glowClass: 'shadow-[0_0_30px_rgba(100,116,139,0.15)]', borderClass: 'border-slate-500/40', textClass: 'text-slate-400' },
      { min: maxHR * 0.6, max: maxHR * 0.7, label: 'Zone 2: Fat Burn', color: '#3b82f6', glowClass: 'shadow-[0_0_30px_rgba(59,130,246,0.25)]', borderClass: 'border-blue-500/40', textClass: 'text-blue-400' },
      { min: maxHR * 0.7, max: maxHR * 0.8, label: 'Zone 3: Aerobic', color: '#22c55e', glowClass: 'shadow-[0_0_30px_rgba(34,197,94,0.25)]', borderClass: 'border-green-500/40', textClass: 'text-green-400' },
      { min: maxHR * 0.8, max: maxHR * 0.9, label: 'Zone 4: Anaerobic', color: '#f59e0b', glowClass: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]', borderClass: 'border-orange-500/40', textClass: 'text-orange-400' },
      { min: maxHR * 0.9, max: Infinity, label: 'Zone 5: Red Line', color: '#ef4444', glowClass: 'shadow-[0_0_40px_rgba(239,68,68,0.35)]', borderClass: 'border-red-500/40', textClass: 'text-red-500' },
    ];
  }, [age]);

  const currentZone = useMemo(() => {
    if (currentHR === null) return null;
    const matched = zones.find(z => currentHR >= z.min && currentHR < z.max);
    if (matched) return matched;
    if (currentHR >= zones[zones.length - 1].min) return zones[zones.length - 1];
    return {
      min: 0,
      max: zones[0].min,
      label: 'Resting / Low Intensity',
      color: '#475569',
      glowClass: 'shadow-none',
      borderClass: 'border-slate-800',
      textClass: 'text-slate-600'
    };
  }, [currentHR, zones]);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const msStr = String(now.getMilliseconds()).padStart(3, '0');
      const newLog = { id: ++logIdRef.current, message, timestamp: `${timeStr}.${msStr}` };
      return [newLog, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  const requestAiInsight = async (summary: MinuteSummary) => {
    const prompt = `${BIO_ANALYST_PERSONA}

Minute Packet Data:
- Average BPM: ${summary.avg}
- Max BPM: ${summary.max}
- Min BPM: ${summary.min}
- Sample Count: ${summary.sampleCount}
- Raw Telemetry Stream: [${summary.values.join(', ')}]`;

    try {
      addLog(`AI_REQUEST: Dispatching packet to Gemini-3-Flash...`);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const insight = response.text || "Insight unavailable.";
      addLog(`AI_RESPONSE: Analysis complete for [${summary.timestamp}]`);
      addLog(`AI_INSIGHT: "${insight}"`);

      setSummaries(prev => prev.map(s => 
        s.id === summary.id ? { ...s, insight, isAnalyzing: false } : s
      ));
    } catch (e) {
      addLog(`AI_ERROR: Failed to retrieve bio-analysis. ${e instanceof Error ? e.message : 'Unknown error'}`);
      setSummaries(prev => prev.map(s => 
        s.id === summary.id ? { ...s, insight: "Analysis failed. Check connection.", isAnalyzing: false } : s
      ));
    }
  };

  const calculateMinuteSummary = useCallback(() => {
    const values = [...currentMinuteRef.current];
    currentMinuteRef.current = [];
    lastSummaryTimeRef.current = Date.now();

    if (values.length === 0) return;
    
    const sampleCount = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = Math.round(sum / sampleCount);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const newSummary: MinuteSummary = {
      id: crypto.randomUUID(),
      timestamp,
      avg,
      max,
      min,
      sampleCount,
      values,
      isAnalyzing: true
    };

    setSummaries(prev => [newSummary, ...prev].slice(0, 3));
    
    addLog(`AGGREGATOR: Minute Packet [${timestamp}] generated.`);
    requestAiInsight(newSummary);
    
  }, [addLog]);

  const calcRef = useRef(calculateMinuteSummary);
  useEffect(() => { calcRef.current = calculateMinuteSummary; }, [calculateMinuteSummary]);

  const showRawTelemetryRef = useRef(showRawTelemetry);
  useEffect(() => { showRawTelemetryRef.current = showRawTelemetry; }, [showRawTelemetry]);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    
    setStatus(ConnectionStatus.CONNECTING);
    setError(null);
    addLog(`SYSTEM: Uplink initiated at ${wsUrl}`);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        const fullDeviceId = `connect:${deviceIdHex}`;
        addLog(`SYSTEM: Handshake confirmed: ${fullDeviceId}`);
        setStatus(ConnectionStatus.CONNECTED);
        ws.send(fullDeviceId);
        currentMinuteRef.current = []; 
        lastSummaryTimeRef.current = Date.now();
      };

      ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data.toString());
          const rawHR = rawData.hr !== undefined ? rawData.hr : (rawData.data?.hr);
          const numericHR = typeof rawHR === 'number' ? rawHR : Number(rawHR);
          
          if (!isNaN(numericHR) && numericHR >= HR_MIN_VALID && numericHR <= HR_MAX_VALID) {
            const newData: HeartRateData = {
              hr: numericHR,
              timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            };
            
            if (showRawTelemetryRef.current) {
              addLog(`TELEMETRY: ${numericHR} BPM`);
            }
            
            setCurrentHR(numericHR);
            setDataPoints((prev) => {
              const updated = [...prev, newData];
              return updated.length > MAX_DATA_POINTS ? updated.slice(updated.length - MAX_DATA_POINTS) : updated;
            });
            
            currentMinuteRef.current.push(numericHR);
            if (Date.now() - lastSummaryTimeRef.current >= 60000) {
              calcRef.current(); 
            }
          } else if (numericHR !== undefined && numericHR !== null) {
            addLog(`WARNING: Biometric Noise Filtered [${numericHR} BPM]`);
          }
        } catch (e) {
          addLog(`ERROR: Telemetry parsing failed.`);
        }
      };

      ws.onclose = () => {
        addLog(`SYSTEM: Connection severed.`);
        setStatus(ConnectionStatus.DISCONNECTED);
      };
      
      ws.onerror = () => {
        addLog(`ERROR: WebSocket transport failure.`);
        setStatus(ConnectionStatus.ERROR);
        setError(`Uplink failure at ${wsUrl}`);
      };
    } catch (e) {
      setStatus(ConnectionStatus.ERROR);
      setError('Initialization error.');
    }
  }, [addLog, wsUrl, deviceIdHex]);

  const handleRestart = useCallback(() => {
    addLog(`SYSTEM: CONFIGURATION_REBOOT INITIALIZED.`);
    
    // PERSISTENCE SYNC
    localStorage.setItem(STORAGE_KEYS.WS, wsUrl);
    localStorage.setItem(STORAGE_KEYS.HEX, deviceIdHex);
    localStorage.setItem(STORAGE_KEYS.AGE, String(age));
    addLog(`SYSTEM: Session parameters cached to secure local storage.`);

    if (wsRef.current) wsRef.current.close();
    setDataPoints([]);
    setCurrentHR(null);
    currentMinuteRef.current = [];
    setSummaries([]);
    setTimeout(connect, 300);
  }, [connect, addLog, wsUrl, deviceIdHex, age]);

  useEffect(() => {
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [connect]);

  return (
    <div className="min-h-screen bg-[#050608] bg-grid text-slate-200 p-4 md:p-8 flex flex-col items-center">
      <div className="w-full max-w-7xl space-y-8 pb-32">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <DashboardHeader />
          <div className="flex flex-wrap items-center gap-4 bg-slate-950/60 p-4 rounded border border-white/5">
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Subject Age</label>
              <input 
                type="number" 
                value={age} 
                onChange={(e) => setAge(Math.max(1, Math.min(120, parseInt(e.target.value) || 0)))} 
                className="bg-black border border-white/10 text-[#ff003c] font-mono text-lg px-3 py-1 w-16 focus:outline-none focus:border-[#ff003c]/50 transition-colors" 
              />
            </div>
            
            <div className="h-10 w-px bg-white/5 hidden md:block" />
            
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">WS Endpoint</label>
              <input 
                type="text" 
                value={wsUrl} 
                onChange={(e) => setWsUrl(e.target.value)} 
                className="bg-black border border-white/10 text-blue-400 font-mono text-xs px-3 py-1.5 w-40 focus:outline-none focus:border-blue-400/50 transition-colors" 
              />
            </div>
            
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Device Hex</label>
              <div className="flex items-center">
                <span className="text-[10px] font-mono text-slate-600 bg-white/5 px-2 py-1.5 border border-white/10 border-r-0 rounded-l-sm">connect:</span>
                <input 
                  type="text" 
                  value={deviceIdHex} 
                  onChange={(e) => setDeviceIdHex(e.target.value)} 
                  className="bg-black border border-white/10 text-emerald-400 font-mono text-xs px-3 py-1.5 w-44 focus:outline-none focus:border-emerald-400/50 transition-colors rounded-r-sm" 
                  placeholder="XX:XX:XX:XX:XX:XX" 
                />
              </div>
            </div>
            
            <div className="h-10 w-px bg-white/5 hidden md:block" />
            
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Log Stream</label>
              <button 
                onClick={() => setShowRawTelemetry(!showRawTelemetry)}
                className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${showRawTelemetry ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
              >
                {showRawTelemetry ? 'Stream: ON' : 'Stream: OFF'}
              </button>
            </div>

            <div className="h-10 w-px bg-white/5 hidden md:block" />

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Status</label>
              <StatusBadge status={status} />
            </div>
            
            <div className="flex gap-2 ml-auto lg:ml-0">
              <button onClick={() => setShowDebug(!showDebug)} className={`px-4 py-2 border font-bold rounded-sm transition-all uppercase text-xs tracking-widest ${showDebug ? 'bg-[#ff003c] text-white border-[#ff003c]' : 'border-white/20 text-slate-400 hover:border-white/40'}`}>{showDebug ? 'Hide Console' : 'Show Console'}</button>
              <button onClick={handleRestart} className="px-4 py-2 border border-[#ff003c]/40 hover:bg-[#ff003c]/10 text-[#ff003c] font-bold rounded-sm transition-all uppercase text-xs tracking-widest">Apply & Persist</button>
            </div>
          </div>
        </div>

        {error && <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-sm text-red-400 text-sm font-mono flex items-center gap-3"><span className="animate-pulse">⚠️</span> {error}</div>}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 items-start">
          <div className="xl:col-span-1 space-y-8">
            <HeartRateDisplay hr={currentHR} zone={currentZone} />
            <div className="p-4 aether-border bg-slate-900/20 opacity-60">
               <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3 border-b border-white/5 pb-2">Target Zones (Age {age})</h3>
               <div className="space-y-2 text-[10px] font-mono">
                 {zones.map((z, idx) => (
                   <div key={idx} className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }}></div>
                     <span className="w-16 text-slate-500 uppercase">{z.label.split(':')[0]}</span>
                     <span className="text-white">{Math.round(z.min)}+ BPM</span>
                   </div>
                 ))}
               </div>
            </div>
          </div>
          <div className="xl:col-span-3 space-y-8">
            <HeartRateChart data={dataPoints} activeColor={currentZone?.color || '#475569'} age={age} zones={zones} />
            <AggregatorPanel summaries={summaries} />
          </div>
        </div>
      </div>
      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-in-out transform ${showDebug ? 'translate-y-0' : 'translate-y-full'}`}><DebugLog logs={logs} onClose={() => setShowDebug(false)} /></div>
      <footer className="mt-auto py-8 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">AetherAegis Biometric Monitoring Suite // v5.2.0-ProductionReady.8765</footer>
    </div>
  );
};

export default App;
