
import React from 'react';
import { ConnectionStatus } from '../types';

interface StatusBadgeProps {
  status: ConnectionStatus;
  sessionActive: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, sessionActive }) => {
  const getStatusConfig = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        if (sessionActive) {
            return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'SESSION ACTIVE', pulse: true };
        }
        return { color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'STANDBY', pulse: false };
      case ConnectionStatus.CONNECTING:
        return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'NEGOTIATING', pulse: true };
      case ConnectionStatus.ERROR:
        return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'INTERFACE FAILURE', pulse: false };
      default:
        return { color: 'text-slate-600', bg: 'bg-slate-800/50', border: 'border-slate-700/30', text: 'OFFLINE', pulse: false };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${config.border} ${config.bg} transition-all duration-300`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color.replace('text', 'bg')} ${config.pulse ? 'animate-ping' : ''}`} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${config.color}`}>
        {config.text}
      </span>
    </div>
  );
};

export default StatusBadge;
