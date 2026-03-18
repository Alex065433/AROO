
import React, { useState, useEffect, useMemo } from 'react';
import GlassCard from '../components/GlassCard';
import { 
  ZoomIn, ZoomOut, Maximize, UserCheck, UserPlus, 
  Info, X, ShieldCheck, Globe, TrendingUp, 
  Zap, ChevronRight, Share2, Award, Copy, Check,
  Link as LinkIcon, Wallet, ArrowUpRight, ArrowDownLeft,
  ArrowRightLeft, Package, History, RefreshCw,
  ArrowLeft, ChevronDown, AlertCircle, BarChart3, LineChart,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabaseService } from '../services/supabaseService';
import { User as UserProfile } from '../types';

interface NodeData {
  id: string;
  name: string;
  rank: string;
  status: 'Active' | 'Pending' | 'Vacant';
  joinDate: string;
  totalTeam: number;
  leftVolume: string;
  rightVolume: string;
  parentId: string | null;
  side: 'LEFT' | 'RIGHT' | 'ROOT';
  uid?: string;
}

const TREE_DATA: Record<string, NodeData> = {
  'root': { id: 'ARW-XXXX', name: 'Loading...', rank: 'Partner', status: 'Active', joinDate: '2024-01-01', totalTeam: 0, leftVolume: '0.00', rightVolume: '0.00', parentId: null, side: 'ROOT' },
};

const Node: React.FC<{ 
  nodeId: string;
  data: NodeData | null; 
  isSelected: boolean;
  isPath: boolean;
  onSelect: (id: string) => void;
  onInvite?: (side: 'LEFT' | 'RIGHT') => void;
  nodeSide?: 'LEFT' | 'RIGHT';
}> = ({ nodeId, data, isSelected, isPath, onSelect, onInvite, nodeSide }) => {
  const active = data && data.status !== 'Vacant';
  
  return (
    <motion.div 
      layout
      className="flex flex-col items-center gap-3 relative"
    >
      <motion.div 
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => active ? onSelect(nodeId) : onInvite?.(nodeSide || 'LEFT')}
        className={`w-20 h-20 rounded-[24px] border-2 flex items-center justify-center transition-all duration-500 group cursor-pointer relative z-20 ${
          isSelected 
            ? 'bg-orange-600 border-white shadow-[0_0_30px_rgba(249,115,22,0.6)]' 
            : active 
              ? isPath 
                ? 'bg-slate-800 border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.3)]'
                : 'bg-slate-800 border-white/10 hover:border-orange-500/50' 
              : 'bg-slate-900 border-dashed border-white/5 opacity-40 hover:opacity-100 hover:bg-orange-500/10 hover:border-orange-500/30'
        }`}
      >
        {active ? (
          <UserCheck className={isSelected ? 'text-white' : isPath ? 'text-orange-500' : 'text-slate-400'} size={28} />
        ) : (
          <div className="flex flex-col items-center gap-1">
            <UserPlus className="text-slate-700 group-hover:text-orange-500 transition-colors" size={24} />
            <span className="text-[7px] font-black text-slate-700 group-hover:text-orange-500 uppercase tracking-tighter">Invite</span>
          </div>
        )}
        
        {/* Animated pulse for selected or path nodes */}
        {(isSelected || isPath) && (
          <span className="absolute inset-0 rounded-[24px] bg-orange-500/20 animate-ping pointer-events-none" />
        )}
      </motion.div>
      
      <div className="text-center h-8">
        <p className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-orange-500' : active ? 'text-white' : 'text-slate-700'}`}>
          {active ? data?.name : 'Initialize Node'}
        </p>
        {active && (
          <p className="text-[8px] text-slate-500 font-bold uppercase mt-1 tracking-tighter">
            {data?.id}
          </p>
        )}
      </div>
    </motion.div>
  );
};

