import React from 'react';
import GlassCard from '../components/GlassCard';
import { Gift, Award, Diamond, Plane, Car, Home, Crown, Star, Globe } from 'lucide-react';

const Rewards: React.FC = () => {
  const rewards = [
    { title: 'Goa Expedition', status: 'In Progress', val: '3 Days / 2 Nights Luxury Stay', icon: Plane, color: 'text-cyan-400' },
    { title: 'Bangkok Gateway', status: 'Locked', val: '4 Days / 3 Nights Premium Tour', icon: Plane, color: 'text-indigo-400' },
    { title: 'Global Tourist Protocol', status: 'Locked', val: 'Annual International Trip', icon: Globe, color: 'text-emerald-400' },
  ];

  return (
    <div className="space-y-12 animate-in fade-in duration-700">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-bold">Incentive Portfolio</h2>
          <p className="text-slate-400 mt-2">Exclusive rewards for high-performance node operators.</p>
        </div>
        <div className="hidden lg:flex gap-4">
           <div className="bg-white/5 border border-white/5 px-6 py-2 rounded-2xl flex items-center gap-3">
             <Star className="text-amber-400" size={16} />
             <span className="text-xs font-black tracking-widest uppercase">1,420 Reward Points</span>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {rewards.map((r, i) => (
          <GlassCard key={i} className="flex gap-8 items-center">
            <div className="w-24 h-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 shadow-inner">
               <r.icon className={r.color} size={32} />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex justify-between items-start">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{r.status}</p>
                {r.status === 'Claimed' && <CheckCircle className="text-emerald-500" size={14} />}
              </div>
              <h4 className="text-xl font-bold">{r.title}</h4>
              <p className="text-lg font-bold text-white opacity-90">{r.val}</p>
              <div className="pt-2">
                 <button className="text-[10px] font-black text-amber-500 hover:text-amber-400 uppercase tracking-widest">Requirement Logic →</button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="p-16 text-center space-y-6 flex flex-col items-center">
        <Crown size={64} className="text-amber-400 animate-bounce" />
        <h3 className="text-4xl font-bold tracking-tight">Global Profit Pool</h3>
        <p className="text-slate-400 text-lg max-w-2xl">The Arowin Trading Pool distributes 2% of total company turnover monthly among Rank 12 (Global Ambassador) partners. Reach Elite Status to participate in institutional dividends.</p>
        <button className="mt-4 px-12 py-4 bg-white text-slate-950 font-black rounded-2xl shadow-2xl hover:bg-slate-200 transition-all active:scale-95">VIEW POOL ANALYTICS</button>
      </GlassCard>
    </div>
  );
};

const CheckCircle: React.FC<{className?: string, size?: number}> = ({className, size}) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);

export default Rewards;