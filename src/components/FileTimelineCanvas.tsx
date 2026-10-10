import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { FileTimelineCanvasControls } from './file-timeline/FileTimelineCanvasControls';
import { FileTimelineTooltip } from './file-timeline/FileTimelineTooltip';
import { findTimelineNodeAtPoint } from './file-timeline/fileTimelineHitTesting';
import { useFileTimelineCanvasRenderer } from './file-timeline/useFileTimelineCanvasRenderer';
import { useFileTimelineData } from './file-timeline/useFileTimelineData';
import { useFileTimelineDimensions } from './file-timeline/useFileTimelineDimensions';
import { useFileTimelineViewport } from './file-timeline/useFileTimelineViewport';
import type { FileTimelineCommit, FileTimelineLayoutNode, FileTimelineNode, FileTimelineViewport } from './file-timeline/types';

type FileTimelineCanvasProps = {
  fileTree: FileTimelineNode;
  activeCommit: FileTimelineCommit;
  contextKey?: string;
};

export const FileTimelineCanvas: React.FC<FileTimelineCanvasProps> = React.memo(({ fileTree, activeCommit, contextKey = '' }) => {
  const { tr } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });

  const [hoveredNode, setHoveredNode] = useState<FileTimelineLayoutNode | null>(null);
  const hoveredPathRef = useRef<string | undefined>(undefined);
  const hoverFrameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const { containerRef, dimensions } = useFileTimelineDimensions();
  const { flatNodes, spatialIndex, toggleFolder } = useFileTimelineData(fileTree, dimensions, contextKey);
  const { centerView, setViewport, viewport, viewportRef, zoomAt, zoomFromCenter } = useFileTimelineViewport(flatNodes, dimensions, contextKey);
  const clearHover = useCallback(() => {
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    hoverFrameRef.current = null;
    hoveredPathRef.current = undefined;
    setHoveredNode(null);
  }, []);
  useEffect(clearHover, [fileTree, clearHover]);
  useEffect(
    () => () => {
      if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    },
    [],
  );

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
        spatialIndex,
      });

      if (match?.path !== hoveredPathRef.current) {
        hoveredPathRef.current = match?.path;
        setHoveredNode(match);
      }
    },
    [spatialIndex],
  );

  const handleMouseDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    isDraggingRef.current = true;
    dragMovedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX - viewportRef.current.translateX,
      y: event.clientY - viewportRef.current.translateY,
    };
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    hoverFrameRef.current = null;
    event.currentTarget.style.cursor = 'grabbing';
  };

  const handleMouseMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (isDraggingRef.current) {
      if (!dragMovedRef.current && Math.hypot(event.clientX - pointerStartRef.current.x, event.clientY - pointerStartRef.current.y) < 3) return;
      dragMovedRef.current = true;
      if (hoveredPathRef.current !== undefined) clearHover();
      setViewport((current) => ({
        ...current,
        translateX: event.clientX - dragStartRef.current.x,
        translateY: event.clientY - dragStartRef.current.y,
      }));
      return;
    }

    pointerRef.current = { x: mouseX, y: mouseY };
    if (hoverFrameRef.current === null)
      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        checkHover(pointerRef.current.x, pointerRef.current.y, viewportRef.current, flatNodes);
      });
  };

  const handleMouseUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.cursor = 'grab';

    if (!dragMovedRef.current) {
      const ctx = event.currentTarget.getContext('2d');
      const rect = event.currentTarget.getBoundingClientRect();
      const node = ctx
        ? findTimelineNodeAtPoint({
            ctx,
            mouseX: event.clientX - rect.left,
            mouseY: event.clientY - rect.top,
            viewport: viewportRef.current,
            nodes: flatNodes,
            spatialIndex,
          })
        : null;
      if (node?.type === 'folder') toggleFolder(node);
      clearHover();
    }
  };

  const handleMouseLeave = () => {
    if (!isDraggingRef.current) clearHover();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? dimensions.height : 1);
      const factor = Math.exp(-Math.max(-100, Math.min(100, pixels)) * 0.002);
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, viewportRef.current.scale * factor);
      clearHover();
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [clearHover, dimensions.height, viewportRef, zoomAt]);

  useFileTimelineCanvasRenderer({ canvasRef, dimensions, flatNodes, spatialIndex, viewport });

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
          touchAction: 'none',
          cursor: isDraggingRef.current ? 'grabbing' : hoveredNode?.type === 'folder' ? 'pointer' : 'grab',
        }}
        tabIndex={0}
        aria-label={tr(
          'Dateibaum-Timeline. Mit Pfeiltasten verschieben, mit Plus und Minus zoomen.',
          'File tree timeline. Pan with arrow keys, zoom with plus and minus.',
        )}
        onPointerDown={handleMouseDown}
        onPointerMove={handleMouseMove}
        onPointerUp={handleMouseUp}
        onPointerLeave={handleMouseLeave}
        onPointerCancel={() => {
          isDraggingRef.current = false;
          clearHover();
        }}
        onKeyDown={(event) => {
          const delta = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[event.key];
          if (delta) {
            event.preventDefault();
            setViewport((current) => ({ ...current, translateX: current.translateX + delta[0], translateY: current.translateY + delta[1] }));
            clearHover();
          } else if (['+', '=', '-'].includes(event.key)) {
            event.preventDefault();
            zoomFromCenter(event.key === '-' ? 0.8 : 1.25);
          } else if (event.key === 'Home') {
            event.preventDefault();
            centerView();
          }
        }}
      />

      {hoveredNode && tooltipPos && <FileTimelineTooltip activeCommit={activeCommit} hoveredNode={hoveredNode} x={tooltipPos.x} y={tooltipPos.y} />}

      <FileTimelineCanvasControls onCenter={centerView} onZoomIn={() => zoomFromCenter(1.25)} onZoomOut={() => zoomFromCenter(0.8)} />
    </div>
  );
});
