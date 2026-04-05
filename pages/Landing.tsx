
import React from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Shield, 
  Zap, 
  Globe, 
  ArrowRight, 
  CheckCircle2, 
  BarChart3, 
  Users, 
  Lock,
  ChevronRight,
  Play,
  Star
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArowinLogo } from '../components/ArowinLogo';
import { useUser } from '../src/context/UserContext';

const Landing: React.FC = () => {
  const { user, profile } = useUser();
  const isAuthenticated = !!user;
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-amber-500/30">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/50 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ArowinLogo size={32} className="sm:w-10 sm:h-10 drop-shadow-[0_0_10px_rgba(251,191,36,0.3)]" />
            <span className="text-lg sm:text-xl font-black tracking-tighter uppercase font-display">
              Arowin<span className="text-amber-500 hidden sm:inline">Trading</span>
            </span>
          </div>

          {/* Mobile Auth Buttons */}
          <div className="flex md:hidden items-center gap-3">
            {isAuthenticated ? (
              <Link 
                to={isAdmin ? "/admin/dashboard" : "/dashboard"} 
                className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-500/40"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link 
                  to="/login" 
                  className="px-4 py-2 bg-white/5 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-white/10 transition-all"
                >
                  Login
                </Link>
                <Link 
                  to="/register" 
                  className="px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-amber-500/40 animate-pulse"
                >
                  Join Now
                </Link>
              </>
            )}
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Features</a>
            <a href="#ecosystem" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Ecosystem</a>
            <a href="#security" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Security</a>
            {isAuthenticated ? (
              <Link 
                to={isAdmin ? "/admin/dashboard" : "/dashboard"} 
                className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-full transition-all hover:scale-105 active:scale-95"
              >
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">Login</Link>
                <Link 
                  to="/register" 
                  className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-bold rounded-full transition-all hover:scale-105 active:scale-95"
                >
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-amber-500/10 blur-[120px] rounded-full -z-10" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-orange-500/5 blur-[100px] rounded-full -z-10" />

        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-widest mb-6">
                <Star size={14} />
                Established in the United Kingdom
              </div>
              <h1 className="text-6xl md:text-8xl font-black leading-[1.1] mb-8 tracking-tight font-display italic">
                Master the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">Markets</span> with Precision.
              </h1>
              <p className="text-xl text-slate-400 leading-relaxed mb-10 max-w-xl">
                Arowin Trading provides a high-performance ecosystem for digital asset growth, combining advanced binary algorithms with institutional-grade security.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link 
                  to="/register" 
                  className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-black rounded-2xl flex items-center gap-3 transition-all hover:scale-105 shadow-xl shadow-amber-500/20"
                >
                  Start Trading Now
                  <ArrowRight size={20} />
                </Link>
              </div>

              <div className="mt-12 flex items-center gap-8 grayscale opacity-50">
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-white">50K+</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Active Traders</span>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-white">$1.2B</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Trading Volume</span>
                </div>
                <div className="w-px h-10 bg-white/10" />
                <div className="flex flex-col">
                  <span className="text-2xl font-bold text-white">99.9%</span>
                  <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Uptime</span>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
              style={{ perspective: 1000 }}
              className="relative"
            >
              <motion.div 
                whileHover={{ rotateY: 10, rotateX: -5 }}
                className="relative z-10 bg-gradient-to-br from-white/10 to-white/5 p-4 rounded-3xl border border-white/10 backdrop-blur-sm shadow-2xl"
              >
                <img 
                  src="https://images.unsplash.com/photo-1611974717484-54078832a819?q=80&w=2070&auto=format&fit=crop" 
                  alt="Trading Interface" 
                  className="rounded-2xl shadow-inner"
                  referrerPolicy="no-referrer"
                />
                
                {/* Floating Elements */}
                <div className="absolute -top-6 -right-6 bg-amber-500 p-4 rounded-2xl shadow-xl animate-bounce">
                  <TrendingUp size={24} className="text-black" />
                </div>
                <div className="absolute -bottom-10 -left-10 bg-[#111] border border-white/10 p-6 rounded-2xl shadow-2xl max-w-[200px]">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Live Profit</p>
                  <p className="text-2xl font-black text-amber-500">+$2,450.00</p>
                  <div className="w-full h-1 bg-amber-500/20 rounded-full mt-3">
                    <div className="w-3/4 h-full bg-amber-500 rounded-full" />
                  </div>
                </div>
              </motion.div>
              
              {/* Decorative Rings */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] border border-amber-500/10 rounded-full -z-10 animate-pulse" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[140%] h-[140%] border border-amber-500/5 rounded-full -z-10" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section className="py-32 bg-black relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/5 blur-[120px] rounded-full -z-10" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="relative z-10 rounded-[40px] overflow-hidden border border-white/10 shadow-2xl">
                <img 
                  src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop" 
                  alt="United Kingdom Headquarters" 
                  className="w-full h-[500px] object-cover hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                <div className="absolute bottom-8 left-8">
                  <p className="text-amber-500 font-black uppercase tracking-[0.3em] text-xs mb-2">Established in</p>
                  <h3 className="text-3xl font-display italic font-bold">United Kingdom</h3>
                </div>
              </div>
              
              {/* 3D Floating Card for Founder */}
              <motion.div 
                animate={{ y: [0, -20, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-10 -right-10 z-20 bg-[#111] border border-white/10 p-8 rounded-3xl shadow-2xl max-w-[280px] backdrop-blur-xl"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xl">
                    A
                  </div>
                  <div>
                    <h4 className="font-display text-xl font-bold">Alex</h4>
                    <p className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">Founder & CEO</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed italic">
                  "Our mission is to democratize high-frequency trading through a secure, UK-based ecosystem that empowers every partner."
                </p>
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight font-display italic">
                The Visionary Behind <span className="text-amber-500">Arowin</span>
              </h2>
              <p className="text-xl text-slate-400 leading-relaxed mb-8">
                Founded by <span className="text-white font-bold">Alex</span>, Arowin Trading was established in the <span className="text-white font-bold">United Kingdom</span> with a singular vision: to bridge the gap between institutional-grade financial tools and the global trading community.
              </p>
              <div className="space-y-6">
                <div className="flex items-center gap-4 p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-amber-500/20 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold">UK Regulatory Standards</h4>
                    <p className="text-sm text-slate-500">Operating with the transparency and integrity of British financial excellence.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-6 rounded-2xl bg-white/5 border border-white/5 hover:border-amber-500/20 transition-all">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <Globe size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold">Global Reach, Local Roots</h4>
                    <p className="text-sm text-slate-500">A London-born vision serving traders in over 120 countries.</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-32 bg-[#080808]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black mb-6 font-display italic">
              Engineered for <span className="text-amber-500">Excellence</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Our platform is built on a foundation of speed, security, and scalability, ensuring you stay ahead in the rapidly evolving digital markets.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8" style={{ perspective: 1000 }}>
            {[
              {
                icon: <Zap className="text-amber-500" />,
                title: "Ultra-Fast Execution",
                desc: "Execute trades in milliseconds with our high-frequency trading engine optimized for speed."
              },
              {
                icon: <Shield className="text-orange-500" />,
                title: "Institutional Security",
                desc: "Multi-layer encryption and cold storage protocols keep your assets safe at all times."
              },
              {
                icon: <Globe className="text-amber-400" />,
                title: "Global Ecosystem",
                desc: "Connect with a worldwide network of traders and access global markets 24/7."
              },
              {
                icon: <BarChart3 className="text-orange-400" />,
                title: "Advanced Analytics",
                desc: "Gain deep insights with our comprehensive suite of technical analysis tools."
              },
              {
                icon: <Users className="text-amber-600" />,
                title: "Binary Network",
                desc: "Leverage our unique binary matching system to grow your network and maximize earnings."
              },
              {
                icon: <Lock className="text-orange-600" />,
                title: "Privacy First",
                desc: "We prioritize your data privacy with state-of-the-art anonymity features."
              }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ rotateY: 10, rotateX: -5, translateY: -10 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-8 rounded-[32px] bg-white/5 border border-white/5 hover:border-amber-500/30 transition-all group cursor-default"
              >
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-4 font-display group-hover:text-amber-400 transition-colors">{feature.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Ecosystem Section */}
      <section id="ecosystem" className="py-32 relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-amber-500/10 blur-[100px] rounded-full -z-10" />
        
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-gradient-to-br from-white/10 to-transparent rounded-[40px] border border-white/10 p-12 md:p-20 relative overflow-hidden">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight font-display italic">
                  The Arowin <span className="text-amber-500">Ecosystem</span>
                </h2>
                <div className="space-y-6">
                  {[
                    "Direct Referral Yield: Earn 5% on every direct connection.",
                    "Binary Matching Dividend: 10% matching on team volume.",
                    "Rank Protocol Bonus: Unlock massive rewards as you grow.",
                    "Incentive Pool Accrual: Share in the global success of the platform."
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-4">
                      <div className="mt-1 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 size={14} className="text-amber-500" />
                      </div>
                      <p className="text-slate-300 font-medium">{item}</p>
                    </div>
                  ))}
                </div>
                <Link 
                  to="/register" 
                  className="mt-10 inline-flex items-center gap-3 text-amber-400 font-bold hover:text-amber-300 transition-colors group"
                >
                  Learn more about rewards
                  <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.8, rotateY: 20 }}
                whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                viewport={{ once: true }}
                style={{ perspective: 1000 }}
                className="relative"
              >
                <motion.div 
                  whileHover={{ rotateY: -10, rotateX: 5 }}
                  className="aspect-square rounded-full border-2 border-dashed border-white/10 animate-[spin_60s_linear_infinite] flex items-center justify-center"
                >
                  <div className="w-3/4 h-3/4 rounded-full border-2 border-dashed border-amber-500/20 animate-[spin_30s_linear_infinite_reverse]" />
                </motion.div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center shadow-2xl shadow-amber-500/50">
                  <TrendingUp size={48} className="text-black" />
                </div>
                
                {/* Floating Icons */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#111] border border-white/10 rounded-2xl flex items-center justify-center shadow-xl">
                  <Users className="text-amber-500" />
                </div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-16 h-16 bg-[#111] border border-white/10 rounded-2xl flex items-center justify-center shadow-xl">
                  <BarChart3 className="text-amber-500" />
                </div>
                <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#111] border border-white/10 rounded-2xl flex items-center justify-center shadow-xl">
                  <Shield className="text-amber-500" />
                </div>
                <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-[#111] border border-white/10 rounded-2xl flex items-center justify-center shadow-xl">
                  <Zap className="text-amber-500" />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-12 md:p-20 rounded-[40px] bg-gradient-to-b from-amber-500 to-orange-600 text-black"
          >
            <h2 className="text-4xl md:text-7xl font-black mb-8 leading-tight font-display">
              Ready to redefine your trading journey?
            </h2>
            <p className="text-black/70 text-xl font-medium mb-10 max-w-xl mx-auto">
              Join thousands of successful traders who have already made the switch to Arowin Trading.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link 
                to="/register" 
                className="px-10 py-5 bg-black text-white font-black rounded-2xl hover:scale-105 transition-all shadow-2xl"
              >
                Create Free Account
              </Link>
              <Link 
                to="/login" 
                className="px-10 py-5 bg-white/20 text-black font-black rounded-2xl hover:bg-white/30 transition-all"
              >
                Sign In
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-white/5 bg-[#030303]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-2">
              <div className="flex items-center gap-3 mb-6">
                <ArowinLogo size={32} />
                <span className="text-lg font-black tracking-tighter uppercase font-display">
                  Arowin<span className="text-amber-500">Trading</span>
                </span>
              </div>
              <p className="text-slate-500 max-w-sm leading-relaxed">
                Arowin Trading is a global leader in digital asset trading solutions, providing innovative tools and a robust ecosystem for traders worldwide.
              </p>
            </div>
            
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest mb-6">Platform</h4>
              <ul className="space-y-4 text-slate-500 text-sm font-medium">
                <li><a href="#" className="hover:text-amber-500 transition-colors">Trading</a></li>
                <li><a href="#" className="hover:text-amber-500 transition-colors">Ecosystem</a></li>
                <li><a href="#" className="hover:text-amber-500 transition-colors">Rewards</a></li>
                <li><a href="#" className="hover:text-amber-500 transition-colors">Security</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest mb-6">Company</h4>
              <ul className="space-y-4 text-slate-500 text-sm font-medium">
                <li><a href="#" className="hover:text-amber-500 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-amber-500 transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-amber-500 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-amber-500 transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-10 border-t border-white/5">
            <p className="text-slate-600 text-xs font-medium">
              © 2026 Arowin Trading. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-slate-600 hover:text-white transition-colors"><Globe size={18} /></a>
              <a href="#" className="text-slate-600 hover:text-white transition-colors"><Users size={18} /></a>
              <a href="#" className="text-slate-600 hover:text-white transition-colors"><BarChart3 size={18} /></a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
