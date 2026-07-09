import React, { useCallback, useMemo, useRef, useState } from 'react';
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
};

export const FileTimelineCanvas: React.FC<FileTimelineCanvasProps> = ({ fileTree, activeCommit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragMovedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const [hoveredNode, setHoveredNode] = useState<FileTimelineLayoutNode | null>(null);

  const { containerRef, dimensions } = useFileTimelineDimensions();
  const { flatNodes, toggleFolder } = useFileTimelineData(fileTree, dimensions);
  const { centerView, setViewport, viewport, zoomAt, zoomFromCenter } = useFileTimelineViewport(flatNodes, dimensions, fileTree?.path || '');

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
      toggleFolder(hoveredNode);
      setHoveredNode(null);
    }
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    setHoveredNode(null);
  };

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

  useFileTimelineCanvasRenderer({ canvasRef, dimensions, flatNodes, viewport });

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
