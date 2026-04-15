
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
          className="fixed inset-0 z-[9999] bg-[#050505] flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Background Effects */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#C5A059]/10 blur-[120px] rounded-full" />
          </div>

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 flex flex-col items-center"
          >
            <div className="relative mb-12">
              <motion.div
                animate={{ 
                  scale: [1, 1.05, 1],
                  opacity: [0.3, 0.5, 0.3]
                }}
                transition={{ 
                  duration: 4, repeat: Infinity, ease: "easeInOut" 
                }}
                className="absolute inset-0 bg-[#C5A059]/20 blur-3xl rounded-full scale-150"
              />
              <ArowinLogo size={100} className="text-[#C5A059]" />
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <h1 className="text-3xl font-light tracking-[0.2em] text-white mb-4">
                AROWIN
              </h1>
              <div className="flex items-center justify-center gap-4">
                <div className="h-[1px] w-12 bg-white/10" />
                <p className="text-[9px] font-bold text-[#C5A059] uppercase tracking-[0.6em]">
                  Institutional
                </p>
                <div className="h-[1px] w-12 bg-white/10" />
              </div>
            </motion.div>
          </motion.div>

          {/* Loading Bar */}
          <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-white/5 overflow-hidden">
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 2.5, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full bg-[#C5A059]"
            />
          </div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="absolute bottom-12 text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]"
          >
            Initializing Secure Protocol v4.0.2
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
