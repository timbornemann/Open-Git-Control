import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useI18n } from '../i18n';

type FileNode = {
  name: string;
  path: string;
  type: 'file' | 'folder';
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';
  children?: Map<string, FileNode>;
};

type CommitStep = {
  hash: string;
  author: string;
  date: string;
  subject: string;
  changes: Array<{
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    path: string;
    oldPath?: string;
  }>;
};

interface FileTimelineCanvasProps {
  fileTree: FileNode;
  activeCommit: CommitStep;
}

interface LayoutNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'unchanged';
  x: number;
  y: number;
  width: number; // Logical units (used for height spacing now)
  children: LayoutNode[];
  hasChildren: boolean;
  isCollapsed: boolean;
}

export const FileTimelineCanvas: React.FC<FileTimelineCanvasProps> = ({ fileTree, activeCommit }) => {
  const { tr } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(0.8);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<LayoutNode | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const mousePosRef = useRef({ x: 0, y: 0, isOver: false });
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasCenteredRef = useRef(false);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Reset collapsed paths when switching repositories (new root tree)
  useEffect(() => {
    setCollapsedPaths(new Set());
    hasCenteredRef.current = false;
  }, [fileTree?.path]);

  // Recursively build tree coordinate layout (Left-to-Right Horizontal Tree)
  const layoutTree = useMemo(() => {
    if (!fileTree) return null;

    const buildLayoutTree = (node: FileNode, depth: number): LayoutNode => {
      const childrenNodes: LayoutNode[] = [];
      const isCollapsed = collapsedPaths.has(node.path);
      const hasChildren = !!node.children && node.children.size > 0;

      if (hasChildren && !isCollapsed) {
        // Sort folders first, then files alphabetically
        const sortedChildren = Array.from(node.children!.values()).sort((a, b) => {
          if (a.type === b.type) return a.name.localeCompare(b.name);
          return a.type === 'folder' ? -1 : 1;
        });

        for (const childNode of sortedChildren) {
          childrenNodes.push(buildLayoutTree(childNode, depth + 1));
        }
      }

      let logicalHeight = 0;
      if (childrenNodes.length === 0) {
        logicalHeight = 1;
      } else {
        for (const c of childrenNodes) {
          logicalHeight += c.width; // width field acts as logical height units
        }
      }

      return {
        name: node.name,
        path: node.path,
        type: node.type,
        status: node.status,
        x: depth * 400 + 60, // Spread horizontally much more (400px per depth)
        y: 0,
        width: logicalHeight,
        children: childrenNodes,
        hasChildren,
        isCollapsed
      };
    };

    const assignY = (node: LayoutNode, topOffset: number, vSpacing: number) => {
      if (node.children.length === 0) {
        node.y = topOffset + vSpacing / 2;
        return;
      }

      let currentTop = topOffset;
      for (const child of node.children) {
        assignY(child, currentTop, vSpacing);
        currentTop += child.width * vSpacing;
      }

      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      node.y = (firstChild.y + lastChild.y) / 2;
    };

    const tree = buildLayoutTree(fileTree, 0);
    assignY(tree, 0, 40); // Vertical spacing 40px for compact dense layout

    // Shift tree so root node is centered at Y = 0
    const rootY = tree.y;
    const offsetTree = (node: LayoutNode) => {
      node.y -= rootY;
      for (const child of node.children) {
        offsetTree(child);
      }
    };
    offsetTree(tree);

    return tree;
  }, [fileTree, collapsedPaths]);

  // Flattened layout nodes for faster rendering and hover checking
  const flatNodes = useMemo(() => {
    const list: LayoutNode[] = [];
    const traverse = (node: LayoutNode) => {
      list.push(node);
      for (const child of node.children) {
        traverse(child);
      }
    };
    if (layoutTree) traverse(layoutTree);
    return list;
  }, [layoutTree]);

  // Helper to center the view
  const centerView = () => {
    if (flatNodes.length === 0 || dimensions.width === 0 || dimensions.height === 0) return;

    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    for (const node of flatNodes) {
      if (node.x < minX) minX = node.x;
      // Calculate max width including estimated text width (roughly 120px)
      if (node.x + 120 > maxX) maxX = node.x + 120;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }

    const treeWidth = maxX - minX;

    // Scale to fit horizontally, but don't zoom out too much!
    // File trees are naturally very tall, so we want the user to scroll vertically
    // instead of squishing everything into an unreadable microscopic vertical line.
    const scaleX = (dimensions.width * 0.85) / Math.max(treeWidth, 150);
    const newScale = Math.max(0.65, Math.min(scaleX, 1.0)); // Keep it readable!

    // Place root on the left
    setTranslateX(Math.max(60, dimensions.width * 0.1));
    
    // Center vertically on the Root Node (which is at Y = 0)
    // instead of centering on the midpoint of the entire massive tree
    setTranslateY(dimensions.height / 2);
    setScale(newScale);
  };

  // Center camera on first load or repository switch
  useEffect(() => {
    if (flatNodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && !hasCenteredRef.current) {
      centerView();
      hasCenteredRef.current = true;
    }
  }, [flatNodes, dimensions]);

  // Mouse / Wheel Event Handlers for Panning & Zooming
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left mouse only
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartRef.current = { x: e.clientX - translateX, y: e.clientY - translateY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    mousePosRef.current = { x, y, isOver: true };

    if (isDraggingRef.current) {
      dragMovedRef.current = true;
      setTranslateX(e.clientX - dragStartRef.current.x);
      setTranslateY(e.clientY - dragStartRef.current.y);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    
    // If it was a click (not a drag) on a folder, toggle collapse
    if (!dragMovedRef.current && hoveredNode && hoveredNode.type === 'folder') {
      setCollapsedPaths(prev => {
        const next = new Set(prev);
        if (next.has(hoveredNode.path)) {
          next.delete(hoveredNode.path);
        } else {
          next.add(hoveredNode.path);
        }
        return next;
      });
    }
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    mousePosRef.current.isOver = false;
    setHoveredNode(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldX = (mouseX - translateX) / scale;
    const worldY = (mouseY - translateY) / scale;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.15, Math.min(scale * zoomFactor, 3.0));

    const newTranslateX = mouseX - worldX * newScale;
    const newTranslateY = mouseY - worldY * newScale;

    setScale(newScale);
    setTranslateX(newTranslateX);
    setTranslateY(newTranslateY);
  };

  const zoomIn = () => {
    const newScale = Math.min(scale * 1.25, 3.0);
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const worldX = (centerX - translateX) / scale;
    const worldY = (centerY - translateY) / scale;
    
    setTranslateX(centerX - worldX * newScale);
    setTranslateY(centerY - worldY * newScale);
    setScale(newScale);
  };

  const zoomOut = () => {
    const newScale = Math.max(scale * 0.8, 0.15);
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;
    const worldX = (centerX - translateX) / scale;
    const worldY = (centerY - translateY) / scale;

    setTranslateX(centerX - worldX * newScale);
    setTranslateY(centerY - worldY * newScale);
    setScale(newScale);
  };

  // Helper functions for drawing custom node icons
  const drawFolderIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
    ctx.fillStyle = color;
    const w = size;
    const h = size * 0.8;
    const left = x - w / 2;
    const top = y - h / 2;

    ctx.beginPath();
    ctx.moveTo(left, top + 2);
    ctx.lineTo(left + w * 0.4, top + 2);
    ctx.lineTo(left + w * 0.55, top + 4.5);
    ctx.lineTo(left + w, top + 4.5);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left, top + h);
    ctx.closePath();
    ctx.fill();
  };

  const drawFileIcon = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
    ctx.fillStyle = color;
    const w = size * 0.75;
    const h = size;
    const left = x - w / 2;
    const top = y - h / 2;

    // Document page
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + w * 0.6, top);
    ctx.lineTo(left + w, top + h * 0.3);
    ctx.lineTo(left + w, top + h);
    ctx.lineTo(left, top + h);
    ctx.closePath();
    ctx.fill();

    // Dog-ear fold highlight
    ctx.fillStyle = 'var(--bg-panel)';
    ctx.beginPath();
    ctx.moveTo(left + w * 0.6, top);
    ctx.lineTo(left + w * 0.6, top + h * 0.3);
    ctx.lineTo(left + w, top + h * 0.3);
    ctx.closePath();
    ctx.fill();
  };

  // Animation and Drawing Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const devicePixelRatio = window.devicePixelRatio || 1;
    let animationId: number;

    const drawGrid = (ctx: CanvasRenderingContext2D) => {
      ctx.fillStyle = 'rgba(150, 130, 160, 0.4)';
      const gridSize = 40;

      const left = -translateX / scale;
      const top = -translateY / scale;
      const right = (dimensions.width - translateX) / scale;
      const bottom = (dimensions.height - translateY) / scale;

      const startX = Math.floor(left / gridSize) * gridSize;
      const startY = Math.floor(top / gridSize) * gridSize;

      for (let x = startX; x < right; x += gridSize) {
        for (let y = startY; y < bottom; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawConnections = (ctx: CanvasRenderingContext2D) => {
      ctx.lineWidth = 1.5;
      for (const node of flatNodes) {
        for (const child of node.children) {
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);

          // Bezier S-Curve horizontally
          const midX = (node.x + child.x) / 2;
          ctx.bezierCurveTo(
            midX, node.y,
            midX, child.y,
            child.x, child.y
          );

          if (child.status === 'added') {
            ctx.strokeStyle = 'rgba(79, 174, 148, 0.85)';
            ctx.lineWidth = 2.0;
          } else if (child.status === 'modified') {
            ctx.strokeStyle = 'rgba(95, 158, 194, 0.85)';
            ctx.lineWidth = 2.0;
          } else if (child.status === 'renamed') {
            ctx.strokeStyle = 'rgba(154, 121, 200, 0.85)';
            ctx.lineWidth = 2.0;
          } else {
            ctx.strokeStyle = 'rgba(150, 135, 165, 0.35)';
            ctx.lineWidth = 1.5;
          }
          ctx.stroke();
        }
      }
    };

    const drawNodes = (ctx: CanvasRenderingContext2D) => {
      const pulse = Math.sin(Date.now() / 150) * 0.35 + 0.65; // oscillating glow factor

      for (const node of flatNodes) {
        const isFolder = node.type === 'folder';
        const radius = isFolder ? 16 : 12;

        // Draw pulse glows for active operations
        let glowColor = '';
        if (node.status === 'added') glowColor = 'rgba(79, 174, 148, ';
        else if (node.status === 'modified') glowColor = 'rgba(95, 158, 194, ';
        else if (node.status === 'renamed') glowColor = 'rgba(154, 121, 200, ';

        if (glowColor) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = `${glowColor}${0.18 * pulse})`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `${glowColor}${0.8 * pulse})`;
          ctx.lineWidth = 2.0;
          ctx.stroke();
        }

        // Hover highlight
        const isHovered = hoveredNode?.path === node.path;
        if (isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1.8;
          ctx.stroke();
        }

        // Core node circle background
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isFolder ? 'var(--bg-panel)' : 'var(--bg-dark)';
        ctx.fill();

        // Core node border
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        if (node.status === 'added') {
          ctx.strokeStyle = 'var(--status-success)';
          ctx.lineWidth = 2.5;
        } else if (node.status === 'modified') {
          ctx.strokeStyle = 'var(--status-info)';
          ctx.lineWidth = 2.5;
        } else if (node.status === 'renamed') {
          ctx.strokeStyle = 'var(--status-merged)';
          ctx.lineWidth = 2.5;
        } else {
          ctx.strokeStyle = isFolder ? 'var(--text-accent)' : '#b49bb5';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();

        // Render Folder / File Icon
        const iconColor = node.status === 'added' ? 'var(--status-success)' :
                          node.status === 'modified' ? 'var(--status-info)' :
                          node.status === 'renamed' ? 'var(--status-merged)' :
                          isFolder ? 'var(--text-accent)' : 'var(--text-primary)';

        if (isFolder) {
          drawFolderIcon(ctx, node.x, node.y, 14, iconColor);
        } else {
          drawFileIcon(ctx, node.x, node.y, 11, iconColor);
        }

        // Fold / Unfold indicator badge for folders with children
        if (isFolder && node.hasChildren) {
          const badgeX = node.x + radius * 0.7;
          const badgeY = node.y - radius * 0.7;
          
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, 6, 0, Math.PI * 2);
          ctx.fillStyle = 'var(--bg-darker)';
          ctx.fill();
          ctx.strokeStyle = 'var(--text-accent)';
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.fillStyle = 'var(--text-primary)';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.isCollapsed ? '+' : '-', badgeX, badgeY + 0.5);
        }

        // Draw names horizontally to the right
        if (scale >= 0.35) {
          ctx.font = isFolder ? 'bold 12px Inter, sans-serif' : '500 12px Inter, sans-serif';
          ctx.fillStyle = isHovered ? '#ffffff' : (isFolder ? 'var(--text-primary)' : 'var(--text-secondary)');
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';

          // Backdrop shadow for crisp readability
          ctx.strokeStyle = 'rgba(18, 15, 21, 0.9)';
          ctx.lineWidth = 4;
          
          const textOffsetX = node.x + radius + 10;
          ctx.strokeText(node.name, textOffsetX, node.y);
          ctx.fillText(node.name, textOffsetX, node.y);
        }
      }
    };

    const checkHover = () => {
      const pos = mousePosRef.current;
      if (!pos.isOver) {
        if (hoveredNode !== null) setHoveredNode(null);
        return;
      }

      // Convert screen mouse coordinates to world space coordinates
      const worldX = (pos.x - translateX) / scale;
      const worldY = (pos.y - translateY) / scale;

      let match: LayoutNode | null = null;
      for (const node of flatNodes) {
        const radius = node.type === 'folder' ? 16 : 12;
        // Increase hit box for horizontal text
        const textWidth = ctx.measureText(node.name).width;
        
        // Check circle collision
        const dist = Math.hypot(worldX - node.x, worldY - node.y);
        if (dist <= radius + 5) {
          match = node;
          break;
        }

        // Check text box collision
        if (
          worldX >= node.x + radius &&
          worldX <= node.x + radius + 10 + textWidth &&
          worldY >= node.y - 10 &&
          worldY <= node.y + 10
        ) {
          match = node;
          break;
        }
      }

      if (match?.path !== hoveredNode?.path) {
        setHoveredNode(match);
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, dimensions.width * devicePixelRatio, dimensions.height * devicePixelRatio);

      ctx.save();
      ctx.scale(devicePixelRatio, devicePixelRatio);

      // Apply camera zoom & pan
      ctx.translate(translateX, translateY);
      ctx.scale(scale, scale);

      drawGrid(ctx);
      drawConnections(ctx);
      drawNodes(ctx);

      ctx.restore();

      checkHover();

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [dimensions, translateX, translateY, scale, flatNodes, hoveredNode]);

  // Translate hovered node position into screen coordinates for tooltip placement
  const tooltipPos = useMemo(() => {
    if (!hoveredNode) return null;
    const radius = hoveredNode.type === 'folder' ? 16 : 12;
    return {
      x: hoveredNode.x * scale + translateX,
      y: hoveredNode.y * scale + translateY - radius - 14 // slightly higher due to horizontal layout
    };
  }, [hoveredNode, scale, translateX, translateY]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: 'var(--bg-darker)',
        overflow: 'hidden'
      }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width * (window.devicePixelRatio || 1)}
        height={dimensions.height * (window.devicePixelRatio || 1)}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          display: 'block',
          cursor: isDraggingRef.current ? 'grabbing' : (hoveredNode?.type === 'folder' ? 'pointer' : 'grab')
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {/* Interactive HTML Tooltip */}
      {hoveredNode && tooltipPos && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            background: 'rgba(36, 29, 44, 0.95)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '10px 12px',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
            maxWidth: '320px',
            fontSize: '0.78rem',
            color: 'var(--text-primary)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            backdropFilter: 'blur(3px)',
            transition: 'top 0.08s ease-out, left 0.08s ease-out'
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
            {hoveredNode.path}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '2px 6px',
                borderRadius: '3px',
                background: hoveredNode.type === 'folder' ? 'var(--bg-hover)' : 'rgba(255,255,255,0.06)',
                color: hoveredNode.type === 'folder' ? 'var(--text-accent)' : 'var(--text-secondary)'
              }}
            >
              {hoveredNode.type === 'folder' ? tr('Ordner', 'Folder') : tr('Datei', 'File')}
            </span>

            {hoveredNode.status !== 'unchanged' && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  background: hoveredNode.status === 'added' ? 'var(--status-success-soft)' :
                              hoveredNode.status === 'modified' ? 'var(--status-info-soft)' :
                              'var(--status-merged-soft)',
                  color: hoveredNode.status === 'added' ? 'var(--status-success)' :
                         hoveredNode.status === 'modified' ? 'var(--status-info)' :
                         'var(--status-merged)',
                  border: hoveredNode.status === 'added' ? '1px solid var(--status-success-border)' :
                          hoveredNode.status === 'modified' ? '1px solid var(--status-info-border)' :
                          '1px solid var(--status-merged-border)'
                }}
              >
                {hoveredNode.status === 'added' ? tr('Hinzugefügt', 'Added') :
                 hoveredNode.status === 'modified' ? tr('Modifiziert', 'Modified') :
                 tr('Umbenannt', 'Renamed')}
              </span>
            )}
          </div>

          {hoveredNode.status !== 'unchanged' && activeCommit && (
            <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-color)', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeCommit.subject}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                {activeCommit.author} • {new Date(activeCommit.date).toLocaleDateString()}
              </div>
            </div>
          )}
          
          {hoveredNode.type === 'folder' && (
            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
              {hoveredNode.isCollapsed ? 'Klicken zum Ausklappen' : 'Klicken zum Einklappen'}
            </div>
          )}
        </div>
      )}

      {/* Floating Canvas Navigation Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          zIndex: 10
        }}
      >
        <button
          onClick={zoomIn}
          className="diff-nav-btn"
          title={tr('Vergrößern', 'Zoom In')}
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: '4px'
          }}
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={zoomOut}
          className="diff-nav-btn"
          title={tr('Verkleinern', 'Zoom Out')}
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: '4px'
          }}
        >
          <ZoomOut size={15} />
        </button>
        <button
          onClick={centerView}
          className="diff-nav-btn"
          title={tr('Ansicht zentrieren', 'Center View')}
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            borderRadius: '4px'
          }}
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
};
