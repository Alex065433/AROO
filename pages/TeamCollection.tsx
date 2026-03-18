
import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import { supabaseService } from '../services/supabaseService';
import { ShieldCheck, Send, CheckSquare, Square, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const TeamCollection: React.FC = () => {
  const [teamList, setTeamList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [transactionPass, setTransactionPass] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  useEffect(() => {
    fetchTeamNodes();
  }, []);

  const fetchTeamNodes = async () => {
    setLoading(true);
    try {
      const user = supabaseService.getCurrentUser();
      if (user) {
        const nodes = await supabaseService.getTeamCollection(user.id || user.uid);
        setTeamList(nodes.map((n: any, idx: number) => ({
          ...n,
          sNo: idx + 1,
          selected: false,
          username: n.node_id,
          masterWallet: '5.25 USDT' // Simulated available amount per node
        })));
      }
    } catch (err) {
      console.error('Error fetching team nodes:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (sNo: number) => {
    setTeamList(list => list.map(m => m.sNo === sNo ? { ...m, selected: !m.selected } : m));
  };

  const toggleAll = () => {
    const allSelected = teamList.length > 0 && teamList.every(m => m.selected);
    setTeamList(list => list.map(m => ({ ...m, selected: !allSelected })));
  };

  const handleSubmit = async () => {
    const selectedNodes = teamList.filter(m => m.selected);
    
    if (selectedNodes.length === 0) {
      setStatus({ type: 'error', msg: 'Please select at least one node to collect from.' });
      return;
    }
    if (!transactionPass) {
      setStatus({ type: 'error', msg: 'Transaction password is required.' });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const user = supabaseService.getCurrentUser();
      if (!user) throw new Error('User not found');

      const nodeIds = selectedNodes.map(n => n.node_id);
      const totalCollected = await supabaseService.collectFromNodes(user.id || user.uid, nodeIds);

      setStatus({ type: 'success', msg: `Successfully collected ${totalCollected.toFixed(2)} USDT from ${selectedNodes.length} nodes.` });
      setTransactionPass('');
      await fetchTeamNodes(); // Refresh list
      setTimeout(() => setStatus(null), 4000);
    } catch (err: any) {
      console.error('Collection Error:', err);
      setStatus({ type: 'error', msg: err.message || 'Failed to collect from nodes.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20">
      <div className="border-b border-orange-500/20 pb-8 flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tight text-white flex items-center gap-4">
             Team Collection USDT
          </h2>
          <p className="text-slate-500 mt-2 font-medium">Gather and consolidate USDT from your organizational hierarchy nodes.</p>
        </div>
        <button 
          onClick={fetchTeamNodes}
          className="p-3 bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {status && (
        <div className={`p-6 rounded-2xl flex items-center gap-4 animate-in zoom-in duration-300 ${
          status.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
        }`}>
          {status.type === 'success' ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}
          <p className="font-bold">{status.msg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
        <div className="bg-[#1a1a1c] border border-white/10 rounded-[32px] overflow-hidden shadow-2xl">
          <div className="p-8 lg:p-12 space-y-10">
             <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="space-y-1">
                   <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Total Available in Selected Nodes</p>
                   <p className="text-3xl font-black text-orange-500">
                     {(teamList.filter(m => m.selected).length * 5.25).toFixed(2)} USDT
                   </p>
                </div>
                <div className="w-full md:w-auto">
                   <div className="relative">
                      <div className="w-full md:w-64 bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 text-white font-black text-center">
                        {(teamList.filter(m => m.selected).length * 5.25).toFixed(2)}
                      </div>
                      <label className="absolute -top-3 left-6 bg-slate-900 px-2 text-[10px] font-black text-slate-600 uppercase">Target Amount</label>
                   </div>
                </div>
             </div>

             <div className="flex flex-col md:flex-row gap-6 items-center pt-6 border-t border-white/5">
                <div className="relative w-full">
                   <input 
                      type="password" 
                      placeholder="Enter your transaction password" 
                      value={transactionPass}
                      onChange={e => setTransactionPass(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:border-orange-500/50 transition-all placeholder:text-slate-700 font-bold"
                   />
                </div>
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting || teamList.filter(m => m.selected).length === 0}
                  className="w-full md:w-48 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-xl shadow-orange-950/20 active:scale-95"
                >
                   {isSubmitting ? 'PROCESSING...' : <>SUBMIT <Send size={18} /></>}
                </button>
             </div>
          </div>
        </div>

        <div className="bg-[#1a1a1c] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
          <div className="bg-gradient-to-r from-orange-600 to-orange-500 px-8 py-5 flex justify-between items-center">
             <h3 className="font-black text-white uppercase tracking-widest text-sm">Select Team List</h3>
             <button onClick={toggleAll} className="flex items-center gap-2 text-[10px] font-black uppercase text-white/90 bg-black/20 px-3 py-1 rounded-lg hover:bg-black/30 transition-all">
                {teamList.length > 0 && teamList.every(m => m.selected) ? <CheckSquare size={14} /> : <Square size={14} />}
                Select All
             </button>
          </div>
          
          <div className="overflow-x-auto custom-scrollbar min-h-[300px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <RefreshCw className="animate-spin text-orange-500" size={40} />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Accessing Team Nodes...</p>
              </div>
            ) : teamList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <AlertCircle className="text-slate-700" size={40} />
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No active nodes found. Activate a package to generate nodes.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-white/5">
                    <th className="px-8 py-5 text-center">Select</th>
                    <th className="px-8 py-5">S.No</th>
                    <th className="px-8 py-5">Node ID</th>
                    <th className="px-8 py-5">Node Name</th>
                    <th className="px-8 py-5">Available</th>
                    <th className="px-8 py-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {teamList.map((member) => (
                    <tr key={member.sNo} className={`group hover:bg-orange-500/[0.02] transition-colors cursor-pointer ${member.selected ? 'bg-orange-500/5' : ''}`} onClick={() => toggleSelect(member.sNo)}>
                      <td className="px-8 py-6 text-center">
                         <div className="text-orange-500 flex justify-center">
                            {member.selected ? <CheckSquare size={20} /> : <Square size={20} className="text-slate-800" />}
                         </div>
                      </td>
                      <td className="px-8 py-6 text-slate-500 font-bold text-sm">{member.sNo}</td>
                      <td className="px-8 py-6 font-mono text-sm text-orange-400 font-bold">{member.node_id}</td>
                      <td className="px-8 py-6 font-bold text-white text-sm uppercase">{member.name}</td>
                      <td className="px-8 py-6 font-black text-slate-400 text-sm">{member.masterWallet}</td>
                      <td className="px-8 py-6">
                         <span className={`text-[10px] font-black px-3 py-1 rounded-lg uppercase border ${
                           member.eligible ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-slate-600 bg-white/5 border-white/5'
                         }`}>
                           {member.eligible ? 'ACTIVE' : 'INACTIVE'}
                         </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamCollection;
