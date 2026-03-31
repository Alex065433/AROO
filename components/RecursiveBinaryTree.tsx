import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  User, UserPlus, ZoomIn, ZoomOut, Maximize, 
  ChevronDown, ChevronUp, Shield, Award, Zap
} from 'lucide-react';

interface NodeData {
  id: string;
  name: string;
  rank: string;
  status: 'Active' | 'Pending' | 'Vacant';
  joinDate: string;
  totalTeam: number;
  leftBusiness: string;
  rightBusiness: string;
  parentId: string | null;
  side: 'LEFT' | 'RIGHT' | 'ROOT';
  uid?: string;
  team_size?: { left: number; right: number };
  generationIds?: { id: string; gen: number }[];
  nodeCount?: number;
}

interface TreeNodeProps {
  path: string;
  data: Record<string, NodeData>;
  onSelect: (path: string) => void;
  onInvite: (parentId: string, side: 'LEFT' | 'RIGHT') => void;
  level: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ path, data, onSelect, onInvite, level }) => {
  if (level > 100) return null;
  const node = data[path];
  
  // If node doesn't exist, it's a potential vacant spot if its parent exists
  if (!node) return null;

  const leftPath = `${path}-left`;
  const rightPath = `${path}-right`;
  
  const hasLeft = !!data[leftPath];
  const hasRight = !!data[rightPath];
  
  const isVacant = node.status === 'Vacant';

  return (
    <div className="flex flex-col items-center relative">
      {/* The Node Card */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: level * 0.1 }}
        onClick={() => !isVacant && onSelect(path)}
        className={`
          relative z-10 w-48 p-4 rounded-3xl border transition-all cursor-pointer
          ${isVacant 
            ? 'bg-black/20 border-dashed border-white/10 hover:border-orange-500/50' 
            : 'bg-[#111112] border-white/5 hover:border-orange-500/50 shadow-2xl shadow-black'}
          ${node.rank !== 'Partner' ? 'ring-1 ring-orange-500/30' : ''}
        `}
      >
        {isVacant ? (
          <div 
            onClick={(e) => {
              e.stopPropagation();
              onInvite(node.parentId || '', node.side as 'LEFT' | 'RIGHT');
            }}
            className="flex flex-col items-center justify-center py-4 space-y-2 group"
          >
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/20 group-hover:text-orange-500 group-hover:bg-orange-500/10 transition-all">
              <UserPlus size={20} />
            </div>
            <span className="text-[10px] font-black text-white/20 uppercase tracking-widest group-hover:text-orange-500 transition-all">Available</span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header: Avatar & Rank */}
            <div className="flex items-center justify-between">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${node.status === 'Active' ? 'bg-orange-600/20 text-orange-500' : 'bg-slate-800 text-slate-500'}`}>
                <User size={20} />
              </div>
              {node.rank !== 'Partner' && (
                <div className="px-2 py-1 bg-orange-500/10 rounded-lg border border-orange-500/20">
                  <span className="text-[8px] font-black text-orange-500 uppercase tracking-tighter">{node.rank}</span>
                </div>
              )}
            </div>

            {/* User Info */}
            <div>
              <h4 className="text-xs font-black text-white truncate uppercase tracking-tight italic">{node.name}</h4>
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{node.id}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
              <div className="space-y-0.5">
                <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Left Pts</p>
                <p className="text-[10px] font-black text-orange-500 italic">{node.team_size?.left || 0}</p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className="text-[7px] font-black text-slate-600 uppercase tracking-widest">Right Pts</p>
                <p className="text-[10px] font-black text-orange-500 italic">{node.team_size?.right || 0}</p>
              </div>
            </div>
            
            {/* Total Badge */}
            <div className="absolute -top-2 -right-2 px-2 py-1 bg-orange-600 rounded-lg shadow-lg border border-orange-400/20">
              <span className="text-[9px] font-black text-white">{node.totalTeam}</span>
            </div>

            {/* Node Count Badge (Internal IDs) */}
            {node.nodeCount && node.nodeCount > 1 && (
              <div className="absolute -top-2 -left-2 px-2 py-1 bg-blue-600 rounded-lg shadow-lg border border-blue-400/20">
                <span className="text-[9px] font-black text-white">{node.nodeCount}</span>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Children Section */}
      {!isVacant && (
        <div className="relative pt-12 flex">
          {/* Vertical Line from Parent */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-12 bg-gradient-to-b from-orange-500/50 to-orange-500/20" />
          
          {/* Horizontal Connector Line */}
          {(hasLeft || hasRight || true) && (
            <div className="absolute top-12 left-1/4 right-1/4 h-0.5 bg-orange-500/20" />
          )}

          <div className="flex gap-12">
            {/* Left Child */}
            <div className="flex flex-col items-center">
              {hasLeft ? (
                <TreeNode 
                  path={leftPath} 
                  data={data} 
                  onSelect={onSelect} 
                  onInvite={onInvite} 
                  level={level + 1} 
                />
              ) : (
                <TreeNodeVacant 
                  parentId={node.uid || ''} 
                  side="LEFT" 
                  onInvite={onInvite} 
                  level={level + 1} 
                />
              )}
            </div>

            {/* Right Child */}
            <div className="flex flex-col items-center">
              {hasRight ? (
                <TreeNode 
                  path={rightPath} 
                  data={data} 
                  onSelect={onSelect} 
                  onInvite={onInvite} 
                  level={level + 1} 
                />
              ) : (
                <TreeNodeVacant 
                  parentId={node.uid || ''} 
                  side="RIGHT" 
                  onInvite={onInvite} 
                  level={level + 1} 
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TreeNodeVacant: React.FC<{ parentId: string, side: 'LEFT' | 'RIGHT', onInvite: any, level: number }> = ({ parentId, side, onInvite, level }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: level * 0.1 }}
      onClick={() => onInvite(parentId, side)}
      className="w-48 p-4 rounded-3xl border border-dashed border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-orange-500/30 transition-all cursor-pointer group flex flex-col items-center justify-center py-8 space-y-2"
    >
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/10 group-hover:text-orange-500 group-hover:bg-orange-500/10 transition-all">
        <UserPlus size={20} />
      </div>
      <span className="text-[10px] font-black text-white/10 uppercase tracking-widest group-hover:text-orange-500 transition-all">Available</span>
    </motion.div>
  );
};

interface RecursiveBinaryTreeProps {
  data: Record<string, NodeData>;
  onSelect: (path: string) => void;
  onInvite: (parentId: string, side: 'LEFT' | 'RIGHT') => void;
}

export const RecursiveBinaryTree: React.FC<RecursiveBinaryTreeProps> = ({ data, onSelect, onInvite }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startPos.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setPosition({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(prev => Math.min(Math.max(prev * delta, 0.1), 2));
    }
  };

  return (
    <div 
      className="relative w-full h-full bg-[#0a0a0b] overflow-hidden rounded-[40px] border border-white/5 shadow-2xl cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Background Grid */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.05) 1px, transparent 0)`,
          backgroundSize: `${40 * scale}px ${40 * scale}px`,
          transform: `translate(${position.x % (40 * scale)}px, ${position.y % (40 * scale)}px)`
        }}
      />

      {/* Tree Canvas */}
      <div 
        className="absolute transition-transform duration-75 ease-out origin-center"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          left: '50%',
          top: '100px',
          marginLeft: '-96px' // Half of node width
        }}
      >
        <TreeNode 
          path="root" 
          data={data} 
          onSelect={onSelect} 
          onInvite={onInvite} 
          level={0} 
        />
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-8 right-8 flex flex-col gap-2 z-50">
        <button 
          onClick={() => setScale(prev => Math.min(prev * 1.2, 2))}
          className="p-3 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <ZoomIn size={20} />
        </button>
        <button 
          onClick={() => setScale(prev => Math.max(prev * 0.8, 0.1))}
          className="p-3 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <ZoomOut size={20} />
        </button>
        <button 
          onClick={() => {
            setScale(0.6);
            setPosition({ x: 0, y: 0 });
          }}
          className="p-3 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <Maximize size={20} />
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 left-8 p-4 bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Node</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-600" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pending Node</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full border border-dashed border-white/20" />
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Slot</span>
        </div>
      </div>
    </div>
  );
};
