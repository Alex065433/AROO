
import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  ShieldCheck, Users, Settings, BarChart3, 
  LogOut, Menu, Bell, Search, Activity, Database,
  Terminal, ShieldAlert, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArowinLogo } from './ArowinLogo';

const AdminLayout: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [isOpen, setIsOpen] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  const menu = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: BarChart3 },
    { name: 'Customers', path: '/admin/users', icon: Users },
    { name: 'Transactions', path: '/admin/transactions', icon: Activity },
    { name: 'Settings', path: '/admin/settings', icon: Settings },
    { name: 'Admin Logs', path: '/admin/logs', icon: Terminal },
  ];

  const [isDarkMode, setIsDarkMode] = useState(true);

  return (
    <div className={`flex h-screen ${isDarkMode ? 'dark bg-[#020617]' : 'bg-slate-50'} text-slate-900 dark:text-slate-100 overflow-hidden font-inter transition-colors duration-300`}>
      {/* Admin Sidebar */}
      <aside className={`${isOpen ? 'w-72' : 'w-20'} transition-all duration-500 border-r border-slate-200 dark:border-blue-500/10 bg-white dark:bg-[#020617] flex flex-col z-[100] shadow-xl`}>
        <div className="p-6 h-20 flex items-center gap-3 border-b border-slate-100 dark:border-blue-500/5">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/10 flex items-center justify-center shrink-0 overflow-hidden border border-indigo-500/20">
            <ArowinLogo size={32} />
          </div>
          {isOpen && (
            <div className="animate-in fade-in duration-500 overflow-hidden whitespace-nowrap">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-none tracking-tight">AROWIN ADMIN</h1>
              <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Enterprise Panel</p>
            </div>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-6 overflow-y-auto custom-scrollbar">
          {menu.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link key={item.path} to={item.path} className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all group ${
                isActive 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-indigo-600 dark:hover:text-white'
              }`}>
                <Icon size={20} className={isActive ? 'text-white' : 'group-hover:text-indigo-600 dark:group-hover:text-white transition-colors'} />
                {isOpen && <span className="font-bold text-sm tracking-tight">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 dark:border-blue-500/5">
          <button onClick={onLogout} className="flex items-center gap-4 px-4 py-3 text-slate-500 hover:text-rose-500 rounded-xl transition-all w-full group">
            <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
            {isOpen && <span className="font-bold text-sm tracking-tight">Logout</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-[#020617] relative">
        {/* Background Atmosphere */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-600/5 rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none dark:block hidden" />

        <header className="h-20 border-b border-slate-200 dark:border-blue-500/10 bg-white/80 dark:bg-[#020617]/80 backdrop-blur-2xl px-8 flex items-center justify-between z-[90] sticky top-0">
          <div className="flex items-center gap-6 flex-1">
            <button onClick={() => setIsOpen(!isOpen)} className="p-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/5 rounded-xl text-slate-500 dark:text-slate-400 transition-all active:scale-95">
              <Menu size={20} />
            </button>
            
            <div className="relative max-w-md w-full hidden lg:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search transactions, users, logs..." 
                className="w-full bg-slate-100 dark:bg-white/5 border-none rounded-xl pl-12 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden xl:flex flex-col text-right mr-4">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
            </div>

            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl transition-all"
            >
              {isDarkMode ? <Activity size={20} /> : <Database size={20} />}
            </button>

            <div className="relative p-2.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl cursor-pointer transition-all">
              <Bell size={20} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-[#020617]" />
            </div>

            <div className="flex items-center gap-4 border-l border-slate-200 dark:border-blue-500/10 pl-6 ml-2">
              <div className="flex flex-col text-right hidden sm:block">
                <span className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Root Admin</span>
                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Online</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-blue-500/30 flex items-center justify-center overflow-hidden shadow-md">
                 <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Admin" className="w-full h-full" />
              </div>
            </div>
          </div>
        </header>

        <section className="flex-1 overflow-y-auto p-8 lg:p-10 custom-scrollbar z-10">
          <div className="max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  );
};

export default AdminLayout;
