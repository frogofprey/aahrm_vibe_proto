import React from 'react';

const DashboardHeader: React.FC = () => {
  return (
    <div className="border-l-4 border-[#ff003c] pl-3">
      <h1 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-white">
        Aether<span className="text-[#ff003c]">Aegis</span>
      </h1>
    </div>
  );
};

export default DashboardHeader;