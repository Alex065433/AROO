
import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { Share2, Link as LinkIcon, Copy, Check, Info, Users, ArrowRight, RefreshCw, ArrowUpRight } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useUser } from '../src/context/UserContext';
import { copyToClipboard } from '../src/lib/clipboard';

const ReferralLinkCard: React.FC<{ side: 'LEFT' | 'RIGHT', operatorId: string }> = ({ side, operatorId }) => {
  const [copied, setCopied] = useState(false);
  
  // Get base URL robustly for both local and real domains
  const getBaseUrl = () => {
    const href = window.location.href;
    const hashIndex = href.indexOf('#');
    const base = hashIndex !== -1 ? href.substring(0, hashIndex) : href;
    return base.endsWith('/') ? base : base + '/';
  };

  const link = `${getBaseUrl()}#/register?ref=${operatorId}&side=${(side || 'LEFT').toLowerCase()}`;

  const handleCopy = async () => {
    const success = await copyToClipboard(link);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`relative overflow-hidden group p-10 rounded-[40px] border transition-all duration-500 ${
      side === 'LEFT' 
        ? 'bg-gradient-to-br from-orange-600/10 to-transparent border-orange-500/10 hover:border-orange-500/30 shadow-[0_20px_50px_rgba(249,115,22,0.05)]' 
        : 'bg-gradient-to-br from-blue-600/10 to-transparent border-blue-500/10 hover:border-blue-500/30 shadow-[0_20px_50px_rgba(59,130,246,0.05)]'
    }`}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-5">
          <div className={`p-4 rounded-2xl shadow-inner ${side === 'LEFT' ? 'bg-orange-500/20 text-orange-500' : 'bg-blue-500/20 text-blue-500'}`}>
            <LinkIcon size={24} />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Binary Placement</span>
            <h4 className={`text-2xl font-bold tracking-tight ${side === 'LEFT' ? 'text-orange-500' : 'text-blue-500'}`}>{side} LEG PORTAL</h4>
          </div>
        </div>
      </div>
      
      <div className="space-y-6">
        <p className="text-sm text-slate-400 leading-relaxed font-medium">
          Share this link to enroll new partners directly into your <span className="text-white font-bold">{(side || 'LEFT').toLowerCase()} leg</span>. 
          Binary matching is calculated based on volume from this leg.
        </p>
        
        <div className="flex items-center gap-4 bg-black/40 border border-white/5 rounded-2xl p-4">
          <p className="flex-1 text-xs font-mono text-slate-500 truncate select-all">{link}</p>
          <button 
            onClick={handleCopy}
            className={`p-3 rounded-xl transition-all active:scale-90 ${
              copied ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleCopy}
            className={`w-full py-5 rounded-2xl text-sm font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 ${
              side === 'LEFT' 
                ? 'bg-orange-600 text-white hover:bg-orange-500 shadow-orange-950/20' 
                : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-950/20'
            }`}
          >
            {copied ? 'Link Copied Successfully' : `Copy ${side} Referral Link`}
          </button>
          
          <a 
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all border border-white/5 flex items-center justify-center gap-2"
          >
            Open Registration Portal <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

const ReferralProgram: React.FC = () => {
  const { profile: user, loading: isProfileLoading } = useUser();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;
      setIsLoading(true);
      try {
        const refs = await supabaseService.getReferrals(user.id);
        setReferrals(refs);
      } catch (err) {
        console.error('Error fetching referrals:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id]);

  const operatorId = user?.operator_id || 'ARW-XXXX';

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
        <div>
          <h2 className="text-5xl font-black uppercase tracking-tight text-white">Affiliate Enrollment Portals</h2>
          <p className="text-slate-500 mt-3 text-lg font-medium max-w-2xl">Expand your network by inviting new partners. Select specific binary positioning to optimize your matching dividends.</p>
        </div>
        <div className="flex gap-4">
           <div className="px-6 py-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/10 flex items-center gap-3">
              <Users className="text-emerald-500" size={20} />
              <div className="flex flex-col">
                 <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500/60">Active Directs</span>
                 <span className="text-lg font-black text-white">{referrals.length} Partners</span>
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <ReferralLinkCard side="LEFT" operatorId={operatorId} />
        <ReferralLinkCard side="RIGHT" operatorId={operatorId} />
      </div>

      {/* Direct Referrals List */}
      <div className="bg-[#111112] border border-white/5 rounded-[40px] p-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-xl text-blue-500">
              <Users size={20} />
            </div>
            <h3 className="text-xl font-bold uppercase tracking-widest">Direct Referral Network</h3>
          </div>
          <div className="px-4 py-1.5 bg-white/5 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {referrals.length} Total
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <RefreshCw className="text-orange-500 animate-spin" size={32} />
          </div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-20 bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
            <p className="text-slate-500 text-sm font-medium">No direct referrals found yet. Share your link to start building!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {referrals.map((ref, idx) => (
              <div key={idx} className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl hover:bg-white/5 transition-all group">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-lg font-black text-slate-500 group-hover:text-orange-500 transition-colors">
                    {ref.name?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{ref.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{ref.operator_id}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Rank</p>
                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mt-0.5">{ref.rank_name || 'Partner'}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Package</p>
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mt-0.5">${ref.active_package || 0}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/5">
                   <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Joined On</p>
                   <p className="text-[10px] font-bold text-slate-400 mt-0.5">{new Date(ref.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <GlassCard className="lg:col-span-2">
            <div className="flex items-center gap-4 mb-8">
               <div className="p-3 bg-orange-500/20 rounded-xl text-orange-500">
                  <Info size={20} />
               </div>
               <h3 className="text-xl font-bold uppercase tracking-widest">Program Compensation Logic</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4 p-6 bg-white/5 rounded-3xl border border-white/5">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Direct Referral Bonus</p>
                  <p className="text-4xl font-black text-white">5.0%</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Earn instant commission on every partner package activated through your direct link.</p>
               </div>
               <div className="space-y-4 p-6 bg-white/5 rounded-3xl border border-white/5">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-500">Binary Matching Dividend</p>
                  <p className="text-4xl font-black text-white">10.0%</p>
                  <p className="text-xs text-slate-500 leading-relaxed">Receive automated matching dividends when volume is balanced across your Left and Right legs.</p>
               </div>
            </div>
         </GlassCard>

         <div className="bg-gradient-to-br from-slate-900 to-black border border-white/5 rounded-[40px] p-10 flex flex-col justify-center items-center text-center space-y-6">
            <div className="w-20 h-20 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-500">
               <Share2 size={32} />
            </div>
            <h4 className="text-xl font-bold uppercase tracking-widest">Global Expansion</h4>
            <p className="text-sm text-slate-500 leading-relaxed">Your network knows no borders. Partners can join from any jurisdiction supported by Arowin Trading node protocols.</p>
            <button className="w-full py-4 bg-white/5 border border-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all">View Network Map <ArrowRight size={14} className="inline ml-2" /></button>
         </div>
      </div>
    </div>
  );
};

export default ReferralProgram;
