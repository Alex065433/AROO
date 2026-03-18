
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import { SplashScreen } from './components/SplashScreen';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
import BinaryTree from './pages/BinaryTree';
import RankSystem from './pages/RankSystem';
import ReferralProgram from './pages/ReferralProgram';
import Rewards from './pages/Rewards';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminSettings from './pages/admin/AdminSettings';
import AdminLogs from './pages/admin/AdminLogs';
import TeamCollection from './pages/TeamCollection';
import Profile from './pages/Profile';
import MasterWallet from './pages/MasterWallet';
import Help from './pages/Help';

const App: React.FC = () => {
  // Set to false to start at the user login screen
  const [isUserAuth, setIsUserAuth] = useState(false);
  // Set to false to allow testing the new Admin Login flow
  const [isAdminAuth, setIsAdminAuth] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <HashRouter>
      {!isSupabaseConfigured && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 text-center shadow-lg">
          Supabase Configuration Missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in AI Studio settings.
        </div>
      )}
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login onLogin={() => setIsUserAuth(true)} />} />
        <Route path="/register" element={<Register onLogin={() => setIsUserAuth(true)} />} />
        
        {/* Admin Public Route */}
        <Route path="/admin/login" element={<AdminLogin onLogin={() => setIsAdminAuth(true)} />} />

        {/* User Protected Routes */}
        <Route element={isUserAuth ? <Layout role="user" /> : <Navigate to="/login" />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/master-wallet" element={<MasterWallet />} />
          <Route path="/team-collection" element={<TeamCollection />} />
          <Route path="/binary-tree" element={<BinaryTree />} />
          <Route path="/ranks" element={<RankSystem />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/referral" element={<ReferralProgram />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/help" element={<Help />} />
        </Route>

        {/* Admin Protected Routes */}
        <Route element={isAdminAuth ? <AdminLayout /> : <Navigate to="/login" />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminCustomers />} />
          <Route path="/admin/transactions" element={<AdminTransactions />} />
          <Route path="/admin/settings" element={<AdminSettings />} /> 
          <Route path="/admin/logs" element={<AdminLogs />} /> 
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
