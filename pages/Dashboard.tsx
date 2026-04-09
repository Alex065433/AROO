import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  TrendingUp, Info, Wallet, CheckCircle2, X, ArrowRight, RefreshCw, 
  DollarSign, Copy, Check, ChevronDown, HelpCircle, 
  User, Scan, ArrowLeft, Zap, BellRing, Megaphone, ShieldCheck, AlertCircle,
  QrCode, Search, ShieldAlert, Package
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_USER, RANKS, PACKAGES, RANK_NAMES } from '../constants';
import { ArowinLogo } from '../components/ArowinLogo';

import { supabaseService } from '../services/supabaseService';
import { supabase } from '../services/supabase';
import { apiFetch } from '../src/lib/api';
import { copyToClipboard as copyUtil } from '../src/lib/clipboard';

const Modal: React.FC<{ 
  title: string; 
  isOpen: boolean; 
  onClose: () => void; 
  children: React.ReactNode;
  isBinanceStyle?: boolean;
}> = ({ title, isOpen, onClose, children, isBinanceStyle = false }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-lg h-full md:h-auto md:max-h-[95vh] bg-[#0b0e11] ${isBinanceStyle ? '' : 'border border-white/10 rounded-[40px] overflow-hidden'} shadow-2xl flex flex-col animate-in zoom-in duration-300`}>
        {isBinanceStyle ? (
          <div className="px-6 py-4 flex justify-between items-center border-b border-[#1e2329]">
            <button onClick={onClose} className="p-2 text-white/90 hover:text-white transition-colors">
              <ArrowLeft size={22} />
            </button>
            <div className="flex flex-col items-center">
              <h3 className="text-lg font-bold text-white tracking-tight">Send {title}</h3>
              <button className="flex items-center gap-1 text-[#848e9c] text-[10px] font-bold mt-0.5">
                On-chain Transfer <ChevronDown size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 text-[#848e9c] hover:text-white"><HelpCircle size={22} /></button>
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 p-6 flex justify-between items-center">
            <h3 className="text-lg font-black uppercase tracking-widest text-white">{title}</h3>
            <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>
        )}
        
        <div className={`flex-1 overflow-y-auto custom-scrollbar ${isBinanceStyle ? 'p-6' : 'p-10'}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

const WalletCardRow: React.FC<{ 
  title: string; 
  amount: number; 
  buttons: { label: string; action?: () => void; color?: string; disabled?: boolean }[];
  isMaster?: boolean;
}> = ({ title, amount, buttons, isMaster = false }) => {
  return (
    <div className={`w-full bg-[#111112] border border-white/5 rounded-2xl overflow-hidden mb-4 md:mb-8 shadow-2xl transition-all duration-500 hover:border-white/10`}>
      <div className={`w-full py-2.5 md:py-3.5 px-4 md:px-6 flex justify-center items-center relative overflow-hidden ${isMaster ? 'bg-[#3b2a0c]' : 'bg-[#18181b]'}`}>
        <h3 className="text-white text-[10px] md:text-xs font-black uppercase tracking-[0.2em] relative z-10 flex items-center gap-2 md:gap-3">
          {isMaster && <Wallet size={14} className="md:w-4 md:h-4" />}
          {title}
        </h3>
      </div>

      <div className="p-4 md:p-10 text-center bg-[#0d0d0e]">
        <div className="flex flex-col items-center mb-4 md:mb-10">
          <p className="text-2xl md:text-4xl font-black text-slate-200 tracking-tight mb-1 md:mb-2">
            {(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[#c0841a] text-[8px] md:text-[10px] font-black tracking-[0.2em] uppercase">USDT NODE ASSET</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 md:gap-4">
          {buttons.map((btn, idx) => (
            <button 
              key={idx}
              onClick={btn.action}
              disabled={btn.disabled}
              className={`px-4 md:px-6 py-2 md:py-2.5 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg border border-white/5 ${
                btn.disabled ? 'opacity-30 cursor-not-allowed' : (btn.color || 'bg-[#1e293b] text-slate-400 hover:text-white')
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [userData, setUserData] = useState<any>(MOCK_USER);
  const [userWallets, setUserWallets] = useState<any>(MOCK_USER.wallets);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [adminSearchId, setAdminSearchId] = useState('');
  const [adminFundAmount, setAdminFundAmount] = useState('');
  const [adminFoundUser, setAdminFoundUser] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleAdminSearch = async () => {
    if (!adminSearchId) return;
    setIsSearching(true);
    try {
      const user = await supabaseService.findUserByOperatorId(adminSearchId);
      setAdminFoundUser(user);
      if (!user) {
        setNotification("System: Node ID not found in network");
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdminAddFunds = async () => {
    if (!adminFoundUser || !adminFundAmount) return;
    setIsProcessing(true);
    try {
      await supabaseService.addFunds(adminFoundUser.id, parseFloat(adminFundAmount));
      setNotification(`System: ${adminFundAmount} USDT Credited to ${adminFoundUser.operator_id}`);
      setAdminFundAmount('');
      setAdminFoundUser(null);
      setAdminSearchId('');
      fetchAllData();
    } catch (err) {
      console.error('Fund Addition Failed:', err);
      setNotification("System Error: Fund Injection Failed");
    } finally {
      setIsProcessing(false);
    }
  };
  
  const [depositAddress, setDepositAddress] = useState('0x71C7656EC7ab88b098defB751B7401B5f6d8976F');
  const [isCopied, setIsCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [binanceRates, setBinanceRates] = useState<{symbol: string, price: string}[]>([]);

  const [isDepositing, setIsDepositing] = useState(false);
  const [depositAmount, setDepositAmount] = useState('50');
  const [depositCurrency, setDepositCurrency] = useState('usdtbsc');
  const [paymentData, setPaymentData] = useState<any>(null);

  const [adminStatus, setAdminStatus] = useState<{status: string} | null>(null);

  const fetchAllData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      // 1. Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        navigate('/login');
        return null;
      }

      const userId = user.id;

      // 2. Fetch profile and transactions in parallel
      const [profileResponse, transactionsData] = await Promise.all([
        supabaseService.getUserProfile(userId),
        supabaseService.getTransactions(userId)
      ]);

      // 3. Handle profile data
      if (profileResponse) {
        const profile = profileResponse as any;
        console.log('profileResponse:', profile);
        setUserData(profile);

        const masterBalance = Number(profile.wallets?.master?.balance ?? profile.wallet_balance ?? profile.deposit_wallet ?? 0);
        const referralBalance = Number(profile.wallets?.referral?.balance ?? profile.referral_income ?? 0);
        const matchingBalance = Number(profile.wallets?.matching?.balance ?? profile.matching_income ?? 0);
        const rankBalance = Number(profile.wallets?.rankBonus?.balance ?? profile.rank_income ?? 0);
        const incentiveBalance = Number(profile.wallets?.rewards?.balance ?? profile.incentive_income ?? 0);
        const yieldBalance = Number(profile.wallets?.yield?.balance ?? profile.yield_income ?? 0);
        const cappingBoxBalance = profile.wallets?.capping_box?.balance || 0;
        
        setUserWallets({
          master: { balance: Number(masterBalance), currency: 'USDT' },
          referral: { balance: Number(referralBalance), currency: 'USDT' },
          matching: { balance: Number(matchingBalance), currency: 'USDT' },
          yield: { balance: Number(yieldBalance), currency: 'USDT' },
          rankBonus: { balance: Number(rankBalance), currency: 'USDT' },
          rewards: { balance: Number(incentiveBalance), currency: 'USDT' },
          capping_box: { balance: Number(cappingBoxBalance), currency: 'USDT' }
        });
      }
      // 4. Handle transactions
      console.log("USER ID:", userId);
      console.log("INCOME TRANSACTIONS:", transactionsData);
      
      return userId;

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      return null;
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    if (!userData) return;
    const userId = userData.id;
    const transactionsSubscription = supabase
      .channel('public:transactions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `uid=eq.${userId}` }, () => {
        fetchAllData(false); // Silent refresh
      })
      .subscribe();
    
    const paymentsSubscription = supabase
      .channel('public:payments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments', filter: `uid=eq.${userId}` }, () => {
        fetchAllData(false); // Silent refresh
      })
      .subscribe();

    return () => {
      transactionsSubscription.unsubscribe();
      paymentsSubscription.unsubscribe();
    };
  }, [userData]);

  const handleDeposit = async () => {
    if (!userData) return;
    setIsDepositing(true);
    try {
      const data = await apiFetch('create-payment', {
        method: 'POST',
        body: JSON.stringify({
          amount: parseFloat(depositAmount),
          user_id: userData.id,
          currency: "usdtbsc"
        })
      });
      
      setPaymentData(data);
      setNotification('Deposit request created successfully!');
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      console.error('Deposit error:', error);
      setNotification(error.message || 'Failed to create deposit request');
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsDepositing(false);
    }
  };

  useEffect(() => {
    let profileUnsubscribe: (() => void) | undefined;
    let isMounted = true;
    
    const setupDashboard = async () => {
      const userId = await fetchAllData(true); // Initial load with spinner
      
      if (userId && isMounted) {
        profileUnsubscribe = supabaseService.subscribeToProfile(userId, (updatedProfile) => {
          console.log('Real-time profile update received in Dashboard:', updatedProfile);
          if (updatedProfile && isMounted) {
            setUserData(updatedProfile);
            // Use nullish coalescing for better robustness
            const masterBalance = updatedProfile.wallet_balance ?? updatedProfile.deposit_wallet ?? updatedProfile.wallets?.master?.balance ?? 0;
            const referralBalance = updatedProfile.wallets?.referral?.balance ?? updatedProfile.referral_income ?? 0;
            const matchingBalance = updatedProfile.wallets?.matching?.balance ?? updatedProfile.matching_income ?? 0;
            const rankBonusBalance = updatedProfile.wallets?.rankBonus?.balance ?? updatedProfile.rank_income ?? 0;
            const rewardsBalance = updatedProfile.wallets?.rewards?.balance ?? updatedProfile.incentive_income ?? 0;
            const yieldBalance = updatedProfile.wallets?.yield?.balance ?? updatedProfile.yield_income ?? 0;
            const cappingBoxBalance = updatedProfile.wallets?.capping_box?.balance || 0;
            
            setUserWallets({ 
              master: { balance: Number(masterBalance), currency: 'USDT' },
              referral: { balance: Number(referralBalance), currency: 'USDT' },
              matching: { balance: Number(matchingBalance), currency: 'USDT' },
              yield: { balance: Number(yieldBalance), currency: 'USDT' },
              rankBonus: { balance: Number(rankBonusBalance), currency: 'USDT' },
              rewards: { balance: Number(rewardsBalance), currency: 'USDT' },
              capping_box: { balance: Number(cappingBoxBalance), currency: 'USDT' }
            });
          }
        });
      }
    };

    setupDashboard();

    const checkAdminStatus = async () => {
      try {
        const data = await apiFetch('health').catch(() => ({ status: 'ok', fallback: true }));
        if (isMounted) {
          setAdminStatus(data);
        }
      } catch (err) {
        // Silently handle if even the fallback fails
      }
    };
    checkAdminStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user && isMounted) {
        try {
          const profile = await supabaseService.getUserProfile(session.user.id);
          if (profile && isMounted) {
            setUserData(profile);
            setUserWallets({
              master: { balance: Number(profile.wallet_balance ?? profile.deposit_wallet ?? profile.wallets?.master?.balance ?? 0), currency: 'USDT' },
              referral: { balance: Number(profile.wallets?.referral?.balance ?? profile.referral_income ?? 0), currency: 'USDT' },
              matching: { balance: Number(profile.wallets?.matching?.balance ?? profile.matching_income ?? 0), currency: 'USDT' },
              rankBonus: { balance: Number(profile.wallets?.rankBonus?.balance ?? profile.rank_income ?? 0), currency: 'USDT' },
              rewards: { balance: Number(profile.wallets?.rewards?.balance ?? profile.incentive_income ?? 0), currency: 'USDT' },
              yield: { balance: Number(profile.wallets?.yield?.balance ?? profile.yield_income ?? 0), currency: 'USDT' },
              capping_box: { balance: Number(profile.wallets?.capping_box?.balance || 0), currency: 'USDT' }
            });
          }
        } catch (err) {
          console.error('Error updating profile on auth change:', err);
        }
      }
    });

    const fetchRates = async () => {
      try {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 'DOTUSDT'];
        let data;
        try {
          data = await apiFetch('binance-rates');
        } catch (err) {
          // Fallback to direct Binance API call if Edge Function is not deployed
          const response = await fetch('https://api.binance.com/api/v3/ticker/price');
          if (response.ok) {
            data = await response.json();
          } else {
            throw new Error('Fallback fetch failed');
          }
        }
        
        if (Array.isArray(data) && isMounted) {
          const filtered = data.filter((item: any) => symbols.includes(item.symbol));
          setBinanceRates(filtered);
        }
      } catch (error) {
        // Silently handle to avoid console spam if both fail
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, 10000);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      clearInterval(interval);
      if (profileUnsubscribe) profileUnsubscribe();
    };
  }, [navigate]);

  const generateNewAddress = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const hex = '0123456789abcdef';
      let newAddr = '0x';
      for (let i = 0; i < 40; i++) newAddr += hex[Math.floor(Math.random() * 16)];
      setDepositAddress(newAddr);
      setIsGenerating(false);
    }, 800);
  };

  const copyAddress = async () => {
    const success = await copyUtil(depositAddress);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleClaim = async (walletKey: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    console.log('Claiming wallet:', walletKey);
    try {
      if (!walletKey) throw new Error('Invalid wallet key');
      await supabaseService.claimWallet(walletKey);
      console.log('Claim successful');
      setNotification(`Successfully claimed to Vault`);
      
      // Refresh user data with a small delay to ensure DB consistency
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchAllData(false);
    } catch (err) {
      console.error('Claim Failed:', err);
      setNotification("Claim Failed: " + (err as Error).message);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const checkDepositStatus = async () => {
    if (!paymentData) return;
    setIsCheckingStatus(true);
    try {
      const data = await apiFetch(`tx-status?id=${paymentData.payment_id}`);
      const status = data.payment_status;
      
      if (status === 'finished' || status === 'partially_paid') {
        setNotification('Deposit confirmed! Your balance will update shortly.');
        setActiveModal(null);
        setPaymentData(null);
        // Refresh data
        fetchAllData();
      } else if (status === 'waiting' || status === 'confirming' || status === 'sending') {
        setNotification(`Payment status: ${status}. Please wait...`);
      } else {
        setNotification(`Payment status: ${status}`);
      }
    } catch (error) {
      console.error('Error checking status:', error);
      setNotification('Failed to check payment status');
    } finally {
      setIsCheckingStatus(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const executeAction = () => {
    if (activeModal === 'deposit' && paymentData) {
      checkDepositStatus();
      return;
    }
    
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setActiveModal(null);
      setNotification("Protocol Action Confirmed");
      setTimeout(() => setNotification(null), 3000);
    }, 1500);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0e11] flex flex-col items-center justify-center gap-6">
        <div className="w-20 h-20 relative">
          <div className="absolute inset-0 border-4 border-orange-500/20 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-xs animate-pulse">Synchronizing Node...</p>
      </div>
    );
  }

  if (!userData) return null;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-20 relative">
      {notification && (
        <div className="fixed top-24 right-10 z-[60] bg-[#c0841a] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 font-bold text-sm">
          <CheckCircle2 size={18} />
          {notification}
        </div>
      )}

      {/* Announcements Ticker */}
      <div className="bg-blue-600/10 border border-blue-500/20 px-8 py-3 rounded-2xl flex items-center gap-4 overflow-hidden group">
         <Megaphone size={18} className="text-blue-500 shrink-0 animate-bounce" />
         <div className="whitespace-nowrap animate-[marquee_30s_linear_infinite] group-hover:[animation-play-state:paused] flex gap-20">
            <span className="text-[11px] font-black uppercase tracking-widest text-blue-400">Node Update: Global synchronization successful. All operational yields credited to registry.</span>
            
            {binanceRates.length > 0 ? (
              binanceRates.map((rate) => (
                <span key={rate.symbol} className="text-[11px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                  <TrendingUp size={12} />
                  {rate.symbol}: <span className="text-white">${(parseFloat(rate.price) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </span>
              ))
            ) : (
              <span className="text-[11px] font-black uppercase tracking-widest text-blue-400">Security: Node Level 2 verification protocols now active for all partners.</span>
            )}
            
            <span className="text-[11px] font-black uppercase tracking-widest text-blue-400">Network: All nodes operational.</span>
         </div>
      </div>

      <style>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>

      {/* Deposit Modal */}
      <Modal 
        title="Inbound Deposit" 
        isOpen={activeModal === 'deposit'} 
        onClose={() => {
          setActiveModal(null);
          setPaymentData(null);
        }}
      >
        <div className="space-y-8">
          {!paymentData ? (
            <>
              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Deposit Amount (USDT)</p>
                </div>
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-amber-500/50 font-bold"
                  placeholder="Min 50 USDT"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 'usdtbsc', name: 'USDT (BEP20)' },
                  { id: 'usdttrc20', name: 'USDT (TRC20)' },
                ].map((network) => (
                  <button
                    key={network.id}
                    onClick={() => setDepositCurrency(network.id)}
                    className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${
                      depositCurrency === network.id
                        ? 'bg-amber-500/10 border-amber-500/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <img src="https://cryptologos.cc/logos/tether-usdt-logo.png" alt={network.name} className="w-8 h-8" referrerPolicy="no-referrer" />
                    <div className="text-[10px] font-black text-white uppercase tracking-widest">{network.name}</div>
                  </button>
                ))}
              </div>

              <button
                onClick={handleDeposit}
                disabled={isDepositing || parseFloat(depositAmount) < 50}
                className="w-full bg-[#a3680e] hover:bg-[#c0841a] disabled:opacity-30 disabled:cursor-not-allowed text-white font-black py-5 rounded-3xl transition-all uppercase tracking-widest text-xs shadow-xl shadow-amber-900/20"
              >
                {isDepositing ? <RefreshCw className="animate-spin mx-auto" size={20} /> : 'GENERATE DEPOSIT ADDRESS'}
              </button>
            </>
          ) : (
            <div className="space-y-8 text-center">
              <div className="bg-white p-6 rounded-[40px] inline-block mx-auto shadow-2xl">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${paymentData.pay_address}`} 
                  alt="QR Code" 
                  className="w-48 h-48 object-contain"
                />
              </div>

              <div className="space-y-4">
                <div className="p-6 bg-white/5 rounded-[32px] border border-white/5 space-y-4">
                  <div className="flex justify-between items-center px-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Send exactly {paymentData.pay_amount} {paymentData.pay_currency.toUpperCase()}</p>
                    <button 
                      onClick={async () => {
                        await copyUtil(paymentData.pay_address);
                        setNotification('Address copied!');
                        setTimeout(() => setNotification(null), 3000);
                      }}
                      className="p-2 hover:bg-white/5 rounded-xl transition-all text-slate-400 hover:text-white"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <p className="text-white font-mono break-all text-xs bg-black/40 p-4 rounded-xl border border-white/5">
                    {paymentData.pay_address}
                  </p>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-[10px] font-black uppercase tracking-widest text-amber-500">
                  Payment ID: <span className="font-mono text-white ml-2">{paymentData.payment_id}</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-relaxed">
                Your node will be credited automatically once the transaction is confirmed on the blockchain.
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={checkDepositStatus}
                  disabled={isCheckingStatus}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-[#1e2329] font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                >
                  {isCheckingStatus ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                  I HAVE DEPOSITED
                </button>

                <button 
                  onClick={() => {
                    setActiveModal(null);
                    setPaymentData(null);
                  }}
                  className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-white/5"
                >
                  CLOSE WINDOW
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Withdrawal Modal */}
      <Modal 
        title="USDT" 
        isOpen={activeModal === 'withdraw'} 
        onClose={() => setActiveModal(null)}
        isBinanceStyle={true}
      >
        <div className="space-y-8 pb-40">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-[#848e9c]">Address</label>
            </div>
            <div className="relative">
              <input 
                type="text" 
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="Enter Address" 
                className="w-full bg-[#1e2329] border-none rounded-lg px-4 py-4 text-white placeholder-[#474d57] font-medium text-sm focus:ring-1 focus:ring-amber-500/50" 
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4 text-[#848e9c]">
                <User size={18} className="cursor-pointer hover:text-white" />
                <Scan size={18} className="cursor-pointer hover:text-white" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#848e9c]">Network</label>
              <Info size={14} className="text-[#848e9c]" />
            </div>
            <div className="bg-[#1e2329] rounded-lg px-4 py-4 flex justify-between items-center cursor-pointer group hover:bg-[#2b3139] transition-colors">
              <span className="text-[#848e9c] text-sm font-medium">Select Protocol Network</span>
              <ChevronDown size={18} className="text-[#848e9c]" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#848e9c]">Withdrawal Amount</label>
            </div>
            <div className="relative">
              <input 
                type="number" 
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Minimum 10" 
                className="w-full bg-[#1e2329] border-none rounded-lg px-4 py-4 text-white font-bold text-lg pr-32 placeholder-[#474d57] focus:ring-1 focus:ring-amber-500/50" 
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                <span className="text-white font-bold text-sm">USDT</span>
                <div className="w-[1px] h-4 bg-[#474d57]" />
                <button onClick={() => setWithdrawAmount((userWallets?.master?.balance || 0).toString())} className="text-amber-500 font-bold text-sm hover:underline">MAX</button>
              </div>
            </div>
            <div className="flex justify-between items-center pt-1 px-1">
               <span className="text-[11px] font-bold text-[#848e9c] underline underline-offset-2 decoration-dotted">Available Balance</span>
               <span className="text-[11px] font-bold text-white">{(userWallets?.master?.balance || 0).toFixed(2)} USDT</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-[#0b0e11] border-t border-[#1e2329] space-y-5 animate-in slide-in-from-bottom duration-300">
           <div className="space-y-2">
             <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#848e9c]">Receive amount</span>
                <div className="flex items-baseline gap-1">
                   <span className="text-2xl font-bold text-white">{((Number(withdrawAmount) || 0) * 0.9).toFixed(2)}</span>
                   <span className="text-[10px] font-bold text-white">USDT</span>
                </div>
             </div>
             <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-[#474d57] underline underline-offset-2 decoration-dotted">Processing fee (10%)</span>
                <span className="text-[11px] font-bold text-[#474d57]">{((Number(withdrawAmount) || 0) * 0.1).toFixed(2)} USDT</span>
             </div>
           </div>
           <button 
             onClick={executeAction} 
             disabled={!withdrawAmount || Number(withdrawAmount) < 10 || isProcessing}
             className={`w-full py-3.5 rounded-lg font-bold text-base transition-all active:scale-95 ${
               withdrawAmount && Number(withdrawAmount) >= 10 ? 'bg-amber-500 text-[#1e2329] hover:bg-amber-400' : 'bg-[#2b3139] text-[#474d57] cursor-not-allowed'
             }`}
           >
              {isProcessing ? <RefreshCw className="animate-spin mx-auto" size={24} /> : 'Withdraw'}
           </button>
        </div>
      </Modal>


      {/* Top Welcome Section */}
      <div className="bg-[#0c0c0d] p-6 md:p-12 rounded-[24px] md:rounded-[48px] border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-amber-600/5 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-10 relative z-10 text-center md:text-left">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
            <div className="w-16 h-16 md:w-28 md:h-28 rounded-2xl md:rounded-[32px] bg-[#1a1a1c] border border-white/10 p-2 md:p-3 flex items-center justify-center relative z-10 shadow-2xl">
               <ArowinLogo size={window.innerWidth < 768 ? 40 : 80} />
            </div>
          </div>
          <div>
            <h2 className="text-xl md:text-4xl font-black text-slate-100 uppercase tracking-tight italic">AROWIN <span className="text-[#c0841a]">TRADING</span></h2>
            <div className="flex flex-wrap justify-center md:justify-start items-center gap-2 md:gap-4 mt-2 md:mt-3">
               <span className="text-slate-500 text-[7px] md:text-[10px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em]">OPERATOR: {userData.name}</span>
               <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-emerald-500" />
               <span className="text-amber-500 text-[8px] md:text-[12px] font-black uppercase tracking-[0.2em] md:tracking-[0.4em]">RANK: {RANK_NAMES[(userData.rank || 1) - 1] || 'Starter'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        <WalletCardRow 
          title="MASTER CONSOLIDATED VAULT"
          isMaster={true}
          amount={userWallets?.master?.balance || 0}
          buttons={[
            { label: 'LEDGER', color: 'bg-white/5 text-slate-400', action: () => navigate('/master-wallet') }
          ]}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {[
          { key: 'referral', label: '1. DIRECT REFERRAL YIELD' },
          { key: 'capping_box', label: '2. DAILY CAPPING BOX' },
          { key: 'matching', label: '3. BINARY MATCHING INCOME' },
        ].map(item => (
          <WalletCardRow 
            key={item.key}
            title={item.label}
            amount={userWallets[item.key as keyof typeof userWallets]?.balance || 0}
            buttons={[
              { 
                label: isProcessing ? 'PROCESSING...' : 'CLAIM TO VAULT', 
                color: 'bg-[#a3680e] text-white', 
                action: () => handleClaim(item.key as any), 
                disabled: isProcessing || (userWallets[item.key as keyof typeof userWallets]?.balance || 0) <= 0 
              },
              { label: 'DETAILS', action: () => navigate('/master-wallet') }
            ]}
          />
        ))}

        {/* Removed Capping Status Card as per new per-transaction logic */}


        {[
          { key: 'rankBonus', label: '4. RANK BONUS' },
          { key: 'rewards', label: '5. REWARD BONUS' },
          { key: 'yield', label: '6. YIELD INCOME' }
        ].map(item => (
          <WalletCardRow 
            key={item.key}
            title={item.label}
            amount={userWallets[item.key as keyof typeof userWallets]?.balance || 0}
            buttons={[
              { 
                label: isProcessing ? 'PROCESSING...' : 'CLAIM TO VAULT', 
                color: 'bg-[#a3680e] text-white', 
                action: () => handleClaim(item.key as any), 
                disabled: isProcessing || (userWallets[item.key as keyof typeof userWallets]?.balance || 0) <= 0 
              },
              { label: 'DETAILS', action: () => navigate('/master-wallet') }
            ]}
          />
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
