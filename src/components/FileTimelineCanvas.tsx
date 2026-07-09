import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileTimelineCanvasControls } from './file-timeline/FileTimelineCanvasControls';
import { FileTimelineTooltip } from './file-timeline/FileTimelineTooltip';
import { findTimelineNodeAtPoint } from './file-timeline/fileTimelineHitTesting';
import { buildFileTimelineLayout, flattenTimelineLayout, getCenteredTimelineViewport } from './file-timeline/fileTimelineLayout';
import { renderFileTimelineCanvas } from './file-timeline/fileTimelineRenderer';
import type { FileTimelineCommit, FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineNode, FileTimelineViewport } from './file-timeline/types';

type FileTimelineCanvasProps = {
  fileTree: FileTimelineNode;
  activeCommit: FileTimelineCommit;
};

const initialViewport: FileTimelineViewport = {
  scale: 0.8,
  translateX: 0,
  translateY: 0,
};

export const FileTimelineCanvas: React.FC<FileTimelineCanvasProps> = ({ fileTree, activeCommit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasCenteredRef = useRef(false);

  const [dimensions, setDimensions] = useState<FileTimelineDimensions>({ width: 0, height: 0 });
  const [viewport, setViewport] = useState<FileTimelineViewport>(initialViewport);
  const [hoveredNode, setHoveredNode] = useState<FileTimelineLayoutNode | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    setCollapsedPaths(new Set());
    hasCenteredRef.current = false;
  }, [fileTree?.path]);

  const layoutTree = useMemo(() => buildFileTimelineLayout(fileTree, collapsedPaths, dimensions), [collapsedPaths, dimensions, fileTree]);
  const flatNodes = useMemo(() => flattenTimelineLayout(layoutTree), [layoutTree]);

  const centerView = useCallback(() => {
    const centeredViewport = getCenteredTimelineViewport(flatNodes, dimensions);
    if (centeredViewport) setViewport(centeredViewport);
  }, [dimensions, flatNodes]);

  useEffect(() => {
    if (flatNodes.length > 0 && dimensions.width > 0 && dimensions.height > 0 && !hasCenteredRef.current) {
      centerView();
      hasCenteredRef.current = true;
    }
  }, [centerView, dimensions.height, dimensions.width, flatNodes.length]);

  const checkHover = useCallback(
    (mouseX: number, mouseY: number, nextViewport: FileTimelineViewport, nodes: FileTimelineLayoutNode[]) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;

      const match = findTimelineNodeAtPoint({
        ctx,
        mouseX,
        mouseY,
        viewport: nextViewport,
        nodes,
      });

      if (match?.path !== hoveredNode?.path) {
        setHoveredNode(match);
      }
    },
    [hoveredNode],
  );

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    dragStartRef.current = {
      x: event.clientX - viewport.translateX,
      y: event.clientY - viewport.translateY,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (isDraggingRef.current) {
      dragMovedRef.current = true;
      setViewport((current) => ({
        ...current,
        translateX: event.clientX - dragStartRef.current.x,
        translateY: event.clientY - dragStartRef.current.y,
      }));
      return;
    }

    checkHover(mouseX, mouseY, viewport, flatNodes);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;

    if (!dragMovedRef.current && hoveredNode?.type === 'folder') {
      setCollapsedPaths((current) => {
        const next = new Set(current);
        if (next.has(hoveredNode.path)) next.delete(hoveredNode.path);
        else next.add(hoveredNode.path);
        return next;
      });
      setHoveredNode(null);
    }
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredNode(null);
  };

  const zoomAt = useCallback(
    (screenX: number, screenY: number, nextScale: number) => {
      const worldX = (screenX - viewport.translateX) / viewport.scale;
      const worldY = (screenY - viewport.translateY) / viewport.scale;
      const nextViewport = {
        scale: nextScale,
        translateX: screenX - worldX * nextScale,
        translateY: screenY - worldY * nextScale,
      };

      setViewport(nextViewport);
      return nextViewport;
    },
    [viewport],
  );

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const zoomFactor = event.deltaY < 0 ? 1.15 : 0.85;
    const nextScale = Math.max(0.15, Math.min(viewport.scale * zoomFactor, 3));
    const nextViewport = zoomAt(mouseX, mouseY, nextScale);
    checkHover(mouseX, mouseY, nextViewport, flatNodes);
  };

  const zoomFromCenter = useCallback(
    (factor: number, min: number, max: number) => {
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      zoomAt(centerX, centerY, Math.max(min, Math.min(viewport.scale * factor, max)));
    },
    [dimensions.height, dimensions.width, viewport.scale, zoomAt],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderFileTimelineCanvas({
      ctx,
      dimensions,
      viewport,
      nodes: flatNodes,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
  }, [dimensions, flatNodes, viewport]);

  const tooltipPos = useMemo(() => {
    if (!hoveredNode) return null;
    const radius = hoveredNode.type === 'folder' ? 16 : 12;
    return {
      x: hoveredNode.x * viewport.scale + viewport.translateX,
      y: hoveredNode.y * viewport.scale + viewport.translateY - radius - 14,
    };
  }, [hoveredNode, viewport.scale, viewport.translateX, viewport.translateY]);

  const devicePixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', background: 'var(--bg-darker)', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        width={dimensions.width * devicePixelRatio}
        height={dimensions.height * devicePixelRatio}
        style={{
          width: dimensions.width,
          height: dimensions.height,
          display: 'block',
          cursor: isDraggingRef.current ? 'grabbing' : hoveredNode?.type === 'folder' ? 'pointer' : 'grab',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {hoveredNode && tooltipPos && <FileTimelineTooltip activeCommit={activeCommit} hoveredNode={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />}

      <FileTimelineCanvasControls onCenter={centerView} onZoomIn={() => zoomFromCenter(1.25, 0.15, 3)} onZoomOut={() => zoomFromCenter(0.8, 0.15, 3)} />
    </div>
  );
};
