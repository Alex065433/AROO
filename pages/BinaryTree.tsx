
import React, { useState, useEffect, useMemo, useRef } from 'react';
import GlassCard from '../components/GlassCard';
import { 
  UserPlus, 
  X, ShieldCheck, Globe, TrendingUp, 
  Zap, ChevronRight, Share2, Award, Copy, Check,
  ArrowUpRight, ArrowDownLeft,
  History, RefreshCw,
  ArrowLeft, AlertCircle,
  CheckCircle2, Users, Search, ArrowUpCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { supabaseService } from '../services/supabaseService';
import { copyToClipboard } from '../src/lib/clipboard';
import { apiFetch } from '../src/lib/api';
import { User as UserProfile } from '../types';
import { LiveRatesTicker } from '../components/LiveRatesTicker';
import { RANK_NAMES } from '../constants';

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [treeData, setTreeData] = useState<Record<string, NodeData>>({});
  const [isTreeLoading, setIsTreeLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'exchange' | 'package' | 'ledger' | null>(null);
  const [totalReferrals, setTotalReferrals] = useState(0);
  const [notification, setNotification] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showRankBreakdown, setShowRankBreakdown] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    const fetchReferrals = async () => {
      if (!userProfile?.id) return;
      const referrals = await supabaseService.getReferrals(userProfile.id);
      setTotalReferrals(referrals.length);
    };
    fetchReferrals();
  }, [userProfile]);

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

  const [fullRankCounts, setFullRankCounts] = useState<{ left: Record<string, number>; right: Record<string, number> }>({
    left: {},
    right: {}
  });

  const handleInvite = (parentId: string, side: 'LEFT' | 'RIGHT', parentOperatorId?: string) => {
    const sponsorId = parentOperatorId || userProfile?.operator_id || 'ARW-XXXX';
    
    const inviteUrl = `${window.location.origin}${window.location.pathname}#/register?ref=${sponsorId}&parent=${parentOperatorId || parentId}&side=${side.toLowerCase()}`;
    
    setInviteModal({
      parentId: parentOperatorId || parentId,
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

  const rankCounts = useMemo(() => {
    if (fullRankCounts.left && Object.keys(fullRankCounts.left).length > 0) {
      return fullRankCounts;
    }

    const left: Record<string, number> = {};
    const right: Record<string, number> = {};
    
    RANK_NAMES.forEach(name => {
      left[name] = 0;
      right[name] = 0;
    });

    (Object.entries(treeData) as [string, NodeData][]).forEach(([path, node]) => {
      if (path.startsWith('root.left')) {
        if (node.rank && left[node.rank] !== undefined) {
          left[node.rank]++;
        }
      } else if (path.startsWith('root.right')) {
        if (node.rank && right[node.rank] !== undefined) {
          right[node.rank]++;
        }
      }
    });

    return { left, right };
  }, [treeData, fullRankCounts]);

  useEffect(() => {
    const unsubscribe = supabaseService.onAuthChange(async (user) => {
      if (user) {
        try {
          const profile = await supabaseService.getUserProfile(user.id || user.uid, 'id, name, rank, team_size, parent_id, role, operator_id, email, left_count, right_count') as any;
          console.log('BinaryTree userProfile:', profile);
          if (profile) {
            setUserProfile(profile);
            
            let rootId = user.id || user.uid;
            if (profile.role === 'admin') {
              const absRoot = await supabaseService.getAbsoluteRoot() as any;
              if (absRoot) rootId = absRoot.id;
            }
            
            setViewRootId(rootId);
          }
          // Fetch real transactions
          const payments = await supabaseService.getTransactions(user.id || user.uid);
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

  const refreshTree = async () => {
    if (viewRootId && !isTreeLoading) {
      setIsTreeLoading(true);
      try {
        // Fetch the updated tree data
        const dynamicTree = await supabaseService.getBinaryTree(viewRootId);
        setTreeData(dynamicTree);
        
        // Refetch profile to update leg counts
        const updatedProfile = await supabaseService.getUserProfile(userProfile.id, 'id, name, rank, team_size, parent_id, role, operator_id, email, left_count, right_count');
        setUserProfile(updatedProfile);
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
      let isMounted = true;
      const fetchTree = async () => {
        if (!isMounted) return;
        setIsTreeLoading(true);
        try {
          const dynamicTree = await supabaseService.getBinaryTree(viewRootId);
          if (isMounted) {
            setTreeData(dynamicTree);
          }
          
          // Fetch full rank breakdown
          const breakdown = await supabaseService.getRankBreakdown(viewRootId);
          if (isMounted && breakdown) {
            setFullRankCounts(breakdown);
          }
        } catch (err) {
          console.error('Error fetching tree:', err);
        } finally {
          if (isMounted) {
            setIsTreeLoading(false);
          }
        }
      };
      
      fetchTree();
      
      // Refresh tree every 30 seconds instead of 10 to reduce buffering/glitching
      const interval = setInterval(fetchTree, 30000);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
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
      const data = await apiFetch('create-payment', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(depositAmount),
          user_id: userProfile?.id,
          currency: 'usdtbsc'
        })
      });
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
    if (!viewRootId) return;
    const currentProfile = await supabaseService.getUserProfile(viewRootId) as any;
    if (currentProfile && currentProfile.parent_id) {
      setViewRootId(currentProfile.parent_id);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const user = await supabaseService.findUserByOperatorId(searchQuery.trim());
      if (user) {
        setViewRootId(user.id);
        setSearchQuery('');
        toast.success(`Found user: ${user.name}`);
      } else {
        toast.error('User not found in network');
      }
    } catch (err) {
      console.error('Search error:', err);
      toast.error('Error searching for user');
    } finally {
      setIsSearching(false);
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
      
      <div className="p-3 md:p-8 space-y-4 md:space-y-6">
        {/* Header Controls */}
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight italic">My Tree</h2>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center overflow-hidden">
               <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile?.name}`} alt="User" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 md:gap-4">
            <button 
              onClick={handleGoUp}
              className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-2.5 bg-[#c0841a] text-black font-black text-[10px] md:text-xs uppercase tracking-widest rounded-full transition-all hover:bg-[#d49a2d] flex items-center justify-center gap-2"
            >
              Back &lt;&lt;
            </button>
            <button 
              onClick={() => setActiveTab('ledger')}
              className="flex-1 md:flex-none px-4 md:px-6 py-2 md:py-2.5 bg-[#c0841a] text-black font-black text-[10px] md:text-xs uppercase tracking-widest rounded-full transition-all hover:bg-[#d49a2d]"
            >
              Downline List
            </button>
          </div>

          <div className="relative group">
            <input 
              type="text" 
              placeholder="Username or Operator ID"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 md:px-6 py-3 md:py-4 text-white font-bold text-xs md:text-sm focus:outline-none focus:border-[#c0841a]/50 transition-all"
            />
            <button 
              onClick={handleSearch}
              disabled={isSearching}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 md:p-3 bg-[#c0841a] rounded-lg text-black hover:bg-[#d49a2d] transition-all disabled:opacity-50"
            >
              {isSearching ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <div className="space-y-1 md:space-y-2 relative">
              <p className="text-[9px] md:text-xs font-bold text-white uppercase tracking-widest">Left Affiliates:</p>
              <p className="text-sm md:text-lg font-black text-white italic">{userProfile?.team_size?.left || 0} | {userProfile?.left_count || 0}</p>
              <button 
                onClick={() => setShowRankBreakdown(showRankBreakdown === 'left' ? null : 'left')}
                className="inline-block px-3 md:px-4 py-1 md:py-1.5 bg-gradient-to-r from-[#c0841a] to-[#d49a2d] rounded-full transition-transform active:scale-95"
              >
                <span className="text-[7px] md:text-[8px] font-black text-black uppercase tracking-widest">TOTAL OF ALL RANKS</span>
              </button>

              <AnimatePresence>
                {showRankBreakdown === 'left' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute left-0 top-full mt-2 w-64 bg-[#f2a93b] rounded-2xl p-4 z-[200] shadow-2xl"
                  >
                    <div className="space-y-1">
                      {RANK_NAMES.map((name) => (
                        <div key={name} className="flex justify-between items-center bg-white/20 rounded-lg px-3 py-1.5">
                          <span className="text-[10px] font-black text-black uppercase">{name}</span>
                          <span className="text-sm font-black text-black">{rankCounts.left[name]}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="space-y-1 md:space-y-2 text-right relative">
              <p className="text-[9px] md:text-xs font-bold text-white uppercase tracking-widest">Right Affiliates:</p>
              <p className="text-sm md:text-lg font-black text-white italic">{userProfile?.team_size?.right || 0} | {userProfile?.right_count || 0}</p>
              <button 
                onClick={() => setShowRankBreakdown(showRankBreakdown === 'right' ? null : 'right')}
                className="inline-block px-3 md:px-4 py-1 md:py-1.5 bg-gradient-to-r from-[#c0841a] to-[#d49a2d] rounded-full transition-transform active:scale-95"
              >
                <span className="text-[7px] md:text-[8px] font-black text-black uppercase tracking-widest">TOTAL OF ALL RANKS</span>
              </button>

              <AnimatePresence>
                {showRankBreakdown === 'right' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-full mt-2 w-64 bg-[#f2a93b] rounded-2xl p-4 z-[200] shadow-2xl text-left"
                  >
                    <div className="space-y-1">
                      {RANK_NAMES.map((name) => (
                        <div key={name} className="flex justify-between items-center bg-white/20 rounded-lg px-3 py-1.5">
                          <span className="text-[10px] font-black text-black uppercase">{name}</span>
                          <span className="text-sm font-black text-black">{rankCounts.right[name]}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Main Tree Container */}
        <div className="w-full h-[700px] md:h-[900px] relative">
          {isTreeLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b] rounded-[40px] border border-white/5">
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="text-[#c0841a] animate-spin" size={48} />
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

      {/* Downline List Modal */}
      <AnimatePresence>
        {activeTab === 'ledger' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveTab(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-4xl bg-[#121214] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-8 md:p-10 border-b border-white/5">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#c0841a]/20 rounded-2xl flex items-center justify-center text-[#c0841a]">
                      <Users size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">Downline Ledger</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Network Synchronization Active</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab(null)}
                    className="p-2 text-slate-500 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
                <div className="space-y-4">
                  {(Object.values(treeData) as NodeData[]).filter(n => n.status !== 'Vacant').length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                          <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="px-6 py-4">Member</th>
                            <th className="px-6 py-4">ID</th>
                            <th className="px-6 py-4">Rank</th>
                            <th className="px-6 py-4">Business (L/R)</th>
                            <th className="px-6 py-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(Object.values(treeData) as NodeData[])
                            .filter(n => n.status !== 'Vacant')
                            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                            .map((member, idx) => (
                              <tr key={idx} className="bg-white/[0.02] hover:bg-white/[0.05] transition-colors group">
                                <td className="px-6 py-4 rounded-l-2xl border-l border-t border-b border-white/5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden">
                                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${member.name}`} alt="User" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="text-sm font-bold text-white italic">{member.name}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 border-t border-b border-white/5">
                                  <span className="text-xs font-mono text-slate-400">{member.id}</span>
                                </td>
                                <td className="px-6 py-4 border-t border-b border-white/5">
                                  <span className="text-[10px] font-black text-[#c0841a] uppercase tracking-widest">{member.rank}</span>
                                </td>
                                <td className="px-6 py-4 border-t border-b border-white/5">
                                  <div className="text-[10px] font-bold text-slate-400">
                                    <span className="text-white">{member.leftBusiness}</span> / <span className="text-white">{member.rightBusiness}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 rounded-r-2xl border-r border-t border-b border-white/5 text-right">
                                  <button 
                                    onClick={() => {
                                      if (member.uid) {
                                        setViewRootId(member.uid);
                                        setActiveTab(null);
                                      }
                                    }}
                                    className="p-2 bg-white/5 hover:bg-[#c0841a] hover:text-black rounded-lg transition-all"
                                  >
                                    <ArrowUpRight size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-20 bg-white/[0.02] rounded-[40px] border border-dashed border-white/5">
                      <Users className="mx-auto text-slate-800 mb-4" size={48} />
                      <p className="text-sm font-black text-slate-500 uppercase tracking-widest">No Downline Members Found</p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-8 border-t border-white/5 bg-black/20 flex justify-between items-center">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                  Total Synchronized Nodes: {(Object.values(treeData) as NodeData[]).filter(n => n.status !== 'Vacant').length}
                </p>
                <button 
                  onClick={() => {
                    // Simple CSV export logic
                    const headers = ['Name', 'ID', 'Rank', 'Left Business', 'Right Business', 'Join Date'];
                    const rows = (Object.values(treeData) as NodeData[])
                      .filter(n => n.status !== 'Vacant')
                      .map(m => [m.name, m.id, m.rank, m.leftBusiness, m.rightBusiness, m.joinDate]);
                    
                    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", `downline_ledger_${new Date().toISOString().split('T')[0]}.csv`);
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    toast.success('Ledger exported successfully');
                  }}
                  className="px-6 py-3 bg-[#c0841a] text-black font-black text-[10px] uppercase tracking-widest rounded-2xl hover:bg-[#d49a2d] transition-all flex items-center gap-2"
                >
                  Download CSV <ChevronRight size={14} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <AnimatePresence>
        {inviteModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInviteModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-[#121214] border border-white/10 rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 md:p-10">
                <div className="flex justify-between items-center mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-500/20 rounded-2xl flex items-center justify-center text-orange-500">
                      <UserPlus size={24} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">Invite Partner</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Placement: {inviteModal.side} Branch</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setInviteModal(null)}
                    className="p-2 text-slate-500 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Referral Protocol Link</p>
                    <div className="flex items-center gap-3 bg-black/40 border border-white/5 rounded-2xl p-4">
                      <div className="flex-1 overflow-hidden">
                        <p className="text-xs font-mono text-slate-400 truncate">{inviteModal.url}</p>
                      </div>
                      <button 
                        onClick={() => {
                          copyToClipboard(inviteModal.url);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                          toast.success('Link copied to clipboard');
                        }}
                        className="p-2 bg-orange-600 rounded-xl text-white hover:bg-orange-500 transition-all"
                      >
                        {copied ? <Check size={18} /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => {
                        window.open(inviteModal.url, '_blank');
                        setInviteModal(null);
                      }}
                      className="w-full py-5 bg-orange-600 hover:bg-orange-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-orange-950/20 flex items-center justify-center gap-3 group"
                    >
                      Open Registration <ArrowUpRight size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (navigator.share) {
                          navigator.share({
                            title: 'Join Arowin Trading',
                            text: 'Join my network on Arowin Trading and start earning!',
                            url: inviteModal.url
                          }).catch(console.error);
                        } else {
                          copyToClipboard(inviteModal.url);
                          toast.success('Link copied to clipboard');
                        }
                      }}
                      className="w-full py-5 bg-white/5 hover:bg-white/10 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl transition-all border border-white/5 flex items-center justify-center gap-3"
                    >
                      Share Protocol <Share2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="bg-orange-500/5 p-6 border-t border-white/5">
                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest text-center leading-relaxed">
                  This link automatically configures the sponsor ID and binary placement side for the new node enrollment.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default BinaryTree;
