
import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, Download, Check, X, 
  Calendar, ArrowUpRight, ArrowDownRight,
  MoreHorizontal, FileText, ExternalLink, RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabaseService } from '../../services/supabaseService';

const AdminTransactions: React.FC = () => {
  const [filterType, setFilterType] = useState('All');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchTransactions = async () => {
      setIsLoading(true);
      try {
        const data = await supabaseService.getPayments('all');
        setTransactions(data);
      } catch (error) {
        console.error('Error fetching transactions:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTransactions();
  }, []);

  const filteredTransactions = transactions.filter(tx => {
    const matchesType = filterType === 'All' || tx.type.toLowerCase().includes(filterType.toLowerCase());
    const matchesSearch = tx.uid?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         tx.id?.toString().includes(searchQuery);
    return matchesType && matchesSearch;
  });

  const stats = {
    deposits: transactions.filter(t => t.type === 'deposit' && (t.status === 'finished' || t.status === 'completed')).reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    withdrawals: transactions.filter(t => t.type === 'withdrawal' && (t.status === 'finished' || t.status === 'completed')).reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
    pending: transactions.filter(t => t.status === 'waiting' || t.status === 'pending').length
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Transactions</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Monitor and approve platform financial activities.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
            <Calendar size={16} /> Date Range
          </button>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2">
            <Download size={16} /> Export Data
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <ArrowUpRight size={18} />
            </div>
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Total Deposits</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">${stats.deposits.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
              <ArrowDownRight size={18} />
            </div>
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Total Withdrawals</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">${stats.withdrawals.toLocaleString()}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
              <FileText size={18} />
            </div>
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Pending Requests</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pending}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by ID or User..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            {['All', 'Deposit', 'Withdrawal'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filterType === type 
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="relative">
            <select className="bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer min-w-[140px]">
              <option>All Status</option>
              <option>Completed</option>
              <option>Pending</option>
              <option>Rejected</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Transaction ID</th>
                <th className="px-8 py-4">User ID</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">Amount</th>
                <th className="px-8 py-4">Method</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-8 py-10 text-center">
                    <RefreshCw className="animate-spin mx-auto text-indigo-600" size={24} />
                  </td>
                </tr>
              ) : filteredTransactions.map((tx, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5 text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    <div className="flex items-center gap-2">
                      {tx.id?.toString().substring(0, 8)}...
                      <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">{tx.uid?.substring(0, 8)}...</td>
                  <td className="px-8 py-5">
                    <span className={`text-xs font-bold uppercase ${
                      tx.type === 'deposit' ? 'text-emerald-500' : 
                      tx.type === 'withdrawal' ? 'text-orange-500' : 'text-blue-500'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">${tx.amount?.toFixed(2)}</td>
                  <td className="px-8 py-5 text-xs text-slate-500 dark:text-slate-400">{tx.method || 'INTERNAL'}</td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                      tx.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                      'bg-rose-500/10 text-rose-500'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-xs text-slate-500 dark:text-slate-400">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'Recent'}
                  </td>
                  <td className="px-8 py-5 text-right">
                    {tx.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white rounded-lg transition-all" title="Approve">
                          <Check size={16} />
                        </button>
                        <button className="p-2 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg transition-all" title="Reject">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-all">
                        <MoreHorizontal size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminTransactions;
