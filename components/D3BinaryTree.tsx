import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, UserPlus, ZoomIn, ZoomOut, Maximize, 
  Share2, X, Copy, Check, ArrowUpRight,
  TrendingUp, Award, Globe, Zap, ShieldCheck
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

interface D3Node extends d3.HierarchyNode<NodeData> {
  x0?: number;
  y0?: number;
}

interface D3BinaryTreeProps {
  data: Record<string, NodeData>;
  onSelect: (id: string) => void;
  onInvite: (parentId: string, side: 'LEFT' | 'RIGHT', parentOperatorId?: string) => void;
  userProfile: any;
}

export const D3BinaryTree: React.FC<D3BinaryTreeProps> = ({ data, onSelect, onInvite, userProfile }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());

  const toggleCollapse = (path: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !data || Object.keys(data).length === 0) return;

    const updateTree = () => {
      if (!svgRef.current || !containerRef.current) return;
      
      // Convert flat data to hierarchical
      const rootNode = data['root'];
      if (!rootNode) return;

      const buildHierarchy = (path: string, depth: number = 0): any => {
        if (depth > 20) return null;
        const node = data[path];
        if (!node) return null;

        const leftPath = `${path}-left`;
        const rightPath = `${path}-right`;

        const children = [];
        const leftChild = buildHierarchy(leftPath, depth + 1);
        const rightChild = buildHierarchy(rightPath, depth + 1);

        // For a binary tree, we want to ensure left is always index 0 and right is index 1
        // even if they are vacant, to maintain visual structure.
        
        // Left child
        if (leftChild) {
          children.push(leftChild);
        } else if (node.status !== 'Vacant') {
          children.push({
            id: `${node.id}-vacant-left`,
            name: 'Vacant',
            status: 'Vacant',
            side: 'LEFT',
            parentId: node.uid,
            parentOperatorId: node.id,
            path: leftPath,
            depth: depth + 1
          });
        }

        // Right child
        if (rightChild) {
          children.push(rightChild);
        } else if (node.status !== 'Vacant') {
          children.push({
            id: `${node.id}-vacant-right`,
            name: 'Vacant',
            status: 'Vacant',
            side: 'RIGHT',
            parentId: node.uid,
            parentOperatorId: node.id,
            path: rightPath,
            depth: depth + 1
          });
        }

        return {
          ...node,
          path,
          depth,
          children: collapsedNodes.has(path) ? null : (children.length > 0 ? children : null),
          _children: children.length > 0 ? children : null,
          isCollapsed: collapsedNodes.has(path),
          hasChildren: children.length > 0
        };
      };

      const hierarchyData = buildHierarchy('root');
      if (!hierarchyData) return;
      
      const root = d3.hierarchy(hierarchyData);

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      // Adjust node spacing for mobile
      const isMobile = width < 768;
      const nodeWidth = isMobile ? 100 : 120;
      const nodeHeight = isMobile ? 120 : 140;

      const treeLayout = d3.tree<NodeData>()
        .nodeSize([nodeWidth * (isMobile ? 1.5 : 2.0), nodeHeight * (isMobile ? 1.2 : 1.4)]);

      treeLayout(root);

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      // Add filters for glow
      const defs = svg.append("defs");
      
      // Gold Glow Filter
      const goldGlow = defs.append("filter")
        .attr("id", "gold-glow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");

      goldGlow.append("feGaussianBlur")
        .attr("stdDeviation", "5")
        .attr("result", "blur");

      goldGlow.append("feComposite")
        .attr("in", "SourceGraphic")
        .attr("in2", "blur")
        .attr("operator", "over");

      const g = svg.append("g");

      const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 3])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
          setZoom(event.transform.k);
        });

      svg.call(zoomBehavior);

      // Initial position - center the root
      const initialScale = isMobile ? 0.4 : 0.6;
      svg.call(zoomBehavior.transform, d3.zoomIdentity.translate(width / 2, 80).scale(initialScale));

      // Links
      const linkGroup = g.selectAll(".link-group")
        .data(root.links())
        .enter()
        .append("g")
        .attr("class", "link-group");

      linkGroup.append("path")
        .attr("class", "link")
        .attr("d", (d: any) => {
          const sourceX = d.source.x;
          const sourceY = d.source.y;
          const targetX = d.target.x;
          const targetY = d.target.y;
          const midY = (sourceY + targetY) / 2;
          
          return `M${sourceX},${sourceY} 
                  V${midY} 
                  H${targetX} 
                  V${targetY}`;
        })
        .attr("fill", "none")
        .attr("stroke", "#c0841a")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", d => d.target.data.status === 'Vacant' ? "4,4" : "none");

      // Nodes
      const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", d => `node ${d.data.status}`)
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("click", (event, d) => {
          event.stopPropagation();
          if (d.data.status === 'Vacant') {
            onInvite(d.data.parentId || '', d.data.side as 'LEFT' | 'RIGHT', (d.data as any).parentOperatorId);
          } else {
            onSelect(d.data.path || 'root');
          }
        });

      // Node Content
      node.each(function(d) {
        const el = d3.select(this);
        const isVacant = d.data.status === 'Vacant';

        if (isVacant) {
          // Vacant Node Style: Circle with +
          el.append("circle")
            .attr("r", 20)
            .attr("fill", "transparent")
            .attr("stroke", "#c0841a")
            .attr("stroke-width", 2);

          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 8)
            .attr("fill", "#c0841a")
            .attr("font-size", "24px")
            .attr("font-weight", "bold")
            .text("+");
        } else {
          // Active Node Style: Avatar Circle + Rounded Rect Label
          
          // Avatar Circle
          el.append("circle")
            .attr("r", 22)
            .attr("cy", -25)
            .attr("fill", "#1e2329")
            .attr("stroke", "#c0841a")
            .attr("stroke-width", 2);

          // User Icon (Simplified)
          const avatarGroup = el.append("g").attr("transform", "translate(0, -25)");
          avatarGroup.append("circle")
            .attr("r", 6)
            .attr("cy", -4)
            .attr("fill", "rgba(255,255,255,0.6)");
          avatarGroup.append("path")
            .attr("d", "M-10,8 Q0,0 10,8")
            .attr("fill", "none")
            .attr("stroke", "rgba(255,255,255,0.6)")
            .attr("stroke-width", 2);

          // Name Label (Rounded Rectangle)
          const labelWidth = 100;
          const labelHeight = 30;
          
          el.append("rect")
            .attr("x", -labelWidth / 2)
            .attr("y", 5)
            .attr("width", labelWidth)
            .attr("height", labelHeight)
            .attr("rx", 8)
            .attr("fill", "#121214")
            .attr("stroke", "#c0841a")
            .attr("stroke-width", 1.5);

          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 25)
            .attr("fill", "white")
            .attr("font-size", "11px")
            .attr("font-weight", "bold")
            .text(d.data.name.length > 12 ? d.data.name.substring(0, 10) + '...' : d.data.name);

          // Downline Numbers (Left | Right)
          if (d.data.team_size) {
            const statsGroup = el.append("g").attr("transform", "translate(0, 45)");
            
            statsGroup.append("text")
              .attr("text-anchor", "middle")
              .attr("fill", "#c0841a")
              .attr("font-size", "10px")
              .attr("font-weight", "bold")
              .text(`${d.data.team_size.left} | ${d.data.team_size.right}`);
          }

          // Node Count indicator (Internal Nodes)
          if (d.data.nodeCount && d.data.nodeCount > 1) {
            const nodeBadge = el.append("g").attr("transform", "translate(25, -40)");
            
            nodeBadge.append("circle")
              .attr("r", 10)
              .attr("fill", "#f08a1d")
              .attr("stroke", "#000")
              .attr("stroke-width", 1);
              
            nodeBadge.append("text")
              .attr("text-anchor", "middle")
              .attr("y", 4)
              .attr("fill", "black")
              .attr("font-size", "9px")
              .attr("font-weight", "bold")
              .text(d.data.nodeCount);
          }
        }
      });
    };

    updateTree();

    // Add ResizeObserver to handle container resizing
    const resizeObserver = new ResizeObserver(() => {
      updateTree();
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [data, collapsedNodes]);

  return (
    <div className="relative w-full h-full bg-[#0a0a0b] overflow-hidden rounded-[40px] border border-white/5 shadow-2xl" ref={containerRef}>
      <svg ref={svgRef} className="w-full h-full" />
      
      {/* Zoom Controls */}
      <div className="absolute bottom-8 right-8 flex flex-col gap-2 z-50">
        <button 
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.transition().call(d3.zoom().scaleBy as any, 1.2);
          }}
          className="p-3 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <ZoomIn size={20} />
        </button>
        <button 
          onClick={() => {
            const svg = d3.select(svgRef.current);
            svg.transition().call(d3.zoom().scaleBy as any, 0.8);
          }}
          className="p-3 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <ZoomOut size={20} />
        </button>
        <button 
          onClick={() => {
            const svg = d3.select(svgRef.current);
            const width = containerRef.current?.clientWidth || 800;
            svg.transition().call(d3.zoom().transform as any, d3.zoomIdentity.translate(width / 2, 100).scale(0.6));
          }}
          className="p-3 bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
        >
          <Maximize size={20} />
        </button>
      </div>

      <style>{`
        .gold-pulse {
          animation: gold-pulse 2s infinite;
        }
        @keyframes gold-pulse {
          0% { stroke-opacity: 1; stroke-width: 2px; }
          50% { stroke-opacity: 0.5; stroke-width: 4px; }
          100% { stroke-opacity: 1; stroke-width: 2px; }
        }
        .node:hover rect {
          stroke: #f97316;
          stroke-width: 3px;
          transition: all 0.3s ease;
        }
        .link {
          transition: all 0.5s ease;
        }
      `}</style>
    </div>
  );
};
