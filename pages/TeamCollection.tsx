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
import { useUser } from '../src/context/UserContext';
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
  generation?: number;
}

const TeamCollection: React.FC = () => {
  const { profile: userProfile, loading: isProfileLoading, refreshProfile } = useUser();
  const [nodes, setNodes] = useState<TeamNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollecting, setIsCollecting] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [transactionPassword, setTransactionPassword] = useState('');
  const [amountToCollect, setAmountToCollect] = useState('0.00');

  useEffect(() => {
    if (userProfile?.id) {
      fetchNodes(userProfile.id);
    }
  }, [userProfile?.id]);

  const fetchNodes = async (userId: string) => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getTeamCollection(userId);
      setNodes(data);
    } catch (error) {
      console.error('Error fetching team nodes:', error);
      toast.error('Failed to load team nodes');
      setNodes([]);
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
        toast.error('Incorrect transaction password');
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
        await refreshProfile();
      } else {
        toast.info('No balance available to collect from selected nodes');
      }
    } catch (error) {
      console.error('Error collecting:', error);
      toast.error('Failed to collect');
    } finally {
      setIsCollecting(false);
    }
  };

  const selectedAccrued = nodes
    .filter(n => selectedNodes.has(n.id))
    .reduce((sum, node) => sum + (node.balance || 0), 0);

  useEffect(() => {
    setAmountToCollect(selectedAccrued.toFixed(2));
  }, [selectedAccrued]);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-4 md:p-8 space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Page Header */}
        <div className="bg-[#f08a1d] px-4 py-2 rounded-sm mb-6">
          <h1 className="text-xl font-bold text-black uppercase tracking-tight">
            Team Collection USDT
          </h1>
        </div>

        {/* Master Wallet Balance Section */}
        <div className="bg-[#111112] border border-white/10 rounded-lg p-6 space-y-6">
          <div className="flex justify-between items-center">
            <p className="text-slate-400 font-medium">Total Master Wallet Balance</p>
            <p className="text-xl font-bold text-[#f08a1d]">
              {(userProfile?.wallet_balance || 0).toFixed(2)} USDT
            </p>
          </div>

          <div className="space-y-4">
            <input 
              type="text"
              readOnly
              value={amountToCollect}
              className="w-full bg-[#0b0e11] border border-white/20 rounded-md px-4 py-3 text-white font-mono focus:border-[#f08a1d] outline-none transition-all"
            />
            
            <div className="flex gap-4">
              <input 
                type="password"
                value={transactionPassword}
                onChange={(e) => setTransactionPassword(e.target.value)}
                placeholder="Enter your transaction password"
                className="flex-1 bg-[#0b0e11] border border-white/20 rounded-md px-4 py-3 text-white focus:border-[#f08a1d] outline-none transition-all placeholder:text-slate-600"
              />
              <button 
                onClick={handleCollect}
                disabled={selectedNodes.size === 0 || isCollecting}
                className="bg-[#f08a1d] hover:bg-[#d97a1a] text-black font-bold px-8 py-3 rounded-md transition-all disabled:opacity-50 uppercase"
              >
                {isCollecting ? '...' : 'SUBMIT'}
              </button>
            </div>
          </div>
        </div>

        {/* Team List Section */}
        <div className="bg-[#111112] border border-white/10 rounded-lg overflow-hidden">
          <div className="bg-[#f08a1d] px-4 py-2">
            <h3 className="text-sm font-bold text-black uppercase">Select Team List</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase text-slate-400 font-black tracking-wider">
                  <th className="px-4 py-4 text-center">Select</th>
                  <th className="px-4 py-4">S.No</th>
                  <th className="px-4 py-4">Username</th>
                  <th className="px-4 py-4">Name</th>
                  <th className="px-4 py-4">Master Wallet (USDT)</th>
                  <th className="px-4 py-4 text-center">E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center">
                      <RefreshCw className="animate-spin mx-auto text-[#f08a1d] mb-4" size={32} />
                      <p className="text-xs text-slate-500 uppercase font-bold">Loading Team Data...</p>
                    </td>
                  </tr>
                ) : nodes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-20 text-center">
                      <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">No team members found</p>
                    </td>
                  </tr>
                ) : (
                  nodes.map((node, index) => (
                    <tr 
                      key={node.id}
                      className={`hover:bg-white/5 transition-colors cursor-pointer ${selectedNodes.has(node.id) ? 'bg-[#f08a1d]/5' : ''}`}
                      onClick={() => toggleNodeSelection(node.id)}
                    >
                      <td className="px-4 py-4 text-center">
                        <div className={`w-5 h-5 mx-auto rounded border flex items-center justify-center transition-all ${
                          selectedNodes.has(node.id) ? 'bg-[#f08a1d] border-[#f08a1d]' : 'border-white/20'
                        }`}>
                          {selectedNodes.has(node.id) && <CheckCircle2 size={12} className="text-black" />}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-mono text-slate-400">{index + 1}</td>
                      <td className="px-4 py-4 text-xs font-bold text-white uppercase tracking-tight">{node.node_id}</td>
                      <td className="px-4 py-4 text-xs font-bold text-white uppercase tracking-tight">{userProfile?.name || 'MEMBER'}</td>
                      <td className="px-4 py-4 text-xs font-bold text-[#f08a1d]">{node.balance.toFixed(2)} USDT</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-[10px] font-black px-2 py-1 rounded ${node.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {node.status === 'active' ? 'N' : 'I'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex justify-between items-center px-2">
          <button 
            onClick={selectAll}
            className="text-[10px] font-black text-[#f08a1d] uppercase tracking-widest hover:underline"
          >
            {selectedNodes.size === nodes.length && nodes.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
            Showing {nodes.length} members
          </p>
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
