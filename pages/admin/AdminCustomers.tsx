
import React, { useState, useEffect } from 'react';
import { 
  Search, Filter, MoreVertical, Eye, Edit2, 
  ShieldAlert, Trash2, ChevronLeft, ChevronRight,
  Download, Plus, CheckCircle2, XCircle, RefreshCw,
  Wallet, Package, Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabaseService } from '../../services/supabaseService';
import { PACKAGES } from '../../constants';

const AdminCustomers: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [selectedPackage, setSelectedPackage] = useState('150');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddFunds = async () => {
    if (!selectedUser || !fundAmount) return;
    setIsProcessing(true);
    try {
      await supabaseService.addFunds(selectedUser.id, parseFloat(fundAmount));
      alert('Funds added successfully');
      setFundAmount('');
      fetchUsers();
    } catch (error) {
      console.error('Error adding funds:', error);
      alert('Error adding funds: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActivatePackage = async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      await supabaseService.activatePackage(selectedUser.id, parseFloat(selectedPackage));
      alert('Package activated successfully');
      fetchUsers();
    } catch (error) {
      console.error('Error activating package:', error);
      alert('Error activating package: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunSync = async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      await supabaseService.checkAndUpdateRank(selectedUser.id);
      alert('System synchronization complete. Rank and nodes updated.');
      fetchUsers();
    } catch (error) {
      console.error('Error running sync:', error);
      alert('Error running sync: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      await supabaseService.updateUser(selectedUser.id, {
        name: selectedUser.name,
        email: selectedUser.email
      });
      alert('User updated successfully');
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error updating user: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedUser) return;
    if (!window.confirm('Are you sure you want to delete this account? This action is irreversible.')) return;
    
    setIsProcessing(true);
    try {
      await supabaseService.deleteUser(selectedUser.id);
      alert('Account deleted successfully');
      setIsEditPanelOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Error deleting account: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setIsEditPanelOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Customer Management</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Manage and monitor all platform users.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
            <Download size={16} /> Export CSV
          </button>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2">
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Search by name, email or ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select className="bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer min-w-[140px]">
              <option>All Status</option>
              <option>Active</option>
              <option>Blocked</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
          <div className="relative">
            <select className="bg-slate-50 dark:bg-slate-800/50 border-none rounded-xl pl-4 pr-10 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer min-w-[140px]">
              <option>All KYC</option>
              <option>Verified</option>
              <option>Pending</option>
              <option>Rejected</option>
            </select>
            <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">User ID</th>
                <th className="px-8 py-4">Name</th>
                <th className="px-8 py-4">Wallet Balance</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">KYC</th>
                <th className="px-8 py-4">Reg. Date</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-8 py-20 text-center">
                    <RefreshCw className="animate-spin mx-auto text-indigo-600 mb-4" size={32} />
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Synchronizing User Nodes...</p>
                  </td>
                </tr>
              ) : users.filter(u => 
                  u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  u.operator_id?.toLowerCase().includes(searchQuery.toLowerCase())
                ).map((user, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5 text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{user.id?.substring(0, 8)}...</td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{user.name || 'Unnamed User'}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">
                    {user.wallets?.master?.balance?.toFixed(2) || '0.00'} USDT
                  </td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      user.active_package ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                    }`}>
                      {user.active_package ? `Active ($${user.active_package})` : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-emerald-500" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
                        Verified
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm text-slate-500 dark:text-slate-400">
                    {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Recent'}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => handleEdit(user)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all">
                        <Edit2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="px-8 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Showing 1 to 5 of 45,231 customers</p>
          <div className="flex items-center gap-2">
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white disabled:opacity-30" disabled>
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1">
              {[1, 2, 3, '...', 12].map((p, i) => (
                <button key={i} className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                  p === 1 ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}>
                  {p}
                </button>
              ))}
            </div>
            <button className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Slide-in Edit Panel */}
      <AnimatePresence>
        {isEditPanelOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]" 
              onClick={() => setIsEditPanelOpen(false)}
            />
            <motion.div 
              initial={{ x: '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '100%' }} 
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl z-[210] p-8 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Customer</h2>
                <button onClick={() => setIsEditPanelOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all">
                  <XCircle size={24} />
                </button>
              </div>

              {selectedUser && (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-xl">
                      {selectedUser.name.charAt(0)}
                    </div>
                    <div>
                      <input 
                        type="text"
                        value={selectedUser.name}
                        onChange={(e) => setSelectedUser({...selectedUser, name: e.target.value})}
                        className="w-full bg-transparent border-none p-0 font-bold text-slate-900 dark:text-white focus:ring-0"
                      />
                      <input 
                        type="email"
                        value={selectedUser.email}
                        onChange={(e) => setSelectedUser({...selectedUser, email: e.target.value})}
                        className="w-full bg-transparent border-none p-0 text-xs text-slate-500 dark:text-slate-400 focus:ring-0"
                      />
                      <p className="text-[10px] text-slate-400 font-mono mt-1">{selectedUser.id}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-500/5 rounded-2xl border border-indigo-100 dark:border-indigo-500/10 space-y-4">
                       <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                          <Wallet size={18} />
                          <h4 className="text-xs font-black uppercase tracking-widest">Add Funds</h4>
                       </div>
                       <div className="flex gap-2">
                          <input 
                            type="number" 
                            placeholder="Amount" 
                            value={fundAmount}
                            onChange={(e) => setFundAmount(e.target.value)}
                            className="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white" 
                          />
                          <button 
                            onClick={handleAddFunds}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                          >
                            {isProcessing ? '...' : 'Add'}
                          </button>
                       </div>
                    </div>

                    <div className="p-4 bg-orange-50 dark:bg-orange-500/5 rounded-2xl border border-orange-100 dark:border-orange-500/10 space-y-4">
                       <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
                          <Package size={18} />
                          <h4 className="text-xs font-black uppercase tracking-widest">Activate Package</h4>
                       </div>
                        <div className="flex gap-2">
                          <select 
                            value={selectedPackage}
                            onChange={(e) => setSelectedPackage(e.target.value)}
                            className="flex-1 bg-white dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 text-slate-900 dark:text-white"
                          >
                            {PACKAGES.map(pkg => (
                              <option key={pkg.price} value={pkg.price}>
                                ${pkg.price} ({pkg.name})
                              </option>
                            ))}
                          </select>
                          <button 
                            onClick={handleActivatePackage}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-orange-600 text-white rounded-xl text-xs font-bold hover:bg-orange-700 transition-all disabled:opacity-50"
                          >
                            {isProcessing ? '...' : 'Activate'}
                          </button>
                       </div>
                    </div>

                    <div className="p-4 bg-emerald-50 dark:bg-emerald-500/5 rounded-2xl border border-emerald-100 dark:border-emerald-500/10 space-y-4">
                       <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                          <Play size={18} />
                          <h4 className="text-xs font-black uppercase tracking-widest">Run Account</h4>
                       </div>
                       <button 
                         onClick={handleRunSync}
                         disabled={isProcessing}
                         className="w-full py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                       >
                          {isProcessing ? '...' : 'Synchronize & Run Node'}
                       </button>
                    </div>
                  </div>

                  <div className="pt-8 space-y-3">
                    <button 
                      onClick={handleSaveChanges}
                      disabled={isProcessing}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                    >
                      {isProcessing ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button 
                      onClick={handleDeleteAccount}
                      disabled={isProcessing}
                      className="w-full py-4 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-bold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Trash2 size={18} /> {isProcessing ? 'Deleting...' : 'Delete Account'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminCustomers;
