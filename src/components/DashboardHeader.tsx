import React from 'react';
import { ConnectionStatus, SessionState } from '../types';
import { Activity, Bluetooth, BluetoothOff, AlertCircle } from 'lucide-react';

interface DashboardHeaderProps {
  status: ConnectionStatus;
  currentSessionState: SessionState;
  elapsedTime: string;
  activeTime: string;
  isSessionActive: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  status,
  currentSessionState,
  elapsedTime,
  activeTime,
  isSessionActive
}) => {
  const getStatusColor = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED: return 'text-emerald-400';
      case ConnectionStatus.ERROR: return 'text-rose-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED: return <Bluetooth className="w-4 h-4" />;
      case ConnectionStatus.ERROR: return <AlertCircle className="w-4 h-4" />;
      default: return <BluetoothOff className="w-4 h-4" />;
    }
  };

  return (
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-500/10 rounded-lg">
          <Activity className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100 tracking-tight">AETHER AEGIS</h1>
          <div className={`flex items-center gap-2 text-xs font-medium ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="uppercase tracking-wider">{status}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Session State</span>
          <span className="text-sm font-mono font-bold text-indigo-300 uppercase tracking-tighter">
            {currentSessionState}
          </span>
        </div>
        
        <div className="h-8 w-px bg-slate-800 mx-2" />

        <div className="flex gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Wall Clock</span>
            <span className="text-xl font-mono font-bold text-slate-200 tabular-nums">{elapsedTime}</span>
          </div>
          {isSessionActive && (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-indigo-500/70 uppercase tracking-widest">Active Time</span>
              <span className="text-xl font-mono font-bold text-indigo-400 tabular-nums">{activeTime}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
