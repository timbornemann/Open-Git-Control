import { describe, expect, it } from 'vitest';
import type { AnalyticsChanges } from '@/shared/ipc/repositoryAnalytics';
import { analyticsTreemapLayout } from '../analyticsTreemapLayout';

const row = (path: string, changes: number): AnalyticsChanges => ({
  path,
  changes,
  additions: 0,
  deletions: 0,
  authors: 1,
  lastChanged: 0,
  hash: 'a'.repeat(40),
  binary: false,
});
describe('path-based change treemap', () => {
  it('uses change-proportional areas for sibling files instead of equal tiles', () => {
    const { tiles } = analyticsTreemapLayout([row('a.ts', 80), row('b.ts', 20)], 800, 400);
    expect((tiles[0].width * tiles[0].height) / (tiles[1].width * tiles[1].height)).toBeCloseTo(4);
    expect(tiles.reduce((total, tile) => total + tile.width * tile.height, 0)).toBeCloseTo(800 * 400);
  });
  it('keeps directory descendants together inside their bounds without overlapping files', () => {
    const rows = [row('src/ui/view.ts', 50), row('src/ui/colors.ts', 10), row('src/api/client.ts', 30), row('docs/start.md', 9), row('README.md', 1)];
    const { tiles, groups } = analyticsTreemapLayout(rows, 900, 440);
    expect(tiles.map((tile) => tile.path)).toEqual(rows.map((row) => row.path));
    expect(groups.map((group) => group.path)).toEqual(expect.arrayContaining(['src', 'src/ui', 'src/api', 'docs']));
    for (const tile of tiles) {
      expect(tile.width).toBeGreaterThan(0);
      expect(tile.height).toBeGreaterThan(0);
      const parents = groups.filter((group) => tile.path.startsWith(`${group.path}/`));
      for (const parent of parents) {
        expect(tile.x).toBeGreaterThanOrEqual(parent.x);
        expect(tile.y).toBeGreaterThanOrEqual(parent.y);
        expect(tile.x + tile.width).toBeLessThanOrEqual(parent.x + parent.width + 0.000001);
        expect(tile.y + tile.height).toBeLessThanOrEqual(parent.y + parent.height + 0.000001);
      }
      for (const other of tiles.filter((other) => other !== tile)) {
        const overlapWidth = Math.min(tile.x + tile.width, other.x + other.width) - Math.max(tile.x, other.x);
        const overlapHeight = Math.min(tile.y + tile.height, other.y + other.height) - Math.max(tile.y, other.y);
        expect(overlapWidth > 0.000001 && overlapHeight > 0.000001).toBe(false);
      }
    }
  });
  it('handles sparse narrow maps, unusual path segments and no data', () => {
    expect(analyticsTreemapLayout([], 0, 0)).toEqual({ tiles: [], groups: [] });
    const rows = [row('__proto__/a.ts', 0), row('path with spaces/ünicode\nfile.ts', 1000), row('tiny.ts', 1)];
    const { tiles } = analyticsTreemapLayout(rows, 150, 100);
    expect(tiles.map((tile) => tile.path)).toEqual(rows.map((row) => row.path));
    expect(tiles.every((tile) => Number.isFinite(tile.width) && tile.width > 0 && tile.height > 0)).toBe(true);
  });
});
