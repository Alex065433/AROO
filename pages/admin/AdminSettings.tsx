
import React, { useState } from 'react';
import { toast } from 'sonner';
import { 
  Save, Globe, Shield, Wallet, 
  Percent, AlertTriangle, Upload,
  CheckCircle2, RefreshCw, Database
} from 'lucide-react';
import { motion } from 'framer-motion';
import { ArowinLogo } from '../../components/ArowinLogo';
import { supabaseService } from '../../services/supabaseService';

const AdminSettings: React.FC = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('Settings updated successfully!');

  const [isProcessingPayouts, setIsProcessingPayouts] = useState(false);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      setSuccessMessage('Settings updated successfully!');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }, 1500);
  };

  const handleRebuild = async () => {
    setIsRebuilding(true);
    try {
      await supabaseService.rebuildTreeCounts();
      setSuccessMessage('Network counts rebuilt successfully!');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Rebuild failed:', err);
      toast.error('Failed to rebuild network counts. Please ensure the SQL schema is updated.');
    } finally {
      setIsRebuilding(false);
    }
  };

  const handleProcessPayouts = async () => {
    setIsProcessingPayouts(true);
    try {
      await supabaseService.processDailyPayouts();
      setSuccessMessage('Daily payouts processed successfully!');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      console.error('Payout processing failed:', err);
      toast.error('Failed to process daily payouts. Check system logs.');
    } finally {
      setIsProcessingPayouts(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Platform Settings</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Configure global platform parameters and rules.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
        >
          {isSaving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {showSuccess && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-500 font-bold text-sm"
        >
          <CheckCircle2 size={20} />
          {successMessage}
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-8">
        {/* General Configuration */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Globe className="text-indigo-600" size={20} />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">General Configuration</h3>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Platform Name</label>
              <input type="text" defaultValue="Arowin Trading" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-medium" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Support Email</label>
              <input type="email" defaultValue="support@arowin.com" className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-medium" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Platform Logo</label>
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 hover:border-indigo-500/50 transition-colors cursor-pointer group">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 flex items-center justify-center p-4">
                    <ArowinLogo size={64} />
                  </div>
                  <div className="text-left">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-full text-slate-400 group-hover:text-indigo-500 transition-colors inline-block mb-2">
                      <Upload size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Click or drag to upload new logo</p>
                    <p className="text-[10px] text-slate-400">Recommended size: 512x512px (PNG, SVG)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Rules */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Wallet className="text-emerald-600" size={20} />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Financial Rules</h3>
          </div>
          <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Min. Deposit Amount ($)</label>
              <input type="number" defaultValue={50} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Min. Withdrawal Amount ($)</label>
              <input type="number" defaultValue={20} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Withdrawal Commission (%)</label>
              <div className="relative">
                <input type="number" defaultValue={5} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold" />
                <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Daily Withdrawal Limit ($)</label>
              <input type="number" defaultValue={5000} className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white font-bold" />
            </div>
          </div>
        </div>

        {/* Security & System */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Shield className="text-rose-600" size={20} />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Security & System</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-lg">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Maintenance Mode</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Disable platform access for all users except admins.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-lg">
                  <Shield size={20} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Two-Factor Authentication</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Require 2FA for all administrative actions.</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* System Tools */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
            <Database className="text-indigo-600" size={20} />
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">System Tools</h3>
          </div>
          <div className="p-8 space-y-6">
            <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-xl">
                  <RefreshCw size={24} className={isRebuilding ? 'animate-spin' : ''} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Rebuild Network Counts</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">Recalculate Left/Right team sizes and volumes for all users. Use this if tree statistics appear out of sync.</p>
                </div>
              </div>
              <button 
                onClick={handleRebuild}
                disabled={isRebuilding}
                className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {isRebuilding ? 'Processing...' : 'Run Rebuild'}
              </button>
            </div>

            <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                  <Wallet size={24} className={isProcessingPayouts ? 'animate-spin' : ''} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Process Daily Payouts</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">Manually trigger binary matching income and daily cap resets. This is usually automated but can be run manually for testing.</p>
                </div>
              </div>
              <button 
                onClick={handleProcessPayouts}
                disabled={isProcessingPayouts}
                className="px-6 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
              >
                {isProcessingPayouts ? 'Processing...' : 'Run Payouts'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
