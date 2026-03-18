
import React, { useState } from 'react';
import { 
  Search, Filter, Download, Check, X, 
  Calendar, ArrowUpRight, ArrowDownRight,
  MoreHorizontal, FileText, ExternalLink
} from 'lucide-react';
import { motion } from 'framer-motion';

const AdminTransactions: React.FC = () => {
  const [filterType, setFilterType] = useState('All');

  const transactions = [
    { id: 'TX-10001', user: 'John Doe', type: 'Deposit', amount: '$1,200.00', status: 'Completed', date: '2024-03-15 14:30', method: 'USDT (TRC20)' },
    { id: 'TX-10002', user: 'Jane Smith', type: 'Withdrawal', amount: '$450.00', status: 'Pending', date: '2024-03-15 12:15', method: 'Bank Transfer' },
    { id: 'TX-10003', user: 'Mike Ross', type: 'Deposit', amount: '$3,000.00', status: 'Completed', date: '2024-03-14 09:45', method: 'BTC' },
    { id: 'TX-10004', user: 'Sarah Connor', type: 'Withdrawal', amount: '$150.00', status: 'Rejected', date: '2024-03-14 16:20', method: 'USDT (ERC20)' },
    { id: 'TX-10005', user: 'Harvey Specter', type: 'Deposit', amount: '$5,000.00', status: 'Completed', date: '2024-03-13 11:00', method: 'USDT (TRC20)' },
    { id: 'TX-10006', user: 'Louis Litt', type: 'Withdrawal', amount: '$2,500.00', status: 'Pending', date: '2024-03-13 15:45', method: 'Bank Transfer' },
  ];

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
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Total Deposits (24h)</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">$42,500.00</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-500/10 text-orange-500 rounded-lg">
              <ArrowDownRight size={18} />
            </div>
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Total Withdrawals (24h)</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">$18,200.00</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
              <FileText size={18} />
            </div>
            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Pending Requests</span>
          </div>
          <p className="text-2xl font-bold text-slate-900 dark:text-white">14</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by ID or User..." 
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
                <th className="px-8 py-4">User</th>
                <th className="px-8 py-4">Type</th>
                <th className="px-8 py-4">Amount</th>
                <th className="px-8 py-4">Method</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">Date</th>
                <th className="px-8 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transactions.map((tx, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5 text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    <div className="flex items-center gap-2">
                      {tx.id}
                      <ExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">{tx.user}</td>
                  <td className="px-8 py-5">
                    <span className={`text-xs font-bold ${tx.type === 'Deposit' ? 'text-emerald-500' : 'text-orange-500'}`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">{tx.amount}</td>
                  <td className="px-8 py-5 text-xs text-slate-500 dark:text-slate-400">{tx.method}</td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      tx.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500' :
                      tx.status === 'Pending' ? 'bg-amber-500/10 text-amber-500' :
                      'bg-rose-500/10 text-rose-500'
                    }`}>
                      {tx.status}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-xs text-slate-500 dark:text-slate-400">{tx.date}</td>
                  <td className="px-8 py-5 text-right">
                    {tx.status === 'Pending' ? (
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
