
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { ArowinLogo } from '../components/ArowinLogo';
import { TwoFactorAuth } from '../components/TwoFactorAuth';
import { PasswordReset } from '../components/PasswordReset';
import { motion, AnimatePresence } from 'framer-motion';
import { supabaseService } from '../services/supabaseService';

const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [show2FA, setShow2FA] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [operatorId, setOperatorId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async () => {
    if (!operatorId || !password) return;
    setIsAuthorizing(true);
    setError(null);
    
    try {
      // Supabase Login with Operator ID
      await supabaseService.login(operatorId, password);
      setIsAuthorizing(false);
      setShow2FA(true);
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(supabaseService.formatError(err));
      setIsAuthorizing(false);
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

  const handleVerify = () => {
    onLogin();
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-6 relative overflow-hidden font-inter text-slate-100">
      {/* Background Atmosphere - Large Dark Blue Glow as seen in screenshot */}
      <div className="absolute top-[-20%] left-[-10%] w-[1000px] h-[1000px] bg-[#0f172a] rounded-full blur-[150px] opacity-40 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-[#422006] rounded-full blur-[120px] opacity-20 pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Logo Section matching the screenshot */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="relative inline-block mb-6 cursor-pointer" onClick={() => navigate('/')}>
            {/* Dark circular background for logo */}
            <div className="w-36 h-36 bg-[#0f172a]/80 rounded-full border border-blue-900/30 flex items-center justify-center relative overflow-hidden group">
               <div className="absolute inset-0 bg-blue-500/5 blur-xl group-hover:bg-blue-500/10 transition-all duration-500" />
               <ArowinLogo size={96} />
            </div>
          </div>
          <h1 className="text-[44px] font-black tracking-tighter text-white uppercase italic leading-none mb-4">
            AROWIN <span className="text-[#c0841a]">TRADING</span>
          </h1>
          <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.5em] mb-12 opacity-80">
            AUTHORIZED ACCESS INTERFACE
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {showReset ? (
            <PasswordReset 
              key="reset-form"
              onCancel={() => setShowReset(false)}
            />
          ) : !show2FA ? (
            <motion.div 
              key="login-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-[#111112]/90 backdrop-blur-3xl border border-white/5 p-10 rounded-[48px] shadow-[0_40px_100px_rgba(0,0,0,0.8)] space-y-10"
            >
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] ml-2">Operator ID</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-6 flex items-center text-slate-700 group-focus-within:text-blue-500 transition-colors">
                    <Mail size={18} />
                  </div>
                  <input 
                    type="text" 
                    value={operatorId}
                    onChange={(e) => setOperatorId(e.target.value)}
                    placeholder="ARW-XXXXXX" 
                    className="w-full bg-[#0d0d0e] border border-white/5 rounded-2xl pl-16 pr-6 py-5 text-white focus:outline-none focus:border-amber-900/40 transition-all placeholder:text-slate-900 font-black text-sm tracking-wide"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Encrypted Vault Key</label>
                  <button 
                    onClick={() => setShowReset(true)}
                    className="text-[9px] font-black text-amber-500/60 hover:text-amber-500 uppercase tracking-widest transition-colors"
                  >
                    Forgot Key?
                  </button>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-6 flex items-center text-slate-700 group-focus-within:text-blue-500 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    className="w-full bg-[#0d0d0e] border border-white/5 rounded-2xl pl-16 pr-14 py-5 text-white focus:outline-none focus:border-amber-900/40 transition-all placeholder:text-slate-900 font-black text-sm tracking-widest"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-800 hover:text-[#c0841a] transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-black uppercase tracking-widest text-center">
                  {error}
                </div>
              )}

              <button 
                onClick={handleAuth}
                disabled={isAuthorizing || !operatorId}
                className="w-full bg-[#a3680e] hover:bg-[#c0841a] text-white font-black py-6 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-4 group active:scale-95 text-lg uppercase tracking-widest disabled:opacity-50"
              >
                {isAuthorizing ? (
                  <RefreshCw className="animate-spin" size={24} />
                ) : (
                  <>
                    AUTHORIZE
                    <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform duration-300" />
                  </>
                )}
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                  <span className="bg-[#111112] px-4 text-slate-700">Or continue with</span>
                </div>
              </div>

              <button 
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
              
              <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.3em] px-2">
                 <button onClick={() => setShowReset(true)} className="text-slate-700 hover:text-white transition-colors">Recover Protocol</button>
                 <button onClick={() => navigate('/register')} className="text-blue-600 hover:text-blue-400 transition-all">Initialize Node</button>
              </div>
            </motion.div>
          ) : (
            <TwoFactorAuth 
              key="2fa-form"
              emailOrId={operatorId}
              onVerify={handleVerify}
              onCancel={() => setShow2FA(false)}
            />
          )}
        </AnimatePresence>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-12 text-center"
        >
           <div className="flex items-center justify-center gap-4 opacity-20 mb-6">
              <ShieldCheck size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">Protocol Secured</span>
           </div>
           <button onClick={() => navigate('/admin/login')} className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-800 hover:text-blue-500 transition-all duration-500">ADMIN GATEWAY</button>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;