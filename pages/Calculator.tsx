
import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { Calculator as CalcIcon, DollarSign, TrendingUp, Sparkles, ChevronDown } from 'lucide-react';
import { RANKS } from '../constants';

const Calculator: React.FC = () => {
  const [left, setLeft] = useState(100);
  const [right, setRight] = useState(85);
  const [selectedRankLevel, setSelectedRankLevel] = useState(1);
  const [results, setResults] = useState({ match: 0, daily: 0, year: 0 });

  const selectedRank = RANKS.find(r => r.level === selectedRankLevel) || RANKS[0];

  useEffect(() => {
    const match = Math.min(left, right);
    const pairIncome = selectedRank.pairIncome;
    setResults({
      match,
      daily: match * pairIncome,
      year: match * pairIncome * 52
    });
  }, [left, right, selectedRank]);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700">
      <div>
        <h2 className="text-4xl font-bold">Smart Income Simulator</h2>
        <p className="text-slate-400 mt-2">Project your network growth and potential binary matching dividends based on your rank.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <GlassCard className="space-y-10">
          <div className="flex items-center justify-between text-amber-400">
            <div className="flex items-center gap-4">
              <CalcIcon size={24} />
              <h3 className="text-xl font-bold">Network Parameters</h3>
            </div>
            <div className="relative group">
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-white/10 transition-all">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rank:</span>
                <span className="text-xs font-bold text-white">{selectedRank.name}</span>
                <ChevronDown size={14} className="text-slate-500" />
              </div>
              <div className="absolute top-full right-0 mt-2 w-48 bg-[#121214] border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 hidden group-hover:block">
                {RANKS.map(r => (
                  <div 
                    key={r.level} 
                    onClick={() => setSelectedRankLevel(r.level)}
                    className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors ${
                      selectedRankLevel === r.level ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {r.name} (${r.pairIncome}/pair)
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between font-bold text-sm">
                <span className="text-slate-400">Left Leg Members</span>
                <span className="text-amber-500">{left}</span>
              </div>
              <input type="range" min="0" max="5000" step="10" value={left} onChange={e => setLeft(Number(e.target.value))} className="w-full h-2 bg-white/10 rounded-full appearance-none accent-amber-500 cursor-pointer" />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between font-bold text-sm">
                <span className="text-slate-400">Right Leg Members</span>
                <span className="text-cyan-400">{right}</span>
              </div>
              <input type="range" min="0" max="5000" step="10" value={right} onChange={e => setRight(Number(e.target.value))} className="w-full h-2 bg-white/10 rounded-full appearance-none accent-cyan-400 cursor-pointer" />
            </div>
          </div>

          <div className="p-6 bg-amber-500/5 rounded-3xl border border-amber-500/10 flex gap-4">
            <Sparkles className="text-amber-400 shrink-0" size={20} />
            <p className="text-xs text-slate-400 leading-relaxed">This simulation assumes a standard <b>$50 Partner Package</b>. Calculations are based on the <b>{selectedRank.name}</b> rank matching bonus of <b>${selectedRank.pairIncome} per pair</b>.</p>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 gap-6">
          <div className="grid grid-cols-2 gap-6">
            <GlassCard glow="amber">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Matched Pairs</p>
              <h4 className="text-4xl font-bold mt-3">{results.match}</h4>
            </GlassCard>
            <GlassCard glow="cyan">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Est. Daily Income</p>
              <h4 className="text-4xl font-bold mt-3 text-emerald-400">${(results.daily || 0).toFixed(2)}</h4>
            </GlassCard>
          </div>

          <GlassCard className="flex-1 flex flex-col justify-center items-center text-center py-12 relative">
             <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><TrendingUp size={120} /></div>
             <div className="p-4 bg-emerald-500/20 rounded-2xl mb-6 text-emerald-400">
               <DollarSign size={32} />
             </div>
             <p className="text-slate-400 font-medium">Projected Yearly Matching Dividends</p>
             <h2 className="text-6xl font-black text-white mt-4 tracking-tighter">${(results.year || 0).toLocaleString()}</h2>
             <div className="mt-8 flex items-center gap-3 bg-white/5 px-6 py-2 rounded-full border border-white/5 text-xs font-bold text-slate-500">
               <span className="w-2 h-2 rounded-full bg-emerald-500" /> Based on 52 Week Cycle
             </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
