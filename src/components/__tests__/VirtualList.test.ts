import { describe, expect, it } from 'vitest';
import { calculateVirtualRange } from '@/components/VirtualList';

describe('calculateVirtualRange', () => {
  it.each([500, 5_000, 100_000])('keeps the rendered window bounded for %i files', (itemCount) => {
    const range = calculateVirtualRange(itemCount, itemCount * 10, 560, 28, 8);
    expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(36);
    expect(range.startIndex).toBeGreaterThanOrEqual(0);
    expect(range.endIndex).toBeLessThanOrEqual(itemCount);
  });

  it('clamps the final window at the end of the list', () => {
    expect(calculateVirtualRange(500, 100_000, 560, 28, 8)).toEqual({
      startIndex: 464,
      endIndex: 500,
    });
  });
});
