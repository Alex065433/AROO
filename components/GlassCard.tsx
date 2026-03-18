
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: 'amber' | 'cyan' | 'none';
}

const GlassCard: React.FC<GlassCardProps> = ({ children, className = '', glow = 'none' }) => {
  const glowStyles = {
    amber: 'shadow-[0_0_30px_rgba(245,158,11,0.08)] border-amber-500/20',
    cyan: 'shadow-[0_0_30px_rgba(34,211,238,0.08)] border-cyan-500/20',
    none: 'shadow-2xl shadow-black/40 border-white/10'
  };

  return (
    <div className={`relative bg-white/5 backdrop-blur-xl border rounded-3xl overflow-hidden transition-all duration-300 ${glowStyles[glow]} ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />
      <div className="relative z-10 p-6">
        {children}
      </div>
    </div>
  );
};

export default GlassCard;
