import React, { useState, useEffect } from 'react';
import { RefreshCw, LayoutGrid, Coins, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabaseService } from '../services/supabaseService';
import { useUser } from '../src/context/UserContext';
import { toast } from 'sonner';

interface TeamNode {
  id: string;
  node_id: string;
  name: string;
  package_name: string;
  package_amount: number;
  status: 'active' | 'inactive';
  balance: number;
  created_at: string;
}

const TeamCollection: React.FC = () => {
  const { profile: userProfile, refreshProfile } = useUser();
  const [nodes, setNodes] = useState<TeamNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollecting, setIsCollecting] = useState(false);

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
      toast.error('Failed to load node collection');
      setNodes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCollectAll = async () => {
    if (!userProfile?.id || nodes.length === 0) return;
    
    setIsCollecting(true);
    try {
      const nodeIds = nodes.map(n => n.node_id);
      const collectedAmount = await supabaseService.collectFromNodes(userProfile.id, nodeIds);
      
      if (collectedAmount > 0) {
        toast.success(`Successfully collected $${collectedAmount.toFixed(2)} from all nodes!`);
        await Promise.all([
          fetchNodes(userProfile.id),
          refreshProfile()
        ]);
      } else {
        toast.info('No pending yield to collect at this time.');
      }
    } catch (error) {
      console.error('Error collecting from nodes:', error);
      toast.error('Failed to collect from nodes');
    } finally {
      setIsCollecting(false);
    }
  };

  const totalPending = nodes.reduce((acc, node) => acc + (node.balance || 0), 0);

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-white p-4 md:p-8 space-y-6">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#f08a1d]/20 rounded-lg">
                <LayoutGrid className="text-[#f08a1d]" size={24} />
              </div>
              <h1 className="text-3xl font-black uppercase tracking-tight">
                Node Collection
              </h1>
            </div>
            <p className="text-slate-500 text-sm font-medium max-w-xl">
              Manage your generated IDs and collect accumulated yields from your multi-node package structure.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-[#111112] border border-white/5 rounded-2xl px-6 py-3 flex flex-col items-end">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Pending</span>
              <span className="text-xl font-black text-[#f08a1d]">${totalPending.toFixed(2)}</span>
            </div>
            <button 
              onClick={handleCollectAll}
              disabled={isCollecting || nodes.length === 0}
              className="bg-[#f08a1d] hover:bg-[#d9791a] disabled:opacity-50 disabled:cursor-not-allowed text-black font-black uppercase tracking-widest px-8 py-4 rounded-2xl transition-all shadow-xl shadow-orange-950/20 flex items-center gap-2 active:scale-95"
            >
              {isCollecting ? <RefreshCw className="animate-spin" size={18} /> : <Coins size={18} />}
              Collect All
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111112] border border-white/5 rounded-3xl p-6 space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Nodes</p>
            <p className="text-2xl font-black text-white">{nodes.length}</p>
          </div>
          <div className="bg-[#111112] border border-white/5 rounded-3xl p-6 space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Package Tier</p>
            <p className="text-2xl font-black text-white">{userProfile?.active_package ? `$${userProfile.active_package}` : 'N/A'}</p>
          </div>
          <div className="bg-[#111112] border border-white/5 rounded-3xl p-6 space-y-1">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Collection Status</p>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="text-emerald-500" size={18} />
              <p className="text-sm font-bold text-emerald-500 uppercase tracking-widest">Operational</p>
            </div>
          </div>
        </div>

        {/* Node List Section */}
        <div className="bg-[#111112] border border-white/5 rounded-[40px] overflow-hidden">
          <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-black text-white uppercase tracking-widest">Node Inventory</h3>
            <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
              <AlertCircle size={12} />
              Yields are calculated in real-time
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] uppercase text-slate-500 font-black tracking-[0.2em] bg-white/[0.02]">
                  <th className="px-8 py-5">Node ID</th>
                  <th className="px-8 py-5">Node Alias</th>
                  <th className="px-8 py-5">Package</th>
                  <th className="px-8 py-5">Pending Yield</th>
                  <th className="px-8 py-5">Activation</th>
                  <th className="px-8 py-5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-24 text-center">
                      <RefreshCw className="animate-spin mx-auto text-[#f08a1d] mb-4" size={32} />
                      <p className="text-xs text-slate-500 uppercase font-black tracking-widest">Syncing Node Data...</p>
                    </td>
                  </tr>
                ) : nodes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-8 py-24 text-center">
                      <p className="text-xs text-slate-500 uppercase font-black tracking-widest">No nodes found in your collection</p>
                      <p className="text-[10px] text-slate-600 uppercase tracking-widest mt-2">Activate a package to generate nodes</p>
                    </td>
                  </tr>
                ) : (
                  nodes.map((node) => (
                    <tr 
                      key={node.id}
                      className="hover:bg-white/[0.02] transition-colors group"
                    >
                      <td className="px-8 py-6">
                        <span className="text-xs font-mono font-bold text-white group-hover:text-[#f08a1d] transition-colors">{node.node_id}</span>
                      </td>
                      <td className="px-8 py-6 text-xs font-bold text-slate-400 uppercase tracking-tight">{node.name}</td>
                      <td className="px-8 py-6 text-xs font-bold text-white uppercase tracking-tight">{node.package_name}</td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-sm font-black text-emerald-500">${(node.balance || 0).toFixed(4)}</span>
                          <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Accruing...</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-xs font-mono text-slate-500">{new Date(node.created_at).toLocaleDateString()}</td>
                      <td className="px-8 py-6 text-center">
                        <span className={`text-[10px] font-black px-3 py-1.5 rounded-full ${node.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/10' : 'bg-rose-500/10 text-rose-500 border border-rose-500/10'}`}>
                          {node.status === 'active' ? 'OPERATIONAL' : 'INACTIVE'}
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
        <div className="flex justify-between items-center px-4">
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">
            Arowin Node Synchronization Protocol v2.4
          </p>
          <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
            Total Nodes: {nodes.length}
          </p>
        </div>
      </div>
    </div>
  );
};

export default TeamCollection;
