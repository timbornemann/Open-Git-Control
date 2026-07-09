import type { FileTimelineDimensions, FileTimelineLayoutNode, FileTimelineNode, FileTimelineViewport } from './types';

export const buildFileTimelineLayout = (
  fileTree: FileTimelineNode | null | undefined,
  collapsedPaths: Set<string>,
  dimensions: FileTimelineDimensions,
): FileTimelineLayoutNode | null => {
  if (!fileTree || dimensions.width === 0 || dimensions.height === 0) return null;

  let maxDepth = 1;

  const buildLayoutTree = (node: FileTimelineNode, depth: number): FileTimelineLayoutNode => {
    if (depth > maxDepth) maxDepth = depth;

    const childrenNodes: FileTimelineLayoutNode[] = [];
    const isCollapsed = collapsedPaths.has(node.path);
    const hasChildren = !!node.children && node.children.size > 0;

    if (hasChildren && !isCollapsed) {
      const sortedChildren = Array.from(node.children!.values()).sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'folder' ? -1 : 1;
      });

      for (const childNode of sortedChildren) {
        childrenNodes.push(buildLayoutTree(childNode, depth + 1));
      }
    }

    const logicalHeight = childrenNodes.length === 0 ? 1 : childrenNodes.reduce((sum, child) => sum + child.width, 0);

    return {
      name: node.name,
      path: node.path,
      type: node.type,
      status: node.status,
      x: 0,
      y: 0,
      width: logicalHeight,
      children: childrenNodes,
      hasChildren,
      isCollapsed,
    };
  };

  const tree = buildLayoutTree(fileTree, 0);
  const vSpacing = 24;
  const naturalHeight = tree.width * vSpacing;
  const requiredScaleY = (dimensions.height * 0.85) / Math.max(naturalHeight, 150);
  const targetNaturalWidth = (dimensions.width * 0.75) / requiredScaleY;
  const dynamicHSpacing = Math.max(350, targetNaturalWidth / Math.max(1, maxDepth));

  const assignCoordinates = (node: FileTimelineLayoutNode, depth: number) => {
    node.x = depth * dynamicHSpacing + 60;
    for (const child of node.children) {
      assignCoordinates(child, depth + 1);
    }
  };

  const assignY = (node: FileTimelineLayoutNode, topOffset: number) => {
    if (node.children.length === 0) {
      node.y = topOffset + vSpacing / 2;
      return;
    }

    let currentTop = topOffset;
    for (const child of node.children) {
      assignY(child, currentTop);
      currentTop += child.width * vSpacing;
    }

    const firstChild = node.children[0];
    const lastChild = node.children[node.children.length - 1];
    node.y = (firstChild.y + lastChild.y) / 2;
  };

  const offsetTree = (node: FileTimelineLayoutNode, rootY: number) => {
    node.y -= rootY;
    for (const child of node.children) {
      offsetTree(child, rootY);
    }
  };

  assignCoordinates(tree, 0);
  assignY(tree, 0);
  offsetTree(tree, tree.y);

  return tree;
};

export const flattenTimelineLayout = (layoutTree: FileTimelineLayoutNode | null): FileTimelineLayoutNode[] => {
  const list: FileTimelineLayoutNode[] = [];

  const traverse = (node: FileTimelineLayoutNode) => {
    list.push(node);
    for (const child of node.children) {
      traverse(child);
    }
  };

  if (layoutTree) traverse(layoutTree);
  return list;
};

export const getCenteredTimelineViewport = (nodes: FileTimelineLayoutNode[], dimensions: FileTimelineDimensions): FileTimelineViewport | null => {
  if (nodes.length === 0 || dimensions.width === 0 || dimensions.height === 0) return null;

  let minY = Infinity;
  let maxY = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;

  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.x + 120 > maxX) maxX = node.x + 120;
    if (node.y < minY) minY = node.y;
    if (node.y > maxY) maxY = node.y;
  }

  const treeWidth = maxX - minX;
  const treeHeight = maxY - minY;
  const scaleX = (dimensions.width * 0.85) / Math.max(treeWidth, 150);
  const scaleY = (dimensions.height * 0.85) / Math.max(treeHeight, 150);
  const scale = Math.min(scaleX, scaleY, 1.5);
  const centerY = (minY + maxY) / 2;

  return {
    scale,
    translateX: Math.max(40, dimensions.width * 0.05),
    translateY: dimensions.height / 2 - centerY * scale,
  };
};
