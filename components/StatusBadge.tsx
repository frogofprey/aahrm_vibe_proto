
import React from 'react';
import { ConnectionStatus } from '../types';

interface StatusBadgeProps {
  status: ConnectionStatus;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'Online' };
      case ConnectionStatus.CONNECTING:
        return { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'Negotiating' };
      case ConnectionStatus.ERROR:
        return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'Interface Failure' };
      default:
        return { color: 'text-slate-500', bg: 'bg-slate-500/10', border: 'border-slate-500/20', text: 'Offline' };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full border ${config.border} ${config.bg}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${config.color.replace('text', 'bg')} ${status === ConnectionStatus.CONNECTING ? 'animate-ping' : ''}`} />
      <span className={`text-[10px] font-bold uppercase tracking-widest ${config.color}`}>
        {config.text}
      </span>
    </div>
  );
};

export default StatusBadge;
