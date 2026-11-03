import { describe, expect, it } from 'vitest';
import { spotlightGeometry } from './spotlightGeometry';

const workspace = { left: 0, top: 44, width: 1200, height: 520 };
describe('tutorial spotlight', () => {
  it('leaves a padded clear area around the target, bounded by the workspace', () => {
    const result = spotlightGeometry({ left: 300, top: 144, width: 400, height: 250 }, workspace)!;
    expect(result.hole).toEqual({ left: 296, top: 96, width: 408, height: 258 });
    expect(result.arrow).toBeNull();
  });
  it('clips partially scrolled targets and leaves the tutorial controls outside the shade', () => {
    expect(spotlightGeometry({ left: -10, top: 500, width: 1300, height: 200 }, workspace)!.hole).toEqual({ left: 0, top: 452, width: 1200, height: 68 });
    expect(spotlightGeometry({ left: 10, top: 700, width: 40, height: 40 }, workspace)).toBeNull();
  });
  it.each([
    [{ left: 5, top: 200, width: 36, height: 36 }, 'right'],
    [{ left: 1150, top: 100, width: 36, height: 36 }, 'left'],
    [{ left: 500, top: 50, width: 36, height: 36 }, 'bottom'],
  ] as const)('positions a small control pointer inside the available space', (target, side) => {
    expect(spotlightGeometry(target, workspace)!.arrow?.side).toBe(side);
  });
  it('omits the pointer when there is no room and retains the clear target', () => {
    const result = spotlightGeometry({ left: 20, top: 60, width: 36, height: 36 }, { left: 0, top: 44, width: 70, height: 60 })!;
    expect(result.arrow).toBeNull();
    expect(result.hole.width).toBe(44);
  });
});
