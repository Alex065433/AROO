import React, { useEffect, useRef, useState } from 'react';
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
  onInvite: (parentId: string, side: 'LEFT' | 'RIGHT') => void;
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
        if (depth > 100) return null;
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
      const nodeWidth = isMobile ? 120 : 140;
      const nodeHeight = isMobile ? 160 : 180;

      const treeLayout = d3.tree<NodeData>()
        .nodeSize([nodeWidth * (isMobile ? 1.3 : 1.6), nodeHeight * (isMobile ? 1.3 : 1.6)]);

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
      const linkGenerator = d3.linkVertical<any, any>()
        .x(d => d.x)
        .y(d => d.y);

      const linkGroup = g.selectAll(".link-group")
        .data(root.links())
        .enter()
        .append("g")
        .attr("class", "link-group");

      linkGroup.append("path")
        .attr("class", "link")
        .attr("d", linkGenerator)
        .attr("fill", "none")
        .attr("stroke", d => d.target.data.status === 'Vacant' ? "rgba(255,255,255,0.05)" : "rgba(249,115,22,0.3)")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", d => d.target.data.status === 'Vacant' ? "5,5" : "none");

      // Link Labels
      linkGroup.append("text")
        .attr("class", "link-label")
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2)
        .attr("dy", -5)
        .attr("text-anchor", "middle")
        .attr("fill", d => d.target.data.status === 'Vacant' ? "rgba(255,255,255,0.1)" : "rgba(249,115,22,0.5)")
        .attr("font-size", "8px")
        .attr("font-weight", "black")
        .text(d => d.target.data.side);

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
            onInvite(d.data.parentId || '', d.data.side as 'LEFT' | 'RIGHT');
          } else {
            // If it has children, toggle collapse on double click or specific area?
            // Let's make a single click on the node select it, and a click on a collapse button toggle it.
            // Actually, let's use Alt+Click or a dedicated button.
            // For now, let's just toggle if it has children and we click the node, 
            // but we also need to allow selection.
            // Better: Toggle if clicking the "expand/collapse" icon, select if clicking the node.
            onSelect(d.data.path || 'root');
          }
        });

      // Collapse/Expand Button
      const collapseBtn = node.filter(d => d.data.hasChildren)
        .append("g")
        .attr("class", "collapse-btn")
        .attr("transform", `translate(0, ${nodeHeight / 2})`)
        .on("click", (event, d) => {
          event.stopPropagation();
          toggleCollapse(d.data.path || '');
        });

      collapseBtn.append("circle")
        .attr("r", 12)
        .attr("fill", "#1e2329")
        .attr("stroke", "#f97316")
        .attr("stroke-width", 2);

      collapseBtn.append("text")
        .attr("text-anchor", "middle")
        .attr("y", 4)
        .attr("fill", "#f97316")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .text(d => d.data.isCollapsed ? "+" : "−");

      // Node Background
      node.append("rect")
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("x", -nodeWidth / 2)
        .attr("y", -nodeHeight / 2)
        .attr("rx", 20)
        .attr("fill", d => d.data.status === 'Vacant' ? "rgba(15, 15, 16, 0.4)" : "#111112")
        .attr("stroke", d => {
          if (d.data.status === 'Vacant') return "rgba(255,255,255,0.05)";
          if (d.data.rank !== 'Partner') return "#f59e0b"; // Gold for ranked users
          return "rgba(255,255,255,0.1)";
        })
        .attr("stroke-width", 2)
        .attr("filter", d => d.data.rank !== 'Partner' ? "url(#gold-glow)" : "none")
        .style("cursor", "pointer")
        .attr("class", d => d.data.rank !== 'Partner' ? "gold-pulse" : "");

      // Node Content
      node.each(function(d) {
        const el = d3.select(this);
        const isActive = d.data.status === 'Active';
        const isVacant = d.data.status === 'Vacant';

        if (isVacant) {
          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 0)
            .attr("fill", "rgba(255,255,255,0.2)")
            .attr("font-size", "10px")
            .attr("font-weight", "bold")
            .text("INVITE");
          
          el.append("circle")
            .attr("r", 15)
            .attr("cy", -25)
            .attr("fill", "rgba(255,255,255,0.05)")
            .attr("stroke", "rgba(255,255,255,0.1)");
          
          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", -21)
            .attr("fill", "rgba(255,255,255,0.2)")
            .attr("font-family", "lucide-react")
            .attr("font-size", "14px")
            .text("+");
        } else {
          // Avatar Circle
          el.append("circle")
            .attr("r", 25)
            .attr("cy", -35)
            .attr("fill", "#1e2329")
            .attr("stroke", isActive ? "#f97316" : "#64748b")
            .attr("stroke-width", 2);

          // Name
          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 10)
            .attr("fill", d.data.rank !== 'Partner' ? "#f59e0b" : "white")
            .attr("font-size", "10px")
            .attr("font-weight", "bold")
            .attr("filter", d.data.rank !== 'Partner' ? "url(#gold-glow)" : "none")
            .text(d.data.name.length > 15 ? d.data.name.substring(0, 12) + '...' : d.data.name);

          // ID
          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 25)
            .attr("fill", d.data.rank !== 'Partner' ? "rgba(245, 158, 11, 0.6)" : "rgba(255,255,255,0.4)")
            .attr("font-size", "8px")
            .text(d.data.id);

          // Rank
          el.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 35)
            .attr("fill", d.data.rank !== 'Partner' ? "#f59e0b" : "rgba(255,255,255,0.3)")
            .attr("font-size", "7px")
            .attr("font-weight", "bold")
            .text(d.data.rank.toUpperCase());

          // Leg Counts
          const leftCount = d.data.team_size?.left || 0;
          const rightCount = d.data.team_size?.right || 0;

          const statsGroup = el.append("g").attr("transform", "translate(0, 45)");

          // Stats Background Pill
          statsGroup.append("rect")
            .attr("x", -nodeWidth / 2 + 10)
            .attr("y", 0)
            .attr("width", nodeWidth - 20)
            .attr("height", 35)
            .attr("rx", 10)
            .attr("fill", "rgba(255,255,255,0.03)")
            .attr("stroke", "rgba(255,255,255,0.05)");

          // Left Leg
          statsGroup.append("text")
            .attr("text-anchor", "end")
            .attr("x", -5)
            .attr("y", 15)
            .attr("fill", "#f97316")
            .attr("font-size", "10px")
            .attr("font-weight", "black")
            .text(`L: ${leftCount}`);
          
          statsGroup.append("text")
            .attr("text-anchor", "end")
            .attr("x", -5)
            .attr("y", 28)
            .attr("fill", "rgba(255,255,255,0.4)")
            .attr("font-size", "7px")
            .text(`(${d.data.leftBusiness})`);

          // Right Leg
          statsGroup.append("text")
            .attr("text-anchor", "start")
            .attr("x", 5)
            .attr("y", 15)
            .attr("fill", "#f97316")
            .attr("font-size", "10px")
            .attr("font-weight", "black")
            .text(`R: ${rightCount}`);

          statsGroup.append("text")
            .attr("text-anchor", "start")
            .attr("x", 5)
            .attr("y", 28)
            .attr("fill", "rgba(255,255,255,0.4)")
            .attr("font-size", "7px")
            .text(`(${d.data.rightBusiness})`);
            
          // Total Badge
          const totalBadge = el.append("g").attr("transform", `translate(0, ${-nodeHeight/2})`);
          
          totalBadge.append("rect")
            .attr("x", -25)
            .attr("y", -10)
            .attr("width", 50)
            .attr("height", 20)
            .attr("rx", 10)
            .attr("fill", "#f97316")
            .attr("stroke", "#111112")
            .attr("stroke-width", 2);

          totalBadge.append("text")
            .attr("text-anchor", "middle")
            .attr("y", 4)
            .attr("fill", "white")
            .attr("font-size", "9px")
            .attr("font-weight", "black")
            .text(d.data.totalTeam);

          // Node Count Badge (Internal IDs)
          if (d.data.nodeCount && d.data.nodeCount > 1) {
            const nodeCountBadge = el.append("g").attr("transform", `translate(${nodeWidth/2 - 15}, ${-nodeHeight/2 + 15})`);
            
            nodeCountBadge.append("circle")
              .attr("r", 10)
              .attr("fill", "#3b82f6")
              .attr("stroke", "#111112")
              .attr("stroke-width", 2);

            nodeCountBadge.append("text")
              .attr("text-anchor", "middle")
              .attr("y", 3)
              .attr("fill", "white")
              .attr("font-size", "8px")
              .attr("font-weight", "black")
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
