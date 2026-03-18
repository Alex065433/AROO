
import React, { useState, useEffect, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import { MOCK_USER } from '../constants';
import { supabaseService } from '../services/supabaseService';
import { 
  Wallet, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, 
  History, Plus, X, ArrowRight, CheckCircle2, RefreshCw,
  Copy, Check, Info, Zap, 
  ArrowLeft, ChevronDown, AlertCircle,
  TrendingUp, TrendingDown, BarChart3, LineChart, Package
} from 'lucide-react';

const MasterWallet: React.FC = () => {
  const [userWallets, setUserWallets] = useState(MOCK_USER.wallets);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'exchange' | 'package' | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<'BTC' | 'ETH' | 'TRX'>('BTC');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('150');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [currentDepositAddress, setCurrentDepositAddress] = useState('0xff92bfff708e055593e03ff6fb12dd05e6e09d44');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = supabaseService.onAuthChange(async (user) => {
      if (user) {
        try {
          const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
          if (profile) {
            setUserProfile(profile);
            setUserWallets(profile.wallets);
          }

          // Fetch real transactions
          const payments = await supabaseService.getPayments(user.id || user.uid);
          setTransactions(payments);
          setIsLoadingTransactions(false);
        } catch (err) {
          console.error('Error fetching profile or transactions:', err);
          setIsLoadingTransactions(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const coins = {
    USDT: { name: 'Tether USDT (BEP20)', symbol: 'USDT', color: 'text-orange-500', bg: 'bg-orange-500/10', rate: 1, change: '+0.01%' },
    BTC: { name: 'Bitcoin (BEP20)', symbol: 'BTC', color: 'text-yellow-500', bg: 'bg-yellow-500/10', rate: 0.000018, change: '-1.42%' },
    ETH: { name: 'Ethereum (BEP20)', symbol: 'ETH', color: 'text-blue-400', bg: 'bg-blue-400/10', rate: 0.00032, change: '+2.10%' },
    TRX: { name: 'Tron (BEP20)', symbol: 'TRX', color: 'text-red-500', bg: 'bg-red-500/10', rate: 8.42, change: '+0.45%' },
  };

  // Automated target calculation
  const targetAmount = useMemo(() => {
    if (!exchangeAmount || isNaN(Number(exchangeAmount))) return '0.00';
    return (Number(exchangeAmount) * coins[selectedCoin].rate).toFixed(selectedCoin === 'TRX' ? 2 : 6);
  }, [exchangeAmount, selectedCoin]);

  const createPayment = async () => {
    if (!depositAmount || Number(depositAmount) < 150) {
      setError('Minimum deposit is 150 USDT');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: depositAmount,
          currency: 'usdtbsc',
          orderId: `DEP-${Date.now()}`,
          orderDescription: `Deposit for ${userProfile?.email}`,
          uid: userProfile?.id
        })
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorMessage = 'Failed to create payment';
        if (contentType && contentType.indexOf("application/json") !== -1) {
          const errData = await response.json();
          errorMessage = errData.error?.message || errData.error || errorMessage;
        } else {
          const textError = await response.text();
          errorMessage = textError || errorMessage;
        }
        throw new Error(errorMessage);
      }

      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        setPaymentData(data);
      } else {
        throw new Error('Server returned non-JSON response');
      }
    } catch (err: any) {
      console.error('Payment Error:', err);
      setError(err.message || 'Failed to initialize payment protocol');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAction = async (forcedAmount?: string) => {
    const amountToUse = forcedAmount || exchangeAmount;
    if (!amountToUse || Number(amountToUse) <= 0) return;
    
    if (activeTab === 'withdraw') {
      if (!userProfile?.active_package) {
        setError('You must have an active package to withdraw funds.');
        return;
      }

      if (!withdrawalPassword) {
        setError('Withdrawal password is required');
        return;
      }
      
      // Verify withdrawal password
      try {
        const user = userProfile;
        if (user) {
          const profile = await supabaseService.getUserProfile(user.id) as any;
          if (profile && profile.withdrawalPassword !== withdrawalPassword) {
            setError('Incorrect withdrawal password');
            return;
          }
        }
      } catch (err) {
        console.error('Error verifying withdrawal password:', err);
        setError('Verification failed. Please try again.');
        return;
      }
    }

    if (activeTab === 'package') {
      // Deduct balance for package activation
      try {
        const user = supabaseService.getCurrentUser();
        if (user) {
          const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
          const cost = Number(amountToUse);
          if (profile.wallets.master.balance < cost) {
            setError('Insufficient balance');
            return;
          }
          
          const newBalance = profile.wallets.master.balance - cost;
          // 1. Deduct balance
          await supabaseService.createUserProfile(user.id || user.uid, {
            wallets: {
              ...profile.wallets,
              master: { ...profile.wallets.master, balance: newBalance }
            }
          });

          // 2. Call activatePackage which handles logging, team nodes, active_package field, and MLM income
          await supabaseService.activatePackage(user.id || user.uid, cost);
          
          setUserWallets(prev => ({
            ...prev,
            master: { ...prev.master, balance: newBalance }
          }));
        }
      } catch (err) {
        console.error('Error activating package:', err);
        setError('Activation failed. Please try again.');
        return;
      }
    }

    setIsProcessing(true);
    setError(null);
    setTimeout(() => {
      setIsProcessing(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setActiveTab(null);
        setExchangeAmount('');
        setWithdrawalPassword('');
      }, 2500);
    }, 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generateNewAddress = () => {
    setIsGeneratingAddress(true);
    setTimeout(() => {
      const hex = '0123456789abcdef';
      let addr = '0x';
      for(let i=0; i<40; i++) addr += hex[Math.floor(Math.random() * 16)];
      setCurrentDepositAddress(addr);
      setIsGeneratingAddress(false);
    }, 800);
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 relative">
      {/* Action Modals */}
      {activeTab && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-[#0b0e11]/98 backdrop-blur-md" onClick={() => !isProcessing && setActiveTab(null)} />
          
          <div className={`relative w-full max-w-[480px] h-full md:h-[90vh] bg-[#0b0e11] md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300 border border-white/5`}>
            
            {/* Header */}
            <div className="px-8 py-6 flex justify-between items-center bg-[#0b0e11] border-b border-white/5">
              <button onClick={() => setActiveTab(null)} className="p-2 text-slate-400 hover:text-white transition-colors">
                <ArrowLeft size={24} />
              </button>
              <div className="flex flex-col items-center">
                <h3 className="text-xl font-black text-white uppercase tracking-tighter">
                  {activeTab === 'withdraw' ? 'Send USDT' : activeTab === 'deposit' ? 'Deposit USDT' : activeTab === 'package' ? 'Activate Package' : 'Exchange Node'}
                </h3>
              </div>
              <div className="w-10" />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-32">
              {activeTab === 'package' ? (
                <div className="mt-10 space-y-10">
                   <div className="p-8 bg-blue-600/10 border border-blue-500/20 rounded-[32px] flex items-center gap-6">
                      <div className="w-16 h-16 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-400">
                         <Package size={32} />
                      </div>
                      <div>
                         <p className="text-xs font-black text-white uppercase tracking-widest">Arowin Node Activation</p>
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Unlock full network dividends</p>
                      </div>
                   </div>

                   <div className="grid grid-cols-1 gap-4">
                      {[
                        { name: 'ID Activation', price: 50, features: ['Network Access', 'Basic Dividends'] },
                        { name: 'Starter Node', price: 150, features: ['5% Pair Income', '250 USDT Capping'] },
                        { name: 'Bronze Node', price: 350, features: ['5% Pair Income', '250 USDT Capping'] },
                        { name: 'Silver Node', price: 750, features: ['5% Pair Income', '250 USDT Capping'] },
                        { name: 'Gold Node', price: 1550, features: ['5% Pair Income', '250 USDT Capping'] },
                        { name: 'Platinum Node', price: 3150, features: ['5% Pair Income', '250 USDT Capping'] },
                        { name: 'Diamond Node', price: 6350, features: ['5% Pair Income', '360 USDT Capping'] },
                        { name: 'Ambassador Node', price: 12750, features: ['5% Pair Income', '490 USDT Capping'] },
                      ].map((pkg) => (
                        <div key={pkg.name} className="p-6 bg-[#1e2329] border border-white/5 rounded-3xl hover:border-orange-500/30 transition-all group cursor-pointer">
                           <div className="flex justify-between items-center">
                              <div>
                                 <h4 className="text-sm font-black text-white uppercase tracking-widest">{pkg.name}</h4>
                                 <p className="text-2xl font-black text-orange-500 mt-1">{pkg.price} USDT</p>
                              </div>
                              <button 
                                onClick={() => {
                                  if (userWallets.master.balance < pkg.price) {
                                    setError(`Insufficient balance. Need ${pkg.price} USDT`);
                                  } else {
                                    const amountStr = pkg.price.toString();
                                    setExchangeAmount(amountStr);
                                    handleAction(amountStr);
                                  }
                                }}
                                className="px-6 py-3 bg-white/5 group-hover:bg-orange-600 text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-white rounded-xl transition-all"
                              >
                                {userProfile?.active_package === pkg.price ? 'Active' : 'Activate'}
                              </button>
                           </div>
                           <div className="mt-4 flex gap-4">
                              {pkg.features.map(f => (
                                <span key={f} className="text-[8px] font-black text-slate-600 uppercase tracking-widest bg-black/20 px-2 py-1 rounded-md">{f}</span>
                              ))}
                           </div>
                        </div>
                      ))}
                   </div>

                   {error && (
                     <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>
                   )}
                </div>
              ) : activeTab === 'exchange' ? (
                <div className="mt-10 space-y-10">
                   {/* Source Input */}
                   <div className="space-y-4">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Source Asset</label>
                        <span className="text-[10px] font-black text-slate-600 uppercase">Available: {userWallets.master.balance} USDT</span>
                      </div>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={exchangeAmount}
                          onChange={(e) => setExchangeAmount(e.target.value)}
                          placeholder="0.00" 
                          className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-6 text-white font-black text-3xl pr-32 focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
                          <span className="text-white font-black text-sm">USDT</span>
                          <button onClick={() => setExchangeAmount(userWallets.master.balance.toString())} className="text-orange-500 font-black text-[10px] uppercase hover:text-orange-400">Max</button>
                        </div>
                      </div>
                   </div>

                   {/* Divider */}
                   <div className="flex justify-center -my-8 relative z-10">
                      <div className="w-14 h-14 bg-[#2b3139] rounded-2xl border-[4px] border-[#0b0e11] flex items-center justify-center text-orange-500 shadow-2xl">
                        <ArrowRightLeft size={24} className="rotate-90" />
                      </div>
                   </div>

                   {/* Target Selection */}
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Target Distribution</label>
                      <div className="relative group">
                        <div className="w-full bg-[#1e2329] rounded-2xl px-6 py-6 flex justify-between items-center cursor-pointer hover:bg-[#2b3139] transition-all group">
                          <div className="flex items-center gap-4">
                             <div className={`w-10 h-10 rounded-xl ${coins[selectedCoin].bg} flex items-center justify-center ${coins[selectedCoin].color} border border-white/5`}>
                                <Zap size={20} />
                             </div>
                             <div>
                               <span className="text-white font-black text-xl leading-none">{coins[selectedCoin].symbol}</span>
                               <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">{coins[selectedCoin].name}</p>
                             </div>
                          </div>
                          <ChevronDown size={20} className="text-slate-500 group-hover:text-white transition-colors" />
                        </div>
                        
                        <div className="hidden group-hover:block absolute top-full left-0 right-0 z-20 bg-[#1e2329] border border-white/10 rounded-2xl mt-2 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                          {Object.entries(coins).filter(([key]) => key !== 'USDT').map(([key, coin]) => (
                            <div key={key} onClick={() => setSelectedCoin(key as any)} className="px-6 py-5 hover:bg-[#2b3139] cursor-pointer flex justify-between items-center group/item">
                               <div className="flex items-center gap-4">
                                 <div className={`w-8 h-8 rounded-lg ${coin.bg} flex items-center justify-center ${coin.color}`}>
                                    <Zap size={14} />
                                 </div>
                                 <span className="font-black text-white group-hover/item:text-orange-500 transition-colors">{coin.symbol}</span>
                               </div>
                               <span className="text-[10px] font-black text-slate-600 uppercase">Rate: {coin.rate}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                   </div>

                   {/* Calculated Result Display */}
                   <div className="p-8 bg-orange-500/[0.03] border border-orange-500/10 rounded-3xl space-y-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">Estimated Distribution</p>
                      <p className="text-4xl font-black text-white text-center tracking-tighter">
                         {targetAmount} <span className="text-sm font-bold text-slate-600 ml-1">{selectedCoin}</span>
                      </p>
                   </div>

                   {/* Live Node Rates Table */}
                   <div className="space-y-6 pt-4">
                      <div className="flex justify-between items-center px-1">
                         <div className="flex items-center gap-3">
                           <LineChart size={18} className="text-orange-500" />
                           <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">Node Settlement Rates</h4>
                         </div>
                         <div className="flex items-center gap-1.5">
                           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[9px] font-black text-emerald-500 uppercase">Live Sync</span>
                         </div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-4">
                         {Object.entries(coins).filter(([key]) => key !== 'USDT').map(([key, coin]) => (
                            <div 
                              key={key} 
                              onClick={() => setSelectedCoin(key as any)}
                              className={`flex justify-between items-center p-5 bg-[#1e2329] rounded-2xl border transition-all cursor-pointer ${
                                selectedCoin === key ? 'border-orange-500/50 bg-[#2b3139]' : 'border-white/5 hover:border-white/10'
                              }`}
                            >
                               <div className="flex items-center gap-4">
                                  <div className={`p-3 rounded-xl bg-black/40 ${coin.color}`}>
                                     <BarChart3 size={18} />
                                  </div>
                                  <div>
                                     <p className="text-xs font-black text-white">USDT / {coin.symbol}</p>
                                     <p className="text-[9px] font-bold text-slate-600 uppercase mt-0.5">Yield: {coin.rate}</p>
                                  </div>
                               </div>
                               <div className={`text-[10px] font-black ${coin.change.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                                  {coin.change}
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                </div>
              ) : activeTab === 'deposit' ? (
                <div className="space-y-10 mt-10">
                   {!paymentData ? (
                     <div className="space-y-8">
                        <div className="space-y-4">
                           <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Deposit Amount (USDT)</label>
                           <div className="relative">
                             <input 
                               type="number" 
                               value={depositAmount}
                               onChange={(e) => setDepositAmount(e.target.value)}
                               placeholder="Minimum 10.00" 
                               className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-6 text-white font-black text-3xl pr-32 focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                             />
                             <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
                               <span className="text-white font-black text-sm">USDT</span>
                             </div>
                           </div>
                        </div>
                        
                        <button 
                          onClick={createPayment}
                          disabled={isProcessing}
                          className="w-full bg-orange-600 hover:bg-orange-500 text-white font-black py-6 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50 text-xs uppercase tracking-[0.2em]"
                        >
                          {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : 'Generate Payment Node'}
                        </button>

                        {error && (
                          <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>
                        )}
                     </div>
                   ) : (
                     <div className="space-y-10">
                        <div className="flex flex-col items-center">
                          <div className="relative p-6 bg-white rounded-[40px] shadow-2xl w-64 h-64 flex items-center justify-center overflow-hidden">
                            <img 
                              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${paymentData.pay_address}`} 
                              alt="QR" 
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="mt-6 text-center space-y-2">
                             <p className="text-xs font-black text-white uppercase tracking-tighter">Send Exactly</p>
                             <p className="text-3xl font-black text-orange-500">{paymentData.pay_amount} <span className="text-sm text-slate-500 uppercase">USDT (BEP20)</span></p>
                          </div>
                        </div>

                        <div className="p-8 bg-[#1e2329] rounded-3xl border border-white/5 space-y-4">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Payment Address (BEP20)</p>
                          <div className="flex justify-between items-center gap-4">
                            <p className="text-orange-500 font-mono text-sm break-all font-bold">{paymentData.pay_address}</p>
                            <button onClick={() => copyToClipboard(paymentData.pay_address)} className="p-3 bg-black/20 rounded-xl text-slate-400 hover:text-white transition-colors">
                              {copied ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Copy size={20} />}
                            </button>
                          </div>
                        </div>

                        <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center gap-4 text-blue-400">
                           <RefreshCw className="animate-spin shrink-0" size={18} />
                           <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">Waiting for blockchain confirmation. Your balance will update automatically once verified.</p>
                        </div>

                        <button 
                          onClick={() => setPaymentData(null)}
                          className="w-full py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
                        >
                          Cancel & Reset Protocol
                        </button>
                     </div>
                   )}
                </div>
              ) : activeTab === 'withdraw' ? (
                <div className="space-y-10 mt-10">
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Withdrawal Amount</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          value={exchangeAmount}
                          onChange={(e) => setExchangeAmount(e.target.value)}
                          placeholder="Minimum 10.00" 
                          className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-6 text-white font-black text-3xl pr-32 focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                        />
                        <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
                          <span className="text-white font-black text-sm">USDT</span>
                          <button onClick={() => setExchangeAmount(userWallets.master.balance.toString())} className="text-orange-500 font-black text-[10px] uppercase hover:text-orange-400">Max</button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center px-1">
                         <span className="text-[10px] font-black text-slate-600 uppercase">Processing Fee (10%)</span>
                         <span className="text-[10px] font-black text-white">{(Number(exchangeAmount) * 0.1).toFixed(2)} USDT</span>
                      </div>
                   </div>

                   <div className="p-8 bg-orange-500/[0.03] border border-orange-500/10 rounded-3xl space-y-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">Net Settlement Amount</p>
                      <p className="text-4xl font-black text-white text-center tracking-tighter">
                         {(Number(exchangeAmount) * 0.9).toFixed(2)} <span className="text-sm font-bold text-slate-600 ml-1">USDT</span>
                      </p>
                   </div>

                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Destination Node Address</label>
                      <input 
                        type="text" 
                        placeholder="Enter Protocol Address" 
                        className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-5 text-white font-mono text-xs focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                      />
                   </div>

                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest px-1">Withdrawal Password</label>
                      <input 
                        type="password" 
                        value={withdrawalPassword}
                        onChange={(e) => setWithdrawalPassword(e.target.value)}
                        placeholder="••••••••" 
                        className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-5 text-white focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                      />
                   </div>

                   {error && (
                     <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</p>
                   )}
                </div>
              ) : null}
            </div>

            {/* Sticky Footer */}
            <div className="absolute bottom-0 left-0 right-0 bg-[#0b0e11] border-t border-white/5 p-8 animate-in slide-in-from-bottom duration-300">
               {success ? (
                 <div className="flex items-center justify-center gap-3 text-emerald-500 font-black uppercase tracking-widest py-4">
                   <CheckCircle2 size={24} /> Protocol Action Confirmed
                 </div>
               ) : (
                 <button 
                  onClick={handleAction}
                  disabled={isProcessing || (activeTab === 'exchange' && !exchangeAmount)}
                  className={`w-full font-black py-6 rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-[0.2em] ${
                    isProcessing || (activeTab === 'exchange' && !exchangeAmount) ? 'bg-slate-900 text-slate-700 cursor-not-allowed' : 'bg-orange-600 text-white shadow-xl shadow-orange-950/20'
                  }`}
                >
                  {isProcessing ? <RefreshCw className="animate-spin mx-auto" size={24} /> : `Authorize ${activeTab === 'exchange' ? 'Conversion' : 'Transaction'}`}
                </button>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Main Page Layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/5 pb-12 gap-8">
        <div>
          <h2 className="text-6xl font-black uppercase tracking-tight text-white leading-none italic">Master <span className="text-orange-500">Vault</span></h2>
          <p className="text-slate-500 mt-5 text-xl font-medium max-w-2xl italic">Institutional-grade USDT liquidity management with decentralized node security.</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('deposit')}
            className="flex-1 md:flex-none px-10 py-5 bg-orange-600 text-white font-black rounded-2xl hover:bg-orange-500 transition-all flex items-center justify-center gap-3 shadow-2xl shadow-orange-950/20 active:scale-95 text-xs uppercase tracking-widest"
          >
            <Plus size={20} /> DEPOSIT LIQUIDITY
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        <GlassCard className="lg:col-span-2 space-y-12 p-12">
           <div className="flex justify-between items-center">
              <div className="flex items-center gap-5">
                 <div className="w-14 h-14 bg-orange-500/10 rounded-2xl text-orange-500 flex items-center justify-center border border-orange-500/20">
                    <Wallet size={28} />
                 </div>
                 <div>
                   <h3 className="text-2xl font-black uppercase tracking-widest text-white">Consolidated Assets</h3>
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">Status: Node Active & Synchronized</p>
                 </div>
              </div>
           </div>

           <div className="text-center py-12 relative">
              <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent blur-[100px] pointer-events-none rounded-full" />
              <p className="text-8xl font-black text-white tracking-tighter relative z-10">{userWallets.master.balance.toFixed(2)}</p>
              <div className="flex items-center justify-center gap-4 mt-6 relative z-10">
                <div className="h-[1px] w-12 bg-orange-500/20" />
                <p className="text-orange-500 text-base font-black uppercase tracking-[0.5em]">Tether (USDT)</p>
                <div className="h-[1px] w-12 bg-orange-500/20" />
              </div>
           </div>

           <div className="grid grid-cols-4 gap-8 pt-12 border-t border-white/5">
              <button 
                onClick={() => setActiveTab('exchange')}
                className="flex flex-col items-center gap-5 p-8 bg-white/5 rounded-[32px] hover:bg-white/10 transition-all border border-white/5 group shadow-inner"
              >
                 <div className="p-4 bg-blue-500/10 text-blue-500 rounded-2xl group-hover:bg-blue-500 group-hover:text-white transition-all"><ArrowRightLeft size={24} /></div>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-200">Convert</span>
              </button>
              <button 
                onClick={() => setActiveTab('withdraw')}
                className="flex flex-col items-center gap-5 p-8 bg-white/5 rounded-[32px] hover:bg-white/10 transition-all border border-white/5 group shadow-inner"
              >
                 <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all"><ArrowUpRight size={24} /></div>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-200">Withdraw</span>
              </button>
              <button 
                onClick={() => setActiveTab('deposit')}
                className="flex flex-col items-center gap-5 p-8 bg-white/5 rounded-[32px] hover:bg-white/10 transition-all border border-white/5 group shadow-inner"
              >
                 <div className="p-4 bg-amber-500/10 text-amber-500 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-all"><ArrowDownLeft size={24} /></div>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-200">Deposit</span>
              </button>
              <button 
                onClick={() => setActiveTab('package')}
                className="flex flex-col items-center gap-5 p-8 bg-white/5 rounded-[32px] hover:bg-white/10 transition-all border border-white/5 group shadow-inner"
              >
                 <div className="p-4 bg-orange-500/10 text-orange-500 rounded-2xl group-hover:bg-orange-500 group-hover:text-white transition-all"><Package size={24} /></div>
                 <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 group-hover:text-slate-200">Package</span>
              </button>
           </div>
        </GlassCard>

        <GlassCard className="p-10 space-y-10 flex flex-col">
           <div className="flex items-center gap-4">
              <History size={24} className="text-slate-500" />
              <h4 className="text-lg font-black uppercase tracking-widest text-white">Liquidity Ledger</h4>
           </div>
           
           <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-2">
              {isLoadingTransactions ? (
                <div className="flex flex-col items-center justify-center py-10 gap-4">
                   <RefreshCw className="animate-spin text-slate-700" size={24} />
                   <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Syncing Ledger...</p>
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-10">
                   <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No protocol actions recorded</p>
                </div>
              ) : (
                transactions.map((tx, idx) => (
                  <div key={idx} className="flex justify-between items-center group cursor-pointer hover:translate-x-1 transition-all">
                    <div className="flex items-center gap-5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.payment_status === 'finished' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                          {tx.payment_status === 'finished' ? <ArrowDownLeft size={18} /> : <RefreshCw size={18} className="animate-spin" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">
                            {tx.order_description || 'Inbound Deposit'}
                          </p>
                          <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-0.5">
                            {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleString() : 'Recent'}
                          </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className={`text-sm font-black block ${tx.payment_status === 'finished' ? 'text-emerald-500' : 'text-slate-400'}`}>
                          +{tx.pay_amount || tx.amount}
                        </span>
                        <span className="text-[8px] font-black text-slate-700 uppercase">{tx.payment_status}</span>
                    </div>
                  </div>
                ))
              )}
           </div>
           
           <button className="w-full py-5 bg-white/5 border border-white/5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 hover:text-white transition-all shadow-inner">
              View Node Ledger Analysis
           </button>
        </GlassCard>
      </div>
    </div>
  );
};

export default MasterWallet;
