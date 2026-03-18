import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Key, ShieldCheck, ArrowRight, RefreshCw, CheckCircle2, Lock, Eye, EyeOff } from 'lucide-react';

interface PasswordResetProps {
  onCancel: () => void;
  isDarkMode?: boolean;
}

type ResetStep = 'email' | 'otp' | 'new-password' | 'success';

export const PasswordReset: React.FC<PasswordResetProps> = ({ onCancel, isDarkMode = true }) => {
  const [step, setStep] = useState<ResetStep>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('otp');
    }, 1500);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('new-password');
    }, 1500);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('success');
    }, 2000);
  };

  const bgColor = isDarkMode ? 'bg-[#111112]/90' : 'bg-white';
  const inputBg = isDarkMode ? 'bg-[#0d0d0e]' : 'bg-slate-50';
  const borderColor = isDarkMode ? 'border-white/5' : 'border-slate-200';
  const textColor = isDarkMode ? 'text-white' : 'text-slate-900';
  const subTextColor = isDarkMode ? 'text-slate-500' : 'text-slate-400';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`${bgColor} backdrop-blur-3xl border ${borderColor} p-10 rounded-[48px] shadow-2xl space-y-8 w-full`}
    >
      <AnimatePresence mode="wait">
        {step === 'email' && (
          <motion.div
            key="email"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 mb-2">
                <Mail size={32} />
              </div>
              <h2 className={`text-2xl font-black uppercase tracking-tight ${textColor}`}>Reset Protocol</h2>
              <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${subTextColor}`}>
                Enter your registered identity to receive a decryption key
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-6 flex items-center text-slate-700 group-focus-within:text-amber-500 transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Identity Email"
                    className={`w-full ${inputBg} border ${borderColor} rounded-2xl pl-16 pr-6 py-5 ${textColor} focus:outline-none focus:border-amber-500/30 transition-all placeholder:text-slate-900 font-black text-sm tracking-wide`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#a3680e] hover:bg-[#c0841a] text-white font-black py-6 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={20} /> : (
                  <>
                    SEND DECRYPTION KEY
                    <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {step === 'otp' && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 mb-2">
                <ShieldCheck size={32} />
              </div>
              <h2 className={`text-2xl font-black uppercase tracking-tight ${textColor}`}>Verify Key</h2>
              <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${subTextColor}`}>
                Decryption key sent to <span className="text-amber-500">{email}</span>
              </p>
            </div>

            <form onSubmit={handleOtpSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-6 flex items-center text-slate-700 group-focus-within:text-blue-500 transition-colors">
                    <Key size={18} />
                  </div>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="6-Digit Key"
                    className={`w-full ${inputBg} border ${borderColor} rounded-2xl pl-16 pr-6 py-5 ${textColor} focus:outline-none focus:border-blue-500/30 transition-all placeholder:text-slate-900 font-black text-sm tracking-[0.5em] text-center`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-6 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={20} /> : (
                  <>
                    VERIFY PROTOCOL
                    <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {step === 'new-password' && (
          <motion.div
            key="new-password"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-8"
          >
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-2">
                <Lock size={32} />
              </div>
              <h2 className={`text-2xl font-black uppercase tracking-tight ${textColor}`}>New Vault Key</h2>
              <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${subTextColor}`}>
                Establish a new secure access signature
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-6 flex items-center text-slate-700 group-focus-within:text-emerald-500 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Password"
                    className={`w-full ${inputBg} border ${borderColor} rounded-2xl pl-16 pr-14 py-5 ${textColor} focus:outline-none focus:border-emerald-500/30 transition-all placeholder:text-slate-900 font-black text-sm tracking-widest`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-800 hover:text-emerald-500 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-6 flex items-center text-slate-700 group-focus-within:text-emerald-500 transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm Password"
                    className={`w-full ${inputBg} border ${borderColor} rounded-2xl pl-16 pr-6 py-5 ${textColor} focus:outline-none focus:border-emerald-500/30 transition-all placeholder:text-slate-900 font-black text-sm tracking-widest`}
                  />
                </div>
              </div>

              {error && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-6 rounded-2xl shadow-2xl transition-all flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={20} /> : (
                  <>
                    UPDATE VAULT KEY
                    <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8 py-4"
          >
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-emerald-500/10 text-emerald-500 mb-2 relative">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 12 }}
              >
                <CheckCircle2 size={64} />
              </motion.div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-emerald-500/5 rounded-full blur-xl"
              />
            </div>
            <div className="space-y-4">
              <h2 className={`text-3xl font-black uppercase tracking-tight ${textColor}`}>Protocol Restored</h2>
              <p className={`text-[11px] font-bold uppercase tracking-[0.2em] ${subTextColor} max-w-[280px] mx-auto leading-relaxed`}>
                Your access signature has been successfully updated. You may now re-authorize.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-6 rounded-2xl transition-all uppercase tracking-widest text-xs"
            >
              RETURN TO LOGIN
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {step !== 'success' && (
        <div className="flex justify-center">
          <button
            onClick={onCancel}
            className={`text-[10px] font-black uppercase tracking-[0.3em] ${subTextColor} hover:text-white transition-colors`}
          >
            CANCEL RESET
          </button>
        </div>
      )}
    </motion.div>
  );
};
