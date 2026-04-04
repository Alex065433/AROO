
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import { SplashScreen } from './components/SplashScreen';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Login from './pages/Login';
import TwoFactorPage from './pages/TwoFactorPage';
import AdminLogin from './pages/AdminLogin';
import Register from './pages/Register';
import BinaryTree from './pages/BinaryTree';
import TeamCollection from './pages/TeamCollection';
import RankSystem from './pages/RankSystem';
import ReferralProgram from './pages/ReferralProgram';
import Rewards from './pages/Rewards';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminCustomers from './pages/admin/AdminCustomers';
import AdminTransactions from './pages/admin/AdminTransactions';
import AdminSettings from './pages/admin/AdminSettings';
import AdminLogs from './pages/admin/AdminLogs';
import Profile from './pages/Profile';
import MasterWallet from './pages/MasterWallet';
import Help from './pages/Help';
import { useUser } from './src/context/UserContext';

const App: React.FC = () => {
  const { profile, loading, logout } = useUser();
  const [showSplash, setShowSplash] = useState(true);

  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (showSplash || loading) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  const is2FAPending = profile && profile.role !== 'admin' && profile.two_factor_pin && sessionStorage.getItem('2fa_verified') !== 'true';
  const isUserAuth = profile && profile.role !== 'admin' && !is2FAPending;
  const isAdminAuth = profile && profile.role === 'admin';

  return (
    <HashRouter>
      <Toaster position="top-right" richColors />
      {!isSupabaseConfigured && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-[10px] font-black uppercase tracking-widest py-2 px-4 text-center shadow-lg">
          Supabase Configuration Missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in AI Studio settings.
        </div>
      )}
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={
          is2FAPending ? <Navigate to="/two-factor" /> :
          isUserAuth ? <Navigate to="/dashboard" /> : 
          isAdminAuth ? <Navigate to="/admin/dashboard" /> : 
          <Landing />
        } />
        <Route path="/landing" element={<Landing />} />
        <Route path="/login" element={
          is2FAPending ? <Navigate to="/two-factor" /> :
          isUserAuth ? <Navigate to="/dashboard" /> : 
          <Login />
        } />
        <Route path="/two-factor" element={
          !profile ? <Navigate to="/login" /> :
          isUserAuth ? <Navigate to="/dashboard" /> :
          <TwoFactorPage />
        } />
        <Route path="/register" element={isUserAuth ? <Navigate to="/dashboard" /> : <Register onLogin={() => {}} />} />
        
        {/* Admin Public Route */}
        <Route path="/admin/login" element={isAdminAuth ? <Navigate to="/admin/dashboard" /> : <AdminLogin onLogin={() => {}} />} />

        {/* User Protected Routes */}
        <Route element={isUserAuth ? <Layout role="user" onLogout={logout} /> : <Navigate to="/" />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/master-wallet" element={<MasterWallet />} />
          <Route path="/binary-tree" element={<BinaryTree />} />
          <Route path="/team-collection" element={<TeamCollection />} />
          <Route path="/ranks" element={<RankSystem />} />
          <Route path="/rewards" element={<Rewards />} />
          <Route path="/referral" element={<ReferralProgram />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/help" element={<Help />} />
        </Route>

        {/* Admin Protected Routes */}
        <Route element={isAdminAuth ? <AdminLayout onLogout={logout} /> : <Navigate to="/" />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminCustomers />} />
          <Route path="/admin/transactions" element={<AdminTransactions />} />
          <Route path="/admin/settings" element={<AdminSettings />} /> 
          <Route path="/admin/logs" element={<AdminLogs />} /> 
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </HashRouter>
  );
};

export default App;
