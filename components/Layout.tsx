
import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, GitBranch, Trophy, 
  LogOut, Menu, Gift, Bell, Search, Wallet, Share2, User, X,
  HelpCircle, ChevronRight, AlertCircle, Info, Zap, Cpu,
  Wallet2, ShieldCheck, Home
} from 'lucide-react';
import { RANKS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { ArowinLogo } from './ArowinLogo';
import { supabaseService } from '../services/supabaseService';
import { useUser } from '../src/context/UserContext';

const Layout: React.FC<{ role: 'user' | 'admin', onLogout: () => void }> = ({ role, onLogout }) => {
  const { profile, loading } = useUser();
  const [isOpen, setIsOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile?.id) return;

    const uid = profile.id;
    let isMounted = true;

    const initNotifications = async () => {
      try {
        // Fetch initial notifications
        const initialNotifs = await supabaseService.getNotifications(uid);
        if (isMounted) setNotifications(initialNotifs || []);

        // Subscribe to notifications
        const notifUnsubscribe = supabaseService.onNotificationsChange(uid, async () => {
          const updatedNotifs = await supabaseService.getNotifications(uid);
          if (isMounted) setNotifications(updatedNotifs || []);
        });

        return notifUnsubscribe;
      } catch (err) {
        console.error('Error fetching notifications:', err);
      }
    };

    const cleanupPromise = initNotifications();

    return () => {
      isMounted = false;
      cleanupPromise.then(unsubscribe => {
        if (typeof unsubscribe === 'function') unsubscribe();
      });
    };
  }, [profile?.id]);

  const handleAcknowledgeAll = async () => {
    if (profile?.id) {
      await supabaseService.markNotificationsAsRead(profile.id);
      setNotifications(prev => prev.map(n => ({ ...n, is_new: false })));
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'Just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      return date.toLocaleDateString();
    } catch (e) {
      return 'Recently';
    }
  };

  const currentRankName = profile 
    ? (profile.active_package > 0 
        ? (RANKS.find(r => r.level === (profile.rank || 1))?.name || `Rank ${profile.rank || 1}`)
        : 'Inactive')
    : 'Partner';
  const unreadCount = notifications.filter(n => n.is_new).length;

  const menu = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Referral Program', path: '/referral', icon: Share2 },
    { name: 'Identity Profile', path: '/profile', icon: User },
    { name: 'Team Collection', path: '/team-collection', icon: Wallet2 },
    { name: 'Binary Tree', path: '/binary-tree', icon: GitBranch },
    { name: 'Rank Ladder', path: '/ranks', icon: Trophy },
    { name: 'Rewards', path: '/rewards', icon: Gift },
    { name: 'Support & Help', path: '/help', icon: HelpCircle },
    ...(profile?.role === 'admin' ? [{ name: 'Admin Panel', path: '/admin/dashboard', icon: ShieldCheck }] : []),
  ];

  const SidebarContent = () => (
    <>
      <div className="p-6 flex items-center gap-3 h-24 border-b border-white/5 bg-black/20">
        <div className="w-12 h-12 flex items-center justify-center shrink-0">
           <ArowinLogo size={48} />
        </div>
        {(isOpen || mobileMenuOpen) && (
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter text-white uppercase leading-none">AROWIN</h1>
            <span className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-1">TRADING PORTAL</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-1 mt-8 overflow-y-auto custom-scrollbar">
        {menu.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Link 
              key={item.path} 
              to={item.path} 
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all group ${
                isActive ? 'bg-amber-500/10 text-amber-400 shadow-inner border border-amber-500/10' : 'text-slate-500 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-amber-500' : 'group-hover:text-blue-400 transition-colors'} />
              {(isOpen || mobileMenuOpen) && <span className="font-bold text-sm tracking-wide">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <button onClick={onLogout} className="flex items-center gap-4 px-5 py-4 text-slate-500 hover:text-amber-500 rounded-xl transition-colors w-full group text-left">
          <LogOut size={20} className="group-hover:text-amber-500" />
          {(isOpen || mobileMenuOpen) && <span className="font-bold text-[11px] uppercase tracking-[0.2em] text-left">Sign Out Terminal</span>}
        </button>
      </div>
    </>
  );

  const bottomMenu = [
    { name: 'Home', path: '/dashboard', icon: Home },
    { name: 'Tree', path: '/binary-tree', icon: GitBranch },
    { name: 'Team', path: '/team-collection', icon: Wallet2 },
    { name: 'Ranks', path: '/ranks', icon: Trophy },
    { name: 'Profile', path: '/profile', icon: User },
  ];

  return (
    <div className="flex h-screen bg-[#0a0a0b] text-slate-100 font-inter overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={`hidden lg:flex ${isOpen ? 'w-72' : 'w-24'} transition-all duration-300 border-r border-white/5 bg-[#0a0a0b] flex-col shadow-2xl z-50`}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute top-0 left-0 bottom-0 w-72 bg-[#0a0a0b] border-r border-white/10 flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
             <div className="absolute top-6 right-6 lg:hidden">
                <button onClick={() => setMobileMenuOpen(false)} className="text-slate-500 hover:text-white">
                   <X size={24} />
                </button>
             </div>
             <SidebarContent />
          </aside>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0b] relative overflow-hidden pb-20 lg:pb-0">
        {/* Decorative background glow - Navy and Amber */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-amber-600/5 rounded-full blur-[100px] -ml-64 -mb-64 pointer-events-none" />

        <header className="h-16 md:h-20 border-b border-white/5 bg-[#0a0a0b]/80 backdrop-blur-md px-4 md:px-8 flex items-center justify-between z-40 sticky top-0">
          <div className="flex items-center gap-3 md:gap-6 flex-1">
            <button onClick={() => {
              if (window.innerWidth < 1024) setMobileMenuOpen(true);
              else setIsOpen(!isOpen);
            }} className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
              <Menu size={24} />
            </button>
            
            <div className="flex items-center gap-2 md:gap-3 lg:hidden">
              <ArowinLogo size={28} />
              <span className="font-black text-white text-[10px] md:text-xs tracking-tighter uppercase">AROWIN</span>
            </div>

            <div className="relative hidden md:block w-full max-w-lg ml-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600" size={16} />
              <input 
                type="text" 
                placeholder="Search arowin network assets..." 
                className="w-full bg-[#161618] border border-white/5 rounded-xl pl-12 pr-4 py-2.5 text-sm text-slate-300 focus:outline-none focus:border-amber-500/20 transition-all placeholder:text-slate-700" 
              />
            </div>
          </div>

          <div className="flex items-center gap-3 lg:gap-8">
            <div className="relative p-2 text-slate-400 hover:text-white cursor-pointer transition-colors">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative">
                <Bell size={20} className={unreadCount > 0 ? 'text-amber-400' : ''} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-600 rounded-full border-2 border-[#0a0a0b] text-[7px] font-black flex items-center justify-center text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              <AnimatePresence>
                {notifOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-40" 
                      onClick={() => setNotifOpen(false)} 
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-4 w-96 bg-[#111114] border border-white/10 rounded-[32px] shadow-2xl z-50 overflow-hidden"
                    >
                      <div className="px-8 py-6 bg-white/[0.02] border-b border-white/5 flex justify-between items-center">
                        <h4 className="text-sm font-black uppercase tracking-widest text-white">Network Pulse</h4>
                        <button 
                          onClick={handleAcknowledgeAll}
                          className="text-[10px] font-black text-amber-500 uppercase hover:text-amber-400 transition-colors"
                        >
                          Acknowledge All
                        </button>
                      </div>
                      <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {notifications.length > 0 ? (
                          notifications.map((n) => (
                            <div key={n.id} className={`p-6 border-b border-white/5 hover:bg-white/[0.02] transition-all relative group ${n.is_new ? 'bg-amber-500/[0.03]' : ''}`}>
                               <div className="flex gap-4">
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    n.type === 'alert' ? 'bg-red-500/10 text-red-500' : 
                                    n.type === 'reward' ? 'bg-amber-500/10 text-amber-500' : 
                                    'bg-blue-500/10 text-blue-500'
                                  }`}>
                                     {n.type === 'alert' ? <AlertCircle size={18} /> : n.type === 'reward' ? <Zap size={18} /> : <Info size={18} />}
                                  </div>
                                  <div className="flex-1 space-y-1">
                                     <div className="flex justify-between items-start">
                                        <h5 className="text-xs font-black text-white uppercase tracking-tight">{n.title}</h5>
                                        <span className="text-[8px] font-black text-slate-600 uppercase">{formatTime(n.created_at)}</span>
                                     </div>
                                     <p className="text-[10px] text-slate-400 leading-relaxed font-medium line-clamp-2">
                                        {n.message}
                                     </p>
                                  </div>
                               </div>
                               {n.is_new && (
                                 <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                               )}
                            </div>
                          ))
                        ) : (
                          <div className="py-20 text-center text-slate-600">
                             <Bell size={40} className="mx-auto opacity-20 mb-4" />
                             <p className="text-xs font-black uppercase tracking-widest">No Active Alerts</p>
                          </div>
                        )}
                      </div>
                      <button className="w-full py-4 bg-white/[0.02] hover:bg-white/[0.05] transition-all text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest border-t border-white/5">
                        Expand Event Ledger <ChevronRight size={12} className="inline ml-1" />
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            
            <div className="flex items-center gap-4 border-l border-white/5 pl-4 lg:pl-8">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-black text-white tracking-tight">{profile?.name || 'Loading...'}</p>
                <p className="text-[9px] text-amber-500 uppercase font-black tracking-widest leading-none mt-1">OPERATOR • {currentRankName}</p>
              </div>
              <div 
                onClick={() => navigate('/profile')}
                className="w-10 h-10 rounded-full border-2 border-slate-700 overflow-hidden cursor-pointer hover:border-amber-500 transition-all bg-slate-800 shadow-xl"
              >
                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.name || 'User'}`} alt="Avatar" className="w-full h-full" />
              </div>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 custom-scrollbar z-10">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-10">
            <Outlet />
          </div>
        </section>

        {/* Mobile Bottom Navigation */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0a0a0b]/90 backdrop-blur-xl border-t border-white/5 flex items-center justify-around px-2 z-[60]">
          {bottomMenu.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all ${
                  isActive ? 'text-amber-500' : 'text-slate-500'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-amber-500' : ''} />
                <span className={`text-[9px] font-black uppercase tracking-widest ${isActive ? 'text-amber-500' : 'text-slate-600'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
};

export default Layout;
