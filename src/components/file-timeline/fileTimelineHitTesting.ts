import type { FileTimelineLayoutNode, FileTimelineViewport } from './types';
import type { FileTimelineSpatialIndex } from './fileTimelineSpatialIndex';

type Params = {
  ctx: CanvasRenderingContext2D;
  mouseX: number;
  mouseY: number;
  viewport: FileTimelineViewport;
  nodes: FileTimelineLayoutNode[];
  spatialIndex?: FileTimelineSpatialIndex;
};

export const findTimelineNodeAtPoint = ({ ctx, mouseX, mouseY, viewport, nodes, spatialIndex }: Params): FileTimelineLayoutNode | null => {
  const worldX = (mouseX - viewport.translateX) / viewport.scale;
  const worldY = (mouseY - viewport.translateY) / viewport.scale;

  const padding = Math.max(25, 4 / viewport.scale);
  const candidates = spatialIndex?.query({ left: worldX - 280 - padding, right: worldX + padding, top: worldY - padding, bottom: worldY + padding }) ?? nodes;
  let closest: FileTimelineLayoutNode | null = null;
  let closestDistance = Infinity;
  for (const node of candidates) {
    const radius = node.type === 'folder' ? 22 : 16;
    const dist = Math.hypot(worldX - node.x, worldY - node.y);
    if (dist <= Math.max(radius + 5, 4 / viewport.scale) && dist < closestDistance) {
      closest = node;
      closestDistance = dist;
    }
    if (viewport.scale < 0.3) continue;

    const isNearX = worldX >= node.x + radius && worldX <= node.x + radius + 250;
    const isNearY = worldY >= node.y - 12 && worldY <= node.y + 12;
    if (!isNearX || !isNearY) continue;

    ctx.font = node.type === 'folder' ? 'bold 15px Inter, sans-serif' : 'bold 13px Inter, sans-serif';
    const textWidth = ctx.measureText(node.name).width;
    if (worldX <= node.x + radius + 10 + textWidth) return node;
  }

  return closest;
};
