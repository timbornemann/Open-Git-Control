import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineViewport } from './types';

type RenderParams = {
  ctx: CanvasRenderingContext2D;
  dimensions: FileTimelineDimensions;
  viewport: FileTimelineViewport;
  nodes: FileTimelineLayoutNode[];
  devicePixelRatio: number;
};

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

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

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + w * 0.6, top);
  ctx.lineTo(left + w, top + h * 0.3);
  ctx.lineTo(left + w, top + h);
  ctx.lineTo(left, top + h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#222421';
  ctx.beginPath();
  ctx.moveTo(left + w * 0.6, top);
  ctx.lineTo(left + w * 0.6, top + h * 0.3);
  ctx.lineTo(left + w, top + h * 0.3);
  ctx.closePath();
  ctx.fill();
};

const drawGrid = (ctx: CanvasRenderingContext2D, dimensions: FileTimelineDimensions, viewport: FileTimelineViewport) => {
  ctx.fillStyle = 'rgba(150, 130, 160, 0.4)';
  const gridSize = 40;
  const left = -viewport.translateX / viewport.scale;
  const top = -viewport.translateY / viewport.scale;
  const right = (dimensions.width - viewport.translateX) / viewport.scale;
  const bottom = (dimensions.height - viewport.translateY) / viewport.scale;
  const startX = Math.floor(left / gridSize) * gridSize;
  const startY = Math.floor(top / gridSize) * gridSize;

  for (let x = startX; x < right; x += gridSize) {
    for (let y = startY; y < bottom; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

const drawConnections = (ctx: CanvasRenderingContext2D, nodes: FileTimelineLayoutNode[], bounds: Bounds) => {
  ctx.lineWidth = 2.5;
  for (const node of nodes) {
    for (const child of node.children) {
      const isNodeVisible = node.x >= bounds.left && node.x <= bounds.right && node.y >= bounds.top && node.y <= bounds.bottom;
      const isChildVisible = child.x >= bounds.left && child.x <= bounds.right && child.y >= bounds.top && child.y <= bounds.bottom;
      if (!isNodeVisible && !isChildVisible) continue;

      ctx.beginPath();
      ctx.moveTo(node.x, node.y);
      const midX = (node.x + child.x) / 2;
      ctx.bezierCurveTo(midX, node.y, midX, child.y, child.x, child.y);

      if (child.status === 'added') {
        ctx.strokeStyle = 'rgba(79, 174, 148, 1.0)';
        ctx.lineWidth = 4;
      } else if (child.status === 'modified') {
        ctx.strokeStyle = 'rgba(95, 158, 194, 1.0)';
        ctx.lineWidth = 4;
      } else if (child.status === 'renamed') {
        ctx.strokeStyle = 'rgba(154, 121, 200, 1.0)';
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
    }
  }
};

const getNodeIconColor = (node: FileTimelineLayoutNode, isFolder: boolean) => {
  if (node.status === 'added') return '#4fae94';
  if (node.status === 'modified') return '#5f9ec2';
  if (node.status === 'renamed') return '#7890a1';
  return isFolder ? '#d09a72' : '#b3aaa2';
};

const drawNodeGlow = (ctx: CanvasRenderingContext2D, node: FileTimelineLayoutNode, radius: number) => {
  let glowColor = '';
  if (node.status === 'added') glowColor = 'rgba(79, 174, 148, ';
  else if (node.status === 'modified') glowColor = 'rgba(95, 158, 194, ';
  else if (node.status === 'renamed') glowColor = 'rgba(154, 121, 200, ';
  if (!glowColor) return;

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius + 10, 0, Math.PI * 2);
  ctx.fillStyle = `${glowColor}0.15)`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = `${glowColor}0.65)`;
  ctx.lineWidth = 2;
  ctx.stroke();
};

const drawNodeBorder = (ctx: CanvasRenderingContext2D, node: FileTimelineLayoutNode, isFolder: boolean, radius: number) => {
  ctx.beginPath();
  ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
  if (node.status === 'added') {
    ctx.strokeStyle = '#4fae94';
    ctx.lineWidth = 3.5;
  } else if (node.status === 'modified') {
    ctx.strokeStyle = '#5f9ec2';
    ctx.lineWidth = 3.5;
  } else if (node.status === 'renamed') {
    ctx.strokeStyle = '#7890a1';
    ctx.lineWidth = 3.5;
  } else {
    ctx.strokeStyle = isFolder ? '#d09a72' : '#b3aaa2';
    ctx.lineWidth = 2.5;
  }
  ctx.stroke();
};

const drawFolderBadge = (ctx: CanvasRenderingContext2D, node: FileTimelineLayoutNode, radius: number) => {
  if (node.type !== 'folder' || !node.hasChildren) return;

  const badgeX = node.x + radius * 0.7;
  const badgeY = node.y - radius * 0.7;

  ctx.beginPath();
  ctx.arc(badgeX, badgeY, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#0f1214';
  ctx.fill();
  ctx.strokeStyle = '#d09a72';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = '#e8e1d9';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(node.isCollapsed ? '+' : '-', badgeX, badgeY + 0.5);
};

const drawNodeText = (ctx: CanvasRenderingContext2D, node: FileTimelineLayoutNode, isFolder: boolean, radius: number, scale: number) => {
  if (scale < 0.15 && !isFolder) return;

  ctx.font = isFolder ? 'bold 15px Inter, sans-serif' : 'bold 13px Inter, sans-serif';
  ctx.fillStyle = isFolder ? '#e8e1d9' : '#b3aaa2';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(15, 18, 20, 1.0)';
  ctx.lineWidth = 5;

  const textOffsetX = node.x + radius + 12;
  ctx.strokeText(node.name, textOffsetX, node.y);
  ctx.fillText(node.name, textOffsetX, node.y);
};

const drawNodes = (ctx: CanvasRenderingContext2D, nodes: FileTimelineLayoutNode[], bounds: Bounds, scale: number) => {
  for (const node of nodes) {
    if (node.x + 250 < bounds.left || node.x - 50 > bounds.right || node.y + 50 < bounds.top || node.y - 50 > bounds.bottom) continue;

    const isFolder = node.type === 'folder';
    const radius = isFolder ? 22 : 16;
    drawNodeGlow(ctx, node, radius);

    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isFolder ? '#222421' : '#171b1d';
    ctx.fill();

    drawNodeBorder(ctx, node, isFolder, radius);

    const iconColor = getNodeIconColor(node, isFolder);
    if (isFolder) drawFolderIcon(ctx, node.x, node.y, 20, iconColor);
    else drawFileIcon(ctx, node.x, node.y, 16, iconColor);

    drawFolderBadge(ctx, node, radius);
    drawNodeText(ctx, node, isFolder, radius, scale);
  }
};

export const renderFileTimelineCanvas = ({ ctx, dimensions, viewport, nodes, devicePixelRatio }: RenderParams) => {
  const bounds: Bounds = {
    left: (-100 - viewport.translateX) / viewport.scale,
    right: (dimensions.width + 250 - viewport.translateX) / viewport.scale,
    top: (-50 - viewport.translateY) / viewport.scale,
    bottom: (dimensions.height + 50 - viewport.translateY) / viewport.scale,
  };

  ctx.clearRect(0, 0, dimensions.width * devicePixelRatio, dimensions.height * devicePixelRatio);
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);
  ctx.translate(viewport.translateX, viewport.translateY);
  ctx.scale(viewport.scale, viewport.scale);

  drawGrid(ctx, dimensions, viewport);
  drawConnections(ctx, nodes, bounds);
  drawNodes(ctx, nodes, bounds, viewport.scale);

  ctx.restore();
};
