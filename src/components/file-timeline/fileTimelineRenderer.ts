import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineViewport } from './types';
import { FileTimelineSpatialIndex, type TimelineBounds } from './fileTimelineSpatialIndex';

type RenderParams = {
  ctx: CanvasRenderingContext2D;
  dimensions: FileTimelineDimensions;
  viewport: FileTimelineViewport;
  nodes: FileTimelineLayoutNode[];
  devicePixelRatio: number;
  spatialIndex?: FileTimelineSpatialIndex;
};

type Bounds = TimelineBounds;

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
  // Draw in screen space. A fixed world-space raster grows quadratically when zooming out.
  const step = 40 * viewport.scale * 2 ** Math.ceil(Math.log2(32 / (40 * viewport.scale)));
  const startX = ((viewport.translateX % step) + step) % step;
  const startY = ((viewport.translateY % step) + step) % step;
  ctx.fillStyle = 'rgba(150, 130, 160, 0.24)';
  ctx.beginPath();
  for (let x = startX; x < dimensions.width; x += step) {
    for (let y = startY; y < dimensions.height; y += step) {
      ctx.moveTo(x + 1, y);
      ctx.arc(x, y, 1, 0, Math.PI * 2);
    }
  }
  ctx.fill();
};

const drawConnections = (ctx: CanvasRenderingContext2D, index: FileTimelineSpatialIndex, bounds: Bounds, scale: number) => {
  const connections = visibleConnections(index, bounds, scale);
  const styles = [
    { status: 'unchanged', color: 'rgba(179, 170, 162, 0.4)', width: 2 },
    { status: 'added', color: '#4fae94', width: 4 },
    { status: 'modified', color: '#5f9ec2', width: 4 },
    { status: 'renamed', color: '#9a79c8', width: 4 },
  ];
  for (const style of styles) {
    ctx.beginPath();
    let visible = false;
    for (const { parent: node, child } of connections) {
      if (child.status !== style.status) continue;
      visible = true;
      ctx.moveTo(node.x, node.y);
      const midX = (node.x + child.x) / 2;
      ctx.bezierCurveTo(midX, node.y, midX, child.y, child.x, child.y);
    }
    if (visible) {
      ctx.strokeStyle = style.color;
      ctx.lineWidth = scale < 0.3 ? 0.5 / scale : style.width;
      ctx.stroke();
    }
  }
};

function visibleConnections(index: FileTimelineSpatialIndex, bounds: Bounds, scale: number) {
  const visible = index.connections.filter(
    ({ parent, child }) =>
      child.x >= bounds.left && parent.x <= bounds.right && Math.max(parent.y, child.y) >= bounds.top && Math.min(parent.y, child.y) <= bounds.bottom,
  );
  if (scale >= 0.3) return visible;
  const groups = new Map<string, (typeof visible)[number]>();
  for (const connection of visible) {
    const key = `${connection.parent.path}\0${Math.round((connection.child.x * scale) / 2)}:${Math.round((connection.child.y * scale) / 2)}`;
    const previous = groups.get(key);
    if (!previous || (previous.child.status === 'unchanged' && connection.child.status !== 'unchanged')) groups.set(key, connection);
  }
  return [...groups.values()];
}

function overviewNodes(nodes: FileTimelineLayoutNode[], scale: number) {
  const groups = new Map<string, FileTimelineLayoutNode>();
  for (const node of nodes) {
    const key = `${Math.round((node.x * scale) / 3)}:${Math.round((node.y * scale) / 3)}`;
    const previous = groups.get(key);
    if (!previous || (previous.status === 'unchanged' && node.status !== 'unchanged')) groups.set(key, node);
  }
  return [...groups.values()];
}

const getNodeIconColor = (node: FileTimelineLayoutNode, isFolder: boolean) => {
  if (node.status === 'added') return '#4fae94';
  if (node.status === 'modified') return '#5f9ec2';
  if (node.status === 'renamed') return '#9a79c8';
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
    ctx.strokeStyle = '#9a79c8';
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
  if (scale < 0.3) {
    // At overview scale icons, glows and outlined labels are subpixel work. Batch visible dots instead.
    const visible = overviewNodes(nodes, scale);
    for (const color of ['#4fae94', '#5f9ec2', '#9a79c8', '#d09a72', '#b3aaa2']) {
      ctx.beginPath();
      for (const node of visible) {
        if (getNodeIconColor(node, node.type === 'folder') !== color) continue;
        const radius = (node.type === 'folder' ? 2.5 : 1.5) / scale;
        ctx.moveTo(node.x + radius, node.y);
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = color;
      ctx.fill();
    }
    return;
  }
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

export const renderFileTimelineCanvas = ({ ctx, dimensions, viewport, nodes, devicePixelRatio, spatialIndex }: RenderParams) => {
  if (!Number.isFinite(viewport.scale) || viewport.scale <= 0) return;
  const index = spatialIndex ?? new FileTimelineSpatialIndex(nodes);
  const bounds: Bounds = {
    left: (-100 - viewport.translateX) / viewport.scale,
    right: (dimensions.width + 250 - viewport.translateX) / viewport.scale,
    top: (-50 - viewport.translateY) / viewport.scale,
    bottom: (dimensions.height + 50 - viewport.translateY) / viewport.scale,
  };

  ctx.clearRect(0, 0, dimensions.width * devicePixelRatio, dimensions.height * devicePixelRatio);
  ctx.save();
  ctx.scale(devicePixelRatio, devicePixelRatio);
  drawGrid(ctx, dimensions, viewport);
  ctx.translate(viewport.translateX, viewport.translateY);
  ctx.scale(viewport.scale, viewport.scale);

  drawConnections(ctx, index, bounds, viewport.scale);
  const visible = index.query({ left: bounds.left - 250, right: bounds.right + 50, top: bounds.top - 50, bottom: bounds.bottom + 50 });
  drawNodes(ctx, visible, bounds, viewport.scale);

  ctx.restore();
};
