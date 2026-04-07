import React from 'react';
import { motion } from 'framer-motion';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  className = "", 
  width, 
  height, 
  circle = false 
}) => {
  return (
    <motion.div
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ 
        duration: 1.5, 
        repeat: Infinity, 
        ease: "easeInOut" 
      }}
      className={`bg-white/5 rounded-lg ${circle ? 'rounded-full' : ''} ${className}`}
      style={{ 
        width: width || '100%', 
        height: height || '20px' 
      }}
    />
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="w-full bg-[#111112] border border-white/5 rounded-2xl overflow-hidden mb-8 shadow-2xl">
      <div className="w-full py-3.5 px-6 flex justify-center items-center bg-[#18181b]">
        <Skeleton width="120px" height="12px" />
      </div>
      <div className="p-10 text-center bg-[#0d0d0e]">
        <div className="flex flex-col items-center mb-10">
          <Skeleton width="180px" height="40px" className="mb-4" />
          <Skeleton width="100px" height="10px" />
        </div>
        <div className="flex justify-center gap-4">
          <Skeleton width="100px" height="36px" className="rounded-xl" />
          <Skeleton width="100px" height="36px" className="rounded-xl" />
        </div>
      </div>
    </div>
  );
};
