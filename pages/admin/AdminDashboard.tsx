
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  Users, UserCheck, UserX, ArrowUpRight, ArrowDownRight, 
  DollarSign, CreditCard, TrendingUp, Activity,
  ArrowRight, RefreshCw
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts';
import { motion } from 'framer-motion';
import { ArowinLogo } from '../../components/ArowinLogo';
import { supabaseService } from '../../services/supabaseService';

const AdminDashboard: React.FC = () => {
  const [statsData, setStatsData] = useState<any>(null);
  const [recentTx, setRecentTx] = useState<any[]>([]);
  const [tradingLogs, setTradingLogs] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [registrationData, setRegistrationData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const stats = await supabaseService.getAdminStats();
        const payments = await supabaseService.getPayments('all');
        const revData = await supabaseService.getAdminChartData();
        const regData = await supabaseService.getAdminRegistrationData();
        
        setStatsData(stats);
        setRecentTx(payments.slice(0, 5));
        setTradingLogs(payments.slice(0, 10));
        setRevenueData(revData.length > 0 ? revData : [
          { name: 'Jan', revenue: 0 },
          { name: 'Feb', revenue: 0 },
          { name: 'Mar', revenue: 0 }
        ]);
        setRegistrationData(regData);
      } catch (error) {
        console.error('Error fetching admin dashboard data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const stats = [
    { label: 'Total Users', value: statsData?.totalUsers || '0', change: '+12.5%', icon: Users, color: 'indigo' },
    { label: 'Active Users', value: statsData?.activeUsers || '0', change: '+8.2%', icon: UserCheck, color: 'emerald' },
    { label: 'Blocked Users', value: statsData?.blockedUsers || '0', change: '-2.4%', icon: UserX, color: 'rose' },
    { label: 'Total Deposits', value: `$${(statsData?.totalDeposits || 0).toLocaleString()}`, change: '+18.7%', icon: DollarSign, color: 'blue' },
    { label: 'Total Withdrawals', value: `$${(statsData?.totalWithdrawals || 0).toLocaleString()}`, change: '+5.4%', icon: CreditCard, color: 'orange' },
    { label: 'Pending Withdrawals', value: `$${(statsData?.pendingWithdrawals || 0).toLocaleString()}`, change: '0%', icon: Activity, color: 'amber' },
    { label: 'Platform Revenue', value: `$${(statsData?.platformRevenue || 0).toLocaleString()}`, change: '+22.1%', icon: TrendingUp, color: 'violet' },
  ];

  const handleSystemSync = async () => {
    try {
      setIsLoading(true);
      const result = await supabaseService.processSystemIncomes();
      toast.success(result.message);
      // Refresh data
      const stats = await supabaseService.getAdminStats();
      setStatsData(stats);
    } catch (error) {
      console.error('Error syncing system:', error);
      toast.error('Failed to sync system protocols');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 dark:border-slate-800 pb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600/10 rounded-xl flex items-center justify-center p-2 border border-indigo-500/20">
            <ArowinLogo size={40} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AROWIN <span className="text-indigo-600">TRADING</span></h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">Dashboard Overview</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
            Download Report
          </button>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/20">
            Manage Users
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all group cursor-pointer"
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2.5 rounded-xl bg-${stat.color}-500/10 text-${stat.color}-500 group-hover:scale-110 transition-transform`}>
                <stat.icon size={20} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-bold ${stat.change.startsWith('+') ? 'text-emerald-500' : stat.change.startsWith('-') ? 'text-rose-500' : 'text-slate-400'}`}>
                {stat.change.startsWith('+') ? <ArrowUpRight size={12} /> : stat.change.startsWith('-') ? <ArrowDownRight size={12} /> : null}
                {stat.change}
              </div>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{stat.value}</h3>
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Growth */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Revenue Growth</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Monthly revenue performance</p>
            </div>
            <select className="bg-slate-50 dark:bg-slate-800 border-none rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 px-3 py-1.5 focus:ring-2 focus:ring-indigo-500">
              <option>Last 7 Months</option>
              <option>Last Year</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Registrations */}
        <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">User Registrations</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Daily new user signups</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">New Users</span>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={registrationData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '12px', color: '#fff' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Recent Transactions</h3>
            <button className="text-indigo-600 hover:text-indigo-700 text-sm font-bold flex items-center gap-1">
              View All <ArrowRight size={16} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
                  <th className="px-8 py-4">Transaction ID</th>
                  <th className="px-8 py-4">User</th>
                  <th className="px-8 py-4">Type</th>
                  <th className="px-8 py-4">Amount</th>
                  <th className="px-8 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-10 text-center">
                      <RefreshCw className="animate-spin mx-auto text-indigo-600" size={24} />
                    </td>
                  </tr>
                ) : recentTx.map((tx, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-5 text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{tx.id?.toString().substring(0, 8)}...</td>
                    <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">{tx.uid?.substring(0, 8)}...</td>
                    <td className="px-8 py-5 text-sm text-slate-600 dark:text-slate-400 uppercase font-black tracking-widest">{tx.type}</td>
                    <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">${tx.amount?.toFixed(2)}</td>
                    <td className="px-8 py-5 text-right">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Trading Protocol Sync */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Trading Protocol Sync</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Real-time system activity</p>
          </div>
          <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="animate-spin text-indigo-600" size={24} />
              </div>
            ) : tradingLogs.length > 0 ? (
              tradingLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                  <div className={`w-2 h-2 rounded-full mt-2 ${log.type === 'package_activation' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'}`} />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {log.type === 'package_activation' ? 'Package Protocol Executed' : 
                       log.type === 'referral_bonus' ? 'Referral Engine Sync' :
                       log.type === 'team_collection' ? 'Node Collection Processed' : 'System Protocol Sync'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Amount: ${log.amount} • Status: {log.status}
                    </p>
                    <p className="text-[9px] font-mono text-slate-400 mt-1 uppercase">
                      {log.created_at ? new Date(log.created_at).toLocaleString() : 'Recent'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10">
                <Activity className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="text-xs text-slate-500">No protocol logs detected.</p>
              </div>
            )}
          </div>
          <div className="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">
            <button 
              onClick={handleSystemSync}
              disabled={isLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Initialize System Sync'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
