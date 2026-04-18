
import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '../../components/ConfirmDialog';
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
  const [selectedPackage, setSelectedPackage] = useState('50');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    type: 'warning'
  });

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    email: '',
    password: 'Password123!',
    sponsorId: 'ARW-100001',
    side: 'LEFT' as 'LEFT' | 'RIGHT'
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const data = await supabaseService.getAllUsers();
      setUsers(data || []);
      return data;
    } catch (error) {
      console.error('Error fetching users:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    try {
      await supabaseService.register(
        newCustomer.email,
        newCustomer.password,
        newCustomer.sponsorId,
        newCustomer.side,
        { name: newCustomer.name }
      );
      toast.success('Customer added successfully');
      setIsAddModalOpen(false);
      setNewCustomer({
        name: '',
        email: '',
        password: 'Password123!',
        sponsorId: 'ARW-100001',
        side: 'LEFT'
      });
      fetchUsers();
    } catch (error) {
      console.error('Error adding customer:', error);
      toast.error('Error adding customer: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (u.operator_id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleAddFunds = async () => {
    if (!selectedUser || !fundAmount) {
      toast.error('Please enter an amount');
      return;
    }
    
    const numericAmount = parseFloat(fundAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast.error('Please enter a valid positive amount');
      return;
    }

    setIsProcessing(true);
    try {
      await supabaseService.addFunds(selectedUser.id, parseFloat(fundAmount));
      toast.success('Funds added successfully');
      setFundAmount('');
      const updatedUsers = await fetchUsers();
      if (updatedUsers && selectedUser) {
        const updated = updatedUsers.find((u: any) => u.id === selectedUser.id);
        if (updated) setSelectedUser(updated);
      }
    } catch (error) {
      console.error('Error adding funds:', error);
      toast.error('Error adding funds: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActivatePackage = async () => {
    if (!selectedUser) return;
    
    const amount = parseFloat(selectedPackage);
    const balance = Number(selectedUser.wallet_balance || 0);
    
    setConfirmDialog({
      isOpen: true,
      title: 'Activate Package',
      message: `Are you sure you want to activate the $${amount} package for ${selectedUser.name}?`,
      type: 'warning',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsProcessing(true);
        try {
          await supabaseService.activatePackage(`NODE-${amount}`, amount, selectedUser.id);
          toast.success('Package activated successfully');
          const updatedUsers = await fetchUsers();
          if (updatedUsers && selectedUser) {
            const updated = updatedUsers.find((u: any) => u.id === selectedUser.id);
            if (updated) setSelectedUser(updated);
          }
          setIsEditPanelOpen(false);
        } catch (error) {
          console.error('Error activating package:', error);
          toast.error('Error activating package: ' + (error as any).message);
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const handleRunSync = async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      await supabaseService.checkAndUpdateRank(selectedUser.id);
      toast.success('System synchronization complete. Rank and nodes updated.');
      fetchUsers();
    } catch (error) {
      console.error('Error running sync:', error);
      toast.error('Error running sync: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedUser) return;
    const newStatus = selectedUser.status === 'active' ? 'blocked' : 'active';
    setIsProcessing(true);
    try {
      await supabaseService.updateUserStatus(selectedUser.id, newStatus);
      toast.success(`User account ${newStatus === 'active' ? 'activated' : 'blocked'} successfully`);
      setSelectedUser({ ...selectedUser, status: newStatus });
      fetchUsers();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error updating status: ' + (error as any).message);
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
        email: selectedUser.email,
        role: selectedUser.role
      });
      toast.success('User updated successfully');
      fetchUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Error updating user: ' + (error as any).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedUser) return;
    
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Account',
      message: `Are you sure you want to PERMANENTLY DELETE the account for ${selectedUser.name}? This action cannot be undone and will remove all associated data.`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setIsProcessing(true);
        try {
          await supabaseService.deleteUser(selectedUser.id);
          toast.success('Account deleted successfully');
          setSelectedUser(null);
          setIsEditPanelOpen(false);
          fetchUsers();
        } catch (error) {
          console.error('Error deleting account:', error);
          toast.error('Error deleting account: ' + (error as any).message);
        } finally {
          setIsProcessing(false);
        }
      }
    });
  };

  const handleEdit = (user: any) => {
    setSelectedUser(user);
    setIsEditPanelOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <ConfirmDialog 
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
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
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
          >
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
                <th className="px-8 py-4">Package</th>
                <th className="px-8 py-4">Status</th>
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
              ) : paginatedUsers.map((user, i) => (
                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5 text-sm font-mono font-bold text-indigo-600 dark:text-indigo-400">{user.operator_id || user.id?.substring(0, 8)}</td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{user.name || 'Unnamed User'}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-900 dark:text-white">
                    {(user.wallet_balance || 0).toFixed(2)} USDT
                  </td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      user.active_package ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
                    }`}>
                      {user.active_package ? `$${user.active_package}` : 'No Package'}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                      user.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 
                      'bg-rose-500/10 text-rose-500'
                    }`}>
                      {user.status || 'pending'}
                    </span>
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
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} customers
          </p>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <button 
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      currentPage === pageNum ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 && <span className="text-slate-400">...</span>}
              {totalPages > 5 && (
                <button 
                  onClick={() => setCurrentPage(totalPages)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                    currentPage === totalPages ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {totalPages}
                </button>
              )}
            </div>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Add Customer Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 flex items-center justify-center z-[300] p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-md" 
              onClick={() => setIsAddModalOpen(false)}
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Add New Customer</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Register a new user manually into the system.</p>
                  </div>
                  <button onClick={() => setIsAddModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all">
                    <XCircle size={24} />
                  </button>
                </div>

                <form onSubmit={handleAddCustomer} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
                      <input 
                        required
                        type="text" 
                        value={newCustomer.name}
                        onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white" 
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email Address</label>
                      <input 
                        required
                        type="email" 
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white" 
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Password</label>
                    <input 
                      required
                      type="text" 
                      value={newCustomer.password}
                      onChange={(e) => setNewCustomer({...newCustomer, password: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white" 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Sponsor ID</label>
                      <input 
                        required
                        type="text" 
                        value={newCustomer.sponsorId}
                        onChange={(e) => setNewCustomer({...newCustomer, sponsorId: e.target.value})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white" 
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Placement Side</label>
                      <select 
                        value={newCustomer.side}
                        onChange={(e) => setNewCustomer({...newCustomer, side: e.target.value as 'LEFT' | 'RIGHT'})}
                        className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                      >
                        <option value="LEFT">Left Side</option>
                        <option value="RIGHT">Right Side</option>
                      </select>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 mt-4"
                  >
                    {isProcessing ? 'Adding Customer...' : 'Create Account'}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
                      {selectedUser.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <input 
                        type="text"
                        value={selectedUser.name || ''}
                        onChange={(e) => setSelectedUser({...selectedUser, name: e.target.value})}
                        className="w-full bg-transparent border-none p-0 font-bold text-slate-900 dark:text-white focus:ring-0"
                      />
                      <input 
                        type="email"
                        value={selectedUser.email || ''}
                        onChange={(e) => setSelectedUser({...selectedUser, email: e.target.value})}
                        className="w-full bg-transparent border-none p-0 text-xs text-slate-500 dark:text-slate-400 focus:ring-0"
                      />
                      <p className="text-[10px] text-slate-400 font-mono mt-1">{selectedUser.id}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          selectedUser.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                          selectedUser.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 
                          'bg-rose-500/10 text-rose-500'
                        }`}>
                          {selectedUser.status || 'pending'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          selectedUser.role === 'admin' ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-500/10 text-slate-500'
                        }`}>
                          {selectedUser.role || 'user'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">System Role</label>
                          <select 
                            value={selectedUser.role || 'user'}
                            onChange={(e) => setSelectedUser({...selectedUser, role: e.target.value})}
                            className="w-full bg-white dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
                          >
                            <option value="user">Standard User</option>
                            <option value="admin">Administrator</option>
                          </select>
                       </div>

                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                             <ShieldAlert size={18} />
                             <h4 className="text-xs font-black uppercase tracking-widest">Account Activation</h4>
                          </div>
                          <button 
                            onClick={handleToggleStatus}
                            disabled={isProcessing}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${
                              selectedUser.status === 'active' 
                                ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20' 
                                : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            }`}
                          >
                            {isProcessing ? '...' : selectedUser.status === 'active' ? 'Block Account' : 'Activate Account'}
                          </button>
                       </div>

                    </div>

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
                          <button 
                            onClick={async () => {
                              if (!selectedUser) return;
                              setConfirmDialog({
                                isOpen: true,
                                title: 'Free Activation',
                                message: `Are you sure you want to activate user ${selectedUser.name} for FREE?`,
                                type: 'warning',
                                onConfirm: async () => {
                                  setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                                  setIsProcessing(true);
                                  try {
                                    await supabaseService.activatePackage(selectedUser.id, parseFloat(selectedPackage));
                                    toast.success('User activated successfully!');
                                    fetchUsers();
                                    setIsEditPanelOpen(false);
                                  } catch (err) {
                                    toast.error('Activation failed');
                                  } finally {
                                    setIsProcessing(false);
                                  }
                                }
                              });
                            }}
                            disabled={isProcessing}
                            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                          >
                            Free
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
