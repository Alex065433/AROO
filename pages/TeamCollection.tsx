import React, { useState, useEffect, useMemo } from 'react';
import { 
  Cpu, Zap, RefreshCw, CheckCircle2, 
  AlertCircle, ArrowUpRight, ShieldCheck,
  Globe, Award, UserPlus, Share2, Search,
  ArrowLeft, History, User, Users, Send,
  Wallet2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabaseService } from '../services/supabaseService';
import { toast } from 'sonner';
import GlassCard from '../components/GlassCard';

interface TeamNode {
  id: string;
  node_id: string;
  package_name: string;
  package_amount: number;
  daily_yield: number;
  balance: number;
  last_collection: string;
  status: 'active' | 'inactive';
  created_at: string;
}

const TeamCollection: React.FC = () => {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [nodes, setNodes] = useState<TeamNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollecting, setIsCollecting] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [transactionPassword, setTransactionPassword] = useState('');

  useEffect(() => {
    const unsubscribe = supabaseService.onAuthChange(async (user) => {
      if (user) {
        const profile = await supabaseService.getUserProfile(user.id || user.uid) as any;
        if (profile) {
          setUserProfile(profile);
          fetchNodes(profile.id);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchNodes = async (userId: string) => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getTeamCollection(userId);
      setNodes(data);
    } catch (error) {
      console.error('Error fetching team nodes:', error);
      toast.error('Failed to load team nodes');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleNodeSelection = (nodeId: string) => {
    setSelectedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedNodes.size === nodes.length && nodes.length > 0) {
      setSelectedNodes(new Set());
    } else {
      setSelectedNodes(new Set(nodes.map(n => n.id)));
    }
  };

  const handleCollect = async () => {
    if (selectedNodes.size === 0 || !userProfile) return;
    if (!transactionPassword) {
      toast.error('Please enter your transaction password');
      return;
    }
    
    setIsCollecting(true);
    try {
      const isPasswordValid = await supabaseService.verifyWithdrawalPassword(userProfile.id, transactionPassword);
      if (!isPasswordValid) {
        toast.error('Incorrect withdrawal password');
        setIsCollecting(false);
        return;
      }

      const nodeIds = Array.from(selectedNodes) as string[];
      const totalCollected = await supabaseService.collectFromNodes(userProfile.id, nodeIds);
      
      if (totalCollected > 0) {
        toast.success(`Successfully collected ${totalCollected.toFixed(2)} USDT`);
        setSelectedNodes(new Set());
        setTransactionPassword('');
        fetchNodes(userProfile.id);
      } else {
        toast.info('No yield available to collect from selected nodes');
      }
    } catch (error) {
      console.error('Error collecting yield:', error);
      toast.error('Failed to collect yield');
    } finally {
      setIsCollecting(false);
    }
  };

  const selectedAccrued = nodes
    .filter(n => selectedNodes.has(n.id))
    .reduce((sum, node) => sum + (node.balance || 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-8 space-y-12 animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex justify-between items-start max-w-7xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-5xl font-serif font-black uppercase tracking-tight text-white">
            TEAM COLLECTION <span className="text-4xl">USDT</span>
          </h1>
          <p className="text-slate-500 font-medium text-lg">
            Gather and consolidate USDT from your organizational hierarchy nodes.
          </p>
        </div>
        <button 
          onClick={() => userProfile && fetchNodes(userProfile.id)}
          className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl transition-all border border-white/5 group"
        >
          <RefreshCw size={24} className={`text-slate-400 group-hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Main Collection Card */}
        <div className="bg-[#111112] border border-white/5 rounded-[40px] p-12 shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-96 h-96 bg-orange-600/5 blur-[120px] -mr-48 -mt-48 rounded-full" />
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
            <div className="space-y-4">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">TOTAL AVAILABLE IN SELECTED NODES</p>
              <h2 className="text-6xl font-black text-orange-500 italic tracking-tighter">
                {selectedAccrued.toFixed(2)} <span className="text-4xl ml-2">USDT</span>
              </h2>
            </div>

            <div className="w-full md:w-64 space-y-3">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] text-right">TARGET AMOUNT</p>
              <div className="bg-[#0b0e11] border border-white/5 rounded-2xl p-6 text-center">
                <span className="text-2xl font-black text-white">{selectedAccrued.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col md:flex-row gap-4 items-center relative z-10">
            <div className="flex-1 w-full relative">
              <input 
                type="password"
                value={transactionPassword}
                onChange={(e) => setTransactionPassword(e.target.value)}
                placeholder="Enter your transaction password"
                className="w-full bg-[#0b0e11] border border-white/5 rounded-2xl px-8 py-6 text-white font-medium focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-700"
              />
            </div>
            <button 
              onClick={handleCollect}
              disabled={selectedNodes.size === 0 || isCollecting}
              className="w-full md:w-auto px-12 py-6 bg-orange-600 hover:bg-orange-500 text-white font-black text-sm uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-orange-950/20 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isCollecting ? <RefreshCw className="animate-spin" size={20} /> : <Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />}
              SUBMIT
            </button>
          </div>
        </div>

        {/* Team List Section */}
        <div className="bg-[#111112] border border-white/5 rounded-[40px] overflow-hidden shadow-2xl">
          <div className="bg-orange-600 px-10 py-6 flex justify-between items-center">
            <h3 className="text-xs font-black text-white uppercase tracking-[0.3em]">SELECT TEAM LIST</h3>
            <button 
              onClick={selectAll}
              className="flex items-center gap-3 text-white group"
            >
              <span className="text-[10px] font-black uppercase tracking-widest">SELECT ALL</span>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedNodes.size === nodes.length && nodes.length > 0 ? 'bg-white border-white' : 'border-white/50 group-hover:border-white'}`}>
                {selectedNodes.size === nodes.length && nodes.length > 0 && <CheckCircle2 size={14} className="text-orange-600" />}
              </div>
            </button>
          </div>

          <div className="p-12 min-h-[400px] flex flex-col items-center justify-center text-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-4">
                <RefreshCw className="text-orange-500 animate-spin" size={48} />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">SYNCHRONIZING NODES...</p>
              </div>
            ) : nodes.length === 0 ? (
              <div className="space-y-6">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-slate-700 mx-auto border border-white/5">
                  <AlertCircle size={48} />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">NO ACTIVE NODES FOUND. ACTIVATE A PACKAGE TO GENERATE NODES.</p>
                </div>
              </div>
            ) : (
              <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {nodes.map((node) => (
                  <motion.div
                    key={node.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ y: -5 }}
                    onClick={() => toggleNodeSelection(node.id)}
                    className={`group relative p-8 rounded-[32px] border transition-all cursor-pointer text-left ${
                      selectedNodes.has(node.id) 
                        ? 'bg-orange-600/10 border-orange-500/50' 
                        : 'bg-[#0b0e11] border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-8">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                        selectedNodes.has(node.id) ? 'bg-orange-600 text-white' : 'bg-white/5 text-slate-500 group-hover:text-orange-500'
                      }`}>
                        <Cpu size={28} />
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">NODE ID</p>
                        <p className="text-xs font-mono text-white tracking-tighter">{node.node_id}</p>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <h4 className="text-xl font-black text-white italic uppercase tracking-tight">{node.package_name}</h4>
                        <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mt-1">
                          VALUE: {node.package_amount} USDT
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-6 pt-6 border-t border-white/5">
                        <div>
                          <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">DAILY YIELD</p>
                          <p className="text-base font-black text-white">{node.daily_yield.toFixed(2)} <span className="text-[10px] opacity-50">USDT</span></p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-1">ACCRUED</p>
                          <p className={`text-base font-black ${node.balance > 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {node.balance.toFixed(2)} <span className="text-[10px] opacity-50">USDT</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Selection Indicator */}
                    <div className={`absolute top-8 right-8 w-6 h-6 rounded-lg border-2 transition-all flex items-center justify-center ${
                      selectedNodes.has(node.id) ? 'bg-orange-600 border-orange-600' : 'border-white/10'
                    }`}>
                      {selectedNodes.has(node.id) && <CheckCircle2 size={14} className="text-white" />}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,900;1,900&display=swap');
        .font-serif {
          font-family: 'Playfair Display', serif;
        }
      `}</style>
    </div>
  );
};

export default TeamCollection;
