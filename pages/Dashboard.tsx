
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  TrendingUp, Info, Wallet, CheckCircle2, X, ArrowRight, RefreshCw, 
  DollarSign, Copy, Check, ChevronDown, HelpCircle, 
  User, Scan, ArrowLeft, Zap, BellRing, Megaphone, ShieldCheck, AlertCircle,
  QrCode
} from 'lucide-react';
import { MOCK_USER, RANKS, PACKAGES } from '../constants';
import { ArowinLogo } from '../components/ArowinLogo';
import { supabaseService } from '../services/supabaseService';

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
    <div className={`w-full bg-[#111112] border border-white/5 rounded-2xl overflow-hidden mb-8 shadow-2xl transition-all duration-500 hover:border-white/10`}>
      <div className={`w-full py-3.5 px-6 flex justify-center items-center relative overflow-hidden ${isMaster ? 'bg-[#3b2a0c]' : 'bg-[#18181b]'}`}>
        <h3 className="text-white text-xs font-black uppercase tracking-[0.2em] relative z-10 flex items-center gap-3">
          {isMaster && <Wallet size={16} />}
          {title}
        </h3>
      </div>

      <div className="p-10 text-center bg-[#0d0d0e]">
        <div className="flex flex-col items-center mb-10">
          <p className="text-4xl font-black text-slate-200 tracking-tight mb-2">
            {(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
          <p className="text-[#c0841a] text-[10px] font-black tracking-[0.2em] uppercase">USDT NODE ASSET</p>
        </div>

        <div className="flex flex-wrap justify-center gap-4">
          {buttons.map((btn, idx) => (
            <button 
              key={idx}
              onClick={btn.action}
              disabled={btn.disabled}
              className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-lg border border-white/5 ${
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
  const [userData, setUserData] = useState<any>(null);
  const [userWallets, setUserWallets] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
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

  const handleDeposit = async () => {
    if (!userData) return;
    setIsDepositing(true);
    try {
      const response = await axios.post('/api/payments/create', {
        amount: parseFloat(depositAmount),
        currency: depositCurrency,
        orderId: `DEP-${Date.now()}`,
        orderDescription: `Wallet Deposit for ${userData.id}`,
        uid: userData.id
      });
      
      setPaymentData(response.data);
      setNotification('Deposit request created successfully!');
      setTimeout(() => setNotification(null), 3000);
    } catch (error: any) {
      console.error('Deposit error:', error);
      setNotification(error.response?.data?.message || 'Failed to create deposit request');
      setTimeout(() => setNotification(null), 3000);
    } finally {
      setIsDepositing(false);
    }
  };

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const user = supabaseService.getCurrentUser();
        if (user) {
          const profile = await supabaseService.getUserProfile(user.id || user.uid);
          if (profile) {
            setUserData(profile);
            setUserWallets(profile.wallets);
          }
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();

    const checkAdminStatus = async () => {
      try {
        const response = await fetch('/api/health');
        if (response.ok) {
          const data = await response.json();
          setAdminStatus(data);
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
      }
    };
    checkAdminStatus();

    const unsubscribe = supabaseService.onAuthChange(async (user) => {
      if (user) {
        try {
          const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
          if (profile) {
            setUserData(profile);
            setUserWallets(profile.wallets || {});
          }
        } catch (err) {
          console.error('Error fetching profile:', err);
        }
      }
    });

    const fetchRates = async () => {
      try {
        const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'XRPUSDT', 'DOTUSDT'];
        const response = await fetch('/api/rates/binance');
        if (!response.ok) {
          // If server returns an error, we might still get JSON with fallback data
          const errorData = await response.json().catch(() => ({}));
          if (Array.isArray(errorData)) {
            const filtered = errorData.filter((item: any) => symbols.includes(item.symbol));
            setBinanceRates(filtered);
            return;
          }
          throw new Error(`Server responded with ${response.status}`);
        }
        const data = await response.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((item: any) => symbols.includes(item.symbol));
          setBinanceRates(filtered);
        }
      } catch (error) {
        // Only log if it's a real network error or critical failure
        console.warn('Binance rates sync issue:', error);
      }
    };

    fetchRates();
    const interval = setInterval(fetchRates, 10000); // Update every 10 seconds
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

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

  const copyAddress = () => {
    navigator.clipboard.writeText(depositAddress);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleClaim = async (walletKey: string) => {
    setIsProcessing(true);
    try {
      await supabaseService.claimWallet(walletKey);
      setNotification(`Successfully claimed to Vault`);
      
      // Refresh user data
      const user = supabaseService.getCurrentUser();
      if (user) {
        const profile = await supabaseService.getUserProfile(user.id || user.uid);
        if (profile) setUserData(profile);
      }
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
      const response = await axios.get(`/api/payments/status/${paymentData.payment_id}`);
      const status = response.data.payment_status;
      
      if (status === 'finished' || status === 'partially_paid') {
        setNotification('Deposit confirmed! Your balance will update shortly.');
        setActiveModal(null);
        setPaymentData(null);
        // Refresh profile
        if (userData) {
          const profile = await supabaseService.getUserProfile(userData.id);
          if (profile) {
            setUserData(profile);
            setUserWallets(profile.wallets || {});
          }
        }
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
                      onClick={() => {
                        navigator.clipboard.writeText(paymentData.pay_address);
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

      {/* Admin Console (Only for kethankumar130@gmail.com) */}
      {userData.email === 'kethankumar130@gmail.com' && (
        <div className="bg-rose-500/10 border border-rose-500/20 p-12 rounded-[48px] space-y-8">
          <div className="flex items-center gap-4">
            <ShieldCheck className="text-rose-500" size={32} />
            <div>
              <h3 className="text-xl font-black uppercase tracking-widest text-slate-200">Admin Control Node</h3>
              <p className="text-[10px] font-black text-rose-500/60 uppercase tracking-[0.3em]">System Identity: kethankumar130@gmail.com</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 bg-black/40 rounded-3xl border border-white/5 space-y-6">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Test MLM Protocol</h4>
              <p className="text-[10px] text-slate-600 font-bold uppercase leading-relaxed">Simulate a package activation to trigger referral and binary matching yields across the network.</p>
              <button 
                onClick={async () => {
                  setIsProcessing(true);
                  try {
                    await supabaseService.activatePackage(userData.id, 1000);
                    setNotification("MLM Protocol Triggered: 1000 USDT Package Active");
                    // Refresh profile
                    const profile = await supabaseService.getUserProfile(userData.id);
                    setUserData(profile);
                    setUserWallets({ ...MOCK_USER.wallets, ...(profile.wallets || {}) });
                  } catch (err) {
                    console.error('MLM Trigger Failed:', err);
                  }
                  setIsProcessing(false);
                }}
                disabled={isProcessing}
                className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-3"
              >
                {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                ACTIVATE 1000 USDT TEST PACKAGE
              </button>
            </div>

            <div className="p-8 bg-black/40 rounded-3xl border border-white/5 space-y-6">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">System Management</h4>
              <div className="space-y-4">
                <button 
                  onClick={async () => {
                    setIsProcessing(true);
                    try {
                      await supabaseService.rebuildTreeCounts();
                      setNotification("Binary Tree Counts Rebuilt Successfully");
                    } catch (err) {
                      console.error('Rebuild Failed:', err);
                      setNotification("Rebuild Failed: " + (err as Error).message);
                    }
                    setIsProcessing(false);
                  }}
                  disabled={isProcessing}
                  className="w-full bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-blue-500/20 flex items-center justify-center gap-3"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  REBUILD TREE COUNTS
                </button>
                <button 
                  onClick={async () => {
                    setIsProcessing(true);
                    try {
                      await supabaseService.rebuildCumulativeVolume();
                      setNotification("Cumulative Volume Rebuilt Successfully");
                    } catch (err) {
                      console.error('Rebuild Failed:', err);
                      setNotification("Rebuild Failed: " + (err as Error).message);
                    }
                    setIsProcessing(false);
                  }}
                  disabled={isProcessing}
                  className="w-full bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-amber-500/20 flex items-center justify-center gap-3"
                >
                  {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  REBUILD CUMULATIVE VOLUME
                </button>
                <button onClick={() => navigate('/admin/dashboard')} className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-white/5">
                  ACCESS CORE DASHBOARD
                </button>
                <button onClick={() => navigate('/admin/users')} className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-[10px] border border-white/5">
                  MANAGE NETWORK NODES
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Welcome Section */}
      <div className="bg-[#0c0c0d] p-12 rounded-[48px] border border-white/5 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 via-transparent to-amber-600/5 pointer-events-none" />
        
        <div className="flex items-center gap-10 relative z-10">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/10 blur-3xl rounded-full" />
            <div className="w-28 h-28 rounded-[32px] bg-[#1a1a1c] border border-white/10 p-3 flex items-center justify-center relative z-10 shadow-2xl">
               <ArowinLogo size={80} />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-black text-slate-100 uppercase tracking-tight italic">AROWIN <span className="text-[#c0841a]">TRADING</span></h2>
            <div className="flex items-center gap-4 mt-3">
               <span className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">OPERATOR: {userData.name}</span>
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
               <span className="text-blue-500 text-[10px] font-black uppercase tracking-[0.4em]">NODE: {userData.operatorId || userData.id}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          <div className="bg-[#121214] border border-white/5 rounded-3xl px-8 py-5 flex items-center gap-6 group hover:border-amber-500/20 transition-all">
             <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
               <TrendingUp size={22} />
             </div>
             <div>
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Network Yield</p>
                <p className="text-xl font-black text-slate-200">+14.2%</p>
             </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        <div className="w-full bg-[#111112] border border-white/5 rounded-2xl overflow-hidden mb-8 shadow-2xl transition-all duration-500 hover:border-white/10">
          <div className="w-full py-3.5 px-6 flex justify-center items-center relative overflow-hidden bg-emerald-900/40">
            <h3 className="text-white text-xs font-black uppercase tracking-[0.2em] relative z-10 flex items-center gap-3">
              <TrendingUp size={16} />
              TOTAL ACCUMULATED INCOME
            </h3>
          </div>
          <div className="p-10 text-center bg-[#0d0d0e]">
            <div className="flex flex-col items-center mb-10">
              <p className="text-4xl font-black text-emerald-500 tracking-tight mb-2">
                {(userData.total_income || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className="text-slate-500 text-[10px] font-black tracking-[0.2em] uppercase">Total MLM Earnings (USDT)</p>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              <div className="px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-white/5 text-slate-400 border border-white/5">
                RANK: {userData.rank_name || 'Partner'}
              </div>
              <div className="px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-white/5 text-slate-400 border border-white/5">
                STATUS: {userData.status?.toUpperCase()}
              </div>
            </div>
          </div>
        </div>

        <WalletCardRow 
          title="MASTER CONSOLIDATED VAULT"
          isMaster={true}
          amount={userWallets.master.balance}
          buttons={[
            { label: 'LEDGER', color: 'bg-white/5 text-slate-400', action: () => navigate('/master-wallet') },
            { label: 'COLLECT ASSETS', color: 'bg-blue-600 text-white', action: () => navigate('/team-collection') }
          ]}
        />
      </div>

      <div className="max-w-4xl mx-auto px-4 space-y-6">
        {[
          { key: 'referral', label: 'DIRECT REFERRAL YIELD' },
          { key: 'matching', label: 'BINARY MATCHING DIVIDEND' },
          { key: 'capping', label: 'CAPPING INCOME' },
          { key: 'rankBonus', label: 'RANK PROTOCOL BONUS' },
          { key: 'incentive', label: 'INCENTIVE POOL ACCRUAL' }
        ].map(item => {
          if (item.key === 'capping') {
            const today = new Date().toISOString().split('T')[0];
            const todayMatchingIncome = userData?.daily_income?.date === today ? userData.daily_income.amount : 0;
            const userRank = RANKS.find(r => r.level === (userData?.rank || 1));
            const dailyLimit = userRank?.dailyCapping || 250;
            
            return (
              <div key="capping" className="w-full bg-[#111112] border border-white/5 rounded-2xl overflow-hidden mb-8 shadow-2xl transition-all duration-500 hover:border-white/10">
                <div className="w-full py-3.5 px-6 flex justify-center items-center relative overflow-hidden bg-[#18181b]">
                  <h3 className="text-white text-xs font-black uppercase tracking-[0.2em] relative z-10 flex items-center gap-3">
                    CAPPING INCOME STATUS
                  </h3>
                </div>
                <div className="p-10 text-center bg-[#0d0d0e]">
                  <div className="flex flex-col items-center mb-10">
                    <p className="text-4xl font-black text-slate-200 tracking-tight mb-2">
                      {todayMatchingIncome.toFixed(2)} / {dailyLimit.toFixed(2)}
                    </p>
                    <p className="text-[#c0841a] text-[10px] font-black tracking-[0.2em] uppercase">Daily Matching Limit (USDT)</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4">
                    <div className="px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-[#1e293b] text-slate-400 border border-white/5">
                      RANK: {userRank?.name || 'Starter'}
                    </div>
                    <div className="px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest bg-[#1e293b] text-slate-400 border border-white/5">
                      PAIR INCOME: ${userRank?.pairIncome || 5}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return (
            <WalletCardRow 
              key={item.key}
              title={item.label}
              amount={userWallets[item.key as keyof typeof userWallets]?.balance || 0}
              buttons={[
                { label: 'CLAIM TO VAULT', color: 'bg-[#a3680e] text-white', action: () => handleClaim(item.key as any), disabled: (userWallets[item.key as keyof typeof userWallets]?.balance || 0) <= 0 },
                { label: 'DETAILS', action: () => navigate('/master-wallet') }
              ]}
            />
          );
        })}
      </div>

      <div className="bg-slate-900/20 border border-white/5 p-12 rounded-[48px] flex flex-col md:flex-row items-center gap-10">
        <div className="p-6 bg-blue-500/10 rounded-3xl text-blue-500">
           <ShieldCheck size={40} />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h4 className="text-xl font-black uppercase tracking-widest text-slate-200">Institutional Settlement Engine</h4>
          <p className="text-sm text-slate-500 mt-3 leading-relaxed max-w-2xl">
            Arowin Trading utilizes decentralized verification nodes. All asset yields are distributed in accordance with our transparent proof-of-volume protocol.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
