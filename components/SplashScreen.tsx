
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArowinLogo } from './ArowinLogo';

export const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 500); // Wait for exit animation
    }, 2500);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-[#020617] flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Background Effects */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/20 blur-[120px] rounded-full" />
            <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-indigo-600/10 blur-[100px] rounded-full" />
          </div>

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative z-10 flex flex-col items-center"
          >
            <div className="relative mb-8">
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  rotate: { duration: 20, repeat: Infinity, ease: "linear" },
                  scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
                }}
                className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full scale-150"
              />
              <ArowinLogo size={120} />
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-center"
            >
              <h1 className="text-4xl font-black tracking-tighter text-white mb-2 italic font-display">
                AROWIN <span className="text-amber-500">TRADING</span>
              </h1>
              <div className="flex items-center justify-center gap-3">
                <div className="h-[1px] w-8 bg-slate-800" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em]">
                  Premium Financial Network
                </p>
                <div className="h-[1px] w-8 bg-slate-800" />
              </div>
            </motion.div>
          </motion.div>

          {/* Loading Bar */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-48 h-[2px] bg-slate-900 rounded-full overflow-hidden">
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 2, ease: "easeInOut" }}
              className="w-full h-full bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="absolute bottom-12 text-[9px] font-bold text-slate-700 uppercase tracking-[0.2em]"
          >
            Initializing Secure Protocol v4.0.2
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
