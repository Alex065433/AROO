
import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { RANKS } from '../constants';
import { supabaseService } from '../services/supabaseService';
import { Crown, Star, Shield, Zap, Lock, CheckCircle2, Award, Gem, Medal, RefreshCw } from 'lucide-react';

const RankSystem: React.FC = () => {
  const [userRank, setUserRank] = useState(1);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRank = async () => {
      try {
        const user = supabaseService.getCurrentUser();
        if (user) {
          const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
          if (profile) {
            setUserRank(profile.rank || 1);
            setIsActive(profile.active_package > 0);
          }
        }
      } catch (err) {
        console.error('Error fetching rank:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRank();
  }, []);

  const tiers = [
    { name: 'Tier 1 – Foundation Level', levels: [1, 2, 3], color: 'from-slate-400 to-slate-600', icon: Medal },
    { name: 'Tier 2 – Growth Level', levels: [4, 5, 6], color: 'from-amber-400 to-orange-600', icon: Award },
    { name: 'Tier 3 – Leadership Level', levels: [7, 8, 9], color: 'from-blue-400 to-indigo-600', icon: Gem },
    { name: 'Tier 4 – Master Level', levels: [10, 11, 12], color: 'from-purple-400 to-pink-600', icon: Crown },
  ];

  const getRankIcon = (level: number) => {
    if (level <= 3) return Shield;
    if (level <= 6) return Medal;
    if (level <= 9) return Award;
    return Crown;
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <RefreshCw className="animate-spin text-orange-500" size={48} />
        <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-xs">Synchronizing Rank Protocol...</p>
      </div>
    );
  }

  return (
    <div className="space-y-16 animate-in fade-in duration-1000 pb-20">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h2 className="text-5xl font-black bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent uppercase tracking-tight">Enterprise Ladder</h2>
        <p className="text-slate-500 text-lg font-medium">Scale the Arowin hierarchy to unlock institutional profit pools and elite matching dividends.</p>
      </div>

      <div className="space-y-32">
        {tiers.map((tier, tierIdx) => (
          <div key={tierIdx} className="space-y-12">
            {/* Tier Header */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className={`relative px-8 py-3 bg-[#0a0a0b] border border-white/10 rounded-full flex items-center gap-4 shadow-2xl`}>
                <tier.icon className={`text-transparent bg-clip-text bg-gradient-to-r ${tier.color}`} size={24} />
                <h3 className={`text-xl font-black uppercase tracking-[0.2em] bg-gradient-to-r ${tier.color} bg-clip-text text-transparent`}>
                  {tier.name}
                </h3>
              </div>
            </div>

            {/* Ranks in Tier */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
              {RANKS.filter(r => tier.levels.includes(r.level)).map((r) => {
                const isUnlocked = isActive && r.level <= userRank;
                const isCurrent = isActive && r.level === userRank;
                const Icon = getRankIcon(r.level);

                return (
                  <GlassCard 
                    key={r.level} 
                    glow={isCurrent ? 'amber' : 'none'} 
                    className={`group transition-all duration-500 relative ${!isUnlocked ? 'grayscale opacity-40' : 'opacity-100'}`}
                  >
                    {!isUnlocked && (
                      <div className="absolute inset-0 z-20 bg-black/60 backdrop-blur-[4px] rounded-3xl flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3 p-6 text-center">
                           <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                             <Lock className="text-slate-400" size={24} />
                           </div>
                           <span className="text-[11px] font-black text-white uppercase tracking-[0.2em]">
                             {!isActive ? 'Account Activation Required' : `Requires Level ${r.level}`}
                           </span>
                           {!isActive && (
                             <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest max-w-[150px]">
                               Activate a package to unlock the rank ladder
                             </p>
                           )}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-start mb-8">
                      <div className={`p-4 rounded-2xl ${isUnlocked ? 'bg-white/5 text-white' : 'bg-white/5 text-slate-600'}`}>
                        <Icon size={28} className={isUnlocked ? (isCurrent ? 'text-amber-400' : 'text-slate-300') : ''} />
                      </div>
                      {isCurrent ? (
                        <span className="px-3 py-1 bg-amber-500 text-slate-950 text-[9px] font-black rounded-full shadow-lg">ACTIVE RANK</span>
                      ) : isUnlocked ? (
                        <CheckCircle2 className="text-emerald-500" size={18} />
                      ) : null}
                    </div>

                    <div className="space-y-1">
                       <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${isCurrent ? 'text-amber-500' : 'text-slate-500'}`}>Level {r.level}</p>
                       <h4 className="text-2xl font-black text-white tracking-tight">{r.name}</h4>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/5 grid grid-cols-2 gap-y-6 gap-x-4">
                      <div>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Required L/R</p>
                        <p className="text-sm font-black text-slate-200 mt-1">{(r.requiredLeft || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Pair Income</p>
                        <p className="text-sm font-black text-white mt-1">${r.pairIncome}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Weekly Yield</p>
                        <p className="text-sm font-black text-emerald-500 mt-1">+{r.weeklyEarning} USDT</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Daily Cap</p>
                        <p className="text-sm font-black text-slate-200 mt-1">${r.dailyCapping}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Annual Total</p>
                        <p className="text-sm font-black text-amber-500 mt-1">${(r.totalEarning || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <GlassCard className="max-w-4xl mx-auto p-12 text-center space-y-8 bg-gradient-to-br from-amber-500/10 to-transparent border-amber-500/10">
        <Crown className="text-amber-400 mx-auto animate-pulse" size={48} />
        <div className="space-y-2">
          <h3 className="text-3xl font-black text-white uppercase tracking-tight">Institutional Dividend Pool</h3>
          <p className="text-slate-500 text-sm max-w-2xl mx-auto leading-relaxed">
            Partners reaching <span className="text-white font-bold">Tier 4 (Master Level)</span> gain access to the Global Profit Pool, distributing a percentage of total turnover among authorized ambassadors monthly.
          </p>
        </div>
        <button className="px-10 py-4 bg-amber-600 text-white font-black rounded-2xl hover:bg-amber-500 transition-all active:scale-95 shadow-xl shadow-amber-950/20 text-xs uppercase tracking-widest">
          View Pool Eligibility Logic
        </button>
      </GlassCard>
    </div>
  );
};

export default RankSystem;
