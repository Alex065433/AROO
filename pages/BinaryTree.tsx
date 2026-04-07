
import React, { useState, useEffect, useMemo, useRef } from 'react';
import GlassCard from '../components/GlassCard';
import { useUser } from '../src/context/UserContext';
import { 
  UserPlus, 
  X, ShieldCheck, Globe, TrendingUp, 
  Zap, ChevronRight, Share2, Award, Copy, Check,
  ArrowUpRight, ArrowDownLeft,
  History, RefreshCw,
  ArrowLeft, AlertCircle,
  CheckCircle2, Users, Search, ArrowUpCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../services/supabase';
import { supabaseService } from '../services/supabaseService';
import { apiFetch } from '../src/lib/api';
import { User as UserProfile } from '../types';
import { LiveRatesTicker } from '../components/LiveRatesTicker';

import { D3BinaryTree } from '../components/D3BinaryTree';
import { RecursiveBinaryTree } from '../components/RecursiveBinaryTree';

interface NodeData {
  id: string;
  name: string;
  rank: string;
  status: 'Active' | 'Pending' | 'Vacant';
  joinDate: string;
  totalTeam: number;
  leftBusiness: string;
  rightBusiness: string;
  parentId: string | null;
  side: 'LEFT' | 'RIGHT' | 'ROOT';
  uid?: string;
  team_size?: { left: number; right: number };
  sponsorId?: string;
  email?: string;
  generationIds?: { id: string; gen: number }[];
  nodeCount?: number;
}

const TREE_DATA: Record<string, NodeData> = {
  'root': { id: 'ARW-XXXX', name: 'Loading...', rank: 'Partner', status: 'Active', joinDate: '2024-01-01', totalTeam: 0, leftBusiness: '0.00', rightBusiness: '0.00', parentId: null, side: 'ROOT' },
};

const BinaryTree: React.FC = () => {
  const { profile: userProfile, loading, refreshProfile } = useUser();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [treeData, setTreeData] = useState<Record<string, NodeData>>({});
  const [isTreeLoading, setIsTreeLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'exchange' | 'package' | 'ledger' | null>(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [notification, setNotification] = useState<string | null>(null);

  useEffect(() => {
    const fetchReferrals = async () => {
      if (!userProfile?.id) return;
      const referrals = await supabaseService.getReferrals(userProfile.id);
      setTotalReferrals(referrals.length);
    };
    fetchReferrals();
  }, [userProfile?.id]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [depositAmount, setDepositAmount] = useState('50');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<'BTC' | 'ETH' | 'TRX'>('BTC');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [viewRootId, setViewRootId] = useState<string | null>(null);
  const [inviteModal, setInviteModal] = useState<{ parentId: string; side: 'LEFT' | 'RIGHT'; url: string } | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const handleInvite = (parentId: string, side: 'LEFT' | 'RIGHT') => {
    const sponsorId = userProfile?.operator_id || 'ARW-XXXX';
    // Use HashRouter compatible URL
    const baseUrl = window.location.origin + window.location.pathname;
    const inviteUrl = `${baseUrl}#/register?ref=${sponsorId}&parent=${parentId}&side=${(side || 'LEFT').toLowerCase()}`;
    
    setInviteModal({
      parentId,
      side,
      url: inviteUrl
    });
  };

  const coins = {
    USDT: { name: 'Tether USDT (BEP20)', symbol: 'USDT', color: 'text-orange-500', bg: 'bg-orange-500/10', rate: 1, change: '+0.01%' },
    BTC: { name: 'Bitcoin (BEP20)', symbol: 'BTC', color: 'text-yellow-500', bg: 'bg-yellow-500/10', rate: 0.000018, change: '-1.42%' },
    ETH: { name: 'Ethereum (BEP20)', symbol: 'ETH', color: 'text-blue-400', bg: 'bg-blue-400/10', rate: 0.00032, change: '+2.10%' },
    TRX: { name: 'Tron (BEP20)', symbol: 'TRX', color: 'text-red-500', bg: 'bg-red-500/10', rate: 8.42, change: '+0.45%' },
  };

  const targetAmount = useMemo(() => {
    if (!exchangeAmount || isNaN(Number(exchangeAmount))) return '0.00';
    return ((Number(exchangeAmount) || 0) * (coins[selectedCoin]?.rate || 0)).toFixed(selectedCoin === 'TRX' ? 2 : 6);
  }, [exchangeAmount, selectedCoin]);

  useEffect(() => {
    let isMounted = true;

    const initView = async () => {
      if (!userProfile) return;
      
      try {
        let rootId = userProfile.id;
        if (userProfile.role === 'admin') {
          const absRoot = await supabaseService.getAbsoluteRoot() as any;
          if (absRoot) rootId = absRoot.id;
        }
        
        if (isMounted) setViewRootId(rootId);

        // Fetch real transactions
        const payments = await supabaseService.getTransactions(userProfile.id);
        if (isMounted) {
          setTransactions(payments);
          setIsLoadingTransactions(false);
        }
      } catch (err) {
        console.error('Error initializing BinaryTree view:', err);
        if (isMounted) setIsLoadingTransactions(false);
      }
    };

    initView();

    return () => {
      isMounted = false;
    };
  }, [userProfile]);

  const refreshTree = async () => {
    if (viewRootId) {
      setIsTreeLoading(true);
      try {
        // First rebuild the network stats in the database
        await supabaseService.rebuildNetwork();
        // Then fetch the updated tree data
        const dynamicTree = await supabaseService.getBinaryTree(viewRootId);
        setTreeData(dynamicTree);
        
        // Refetch profile to update leg counts
        await refreshProfile();
      } catch (err) {
        console.error('Error refreshing tree:', err);
      } finally {
        setIsTreeLoading(false);
      }
    }
  };

  // Fetch tree when viewRootId changes
  useEffect(() => {
    if (viewRootId) {
      const fetchTree = async () => {
        setIsTreeLoading(true);
        try {
          const dynamicTree = await supabaseService.getBinaryTree(viewRootId);
          console.log('BinaryTree treeData:', dynamicTree);
          setTreeData(dynamicTree);
        } catch (err) {
          console.error('Error fetching tree:', err);
        } finally {
          setIsTreeLoading(false);
        }
      };
      
      fetchTree();
      
      // Refresh tree every 10 seconds to ensure leg counts are updated
      const interval = setInterval(fetchTree, 10000);
      return () => clearInterval(interval);
    }
  }, [viewRootId]);

  const createPayment = async () => {
    if (!depositAmount || Number(depositAmount) < 50) {
      setError('Minimum deposit is 50 USDT');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const data = await apiFetch('/api/v1/tx/new', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Number(depositAmount),
          currency: 'usdtbsc',
          uid: userProfile?.id,
          email: userProfile?.email,
          orderDescription: `Deposit for ${userProfile?.email}`
        }),
      });

      setPaymentData({
        payment_id: data.payment_id,
        pay_address: data.pay_address,
        pay_amount: data.pay_amount,
        pay_currency: data.pay_currency
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAction = async () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setActiveTab(null);
      setNotification('Action processed successfully');
      setTimeout(() => setNotification(null), 3000);
    }, 1500);
  };

  const handleSelect = (id: string) => {
    if (selectedNodeId === id) {
      const node = treeData[id];
      if (node && node.uid) {
        setViewRootId(node.uid);
        setSelectedNodeId(null);
      }
    } else {
      setSelectedNodeId(id);
    }
  };

  const handleGoUp = async () => {
    if (!viewRootId || !treeData['root']) return;
    const parentId = treeData['root'].parentId;
    if (parentId) {
      setViewRootId(parentId);
    }
  };

  const handleResetView = async () => {
    if (userProfile) {
      let rootId = userProfile.id;
      if (userProfile.role === 'admin') {
        const absRoot = await supabaseService.getAbsoluteRoot() as any;
        if (absRoot) rootId = absRoot.id;
      }
      setViewRootId(rootId);
    }
  };

  const selectedNode = selectedNodeId ? treeData[selectedNodeId] : null;

  // Find downline members of the selected node
  const { leftBranch, rightBranch, directLeft, directRight } = useMemo(() => {
    if (!selectedNodeId) return { leftBranch: [], rightBranch: [], directLeft: null, directRight: null };
    
    const leftPathPrefix = `${selectedNodeId}-left`;
    const rightPathPrefix = `${selectedNodeId}-right`;
    
    const leftBranch = Object.keys(treeData)
      .filter(path => path.startsWith(leftPathPrefix))
      .map(path => treeData[path])
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
    const rightBranch = Object.keys(treeData)
      .filter(path => path.startsWith(rightPathPrefix))
      .map(path => treeData[path])
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const directLeft = treeData[leftPathPrefix] || null;
    const directRight = treeData[rightPathPrefix] || null;

    return { leftBranch, rightBranch, directLeft, directRight };
  }, [selectedNodeId, treeData]);

  const downlineMembers = useMemo(() => [...leftBranch, ...rightBranch], [leftBranch, rightBranch]);

  return (
    <div className="space-y-0 animate-in fade-in duration-500 relative min-h-[800px]">
      {notification && (
        <div className="fixed top-24 right-10 z-[100] bg-[#c0841a] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 font-bold text-sm">
          <CheckCircle2 size={18} />
          {notification}
        </div>
      )}
      <LiveRatesTicker />
      
      <div className="p-8 space-y-8">

        {/* Invite Modal */}
      <AnimatePresence>
        {inviteModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInviteModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#111112] border border-white/10 rounded-[40px] p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setInviteModal(null)} className="text-slate-500 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex flex-col items-center text-center space-y-6">
                <div className="w-20 h-20 bg-orange-600/20 rounded-[24px] flex items-center justify-center text-orange-500">
                  <Share2 size={32} />
                </div>
                
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight italic">Referral Protocol</h3>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-2">
                    Placement: {inviteModal.parentId} ({inviteModal.side} Side)
                  </p>
                </div>

                <div className="w-full space-y-4">
                  <div className="p-6 bg-slate-900/50 rounded-3xl border border-white/5 space-y-3">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-left">Your Referral Link</p>
                    <div className="flex items-center gap-3">
                      <input 
                        readOnly 
                        value={inviteModal.url}
                        className="flex-1 bg-transparent border-none text-xs font-mono text-slate-300 focus:ring-0 truncate"
                      />
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(inviteModal.url);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="p-3 bg-orange-600 rounded-xl text-white hover:bg-orange-500 transition-all shadow-lg shadow-orange-950/20"
                      >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button 
                      onClick={() => window.open(inviteModal.url, '_blank')}
                      className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all border border-white/5 flex items-center justify-center gap-2"
                    >
                      Open Registration <ArrowUpRight size={14} />
                    </button>
                    <p className="text-[8px] text-slate-600 font-bold uppercase tracking-widest">
                      Share this link with your new partner for direct positioning.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Wallet Modals (Same as MasterWallet) */}
      <AnimatePresence>
        {activeTab && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center">
            <div className="absolute inset-0 bg-[#0b0e11]/98 backdrop-blur-md" onClick={() => !isProcessing && setActiveTab(null)} />
            
            <div className={`relative w-full max-w-[480px] h-full md:h-[90vh] bg-[#0b0e11] md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300 border border-white/5`}>
              
              <div className="px-8 py-6 flex justify-between items-center bg-[#0b0e11] border-b border-white/5">
                <button onClick={() => setActiveTab(null)} className="p-2 text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft size={24} />
                </button>
                <div className="flex flex-col items-center">
                  <h3 className="text-xl font-black text-white uppercase tracking-tighter">
                    {activeTab === 'withdraw' ? 'Send USDT' : activeTab === 'deposit' ? 'Deposit USDT' : activeTab === 'package' ? 'Activate Package' : activeTab === 'ledger' ? 'Liquidity Ledger' : 'Exchange Node'}
                  </h3>
                </div>
                <div className="w-10" />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-32">
                {activeTab === 'deposit' ? (
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
                              placeholder="50" 
                              className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-6 text-white font-black text-3xl pr-32 focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                            />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-white font-black text-sm">USDT</span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-1">Minimum Deposit: 50 USDT</p>
                        </div>

                        <button 
                          onClick={createPayment}
                          disabled={isProcessing}
                          className="w-full py-6 bg-orange-600 text-white font-black rounded-2xl hover:bg-orange-500 transition-all shadow-xl shadow-orange-950/20 flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <Zap size={20} />}
                          INITIALIZE PAYMENT
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-10 animate-in fade-in zoom-in duration-500">
                        <div className="p-8 bg-emerald-500/10 border border-emerald-500/20 rounded-[32px] flex flex-col items-center text-center space-y-4">
                           <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500">
                              <CheckCircle2 size={32} />
                           </div>
                           <div>
                              <p className="text-xs font-black text-white uppercase tracking-widest">Payment Node Generated</p>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Send exactly {paymentData.pay_amount} {paymentData.pay_currency.toUpperCase()}</p>
                           </div>
                        </div>

                        <div className="space-y-6">
                           <div className="p-6 bg-[#1e2329] rounded-2xl border border-white/5 space-y-4">
                              <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Destination Address (BEP20)</p>
                              <div className="flex items-center gap-4">
                                 <p className="flex-1 font-mono text-xs text-white break-all">{paymentData.pay_address}</p>
                                 <button onClick={() => { navigator.clipboard.writeText(paymentData.pay_address); toast.success('Address copied to clipboard'); }} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
                                    <Copy size={16} />
                                 </button>
                              </div>
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : activeTab === 'ledger' ? (
                  <div className="mt-10 space-y-8">
                    {isLoadingTransactions ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <RefreshCw className="animate-spin text-slate-700" size={32} />
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Syncing Ledger...</p>
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="text-center py-20">
                        <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">No protocol actions recorded</p>
                      </div>
                    ) : (
                      transactions.map((tx, idx) => (
                        <div key={idx} className="flex justify-between items-center p-6 bg-white/5 rounded-2xl border border-white/5">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.payment_status === 'finished' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                              {tx.payment_status === 'finished' ? <ArrowDownLeft size={18} /> : <RefreshCw size={18} className="animate-spin" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{tx.order_description || 'Inbound Deposit'}</p>
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
                ) : (
                  <div className="mt-10 text-center py-20">
                    <AlertCircle className="mx-auto text-slate-700 mb-4" size={48} />
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Protocol under maintenance</p>
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 left-0 right-0 bg-[#0b0e11] border-t border-white/5 p-8">
                <button 
                  onClick={() => setActiveTab(null)}
                  className="w-full py-5 bg-white/5 text-slate-400 font-black rounded-2xl hover:text-white transition-all text-xs uppercase tracking-widest"
                >
                  Close Interface
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tight text-white italic">Network Architecture</h2>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-slate-500 font-medium">Visualization of your institutional binary growth nodes.</p>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleGoUp}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all border border-white/5 flex items-center gap-2"
              >
                <ArrowLeft size={12} /> Go Up
              </button>
              <button 
                onClick={handleResetView}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all border border-white/5 flex items-center gap-2"
              >
                <RefreshCw size={12} /> Reset View
              </button>
              <button 
                onClick={refreshTree}
                disabled={isTreeLoading}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all border border-orange-500/20 flex items-center gap-2 shadow-lg shadow-orange-950/20"
              >
                <RefreshCw size={12} className={isTreeLoading ? "animate-spin" : ""} /> Sync Network
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900/50 p-2 rounded-2xl border border-white/5 backdrop-blur-xl">
            <button onClick={() => setActiveTab('ledger')} className="p-3 text-slate-400 hover:text-white transition-colors flex flex-col items-center gap-1">
              <History size={20} />
              <span className="text-[7px] font-black uppercase">Ledger</span>
            </button>
            <button onClick={() => setActiveTab('deposit')} className="p-3 text-slate-400 hover:text-white transition-colors flex flex-col items-center gap-1">
              <ArrowDownLeft size={20} />
              <span className="text-[7px] font-black uppercase">Deposit</span>
            </button>
            <button onClick={() => setActiveTab('withdraw')} className="p-3 text-slate-400 hover:text-white transition-colors flex flex-col items-center gap-1">
              <ArrowUpRight size={20} />
              <span className="text-[7px] font-black uppercase">Withdraw</span>
            </button>
          </div>

          <div className="flex items-center gap-4 bg-slate-900/50 p-2 rounded-2xl border border-white/5 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-orange-500" />
                 <span className="text-[10px] font-black text-slate-500 uppercase">Path Active</span>
               </div>
               {viewRootId !== userProfile?.id && (
                 <div className="flex gap-2">
                   <button 
                     onClick={() => {
                       const currentRoot = treeData['root'];
                       if (currentRoot && currentRoot.parentId) {
                         setViewRootId(currentRoot.parentId);
                       }
                     }}
                     className="px-4 py-2 bg-slate-800 text-slate-400 text-[9px] font-black uppercase rounded-lg border border-white/5 hover:text-white transition-all"
                   >
                     Go Up
                   </button>
                   <button 
                     onClick={() => {
                       setViewRootId(userProfile?.id || null);
                       // scrollToMyNode
                     }}
                     className="px-4 py-2 bg-orange-600/20 text-orange-500 text-[9px] font-black uppercase rounded-lg border border-orange-500/30 hover:bg-orange-600 hover:text-white transition-all"
                   >
                     My Node
                   </button>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <GlassCard className="p-6 border-white/5 flex items-center justify-between bg-gradient-to-br from-orange-500/10 to-transparent">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Direct Referrals</p>
            <h3 className="text-3xl font-black text-white italic">{totalReferrals}</h3>
          </div>
          <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500">
            <UserPlus size={24} />
          </div>
        </GlassCard>
        <GlassCard className="p-6 border-white/5 flex items-center justify-between bg-gradient-to-br from-emerald-500/10 to-transparent">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Left Leg Count</p>
            <h3 className="text-3xl font-black text-white italic">{userProfile?.team_size?.left || 0}</h3>
          </div>
          <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-500">
            <ArrowDownLeft size={24} />
          </div>
        </GlassCard>
        <GlassCard className="p-6 border-white/5 flex items-center justify-between bg-gradient-to-br from-blue-500/10 to-transparent">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Right Leg Count</p>
            <h3 className="text-3xl font-black text-white italic">{userProfile?.team_size?.right || 0}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500">
            <ArrowUpRight size={24} />
          </div>
        </GlassCard>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start relative">
        {/* Main Tree Container */}
        <div className="w-full lg:flex-1 h-[600px] md:h-[850px] relative">
          {isTreeLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b] rounded-[40px] border border-white/5">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="text-orange-500 animate-spin" size={48} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Synchronizing Network Data...</p>
              </div>
            </div>
          ) : Object.keys(treeData).length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b] rounded-[40px] border border-white/5">
              <div className="flex flex-col items-center gap-4">
                <AlertCircle className="text-slate-700" size={48} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">No Network Data Found</p>
              </div>
            </div>
          ) : (
            <D3BinaryTree 
              data={treeData}
              onSelect={handleSelect}
              onInvite={handleInvite}
              userProfile={userProfile}
            />
          )}
        </div>

        {/* Profile Sidebar (Chain Details) */}
        <AnimatePresence>
          {selectedNode && (
            <>
              {/* Mobile Overlay Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedNodeId(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[140] lg:hidden"
              />
              
              <motion.div
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 w-full sm:w-[400px] lg:w-96 z-[150] lg:relative lg:z-0 lg:h-[850px] bg-[#0d0d0e] border-l lg:border border-white/5 lg:rounded-[40px] shadow-2xl p-6 md:p-8 flex flex-col"
              >
                <div className="flex justify-between items-center mb-6 md:mb-8">
                  <div className="px-4 py-1.5 bg-orange-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-orange-950/20">
                    Node Analysis
                  </div>
                  <button 
                    onClick={() => setSelectedNodeId(null)}
                    className="p-2 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-xl lg:bg-transparent"
                  >
                    <X size={24} />
                  </button>
                </div>

              <div className="flex flex-col items-center text-center space-y-4 mb-10 pb-10 border-b border-white/5">
                <div className="relative">
                  <div className="w-24 h-24 rounded-3xl bg-slate-800 border-2 border-orange-500 p-1 flex items-center justify-center overflow-hidden">
                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedNode.name}`} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-500 rounded-xl flex items-center justify-center border-4 border-[#0d0d0e] text-white">
                    <ShieldCheck size={14} />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white italic tracking-tight">{selectedNode.name}</h3>
                  <p className="text-orange-500 font-black text-[10px] uppercase tracking-[0.3em] mt-1">{selectedNode.rank}</p>
                </div>
              </div>

              <div className="flex-1 space-y-6 overflow-y-auto custom-scrollbar pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-white/5 rounded-3xl border border-white/5">
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Left Business</p>
                    <p className="text-lg font-black text-white mt-1">{selectedNode.leftBusiness} <span className="text-[10px] opacity-50">USDT</span></p>
                    <p className="text-[10px] text-orange-500 font-bold mt-1">L: {selectedNode.team_size?.left || 0}</p>
                  </div>
                  <div className="p-5 bg-white/5 rounded-3xl border border-white/5">
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Right Business</p>
                    <p className="text-lg font-black text-white mt-1">{selectedNode.rightBusiness} <span className="text-[10px] opacity-50">USDT</span></p>
                    <p className="text-[10px] text-orange-500 font-bold mt-1">R: {selectedNode.team_size?.right || 0}</p>
                  </div>
                </div>

                <div className="p-5 bg-white/5 rounded-3xl border border-white/5 flex justify-between items-center">
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Total Downline</p>
                    <p className="text-lg font-black text-white mt-1">{downlineMembers.length} <span className="text-[10px] opacity-50">Members</span></p>
                  </div>
                  <button 
                    onClick={refreshTree}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors group"
                    title="Refresh Tree"
                  >
                    <RefreshCw className="w-5 h-5 text-slate-500 group-hover:text-orange-500 transition-colors" />
                  </button>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Network Registry ID', val: selectedNode.id, icon: Globe },
                    { label: 'Synchronization Date', val: selectedNode.joinDate, icon: Zap },
                    { label: 'Team Node Count', val: `${selectedNode.nodeCount || 1} IDs`, icon: Award },
                    { label: 'Placement Protocol', val: `${selectedNode.side} BRANCH`, icon: Share2 },
                    { label: 'Sponsor ID', val: selectedNode.sponsorId || 'N/A', icon: UserPlus },
                    { label: 'Contact Email', val: selectedNode.email || 'N/A', icon: Globe }
                  ].map((item, idx) => (
                    <div key={idx} className="flex items-center gap-5 p-4 bg-white/[0.02] border border-white/5 rounded-2xl group hover:bg-white/5 transition-colors">
                      <div className="p-2.5 bg-slate-800 rounded-xl text-slate-500 group-hover:text-orange-500 transition-colors">
                        <item.icon size={18} />
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{item.label}</p>
                        <p className="text-xs font-bold text-slate-200 mt-0.5">{item.val}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Generation IDs Section */}
                {selectedNode.generationIds && selectedNode.generationIds.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-white/5">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Generation IDs</h4>
                      <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-white/40">{selectedNode.generationIds.length} Total</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                      {selectedNode.generationIds.map((genId, idx) => (
                        <div key={idx} className="p-3 bg-white/5 rounded-xl border border-white/5 flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-lg bg-orange-600/20 flex items-center justify-center text-orange-500 text-[10px] font-black">
                              {genId.gen}
                            </div>
                            <span className="text-[10px] font-mono text-slate-300">{genId.id}</span>
                          </div>
                          <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">GEN {genId.gen}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Downline Members List */}
                <div className="mt-8 pt-8 border-t border-white/5">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Downline Branches</h4>
                    <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-white/40">{downlineMembers.length} Total</span>
                  </div>

                  {/* Left Branch Section */}
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Left Branch ({leftBranch.length})</h5>
                    </div>
                    
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                      {leftBranch.length > 0 ? (
                        leftBranch.map((member, idx) => (
                          <div 
                            key={`left-${idx}`}
                            className={`p-4 bg-white/5 rounded-2xl border transition-all group cursor-pointer ${
                              directLeft?.uid === member.uid ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/5 hover:border-orange-500/30'
                            }`}
                            onClick={() => {
                              const path = Object.keys(treeData).find(k => treeData[k].uid === member.uid);
                              if (path) setSelectedNodeId(path);
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-black text-white group-hover:text-orange-500 transition-colors italic">
                                {member.name} {directLeft?.uid === member.uid && <span className="text-[8px] text-orange-500 ml-2">(DIRECT)</span>}
                              </p>
                              <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                                member.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                {member.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-white/30 font-bold">
                              <span>ID: {member.id}</span>
                              <span className="text-orange-500/60 uppercase tracking-widest">{member.rank}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
                          <p className="text-[9px] font-black text-white/10 uppercase tracking-widest">No Left Branch Members</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Branch Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      <h5 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Right Branch ({rightBranch.length})</h5>
                    </div>
                    
                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                      {rightBranch.length > 0 ? (
                        rightBranch.map((member, idx) => (
                          <div 
                            key={`right-${idx}`}
                            className={`p-4 bg-white/5 rounded-2xl border transition-all group cursor-pointer ${
                              directRight?.uid === member.uid ? 'border-orange-500/50 bg-orange-500/5' : 'border-white/5 hover:border-orange-500/30'
                            }`}
                            onClick={() => {
                              const path = Object.keys(treeData).find(k => treeData[k].uid === member.uid);
                              if (path) setSelectedNodeId(path);
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-black text-white group-hover:text-orange-500 transition-colors italic">
                                {member.name} {directRight?.uid === member.uid && <span className="text-[8px] text-orange-500 ml-2">(DIRECT)</span>}
                              </p>
                              <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${
                                member.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                              }`}>
                                {member.status}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-white/30 font-bold">
                              <span>ID: {member.id}</span>
                              <span className="text-orange-500/60 uppercase tracking-widest">{member.rank}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 bg-white/[0.02] rounded-3xl border border-dashed border-white/5">
                          <p className="text-[9px] font-black text-white/10 uppercase tracking-widest">No Right Branch Members</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 space-y-3 mt-auto">
                 <button 
                   onClick={() => {
                     if (selectedNode.uid) {
                       setViewRootId(selectedNode.uid);
                       setSelectedNodeId(null);
                       // Scroll to top of tree container on mobile
                       if (window.innerWidth < 1024) {
                         window.scrollTo({ top: 0, behavior: 'smooth' });
                       }
                     }
                   }}
                   className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-orange-950/20 active:scale-95 flex items-center justify-center gap-3"
                 >
                   Inspect Child Nodes <ChevronRight size={16} />
                 </button>
                 <button 
                   onClick={() => setActiveTab('ledger')}
                   className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-500 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-2xl transition-all border border-white/5"
                 >
                   Export Ledger
                 </button>
              </div>
            </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <div className="bg-[#111112] border border-white/5 p-10 rounded-[40px] flex flex-col md:flex-row items-center gap-10">
        <div className="p-5 bg-orange-500/10 rounded-3xl text-orange-500 shadow-inner">
           <TrendingUp size={32} />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h4 className="text-lg font-black uppercase tracking-widest text-slate-200">Binary Positioning Protocol</h4>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Selecting an active node activates the <b>Primary Connection Chain</b>. Clicking an empty node initializes the <b>Registration Invite Protocol</b>, providing side-specific positioning links for new organizational expansion.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
};

export default BinaryTree;
