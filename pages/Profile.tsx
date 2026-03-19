
import React, { useState, useRef, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { MOCK_USER } from '../constants';
import { supabaseService } from '../services/supabaseService';
import { 
  User, Mail, Phone, Lock, Camera, Save, 
  ShieldCheck, AlertCircle, Fingerprint, Globe,
  ShieldAlert, X, ArrowRight, RefreshCw, CheckCircle2
} from 'lucide-react';

const Profile: React.FC = () => {
  const [userData, setUserData] = useState({
    name: MOCK_USER.name,
    email: MOCK_USER.email,
    mobile: MOCK_USER.mobile,
    password: '••••••••••••',
    withdrawalPassword: '',
    twoFactorPin: '',
    operatorId: MOCK_USER.id,
    sponsorId: MOCK_USER.sponsorId
  });
  
  const [newPassword, setNewPassword] = useState('');
  const [newWithdrawalPassword, setNewWithdrawalPassword] = useState('');
  const [newTwoFactorPin, setNewTwoFactorPin] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [avatar, setAvatar] = useState(`https://api.dicebear.com/7.x/avataaars/svg?seed=${MOCK_USER.name}`);
  const [showVerification, setShowVerification] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [isLoadingReferrals, setIsLoadingReferrals] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribe = supabaseService.onAuthChange(async (user) => {
      if (user) {
        try {
          const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
          if (profile) {
            setUserData({
              name: profile.name,
              email: profile.email,
              mobile: profile.mobile,
              password: '••••••••••••',
              withdrawalPassword: profile.withdrawal_password || '',
              twoFactorPin: profile.two_factor_pin || '',
              operatorId: profile.operator_id || profile.id,
              sponsorId: profile.sponsor_id || 'SPN-001'
            });
            setAvatar(`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.name}`);
            
            // Fetch referrals
            setIsLoadingReferrals(true);
            const refs = await supabaseService.getReferrals(profile.id);
            setReferrals(refs);
            setIsLoadingReferrals(false);
          }
        } catch (err) {
          console.error('Error fetching profile or referrals:', err);
          setIsLoadingReferrals(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const user = supabaseService.getCurrentUser();
      if (!user) throw new Error('User not found');

      // 1. Update Profile (Name, Mobile)
      await supabaseService.createUserProfile(user.id || user.uid, {
        name: userData.name,
        mobile: userData.mobile
      });

      // 2. Update Security Key (Account Password) if provided
      if (newPassword) {
        await supabaseService.updatePassword(newPassword);
        setNewPassword('');
      }

      // 3. Update Withdrawal Password and 2FA PIN if provided
      const securityData: any = {};
      if (newWithdrawalPassword) securityData.withdrawal_password = newWithdrawalPassword;
      if (newTwoFactorPin) securityData.two_factor_pin = newTwoFactorPin;

      if (Object.keys(securityData).length > 0) {
        await supabaseService.updateSecuritySettings(user.id || user.uid, securityData);
        setNewWithdrawalPassword('');
        setNewTwoFactorPin('');
      }

      setSuccessMsg('Security protocols and profile synchronized successfully.');
      
      // Refresh local data
      const updatedProfile = await supabaseService.getUserProfile(user.id || user.uid) as any;
      if (updatedProfile) {
        setUserData(prev => ({
          ...prev,
          name: updatedProfile.name,
          mobile: updatedProfile.mobile,
          withdrawalPassword: updatedProfile.withdrawal_password,
          twoFactorPin: updatedProfile.two_factor_pin
        }));
      }
    } catch (err: any) {
      console.error('Update Error:', err);
      setError(err.message || 'Failed to synchronize profile.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateInitiation = (e: React.FormEvent) => {
    e.preventDefault();
    setShowVerification(true);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto focus next
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleConfirmVerification = () => {
    setIsVerifying(true);
    // Simulate API delay
    setTimeout(() => {
      setIsVerifying(false);
      setShowVerification(false);
      setOtp(['', '', '', '', '', '']);
      alert('Identity synchronized and verified via secure email protocol.');
    }, 1500);
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20 relative">
      {/* Verification Modal Overlay */}
      {showVerification && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowVerification(false)} />
          <div className="relative w-full max-w-md bg-[#121214] border border-white/10 rounded-[40px] shadow-2xl p-10 animate-in zoom-in duration-300">
            <button 
              onClick={() => setShowVerification(false)}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-orange-500/10 rounded-3xl text-orange-500 mb-2">
                <ShieldAlert size={40} />
              </div>
              <h3 className="text-2xl font-bold text-white tracking-tight">Security Verification</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                A 6-digit synchronization key has been transmitted to <br/>
                <span className="text-orange-500 font-mono font-bold">{userData.email}</span>
              </p>

              <div className="flex justify-between gap-2 py-6">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    id={`otp-${idx}`}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(idx, e.target.value)}
                    className="w-12 h-14 bg-white/5 border border-white/10 rounded-xl text-center text-xl font-bold text-orange-500 focus:outline-none focus:border-orange-500 transition-all"
                  />
                ))}
              </div>

              <div className="space-y-4">
                <button 
                  onClick={handleConfirmVerification}
                  disabled={isVerifying || otp.some(d => !d)}
                  className="w-full bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl hover:bg-orange-500 transition-all flex items-center justify-center gap-3"
                >
                  {isVerifying ? (
                    <RefreshCw className="animate-spin" size={20} />
                  ) : (
                    <>CONFIRM KEY <ArrowRight size={20} /></>
                  )}
                </button>
                <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest cursor-pointer hover:text-orange-500 transition-colors">
                  Didn't receive code? Resend Protocol
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/5 pb-10">
        <div>
          <h2 className="text-5xl font-black uppercase tracking-tight text-white">Identity Core</h2>
          <p className="text-slate-500 mt-3 text-lg font-medium max-w-2xl">Manage your digital presence and security protocols for the Arowin Trading network.</p>
        </div>
        <div className="px-6 py-4 bg-orange-500/10 rounded-2xl border border-orange-500/10 flex items-center gap-3">
          <Fingerprint className="text-orange-500" size={20} />
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-500/60">Node Security</span>
            <span className="text-lg font-black text-white">Verified Level 2</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: Avatar & Immutable Info */}
        <div className="space-y-8">
          <GlassCard className="flex flex-col items-center text-center p-12">
            <div className="relative group mb-8">
              <div className="w-40 h-40 rounded-full border-4 border-orange-500/30 p-1.5 overflow-hidden transition-all duration-500 group-hover:border-orange-500">
                <img src={avatar} alt="Profile" className="w-full h-full rounded-full bg-slate-800 object-cover" />
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2 right-2 p-3 bg-orange-600 text-white rounded-full shadow-xl hover:bg-orange-500 transition-all active:scale-90"
              >
                <Camera size={20} />
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageUpload} 
                className="hidden" 
                accept="image/*"
              />
            </div>
            <h3 className="text-2xl font-bold text-white">{userData.name}</h3>
            <p className="text-orange-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Node Operator</p>
            
            <div className="w-full mt-10 pt-10 border-t border-white/5 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 uppercase tracking-widest font-black text-[10px]">Registry ID</span>
                <span className="font-mono text-slate-300">{userData.operatorId}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 uppercase tracking-widest font-black text-[10px]">Sponsor Protocol</span>
                <span className="font-mono text-slate-300">{userData.sponsorId}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 uppercase tracking-widest font-black text-[10px]">Origin Node</span>
                <span className="font-mono text-slate-300">US-EAST-01</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard glow="none" className="bg-orange-600/5 border-orange-500/10">
            <div className="flex gap-4">
              <AlertCircle className="text-orange-500 shrink-0" size={24} />
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-white uppercase tracking-widest">Locked Attributes</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Registry ID and Sponsor Protocol are cryptographically bound to your node and cannot be modified after enrollment.</p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Right Column: Editable Details */}
        <div className="lg:col-span-2">
          <GlassCard>
            <form onSubmit={handleUpdateProfile} className="space-y-8 p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <ShieldCheck className="text-orange-500" size={24} />
                  <h3 className="text-xl font-bold uppercase tracking-widest">Operator Configuration</h3>
                </div>
                {isUpdating && <RefreshCw className="animate-spin text-orange-500" size={20} />}
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-500 text-sm">
                  <CheckCircle2 size={18} />
                  {successMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Identity Name</label>
                  <div className="relative">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="text" 
                      value={userData.name}
                      onChange={e => setUserData({...userData, name: e.target.value})}
                      className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold focus:outline-none focus:border-orange-500/40 transition-all" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Secure Email Access</label>
                  <div className="relative">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="email" 
                      value={userData.email}
                      readOnly
                      className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-slate-500 font-bold focus:outline-none cursor-not-allowed" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Mobile Uplink</label>
                  <div className="relative">
                    <Phone className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="tel" 
                      value={userData.mobile}
                      onChange={e => setUserData({...userData, mobile: e.target.value})}
                      className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold focus:outline-none focus:border-orange-500/40 transition-all" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Change Security Key (Password)</label>
                  <div className="relative">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="password" 
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold focus:outline-none focus:border-orange-500/40 transition-all placeholder:text-slate-700" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Change Withdrawal Password</label>
                  <div className="relative">
                    <ShieldAlert className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="password" 
                      value={newWithdrawalPassword}
                      onChange={e => setNewWithdrawalPassword(e.target.value)}
                      placeholder="Enter new withdrawal password"
                      className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold focus:outline-none focus:border-orange-500/40 transition-all placeholder:text-slate-700" 
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Change 2FA Security PIN</label>
                  <div className="relative">
                    <Fingerprint className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                    <input 
                      type="text" 
                      maxLength={6}
                      value={newTwoFactorPin}
                      onChange={e => setNewTwoFactorPin(e.target.value)}
                      placeholder="Enter new 6-digit PIN"
                      className="w-full bg-slate-900/50 border border-white/5 rounded-2xl pl-14 pr-6 py-4 text-white font-bold focus:outline-none focus:border-orange-500/40 transition-all placeholder:text-slate-700" 
                    />
                  </div>
                </div>
              </div>

              <div className="pt-8 flex flex-col md:flex-row gap-6">
                <button 
                  type="submit"
                  disabled={isUpdating}
                  className="flex-1 bg-orange-600 text-white font-black py-5 rounded-2xl hover:bg-orange-500 hover:shadow-[0_20px_40px_rgba(249,115,22,0.2)] transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl shadow-orange-950/20 disabled:opacity-50"
                >
                  {isUpdating ? 'SYNCHRONIZING...' : 'SYNCHRONIZE SECURITY PROTOCOLS'}
                  <Save size={22} />
                </button>
              </div>
            </form>
          </GlassCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10">
            <GlassCard className="flex items-center gap-6 p-8">
              <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-2xl">
                <Globe size={24} />
              </div>
              <div>
                <h4 className="font-bold text-white">Global Visibility</h4>
                <p className="text-xs text-slate-500 mt-1">Your profile is visible to your direct up-line for network optimization.</p>
              </div>
            </GlassCard>
            <GlassCard className="flex items-center gap-6 p-8">
              <div className="p-4 bg-blue-500/10 text-blue-500 rounded-2xl">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h4 className="font-bold text-white">Encrypted Vault</h4>
                <p className="text-xs text-slate-500 mt-1">Personal data is stored on decentralized nodes with AES-256 encryption.</p>
              </div>
            </GlassCard>
          </div>

          {/* Sponsor Protocol Section */}
          <div className="mt-12 space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center text-orange-500">
                <User size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white">Sponsor Protocol</h3>
                <p className="text-slate-500 text-sm font-medium">Direct referrals registered under your operator identity.</p>
              </div>
            </div>

            <GlassCard className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5">
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Identity</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Registry ID</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Enrollment Date</th>
                      <th className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {isLoadingReferrals ? (
                      <tr>
                        <td colSpan={4} className="px-8 py-20 text-center">
                          <RefreshCw className="animate-spin text-orange-500 mx-auto mb-4" size={32} />
                          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Syncing Referrals...</p>
                        </td>
                      </tr>
                    ) : referrals.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-8 py-20 text-center">
                          <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No direct referrals detected in registry</p>
                        </td>
                      </tr>
                    ) : (
                      referrals.map((ref, idx) => (
                        <tr key={idx} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center overflow-hidden border border-white/5 group-hover:border-orange-500/50 transition-all">
                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${ref.name}`} alt="Avatar" className="w-full h-full object-cover" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{ref.name}</p>
                                <p className="text-[10px] text-slate-500 font-medium">{ref.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className="font-mono text-xs text-slate-400">{ref.operator_id}</span>
                          </td>
                          <td className="px-8 py-6">
                            <span className="text-xs text-slate-500">{new Date(ref.created_at).toLocaleDateString()}</span>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${ref.active_package > 0 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]'}`} />
                              <span className={`text-[10px] font-black uppercase tracking-widest ${ref.active_package > 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {ref.active_package > 0 ? 'Active' : 'Pending'}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
