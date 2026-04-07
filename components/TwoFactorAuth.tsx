import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, RefreshCw, ArrowRight, Lock, Smartphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabaseService } from '../services/supabaseService';

interface TwoFactorAuthProps {
  onVerify: () => void;
  onCancel: () => void;
  emailOrId: string;
  isDarkMode?: boolean;
}

export const TwoFactorAuth: React.FC<TwoFactorAuthProps> = ({ 
  onVerify, 
  onCancel, 
  emailOrId,
  isDarkMode = true 
}) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [realPin, setRealPin] = useState<string | null>(null);

  useEffect(() => {
    const fetchPin = async () => {
      // Use supabaseService to get the current mock user
      const currentUser = supabaseService.getCurrentUser();
      if (currentUser) {
        try {
          const profile = await supabaseService.getUserProfile(currentUser.id || currentUser.uid) as any;
          if (profile && profile.two_factor_pin) {
            setRealPin(profile.two_factor_pin);
          } else {
            setRealPin('123456'); // Fallback
          }
        } catch (err) {
          console.error('Error fetching 2FA PIN:', err);
          setRealPin('123456');
        }
      } else {
        // If no user, maybe it's an admin login with username/password
        // For now, default to 123456 for mock
        setRealPin('123456');
      }
    };
    fetchPin();
  }, []);

  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendTimer]);

  const handleChange = (index: number, value: string) => {
    if (isNaN(Number(value))) return;
    
    const newCode = [...code];
    newCode[index] = value.substring(value.length - 1);
    setCode(newCode);

    // Move to next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setIsVerifying(true);
    setError(null);

    // Simulate verification
    setTimeout(() => {
      if (fullCode === realPin) { 
        onVerify();
      } else {
        setIsVerifying(false);
        setError('Invalid verification code. Please try again.');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    }, 1500);
  };

  const handleResend = () => {
    if (resendTimer > 0) return;
    setResendTimer(30);
    setError(null);
    // Simulate resending
  };

  const bgColor = isDarkMode ? 'bg-[#111112]' : 'bg-white';
  const textColor = isDarkMode ? 'text-white' : 'text-slate-900';
  const subTextColor = isDarkMode ? 'text-slate-500' : 'text-slate-400';
  const inputBg = isDarkMode ? 'bg-[#0d0d0e]' : 'bg-slate-50';
  const borderColor = isDarkMode ? 'border-white/5' : 'border-slate-200';

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`${bgColor} ${borderColor} border p-10 rounded-[48px] shadow-2xl space-y-8 w-full`}
    >
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 mb-2">
          <Smartphone size={32} />
        </div>
        <h2 className={`text-2xl font-black uppercase tracking-tight ${textColor}`}>Two-Factor Auth</h2>
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${subTextColor}`}>
          A verification code has been sent to your registered device for <span className="text-blue-500">{emailOrId}</span>
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between gap-2">
          {code.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className={`w-12 h-16 ${inputBg} border ${borderColor} rounded-xl text-center text-xl font-black ${textColor} focus:outline-none focus:border-blue-500/50 transition-all`}
            />
          ))}
        </div>

        {error && (
          <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>
        )}

        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
        >
          {isVerifying ? (
            <RefreshCw className="animate-spin" size={20} />
          ) : (
            <>
              VERIFY & CONTINUE
              <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" />
            </>
          )}
        </button>

        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={handleResend}
            disabled={resendTimer > 0}
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${resendTimer > 0 ? 'text-slate-700' : 'text-blue-500 hover:text-blue-400'}`}
          >
            {resendTimer > 0 ? `RESEND CODE IN ${resendTimer}S` : 'RESEND VERIFICATION CODE'}
          </button>
          
          <button 
            onClick={onCancel}
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${subTextColor} hover:text-white transition-colors`}
          >
            BACK TO LOGIN
          </button>
        </div>
      </div>

      <div className="pt-4 flex items-center justify-center gap-3 opacity-20">
        <ShieldCheck size={14} />
        <span className="text-[8px] font-black uppercase tracking-widest">End-to-End Encrypted Verification</span>
      </div>
    </motion.div>
  );
};
