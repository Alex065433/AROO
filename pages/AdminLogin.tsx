
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, Terminal, Lock, UserCircle, 
  ArrowRight, RefreshCw, AlertCircle, Fingerprint,
  Activity, Key, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArowinLogo } from '../components/ArowinLogo';
import { TwoFactorAuth } from '../components/TwoFactorAuth';
import { PasswordReset } from '../components/PasswordReset';
import { supabaseService } from '../services/supabaseService';

const AdminLogin: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReset, setShowReset] = useState(false);

  const isAuthenticatingRef = React.useRef(false);

  const handleSetupAdmin = async () => {
    const secret = prompt('Enter Setup Secret Key:');
    if (!secret) return;
    
    setIsAuthenticating(true);
    try {
      const result = await supabaseService.setupAdmin(secret);
      alert(result.message);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Setup failed.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsAuthenticating(true);
    isAuthenticatingRef.current = true;

    // Safety timeout to prevent infinite buffering
    const timeout = setTimeout(() => {
      if (isAuthenticatingRef.current) {
        setIsAuthenticating(false);
        isAuthenticatingRef.current = false;
        setError('Connection timeout. The database is taking longer than expected to wake up. Please try again in a moment.');
      }
    }, 45000);

    try {
      // Unique Admin Login Protocol - using the same login service
      const authData = await supabaseService.login(username, password);
      
      // For Admin, we MUST verify role before proceeding to 2FA
      const profile = await supabaseService.getUserProfile(authData.user.id);
      
      if (!profile || profile.role !== 'admin') {
        await supabaseService.logout();
        throw new Error('Unauthorized: You do not have administrative privileges.');
      }

      clearTimeout(timeout);
      setIsAuthenticating(false);
      isAuthenticatingRef.current = false;
      
      // Save for 2FA page display
      localStorage.setItem('arowin_login_id', username);
      
      // Proceed to dashboard, App.tsx will handle the redirect to /two-factor if needed
      onLogin();
      navigate('/admin/dashboard');
    } catch (err: any) {
      clearTimeout(timeout);
      console.error('Admin login failed:', err);
      setError(err.message || 'Authorization Failed: Invalid System Signature.');
      setIsAuthenticating(false);
      isAuthenticatingRef.current = false;
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    try {
      const user = await supabaseService.loginWithGoogle() as any;
      const profile = await supabaseService.getUserProfile(user.id);
      
      if (profile?.role !== 'admin') {
        await supabaseService.logout();
        throw new Error('Unauthorized: Google account is not registered as an administrator.');
      }

      onLogin();
      navigate('/admin/dashboard');
    } catch (err: any) {
      console.error('Google login failed:', err);
      setError(err.message || 'Google authentication failed.');
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden font-inter">
      {/* Security Mesh Background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:24px_24px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(30,64,175,0.1)_0,transparent_70%)] pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center justify-center mb-8 relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full scale-150" />
            <ArowinLogo size={96} />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-2 uppercase italic">AROWIN <span className="text-blue-500">CORE</span></h1>
          <p className="text-slate-500 font-bold text-[10px] uppercase tracking-[0.5em]">Internal Administration Gateway</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {showReset ? (
            <PasswordReset 
              key="reset-form"
              onCancel={() => setShowReset(false)}
            />
          ) : (
            <motion.div 
              key="login-form"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 p-12 rounded-[48px] shadow-[0_32px_128px_rgba(0,0,0,0.8)] space-y-8"
            >
              <div className="flex items-center gap-3 p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 mb-2">
                 <Shield className="text-blue-500" size={18} />
                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Access Only</span>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-2">Administrative ID</label>
                  <div className="relative group">
                    <UserCircle className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                      type="text" 
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ARW-ADMIN-01" 
                      className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-14 pr-6 py-5 text-blue-400 font-mono focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-slate-900 text-sm font-bold"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center px-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Protocol Password</label>
                    <button 
                      type="button"
                      onClick={() => setShowReset(true)}
                      className="text-[9px] font-black text-blue-500/60 hover:text-blue-500 uppercase tracking-widest transition-colors"
                    >
                      Forgot?
                    </button>
                  </div>
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-700 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••" 
                      className="w-full bg-slate-950/50 border border-white/5 rounded-2xl pl-14 pr-6 py-5 text-blue-400 font-mono focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-slate-900 text-sm font-bold tracking-widest"
                      required
                    />
                  </div>
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500"
                    >
                      <AlertCircle size={16} />
                      <span className="text-[11px] font-black uppercase tracking-widest">{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button 
                  type="submit"
                  disabled={isAuthenticating}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-6 rounded-2xl shadow-xl shadow-blue-900/20 transition-all flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
                >
                  {isAuthenticating ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      <span>INITIALIZING...</span>
                    </>
                  ) : (
                    <>
                      <span>INITIALIZE SYSTEM LOGIN</span>
                      <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                    </>
                  )}
                </button>
              </form>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5"></div>
                </div>
                <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                  <span className="bg-[#0f172a] px-4 text-slate-700">Or authenticate via</span>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 font-black py-5 rounded-2xl border border-blue-500/10 transition-all flex items-center justify-center gap-4 group active:scale-95 text-xs uppercase tracking-widest"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google Admin Protocol
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-12 flex flex-col items-center gap-6"
        >
          <div className="flex flex-col items-center gap-6">
            <div className="flex justify-center gap-8 text-[9px] font-black uppercase tracking-[0.3em] text-slate-700">
              <span className="flex items-center gap-2"><Activity size={12} className="text-emerald-500" /> All Systems Nominal</span>
              <span className="flex items-center gap-2"><Fingerprint size={12} className="text-blue-500" /> Biometric Ready</span>
            </div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/login')} 
                className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-800 hover:text-blue-500 transition-all"
              >
                ← BACK TO TRADING PORTAL
              </button>
              <span className="text-slate-900">|</span>
              <button 
                onClick={handleSetupAdmin} 
                className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-800 hover:text-blue-500 transition-all"
              >
                EMERGENCY SYSTEM INITIALIZATION
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AdminLogin;

