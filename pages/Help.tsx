
import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';
import { Mail, MessageSquare, LifeBuoy, Send, CheckCircle2, ArrowRight, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';

const Help: React.FC = () => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) return;
    
    setIsSubmitting(true);
    try {
      const user = supabaseService.getCurrentUser();
      if (!user) {
        throw new Error('User not authenticated');
      }
      // Real Supabase Integration
      await supabaseService.createTicket(user.id || user.uid, subject, message);
      setIsSubmitting(false);
      setIsSuccess(true);
      setSubject('');
      setMessage('');
      setTimeout(() => setIsSuccess(false), 5000);
    } catch (error) {
      console.error('Failed to submit ticket:', error);
      setIsSubmitting(false);
      // Fallback or error handling could go here
    }
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
        <div>
          <h2 className="text-5xl font-black uppercase tracking-tight text-white leading-tight">Support Node</h2>
          <p className="text-slate-500 mt-3 text-lg font-medium max-w-2xl">
            Technical assistance or protocol inquiries? Connect with our global administrative node for priority resolution.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
           <a 
             href="mailto:arowintrading@gmail.com" 
             className="px-6 py-4 bg-blue-600/10 border border-blue-500/10 rounded-2xl flex items-center gap-4 hover:bg-blue-600 hover:text-white transition-all group"
           >
              <Mail className="text-blue-500 group-hover:text-white transition-colors" size={20} />
              <div className="flex flex-col text-left">
                 <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Trading Node</span>
                 <span className="text-xs font-black">arowintrading@gmail.com</span>
              </div>
           </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left column - Ticket Form */}
        <div className="lg:col-span-2 space-y-8">
          <GlassCard className="p-10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none">
              <LifeBuoy size={200} />
            </div>

            {isSuccess ? (
              <div className="py-20 text-center space-y-8 animate-in zoom-in duration-500">
                <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                  <CheckCircle2 size={48} className="animate-bounce" />
                </div>
                <div className="space-y-4">
                  <h3 className="text-3xl font-black text-white uppercase tracking-tight">Ticket Protocol Active</h3>
                  <p className="text-slate-500 font-bold uppercase tracking-widest text-xs max-w-sm mx-auto leading-relaxed">
                    Your inquiry has been successfully transmitted and routed to <span className="text-blue-500 font-mono">arowintrading@gmail.com</span>. Expect synchronization within 24-48 hours.
                  </p>
                </div>
                <button 
                  onClick={() => setIsSuccess(false)}
                  className="px-10 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all"
                >
                  Return to Support Portal
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 bg-orange-500/10 rounded-2xl text-orange-500 flex items-center justify-center border border-orange-500/20">
                    <MessageSquare size={24} />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-widest text-white">Raise Official Ticket</h3>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Inquiry Category / Subject</label>
                    <select 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-5 text-white font-bold focus:outline-none focus:border-orange-500/40 transition-all appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Select Inquiry Type...</option>
                      <option value="withdrawal">Withdrawal Synchronization Issue</option>
                      <option value="binary">Binary Matching Protocol Error</option>
                      <option value="rank">Rank Advancement Verification</option>
                      <option value="node">Node Security & 2FA Reset</option>
                      <option value="general">General Institutional Inquiry</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Detailed Message Specification</label>
                    <textarea 
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      placeholder="Provide full technical details of your request..."
                      rows={6}
                      className="w-full bg-slate-900 border border-white/5 rounded-2xl px-6 py-5 text-white focus:outline-none focus:border-orange-500/40 transition-all placeholder:text-slate-800 font-medium leading-relaxed resize-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-6">
                  <button 
                    type="submit"
                    disabled={isSubmitting || !subject || !message}
                    className="flex-1 bg-orange-600 text-white font-black py-6 rounded-3xl hover:bg-orange-500 transition-all flex items-center justify-center gap-4 group shadow-2xl shadow-orange-950/20 active:scale-95 disabled:opacity-20 disabled:cursor-not-allowed text-lg uppercase tracking-widest"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="animate-spin" size={24} />
                    ) : (
                      <>TRANSMIT TICKET PROTOCOL <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform duration-300" /></>
                    )}
                  </button>
                  <button 
                    type="button" 
                    className="px-8 py-6 border border-white/10 text-slate-500 font-black rounded-3xl hover:bg-white/5 transition-all text-xs uppercase tracking-widest"
                  >
                    Discard Draft
                  </button>
                </div>
              </form>
            )}
          </GlassCard>
        </div>

        {/* Right column - Knowledge Base & Contact */}
        <div className="space-y-8">
          <GlassCard glow="none" className="p-8 space-y-8 border-orange-500/5 bg-orange-500/[0.02]">
            <h4 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-3">
              <AlertTriangle size={18} className="text-orange-500" /> Administrative Notice
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed font-bold uppercase tracking-widest">
              Please include your <span className="text-white">ARW-8821</span> node identifier in all direct correspondence to <span className="text-blue-500">arowintrading@gmail.com</span> to bypass initial filtering.
            </p>
            <ul className="space-y-4 pt-4 border-t border-white/5">
              {[
                { label: 'Network Uptime', val: '99.98%' },
                { label: 'Avg. Response Node', val: '4.2h' },
                { label: 'Security Level', val: 'Institutional' }
              ].map((item, idx) => (
                <li key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="text-white">{item.val}</span>
                </li>
              ))}
            </ul>
          </GlassCard>

          <div className="space-y-4">
            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Support Channels</p>
            
            <a 
              href="mailto:arowintrading@gmail.com" 
              className="block p-6 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/10 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                    <Mail size={18} />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-white uppercase tracking-tight">Trading Support Node</h5>
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">arowintrading@gmail.com</p>
                  </div>
                </div>
                <ExternalLink size={16} className="text-slate-700 group-hover:text-white transition-colors" />
              </div>
            </a>

            <div className="p-6 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/10 transition-all cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                    <LifeBuoy size={18} />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-white uppercase tracking-tight">Technical Wiki</h5>
                    <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Operator Guidelines</p>
                  </div>
                </div>
                <ArrowRight size={16} className="text-slate-700 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
