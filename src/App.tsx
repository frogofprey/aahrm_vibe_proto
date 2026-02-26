import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { 
  Activity, 
  Heart, 
  Shield, 
  Zap, 
  AlertTriangle, 
  Cpu,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface HeartRateData {
  value: number;
  timestamp: number;
  status: 'normal' | 'high' | 'low';
}

const App: React.FC = () => {
  const [data, setData] = useState<HeartRateData[]>([]);
  const [currentHR, setCurrentHR] = useState<number>(0);
  const [status, setStatus] = useState<'normal' | 'high' | 'low'>('normal');
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('connect', () => {
      setConnected(true);
    });

    socketRef.current.on('disconnect', () => {
      setConnected(false);
    });

    socketRef.current.on('heartRate', (newData: HeartRateData) => {
      setCurrentHR(newData.value);
      setStatus(newData.status);
      setData(prev => {
        const updated = [...prev, newData];
        if (updated.length > 50) return updated.slice(1);
        return updated;
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] biometric-grid p-6 font-sans selection:bg-emerald-500/30">
      <div className="scanline" />
      
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center justify-center">
            <Shield className="text-emerald-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight text-white/90">AETHERAEGIS</h1>
            <p className="text-[10px] font-mono text-white/40 uppercase tracking-widest">Biometric Link v0.84</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">System Status</span>
            <div className="flex items-center gap-2">
              <div className={cn("w-1.5 h-1.5 rounded-full", connected ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
              <span className="text-xs font-mono text-white/80 uppercase tracking-tighter">
                {connected ? "LINK_ESTABLISHED" : "LINK_DISCONNECTED"}
              </span>
            </div>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex items-center gap-3">
             <Clock className="text-white/40 w-4 h-4" />
             <span className="text-xs font-mono text-white/80">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </header>

      <main className="grid grid-cols-12 gap-6 max-w-7xl mx-auto">
        
        {/* Main Biometric Display */}
        <section className="col-span-12 lg:col-span-8 space-y-6">
          <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-sm font-mono text-white/40 uppercase tracking-widest mb-1">Live Biometric Feed</h2>
                <div className="flex items-center gap-2">
                  <Activity className="text-emerald-400 w-4 h-4" />
                  <span className="text-xs font-mono text-emerald-400/80">CHANNEL_01: HEART_RATE_MONITOR</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-mono text-white/40 uppercase">Sampling Rate</span>
                <p className="text-xs font-mono text-white/80">1.0 Hz</p>
              </div>
            </div>

            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorHr" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis 
                    dataKey="timestamp" 
                    hide 
                  />
                  <YAxis 
                    domain={[40, 200]} 
                    stroke="#ffffff20" 
                    fontSize={10} 
                    fontFamily="JetBrains Mono"
                    tickFormatter={(val) => `${val}`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', fontSize: '10px', fontFamily: 'JetBrains Mono' }}
                    itemStyle={{ color: '#10b981' }}
                    labelFormatter={() => 'Biometric Data'}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#10b981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorHr)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div className="glass-panel rounded-xl p-4">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block mb-2">Min HR</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono text-white/90">62</span>
                <span className="text-xs font-mono text-white/40">BPM</span>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block mb-2">Max HR</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono text-white/90">174</span>
                <span className="text-xs font-mono text-white/40">BPM</span>
              </div>
            </div>
            <div className="glass-panel rounded-xl p-4">
              <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block mb-2">Avg HR</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-mono text-white/90">78</span>
                <span className="text-xs font-mono text-white/40">BPM</span>
              </div>
            </div>
          </div>
        </section>

        {/* Sidebar Stats */}
        <aside className="col-span-12 lg:col-span-4 space-y-6">
          {/* Real-time Value Card */}
          <div className={cn(
            "glass-panel rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden transition-colors duration-500",
            status === 'high' ? "border-red-500/50 bg-red-500/5" : status === 'low' ? "border-blue-500/50 bg-blue-500/5" : "border-emerald-500/20"
          )}>
            <div className="absolute top-4 left-4">
              <Heart className={cn("w-5 h-5", status === 'high' ? "text-red-500 animate-ping" : "text-emerald-400 animate-pulse")} />
            </div>
            
            <span className="text-xs font-mono text-white/40 uppercase tracking-[0.2em] mb-2">Current Pulse</span>
            <div className="flex items-baseline gap-2">
              <AnimatePresence mode="wait">
                <motion.span 
                  key={currentHR}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  className={cn(
                    "text-8xl font-mono font-medium tracking-tighter",
                    status === 'high' ? "text-red-500 warning-glow" : "text-emerald-400 glow-text"
                  )}
                >
                  {currentHR}
                </motion.span>
              </AnimatePresence>
              <span className="text-xl font-mono text-white/20">BPM</span>
            </div>

            <div className="mt-6 flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
              <div className={cn("w-2 h-2 rounded-full", status === 'high' ? "bg-red-500" : status === 'low' ? "bg-blue-500" : "bg-emerald-500")} />
              <span className="text-[10px] font-mono text-white/60 uppercase tracking-widest">
                {status.toUpperCase()} THRESHOLD
              </span>
            </div>
          </div>

          {/* System Diagnostics */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-xs font-mono text-white/40 uppercase tracking-widest mb-6 flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Diagnostics
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-white/60 uppercase">Neural Link</span>
                <span className="text-[10px] font-mono text-emerald-400">OPTIMIZED</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-emerald-500 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: '92%' }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-white/60 uppercase">Data Integrity</span>
                <span className="text-[10px] font-mono text-emerald-400">99.9%</span>
              </div>
              <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                <motion.div 
                  className="bg-emerald-500 h-full"
                  initial={{ width: 0 }}
                  animate={{ width: '99.9%' }}
                />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-white/60 uppercase">Latency</span>
                <span className="text-[10px] font-mono text-emerald-400">12ms</span>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
              <button className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono uppercase tracking-widest hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-2">
                <Zap className="w-3 h-3" />
                Recalibrate Sensors
              </button>
            </div>
          </div>

          {/* Alerts */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="text-xs font-mono text-white/40 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Alert Log
            </h3>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-[10px] font-mono text-white/40 mb-1">14:22:01</p>
                <p className="text-[10px] font-mono text-white/80 uppercase">System startup sequence complete</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                <p className="text-[10px] font-mono text-emerald-400/40 mb-1">14:22:05</p>
                <p className="text-[10px] font-mono text-emerald-400/80 uppercase">Biometric link established</p>
              </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="mt-12 max-w-7xl mx-auto flex justify-between items-center border-t border-white/10 pt-6 opacity-40">
        <p className="text-[10px] font-mono uppercase tracking-widest">AetherAegis Systems © 2026</p>
        <div className="flex gap-6">
          <span className="text-[10px] font-mono uppercase tracking-widest">Secure Connection</span>
          <span className="text-[10px] font-mono uppercase tracking-widest">Encrypted Stream</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
