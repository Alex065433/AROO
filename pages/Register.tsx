
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, ShieldCheck, Mail, Phone, Lock, ChevronDown, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { ArowinLogo } from '../components/ArowinLogo';
import { supabaseService } from '../services/supabaseService';

const Register: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [sponsorId, setSponsorId] = useState('ARW-REF-882');
  const [parentId, setParentId] = useState<string | null>(null);
  const [sponsorName, setSponsorName] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [twoFactorPin, setTwoFactorPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<'LEFT' | 'RIGHT' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = params.get('ref');
    const parentParam = params.get('parent');
    const sideParam = params.get('side');
    
    if (ref) setSponsorId(ref);
    if (parentParam) setParentId(parentParam);
    if (sideParam === 'left' || sideParam === 'right') {
      setSide(sideParam.toUpperCase() as 'LEFT' | 'RIGHT');
    }
  }, [location]);

  useEffect(() => {
    const fetchSponsor = async () => {
      if (sponsorId.length >= 6) {
        const sponsor = await supabaseService.findUserByOperatorId(sponsorId);
        if (sponsor) {
          setSponsorName(sponsor.name);
        } else {
          setSponsorName(null);
        }
      } else {
        setSponsorName(null);
      }
    };
    const fetchParent = async () => {
      if (parentId && parentId.length >= 6) {
        const parent = await supabaseService.findUserByOperatorId(parentId);
        if (parent) {
          setParentName(parent.name);
        } else {
          setParentName(null);
        }
      } else {
        setParentName(null);
      }
    };
    fetchSponsor();
    fetchParent();
  }, [sponsorId, parentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Supabase Registration (Real Logic)
      const user = await supabaseService.register(email, password, sponsorId, side || 'LEFT', {
        name: name || 'New Operator',
        mobile: mobile || '',
        withdrawalPassword: withdrawalPassword,
        twoFactorPin: twoFactorPin || '123456',
        parentId: parentId
      });
      
      setIsSubmitting(false);
      setIsSuccess(true);
      setTimeout(() => {
        onLogin();
        navigate('/dashboard');
      }, 2500);
    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(supabaseService.formatError(err));
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const user = await supabaseService.loginWithGoogle() as any;
      
      // Check if profile exists, if not create one
      const profile = await supabaseService.getUserProfile(user.id);
      if (!profile) {
        await supabaseService.createUserProfile(user.id, {
          name: user.user_metadata?.full_name || 'New Operator',
          email: user.email || '',
          mobile: '',
          operator_id: `ARW-${Math.floor(100000 + Math.random() * 900000)}`,
          rank: 1,
          wallets: {
            master: { balance: 0, currency: 'USDT' },
            referral: { balance: 0, currency: 'USDT' },
            matching: { balance: 0, currency: 'USDT' },
            rankBonus: { balance: 0, currency: 'USDT' },
            rewards: { balance: 0, currency: 'USDT' },
          },
          team_size: { left: 0, right: 0 },
          matched_pairs: 0,
          role: 'user'
        });
      }

      onLogin();
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError(supabaseService.formatError(err));
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center p-10 font-inter">
        <div className="text-center space-y-8 animate-in zoom-in duration-500">
           <div className="w-32 h-32 bg-emerald-500/20 border border-emerald-500/30 rounded-[40px] flex items-center justify-center mx-auto text-emerald-500">
              <CheckCircle2 size={64} className="animate-bounce" />
           </div>
           <h1 className="text-4xl font-black text-white uppercase tracking-tight">Enrollment Successful</h1>
           <p className="text-slate-500 font-bold uppercase tracking-widest text-sm max-w-sm mx-auto">
             Your node is now synchronizing with the Arowin Network. Redirecting to access portal...
           </p>
           <div className="pt-4">
              <RefreshCw className="text-emerald-500 animate-spin mx-auto" size={24} />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0b] py-20 px-6 relative flex flex-col items-center justify-start overflow-y-auto font-inter">
      {/* Decorative background element */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-orange-500/10 rounded-full blur-[150px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-orange-600/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      <div className="w-full max-w-3xl relative z-10 animate-in fade-in slide-in-from-bottom-10">
        <div className="text-center mb-16">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-orange-600/10 border border-orange-500/20 rounded-[32px] mb-8 overflow-hidden">
            <ArowinLogo size={64} />
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-4">Node Enrollment</h1>
          <p className="text-slate-400 text-lg uppercase tracking-[0.1em] font-black">get your free AROWIN TRADING account now</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#121214]/80 backdrop-blur-3xl border border-white/10 p-12 rounded-[50px] shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="md:col-span-2 space-y-3">
              <label className="text-[10px] font-black text-orange-500 uppercase tracking-[0.3em] ml-1">Sponsor Protocol ID</label>
              <input 
                required 
                type="text" 
                value={sponsorId}
                onChange={(e) => setSponsorId(e.target.value)}
                className="w-full bg-slate-900/60 border border-orange-500/20 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none focus:border-orange-500/50" 
              />
              {sponsorName && (
                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest ml-1">
                  Sponsor: {sponsorName}
                </p>
              )}
            </div>

            {parentId && (
              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] ml-1">Placement Parent ID</label>
                <input 
                  readOnly
                  type="text" 
                  value={parentId}
                  className="w-full bg-slate-900/60 border border-blue-500/20 rounded-2xl px-6 py-4 text-white font-mono focus:outline-none opacity-70" 
                />
                {parentName && (
                  <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest ml-1">
                    Parent: {parentName} ({side} Side)
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Full Legal Name</label>
              <input 
                required 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe" 
                className="w-full bg-slate-900/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500/40" 
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Electronic Mail</label>
              <div className="relative">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                <input 
                  required 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@mail.com" 
                  className="w-full bg-slate-900/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white focus:outline-none" 
                />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Mobile Access</label>
              <div className="relative">
                <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                <input 
                  required 
                  type="tel" 
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="+1 (000) 000-0000" 
                  className="w-full bg-slate-900/40 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white focus:outline-none" 
                />
              </div>
            </div>


            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Security Key</label>
              <input 
                required 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-slate-900/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none" 
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Confirm Security Key</label>
              <input 
                required 
                type="password" 
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-slate-900/40 border border-white/5 rounded-2xl px-6 py-4 text-white focus:outline-none" 
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-orange-500 uppercase tracking-widest ml-1">Withdrawal Password</label>
              <input 
                required 
                type="password" 
                value={withdrawalPassword}
                onChange={(e) => setWithdrawalPassword(e.target.value)}
                placeholder="••••••••" 
                className="w-full bg-slate-900/40 border border-orange-500/20 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500/50" 
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-blue-500 uppercase tracking-widest ml-1">Setup 2FA PIN (6 Digits)</label>
              <input 
                required 
                type="text" 
                maxLength={6}
                value={twoFactorPin}
                onChange={(e) => setTwoFactorPin(e.target.value.replace(/\D/g, ''))}
                placeholder="123456" 
                className="w-full bg-slate-900/40 border border-blue-500/20 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-blue-500/50" 
              />
            </div>

            <div className="md:col-span-2 pt-8">
              <div className="flex items-center gap-4 p-6 bg-orange-500/5 border border-orange-500/10 rounded-3xl mb-10">
                <ShieldCheck className="text-orange-500 shrink-0" size={24} />
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold leading-relaxed">By creating a node, you acknowledge the risk-based nature of matching dividends and decentralized growth protocols under the Arowin Trading framework.</p>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl mb-6 text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                  {error}
                </div>
              )}

              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-orange-600 text-white font-black py-5 rounded-2xl hover:bg-orange-500 disabled:opacity-50 transition-all flex items-center justify-center gap-3 group active:scale-95 shadow-xl shadow-orange-950/20"
              >
                {isSubmitting ? (
                  <RefreshCw className="animate-spin" size={22} />
                ) : (
                  <>
                    ENROLL PROTOCOL NODE
                    <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform" />
                  </>
                )}
              </button>

              <div className="relative py-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                  <span className="bg-[#121214] px-4 text-slate-700">Or expedite with</span>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-black py-5 rounded-2xl border border-white/5 transition-all flex items-center justify-center gap-4 group active:scale-95 text-sm uppercase tracking-widest"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google Protocol
              </button>
            </div>
          </div>
        </form>

        <p className="text-center mt-12 text-slate-500 font-medium pb-20">
          Existing Operator? <button onClick={() => navigate('/login')} className="text-orange-500 font-bold hover:underline ml-2">Log in to Portal</button>
        </p>
      </div>
    </div>
  );
};

export default Register;
