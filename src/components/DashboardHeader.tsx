import React from 'react';
import { APP_VERSION, BUILD_ID } from '../version';

const DashboardHeader: React.FC = () => {
  return (
    <div className="border-l-4 border-[#ff003c] pl-3 flex flex-col justify-center">
      <div className="flex items-baseline gap-2">
        <h1 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-white">
          Aether<span className="text-[#ff003c]">Aegis</span>
        </h1>
        <span 
          title={`Build: ${BUILD_ID}`} 
          className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-xs border border-white/10 text-slate-400 bg-black/40 tracking-wider"
        >
          v{APP_VERSION}
        </span>
      </div>
    </div>
  );
};

export default DashboardHeader;