const ConnectionLine: React.FC<{ isActive: boolean; direction: 'vertical' | 'left' | 'right' | 'horizontal'; width?: string }> = ({ isActive, direction, width = '300px' }) => {
  const styles = {
    vertical: 'h-12 w-[2px]',
    left: `h-12 w-[2px] absolute top-0 left-0`,
    right: `h-12 w-[2px] absolute top-0 right-0`,
    horizontal: `h-[2px] absolute top-12 left-1/2 -translate-x-1/2`,
  };

  return (
    <div 
      className={`transition-all duration-700 ${styles[direction]} ${isActive ? 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]' : 'bg-white/5'}`}
      style={direction === 'horizontal' ? { width } : {}}
    />
  );
};

const BinaryTree: React.FC = () => {
  const [scale, setScale] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inviteModalSide, setInviteModalSide] = useState<'LEFT' | 'RIGHT' | null>(null);
  const [copied, setCopied] = useState(false);
  const [treeData, setTreeData] = useState<Record<string, NodeData>>(TREE_DATA);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'exchange' | 'package' | 'ledger' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [depositAmount, setDepositAmount] = useState('150');
  const [paymentData, setPaymentData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCoin, setSelectedCoin] = useState<'BTC' | 'ETH' | 'TRX'>('BTC');
  const [exchangeAmount, setExchangeAmount] = useState('');
  const [withdrawalPassword, setWithdrawalPassword] = useState('');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [viewRootId, setViewRootId] = useState<string | null>(null);

  const coins = {
    USDT: { name: 'Tether USDT (BEP20)', symbol: 'USDT', color: 'text-orange-500', bg: 'bg-orange-500/10', rate: 1, change: '+0.01%' },
    BTC: { name: 'Bitcoin (BEP20)', symbol: 'BTC', color: 'text-yellow-500', bg: 'bg-yellow-500/10', rate: 0.000018, change: '-1.42%' },
    ETH: { name: 'Ethereum (BEP20)', symbol: 'ETH', color: 'text-blue-400', bg: 'bg-blue-400/10', rate: 0.00032, change: '+2.10%' },
    TRX: { name: 'Tron (BEP20)', symbol: 'TRX', color: 'text-red-500', bg: 'bg-red-500/10', rate: 8.42, change: '+0.45%' },
  };

  const targetAmount = useMemo(() => {
    if (!exchangeAmount || isNaN(Number(exchangeAmount))) return '0.00';
    return (Number(exchangeAmount) * coins[selectedCoin].rate).toFixed(selectedCoin === 'TRX' ? 2 : 6);
  }, [exchangeAmount, selectedCoin]);

  useEffect(() => {
    const unsubscribe = supabaseService.onAuthChange(async (user) => {
      if (user) {
        try {
          const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
          if (profile) {
            setUserProfile(profile);
            
            let rootId = user.id || user.uid;
            if (profile.role === 'admin') {
              const absRoot = await supabaseService.getAbsoluteRoot() as any;
              if (absRoot) rootId = absRoot.id;
            }
            
            setViewRootId(rootId);
            const dynamicTree = await supabaseService.getBinaryTree(rootId);
            if (Object.keys(dynamicTree).length > 0) {
              setTreeData(dynamicTree);
            }
          }
          const payments = await supabaseService.getPayments(user.id || user.uid);
          setTransactions(payments);
          setIsLoadingTransactions(false);
        } catch (err) {
          console.error('Error fetching tree or profile:', err);
          setIsLoadingTransactions(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch tree when viewRootId changes
  useEffect(() => {
    if (viewRootId) {
      const fetchTree = async () => {
        const dynamicTree = await supabaseService.getBinaryTree(viewRootId);
        if (Object.keys(dynamicTree).length > 0) {
          setTreeData(dynamicTree);
        }
      };
      fetchTree();
    }
  }, [viewRootId]);

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
      if (!response.ok) throw new Error('Failed to create payment');
      const data = await response.json();
      setPaymentData(data);
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
      alert('Action processed successfully');
    }, 1500);
  };

  // Calculate path from selected node to root
  const getPathToRoot = (nodeId: string | null): string[] => {
    if (!nodeId) return [];
    const path = [nodeId];
    let current = treeData[nodeId];
    while (current && current.parentId) {
      path.push(current.parentId);
      current = treeData[current.parentId];
    }
    return path;
  };

  const activePath = getPathToRoot(selectedNodeId);
  const selectedNode = selectedNodeId ? treeData[selectedNodeId] : null;

  const handleCopy = () => {
    const link = `${window.location.origin}/register?ref=${treeData['root'].id}&side=${inviteModalSide?.toLowerCase()}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 relative min-h-[800px]">
      {/* Registration Invitation Modal */}
      <AnimatePresence>
        {inviteModalSide && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/90 backdrop-blur-sm" 
              onClick={() => setInviteModalSide(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-[#121214] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden p-10 flex flex-col items-center text-center space-y-8"
            >
              <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center text-orange-500 mb-2">
                <LinkIcon size={36} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white italic tracking-tight uppercase">Enroll New Partner</h3>
                <p className="text-slate-500 text-sm font-medium">
                  Initialize registration for your <span className="text-orange-500 font-bold">{inviteModalSide} Branch</span>.
                </p>
              </div>

              <div className="w-full bg-black/40 border border-white/5 rounded-2xl p-5 space-y-4">
                 <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest text-left">Referral Access Portal</p>
                 <div className="flex items-center gap-4">
                    <p className="flex-1 text-[10px] font-mono text-slate-400 truncate text-left">
                       {`${window.location.origin}/register?ref=${userProfile?.operatorId || 'ARW-8821'}&side=${inviteModalSide.toLowerCase()}`}
                    </p>
                    <button 
                      onClick={handleCopy}
                      className={`p-3 rounded-xl transition-all active:scale-90 ${
                        copied ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                 </div>
              </div>

              <div className="w-full space-y-3">
                 <button 
                   onClick={handleCopy}
                   className="w-full py-5 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-orange-950/20"
                 >
                   {copied ? 'PROTOCOL COPIED' : 'COPY RECRUITMENT LINK'}
                 </button>
                 <button 
                   onClick={() => setInviteModalSide(null)}
                   className="w-full py-4 text-slate-600 hover:text-white font-black text-[10px] uppercase tracking-widest transition-colors"
                 >
                   Dismiss Authorization
                 </button>
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
                              placeholder="150" 
                              className="w-full bg-[#1e2329] border-none rounded-2xl px-6 py-6 text-white font-black text-3xl pr-32 focus:ring-1 focus:ring-orange-500/20 placeholder:text-slate-800"
                            />
                            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-white font-black text-sm">USDT</span>
                          </div>
                          <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest px-1">Minimum Deposit: 150 USDT</p>
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
                                 <button onClick={() => { navigator.clipboard.writeText(paymentData.pay_address); alert('Address copied'); }} className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
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
          <p className="text-slate-500 mt-2 font-medium">Visualization of your institutional binary growth nodes.</p>
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
            <div className="flex px-2 border-r border-white/10">
              <button onClick={() => setScale(s => Math.min(s + 0.1, 2))} className="p-3 text-slate-400 hover:text-white transition-colors"><ZoomIn size={20} /></button>
              <button onClick={() => setScale(s => Math.max(s - 0.1, 0.5))} className="p-3 text-slate-400 hover:text-white transition-colors"><ZoomOut size={20} /></button>
              <button onClick={() => setScale(1)} className="p-3 text-slate-400 hover:text-white transition-colors"><Maximize size={20} /></button>
            </div>
            <div className="flex items-center gap-3 px-4">
               <div className="flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-orange-500" />
                 <span className="text-[10px] font-black text-slate-500 uppercase">Path Active</span>
               </div>
               {viewRootId !== userProfile?.id && (
                 <button 
                   onClick={() => setViewRootId(userProfile?.id || null)}
                   className="ml-4 px-4 py-2 bg-orange-600/20 text-orange-500 text-[9px] font-black uppercase rounded-lg border border-orange-500/30 hover:bg-orange-600 hover:text-white transition-all"
                 >
                   My Node
                 </button>
               )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-8 items-start relative">
        {/* Main Tree Container */}
        <GlassCard className="flex-1 h-[750px] overflow-auto custom-scrollbar flex items-center justify-center relative bg-[#0a0a0b] cursor-grab active:cursor-grabbing">
          {/* Legend Overlay */}
          <div className="absolute top-8 left-8 space-y-4 z-10">
            <div className="p-5 bg-black/40 backdrop-blur-md border border-white/5 rounded-3xl space-y-4 shadow-2xl">
              <h4 className="text-[10px] font-black text-slate-600 uppercase tracking-widest border-b border-white/5 pb-2">Visualization Key</h4>
              <div className="flex items-center gap-4 text-xs">
                <div className="w-3 h-3 rounded-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]" /> 
                <span className="text-slate-300 font-bold">Primary Path</span>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="w-3 h-3 rounded-full bg-slate-700" /> 
                <span className="text-slate-500">Dormant Node</span>
              </div>
            </div>
          </div>

          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale, opacity: 1 }}
            transition={{ type: 'spring', damping: 20 }}
            className="relative py-20 px-40"
          >
            <div className="flex flex-col items-center">
              {/* Level 0: Root */}
              <Node 
                nodeId="root"
                data={treeData['root']} 
                isSelected={selectedNodeId === 'root'}
                isPath={activePath.includes('root')}
                onSelect={setSelectedNodeId}
              />
              
              {/* Connectors Level 0 to 1 */}
              <div className="flex flex-col items-center relative">
                 <ConnectionLine isActive={activePath.includes('root') && activePath.length > 1} direction="vertical" />
                 <ConnectionLine isActive={activePath.includes('root') && activePath.length > 1} direction="horizontal" width="400px" />
              </div>

              {/* Level 1 */}
              <div className="flex gap-60 mt-0">
                <div className="flex flex-col items-center relative">
                  <ConnectionLine isActive={activePath.includes('l1')} direction="vertical" />
                  <Node 
                    nodeId="l1"
                    data={treeData['l1']} 
                    isSelected={selectedNodeId === 'l1'}
                    isPath={activePath.includes('l1')}
                    onSelect={setSelectedNodeId}
                    onInvite={setInviteModalSide}
                    nodeSide="LEFT"
                  />
                  {/* Connectors Level 1 to 2 Left */}
                  <div className="flex flex-col items-center relative">
                    <ConnectionLine isActive={activePath.includes('l1') && (activePath.includes('l1-l') || activePath.includes('l1-r'))} direction="vertical" />
                    <ConnectionLine isActive={activePath.includes('l1') && (activePath.includes('l1-l') || activePath.includes('l1-r'))} direction="horizontal" width="180px" />
                    <div className="flex gap-24 mt-0">
                      <div className="flex flex-col items-center">
                        <ConnectionLine isActive={activePath.includes('l1-l')} direction="vertical" />
                        <Node nodeId="l1-l" data={treeData['l1-l']} isSelected={selectedNodeId === 'l1-l'} isPath={activePath.includes('l1-l')} onSelect={setSelectedNodeId} />
                        {/* Vacant slots below l1-l */}
                        <ConnectionLine isActive={false} direction="vertical" />
                        <ConnectionLine isActive={false} direction="horizontal" width="100px" />
                        <div className="flex gap-10">
                           <Node nodeId="v-l1-l-l" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="LEFT" />
                           <Node nodeId="v-l1-l-r" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="RIGHT" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <ConnectionLine isActive={activePath.includes('l1-r')} direction="vertical" />
                        <Node nodeId="l1-r" data={treeData['l1-r']} isSelected={selectedNodeId === 'l1-r'} isPath={activePath.includes('l1-r')} onSelect={setSelectedNodeId} />
                        {/* Vacant slots below l1-r */}
                        <ConnectionLine isActive={false} direction="vertical" />
                        <ConnectionLine isActive={false} direction="horizontal" width="100px" />
                        <div className="flex gap-10">
                           <Node nodeId="v-l1-r-l" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="LEFT" />
                           <Node nodeId="v-l1-r-r" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="RIGHT" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center relative">
                  <ConnectionLine isActive={activePath.includes('r1')} direction="vertical" />
                  <Node 
                    nodeId="r1"
                    data={treeData['r1']} 
                    isSelected={selectedNodeId === 'r1'}
                    isPath={activePath.includes('r1')}
                    onSelect={setSelectedNodeId}
                    onInvite={setInviteModalSide}
                    nodeSide="RIGHT"
                  />
                  {/* Connectors Level 1 to 2 Right */}
                  <div className="flex flex-col items-center relative">
                    <ConnectionLine isActive={activePath.includes('r1') && (activePath.includes('r1-l') || activePath.includes('r1-r'))} direction="vertical" />
                    <ConnectionLine isActive={activePath.includes('r1') && (activePath.includes('r1-l') || activePath.includes('r1-r'))} direction="horizontal" width="180px" />
                    <div className="flex gap-24 mt-0">
                      <div className="flex flex-col items-center">
                        <ConnectionLine isActive={activePath.includes('r1-l')} direction="vertical" />
                        <Node nodeId="r1-l" data={treeData['r1-l']} isSelected={selectedNodeId === 'r1-l'} isPath={activePath.includes('r1-l')} onSelect={setSelectedNodeId} />
                        {/* Vacant slots below r1-l */}
                        <ConnectionLine isActive={false} direction="vertical" />
                        <ConnectionLine isActive={false} direction="horizontal" width="100px" />
                        <div className="flex gap-10">
                           <Node nodeId="v-r1-l-l" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="LEFT" />
                           <Node nodeId="v-r1-l-r" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="RIGHT" />
                        </div>
                      </div>
                      <div className="flex flex-col items-center">
                        <ConnectionLine isActive={false} direction="vertical" />
                        <Node nodeId="r1-r" data={null} isSelected={false} isPath={false} onSelect={() => {}} onInvite={setInviteModalSide} nodeSide="RIGHT" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </GlassCard>

        {/* Profile Sidebar (Chain Details) */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ x: 100, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 100, opacity: 0 }}
              className="w-96 shrink-0 h-[750px] bg-[#0d0d0e] border border-white/5 rounded-[40px] shadow-2xl p-8 flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <div className="px-4 py-1.5 bg-orange-600 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-orange-950/20">
                  Node Analysis
                </div>
                <button 
                  onClick={() => setSelectedNodeId(null)}
                  className="p-2 text-slate-500 hover:text-white transition-colors"
                >
                  <X size={20} />
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
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Left Volume</p>
                    <p className="text-lg font-black text-white mt-1">{selectedNode.leftVolume} <span className="text-[10px] opacity-50">USDT</span></p>
                  </div>
                  <div className="p-5 bg-white/5 rounded-3xl border border-white/5">
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Right Volume</p>
                    <p className="text-lg font-black text-white mt-1">{selectedNode.rightVolume} <span className="text-[10px] opacity-50">USDT</span></p>
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    { label: 'Network Registry ID', val: selectedNode.id, icon: Globe },
                    { label: 'Synchronization Date', val: selectedNode.joinDate, icon: Zap },
                    { label: 'Team Node Count', val: `${selectedNode.totalTeam} Partners`, icon: Award },
                    { label: 'Placement Protocol', val: `${selectedNode.side} BRANCH`, icon: Share2 }
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
              </div>

              <div className="pt-8 space-y-3">
                 <button 
                   onClick={() => {
                     if (selectedNode.uid) {
                       setViewRootId(selectedNode.uid);
                       setSelectedNodeId(null);
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
          )}
        </AnimatePresence>
      </div>

      <div className="bg-[#111112] border border-white/5 p-10 rounded-[40px] flex flex-col md:flex-row items-center gap-10">
        <div className="p-5 bg-orange-500/10 rounded-3xl text-orange-500 shadow-inner">
           <TrendingUp size={32} />
        </div>
        <div className="flex-1 text-center md:text-left">
          <h4 className="text-lg font-black uppercase tracking-widest text-slate-200">Binary Placement Protocol</h4>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            Selecting an active node activates the <b>Primary Connection Chain</b>. Clicking an empty node initializes the <b>Registration Invite Protocol</b>, providing side-specific placement links for new organizational expansion.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BinaryTree;
