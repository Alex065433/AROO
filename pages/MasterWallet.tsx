
import React, { useState, useEffect, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import { PACKAGES } from '../constants';
import { supabaseService } from '../services/supabaseService';
import { supabase } from '../services/supabase';
import { useUser } from '../src/context/UserContext';
import { useLocation } from 'react-router-dom';
import { 
  Wallet, ArrowUpRight, ArrowDownLeft, ArrowRightLeft, 
  History, Plus, X, ArrowRight, CheckCircle2, RefreshCw,
  Copy, Check, Info, Zap, 
  ArrowLeft, ChevronDown, AlertCircle,
  TrendingUp, TrendingDown, BarChart3, LineChart, Package
} from 'lucide-react';

const MasterWallet: React.FC = () => {
  const { profile: userProfile, loading, refreshProfile } = useUser();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'exchange' | 'package' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (action === 'deposit' || action === 'withdraw' || action === 'exchange' || action === 'package') {
      setActiveTab(action);
    }
  }, [location.search]);
  const [selectedCoin, setSelectedCoin] = useState<'BTC' | 'ETH' | 'TRX'>('BTC');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('50');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  const [currentDepositAddress, setCurrentDepositAddress] = useState('0xff92bfff708e055593e03ff6fb12dd05e6e09d44');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [withdrawalAddress, setWithdrawalAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const userWallets = useMemo(() => {
    if (!userProfile) return null;
    return { 
      master: { balance: Number(userProfile.wallet_balance || 0), currency: 'USDT' },
      referral: { balance: Number(userProfile.referral_income || 0), currency: 'USDT' },
      matching: { balance: Number(userProfile.matching_income || 0), currency: 'USDT' },
      yield: { balance: Number(userProfile.yield_income || 0), currency: 'USDT' },
      rankBonus: { balance: Number(userProfile.rank_bonus_income || 0), currency: 'USDT' },
      rewards: { balance: Number(userProfile.incentive_income || 0), currency: 'USDT' }
    };
  }, [userProfile]);

  useEffect(() => {
    let isMounted = true;

    const fetchTransactions = async () => {
      if (!userProfile?.id) return;
      try {
        const payments = await supabaseService.getTransactions(userProfile.id);
        if (isMounted) {
          setTransactions(payments);
          setIsLoadingTransactions(false);
        }
      } catch (err) {
        console.error('Error fetching transactions:', err);
        if (isMounted) setIsLoadingTransactions(false);
      }
    };

    fetchTransactions();

    // Polling for payment status
    let statusInterval: any;
    if (paymentData?.payment_id) {
      statusInterval = setInterval(async () => {
        try {
          console.log(`Polling status for payment ${paymentData.payment_id}...`);
          const response = await fetch(`/api/v1/tx/status/${paymentData.payment_id}`);
          if (response.ok) {
            const data = await response.json();
            if (data.payment_status === 'finished' || data.payment_status === 'partially_paid') {
              console.log('Payment finished! Refreshing data...');
              setSuccess(true);
              setPaymentData(null);
              fetchTransactions();
              refreshProfile();
              clearInterval(statusInterval);
              setTimeout(() => setSuccess(false), 3000);
            }
          }
        } catch (err) {
          console.error('Error polling payment status:', err);
        }
      }, 10000); // Poll every 10 seconds
    }

    return () => {
      isMounted = false;
      if (statusInterval) clearInterval(statusInterval);
    };
  }, [userProfile?.id, paymentData?.payment_id, refreshProfile]);

  const coins = {
    USDT: { name: 'Tether USDT (BEP20)', symbol: 'USDT', color: 'text-orange-500', bg: 'bg-orange-500/10', rate: 1, change: '+0.01%' },
    BTC: { name: 'Bitcoin (BEP20)', symbol: 'BTC', color: 'text-yellow-500', bg: 'bg-yellow-500/10', rate: 0.000018, change: '-1.42%' },
    ETH: { name: 'Ethereum (BEP20)', symbol: 'ETH', color: 'text-blue-400', bg: 'bg-blue-400/10', rate: 0.00032, change: '+2.10%' },
    TRX: { name: 'Tron (BEP20)', symbol: 'TRX', color: 'text-red-500', bg: 'bg-red-500/10', rate: 8.42, change: '+0.45%' },
  };

  // Automated target calculation
  const targetAmount = useMemo(() => {
    if (!exchangeAmount || isNaN(Number(exchangeAmount))) return '0.00';
    return ((Number(exchangeAmount) || 0) * (coins[selectedCoin]?.rate || 0)).toFixed(selectedCoin === 'TRX' ? 2 : 6);
  }, [exchangeAmount, selectedCoin]);

  const createPayment = async () => {
    // ✅ Validation
    if (!depositAmount || Number(depositAmount) < 10) {
      setError("Minimum deposit is 10 USDT");
      return;
    }

    if (!userProfile?.id) {
      setError("User not loaded");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      console.log('Creating payment via /api/v1/payment/create...');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';

      const response = await fetch('/api/v1/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: Number(depositAmount),
          currency: 'usdtbsc',
          uid: userProfile.id,
          email: userProfile.email,
          order_description: `Deposit for ${userProfile.email}`
        }),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('PAYMENT ERROR: Received non-JSON response from server', {
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: text.substring(0, 500)
        });
        throw new Error(`Server returned ${response.status} ${response.statusText} (${contentType || 'no content type'}). Expected JSON.`);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payment');
      }
      console.log('Payment created successfully:', data);
      
      setPaymentData({
        payment_id: data.payment_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency
      });
    } catch (err: any) {
      console.error("PAYMENT ERROR:", err);
      setError(err.message || "Something went wrong");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAction = async (forcedAmount?: string) => {
    const amountToUse = forcedAmount || exchangeAmount;
    const numericAmount = Number(amountToUse);
    
    if (!amountToUse || isNaN(numericAmount) || numericAmount <= 0) {
      setError('Please enter a valid amount greater than 0');
      return;
    }
    
    if (activeTab === 'withdraw') {
      if (!userProfile?.active_package) {
        setError('You must have an active package to withdraw funds.');
        return;
      }

      if (!withdrawalPassword) {
        setError('Withdrawal password is required');
        return;
      }

      if (!withdrawalAddress) {
        setError('Destination address is required');
        return;
      }
      
      // Verify withdrawal password
      try {
        setIsProcessing(true);
        const user = userProfile;
        if (user) {
          const isPasswordValid = await supabaseService.verifyWithdrawalPassword(user.id, withdrawalPassword);
          if (!isPasswordValid) {
            setError('Incorrect withdrawal password');
            setIsProcessing(false);
            return;
          }

          // Create withdrawal request via API
          console.log('Creating withdrawal via /api/v1/tx/withdraw...');
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token || '';

          const withdrawResponse = await fetch('/api/v1/tx/withdraw', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              amount: numericAmount,
              address: withdrawalAddress,
              uid: user.id,
              email: user.email
            }),
          });

          const withdrawContentType = withdrawResponse.headers.get('content-type');
          if (!withdrawContentType || !withdrawContentType.includes('application/json')) {
            const text = await withdrawResponse.text();
            console.error('WITHDRAWAL ERROR: Received non-JSON response from server', {
              status: withdrawResponse.status,
              statusText: withdrawResponse.statusText,
              contentType: withdrawContentType,
              body: text.substring(0, 500)
            });
            throw new Error(`Server returned ${withdrawResponse.status} ${withdrawResponse.statusText} (${withdrawContentType || 'no content type'}). Expected JSON.`);
          }

          const withdrawData = await withdrawResponse.json();
          if (!withdrawResponse.ok) {
            throw new Error(withdrawData.error || 'Failed to create withdrawal');
          }
          console.log('Withdrawal created successfully:', withdrawData);
          
          // Deduct balance in Supabase (the API already created the payment record)
          await supabaseService.createWithdrawal(user.id, numericAmount, withdrawalAddress);
          
          setSuccess(true);
          setTimeout(() => {
            setSuccess(false);
            setActiveTab(null);
            setExchangeAmount('');
            setWithdrawalPassword('');
            setWithdrawalAddress('');
          }, 2500);
          return;
        }
      } catch (err: any) {
        console.error('Error processing withdrawal:', err);
        setError(err.message || 'Withdrawal failed. Please try again.');
        setIsProcessing(false);
        return;
      }
    }

    if (activeTab === 'package') {
      // The database RPC 'activate_package' handles the balance check and deduction 
      // from the master wallet automatically.
      try {
        const user = supabaseService.getCurrentUser();
        if (user) {
          const cost = Number(amountToUse);
          
          // Call activatePackage which handles logging, team nodes, active_package field, and MLM income
          // It will also trigger the wallet deduction in the DB
          setIsProcessing(true);
          await supabaseService.activatePackage(userProfile.id, cost);
          
          // Refresh global profile state
          await refreshProfile();
          
          setSuccess(true);
          setTimeout(() => {
            setSuccess(false);
            setActiveTab(null);
            setExchangeAmount('');
          }, 2500);
          return;
        }
      } catch (err: any) {
        console.error('Error activating package:', err);
        setError(err.message || 'Activation failed. Please try again.');
        setIsProcessing(false);
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
                      {PACKAGES.map((pkg) => (
                        <div key={pkg.name} className="p-6 bg-[#1e2329] border border-white/5 rounded-3xl hover:border-orange-500/30 transition-all group cursor-pointer">
                           <div className="flex justify-between items-center">
                              <div>
                                 <h4 className="text-sm font-black text-white uppercase tracking-widest">{pkg.name}</h4>
                                 <p className="text-2xl font-black text-orange-500 mt-1">{pkg.price} USDT</p>
                              </div>
                              <button 
                                onClick={() => {
                                  const amountStr = pkg.price.toString();
                                  setExchangeAmount(amountStr);
                                  handleAction(amountStr);
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
              ) :
 activeTab === 'exchange' ? (
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
                               placeholder="Minimum 50.00" 
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

                        <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center gap-4 text-blue-400">
                       <Info size={18} className="shrink-0" />
                       <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">
                         Withdrawal will process within 6 to 12 hours.
                       </p>
                    </div>

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
                         <span className="text-[10px] font-black text-white">{((Number(exchangeAmount) || 0) * 0.1).toFixed(2)} USDT</span>
                      </div>
                   </div>

                   <div className="p-8 bg-orange-500/[0.03] border border-orange-500/10 rounded-3xl space-y-2">
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] text-center">Net Settlement Amount</p>
                      <p className="text-4xl font-black text-white text-center tracking-tighter">
                         {((Number(exchangeAmount) || 0) * 0.9).toFixed(2)} <span className="text-sm font-bold text-slate-600 ml-1">USDT</span>
                      </p>
                   </div>

                    <div className="space-y-4">
                       <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Destination Node Address</label>
                       <input 
                         type="text" 
                         value={withdrawalAddress || ''}
                         onChange={(e) => setWithdrawalAddress(e.target.value)}
                         placeholder="Enter Protocol Address" 
                         className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-5 text-white font-mono text-xs focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                       />
                    </div>

                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest px-1">Withdrawal Password</label>
                      <input 
                        type="password" 
                        value={withdrawalPassword || ''}
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
                  onClick={() => handleAction()}
                  disabled={isProcessing || ((activeTab === 'exchange' || activeTab === 'withdraw' || activeTab === 'package') && !exchangeAmount)}
                  className={`w-full font-black py-6 rounded-2xl transition-all active:scale-95 text-xs uppercase tracking-[0.2em] ${
                    isProcessing || ((activeTab === 'exchange' || activeTab === 'withdraw' || activeTab === 'package') && !exchangeAmount) ? 'bg-slate-900 text-slate-700 cursor-not-allowed' : 'bg-orange-600 text-white shadow-xl shadow-orange-950/20'
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
              <p className="text-8xl font-black text-white tracking-tighter relative z-10">{(userWallets?.master?.balance || 0).toFixed(2)}</p>
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
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.status === 'finished' ? (tx.type === 'withdrawal' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20') : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                          {tx.status === 'finished' ? (tx.type === 'withdrawal' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />) : <RefreshCw size={18} className="animate-spin" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white group-hover:text-orange-500 transition-colors">
                            {tx.order_description || tx.type?.replace(/_/g, ' ').toUpperCase() || 'Inbound Deposit'}
                          </p>
                          <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-0.5">
                            {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'Recent'}
                          </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className={`text-sm font-black block ${tx.status === 'finished' ? (tx.type === 'withdrawal' ? 'text-rose-500' : 'text-emerald-500') : 'text-slate-400'}`}>
                          {tx.type === 'withdrawal' ? '-' : (tx.amount > 0 ? '+' : '')}{tx.amount}
                        </span>
                        <span className="text-[8px] font-black text-slate-700 uppercase">{tx.status}</span>
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
