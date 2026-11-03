export type SpotlightBox = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };

export function spotlightGeometry(target: SpotlightBox, workspace: SpotlightBox) {
  const left = Math.max(workspace.left, target.left - 4);
  const top = Math.max(workspace.top, target.top - 4);
  const right = Math.min(workspace.left + workspace.width, target.left + target.width + 4);
  const bottom = Math.min(workspace.top + workspace.height, target.top + target.height + 4);
  if (right <= left || bottom <= top) return null;
  const hole = { left: left - workspace.left, top: top - workspace.top, width: right - left, height: bottom - top };
  const compact = target.height <= 64 && target.width <= 180;
  if (!compact) return { hole, arrow: null };

  const center = { x: hole.left + hole.width / 2, y: hole.top + hole.height / 2 };
  const space = { right: workspace.width - hole.left - hole.width, left: hole.left, bottom: workspace.height - hole.top - hole.height, top: hole.top };
  const preferred: Array<keyof typeof space> =
    hole.left < 80
      ? ['right', 'bottom', 'top', 'left']
      : space.right < 80
        ? ['left', 'bottom', 'top', 'right']
        : hole.top < 80
          ? ['bottom', 'right', 'left', 'top']
          : ['right', 'left', 'bottom', 'top'];
  const side = preferred.find((direction) => space[direction] >= 58);
  if (!side) return { hole, arrow: null };
  const outward: Record<keyof typeof space, Point> = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, bottom: { x: 0, y: 1 }, top: { x: 0, y: -1 } };
  const direction = outward[side];
  const tip = { x: center.x + direction.x * (hole.width / 2 + 10), y: center.y + direction.y * (hole.height / 2 + 10) };
  const tail = { x: tip.x + direction.x * 32, y: tip.y + direction.y * 32 };
  const wing = (offset: number) => ({ x: tip.x + direction.x * 9 - direction.y * offset, y: tip.y + direction.y * 9 + direction.x * offset });
  const first = wing(7),
    second = wing(-7);
  return { hole, arrow: { side, path: `M ${tail.x} ${tail.y} L ${tip.x} ${tip.y} M ${first.x} ${first.y} L ${tip.x} ${tip.y} L ${second.x} ${second.y}` } };
}
