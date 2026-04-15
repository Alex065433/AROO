
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
  Star,
  Accessibility
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ArowinLogo } from '../components/ArowinLogo';

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-[#C5A059]/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-8 h-24 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <ArowinLogo size={32} className="text-[#C5A059]" />
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight leading-none">AROWIN</span>
              <span className="text-[10px] uppercase tracking-[0.3em] text-[#C5A059] font-medium">Institutional</span>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-10">
            {['Features', 'Ecosystem', 'Security'].map((item) => (
              <a 
                key={item} 
                href={`#${item.toLowerCase()}`} 
                className="text-[11px] uppercase tracking-[0.2em] font-medium text-white/50 hover:text-white transition-colors"
              >
                {item}
              </a>
            ))}
            <div className="h-4 w-px bg-white/10" />
            <Link to="/login" className="text-[11px] uppercase tracking-[0.2em] font-medium text-white/50 hover:text-white transition-colors">Login</Link>
            <Link 
              to="/register" 
              className="px-8 py-3 bg-white text-black text-[11px] uppercase tracking-[0.2em] font-bold rounded-full hover:bg-[#C5A059] hover:text-white transition-all duration-300"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile Menu Toggle (Simplified) */}
          <div className="md:hidden flex items-center gap-4">
            <Link to="/login" className="text-[10px] uppercase tracking-widest font-bold">Login</Link>
            <Link to="/register" className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-black">
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section - Split Layout */}
      <section className="relative min-h-screen flex items-center pt-24">
        <div className="max-w-7xl mx-auto px-8 w-full grid lg:grid-cols-2 gap-20 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-3 mb-8">
              <div className="w-12 h-px bg-[#C5A059]" />
              <span className="text-[10px] uppercase tracking-[0.4em] text-[#C5A059] font-bold">London • Singapore • New York</span>
            </div>
            
            <h1 className="text-6xl md:text-[112px] font-light leading-[0.9] tracking-[-0.04em] mb-10">
              The Future of <br />
              <span className="font-serif italic text-[#C5A059]">Digital Assets</span>
            </h1>
            
            <p className="text-lg text-white/50 leading-relaxed mb-12 max-w-md font-light">
              Arowin provides institutional-grade liquidity and advanced algorithmic trading infrastructure for the modern financial landscape.
            </p>
            
            <div className="flex items-center gap-8">
              <Link 
                to="/register" 
                className="group flex items-center gap-4 text-[12px] uppercase tracking-[0.3em] font-bold"
              >
                <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-500">
                  <ArrowRight size={24} />
                </div>
                <span>Open Account</span>
              </Link>
              
              <div className="hidden sm:flex flex-col">
                <span className="text-2xl font-light">$1.2B+</span>
                <span className="text-[9px] uppercase tracking-widest text-white/30">Quarterly Volume</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
            className="relative aspect-[4/5] lg:aspect-square"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-[#C5A059]/20 to-transparent rounded-[40px] -z-10 blur-3xl opacity-30" />
            <img 
              src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop" 
              alt="Architectural Detail" 
              className="w-full h-full object-cover rounded-[40px] grayscale hover:grayscale-0 transition-all duration-1000 shadow-2xl"
              referrerPolicy="no-referrer"
            />
            
            {/* Floating Data Point */}
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-10 -left-10 bg-[#0A0A0A] border border-white/10 p-8 rounded-3xl shadow-2xl backdrop-blur-xl max-w-[240px]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 rounded-full bg-[#C5A059] animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest text-white/40">Market Status</span>
              </div>
              <div className="text-3xl font-light mb-2">99.98%</div>
              <div className="text-[9px] uppercase tracking-widest text-[#C5A059]">Uptime Guaranteed</div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-24 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-8 flex flex-wrap justify-between items-center gap-12 opacity-30 grayscale">
          {['GOLDMAN', 'MORGAN', 'CITI', 'HSBC', 'BARCLAYS'].map((bank) => (
            <span key={bank} className="text-xl font-black tracking-tighter">{bank}</span>
          ))}
        </div>
      </section>

      {/* Features - Grid Layout */}
      <section id="features" className="py-40">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid lg:grid-cols-3 gap-1px bg-white/5 border border-white/5">
            {[
              {
                title: "Execution",
                desc: "Proprietary low-latency matching engine designed for high-frequency institutional flows.",
                icon: <Zap size={20} />
              },
              {
                title: "Custody",
                desc: "Multi-signature cold storage and insurance-backed asset protection protocols.",
                icon: <Shield size={20} />
              },
              {
                title: "Analytics",
                desc: "Real-time data visualization and predictive modeling for informed decision making.",
                icon: <BarChart3 size={20} />
              }
            ].map((feature, i) => (
              <div key={i} className="bg-[#050505] p-16 group hover:bg-white transition-all duration-700">
                <div className="text-[#C5A059] mb-12 group-hover:text-black transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-light mb-6 group-hover:text-black transition-colors">{feature.title}</h3>
                <p className="text-white/40 leading-relaxed group-hover:text-black/60 transition-colors">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision Section */}
      <section className="py-40 bg-[#0A0A0A]">
        <div className="max-w-7xl mx-auto px-8 grid lg:grid-cols-2 gap-32 items-center">
          <div className="order-2 lg:order-1">
            <h2 className="text-5xl font-light leading-tight mb-12">
              A Vision of <br />
              <span className="font-serif italic text-[#C5A059]">Global Integrity</span>
            </h2>
            <div className="space-y-12">
              <div>
                <h4 className="text-[10px] uppercase tracking-[0.3em] text-[#C5A059] font-bold mb-4">01 / Regulation</h4>
                <p className="text-white/50 leading-relaxed max-w-md">
                  Operating under the stringent standards of UK financial frameworks, ensuring transparency at every level of the ecosystem.
                </p>
              </div>
              <div>
                <h4 className="text-[10px] uppercase tracking-[0.3em] text-[#C5A059] font-bold mb-4">02 / Innovation</h4>
                <p className="text-white/50 leading-relaxed max-w-md">
                  Bridging the gap between traditional finance and decentralized possibilities through advanced binary algorithms.
                </p>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2 relative">
            <div className="aspect-[3/4] rounded-[40px] overflow-hidden">
              <img 
                src="https://images.unsplash.com/photo-1554469384-e58fac16e23a?q=80&w=1974&auto=format&fit=crop" 
                alt="Office" 
                className="w-full h-full object-cover grayscale"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-[#C5A059] rounded-full flex items-center justify-center p-12 text-black text-center">
              <p className="font-serif italic text-xl leading-tight">"Integrity is the only currency that never devalues."</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-60 text-center">
        <div className="max-w-4xl mx-auto px-8">
          <h2 className="text-6xl md:text-8xl font-light tracking-tighter mb-16">
            Ready to <span className="font-serif italic text-[#C5A059]">Ascend?</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <Link 
              to="/register" 
              className="px-12 py-6 bg-white text-black text-[12px] uppercase tracking-[0.3em] font-bold rounded-full hover:bg-[#C5A059] hover:text-white transition-all duration-500"
            >
              Initialize Account
            </Link>
            <Link 
              to="/login" 
              className="text-[12px] uppercase tracking-[0.3em] font-bold border-b border-white/20 pb-2 hover:border-[#C5A059] transition-all"
            >
              Existing Partner Login
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-24 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid md:grid-cols-4 gap-20 mb-24">
            <div className="col-span-2">
              <div className="flex items-center gap-4 mb-8">
                <ArowinLogo size={24} className="text-[#C5A059]" />
                <span className="text-sm font-bold tracking-widest">AROWIN</span>
              </div>
              <p className="text-white/30 text-sm leading-relaxed max-w-xs">
                Arowin Institutional Trading. <br />
                Registered in the United Kingdom. <br />
                Serving global markets with precision.
              </p>
            </div>
            <div>
              <h5 className="text-[10px] uppercase tracking-[0.3em] text-white/50 font-bold mb-8">Navigation</h5>
              <ul className="space-y-4 text-sm text-white/30">
                <li><a href="#" className="hover:text-white transition-colors">Platform</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Ecosystem</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Security</a></li>
              </ul>
            </div>
            <div>
              <h5 className="text-[10px] uppercase tracking-[0.3em] text-white/50 font-bold mb-8">Legal</h5>
              <ul className="space-y-4 text-sm text-white/30">
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Compliance</a></li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 pt-12 border-t border-white/5">
            <span className="text-[10px] uppercase tracking-widest text-white/20">© 2026 Arowin Institutional. All rights reserved.</span>
            <div className="flex gap-8">
              {['TW', 'LI', 'IG'].map((social) => (
                <a key={social} href="#" className="text-[10px] font-bold text-white/20 hover:text-[#C5A059] transition-colors">{social}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
