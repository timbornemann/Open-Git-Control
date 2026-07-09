import type { FileTimelineLayoutNode, FileTimelineViewport } from './types';

type Params = {
  ctx: CanvasRenderingContext2D;
  mouseX: number;
  mouseY: number;
  viewport: FileTimelineViewport;
  nodes: FileTimelineLayoutNode[];
};

export const findTimelineNodeAtPoint = ({ ctx, mouseX, mouseY, viewport, nodes }: Params): FileTimelineLayoutNode | null => {
  const worldX = (mouseX - viewport.translateX) / viewport.scale;
  const worldY = (mouseY - viewport.translateY) / viewport.scale;

  for (const node of nodes) {
    const radius = node.type === 'folder' ? 16 : 12;
    const dist = Math.hypot(worldX - node.x, worldY - node.y);
    if (dist <= radius + 5) return node;

    const isNearX = worldX >= node.x + radius && worldX <= node.x + radius + 250;
    const isNearY = worldY >= node.y - 12 && worldY <= node.y + 12;
    if (!isNearX || !isNearY) continue;

    const textWidth = ctx.measureText(node.name).width;
    if (worldX <= node.x + radius + 10 + textWidth) return node;
  }

  return null;
};
