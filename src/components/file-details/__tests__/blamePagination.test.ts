import { describe, expect, it } from 'vitest';
import { BLAME_PAGE_SIZE, splitBlamePage } from '../blamePagination';

describe('splitBlamePage', () => {
  it('does not offer another page for an exact multiple-sized final page', () => {
    const result = splitBlamePage(Array.from({ length: BLAME_PAGE_SIZE }, (_, index) => index + 1));

    expect(result.lines).toHaveLength(BLAME_PAGE_SIZE);
    expect(result.hasMore).toBe(false);
  });

  it('keeps the look-ahead line out of the rendered page and reports more data', () => {
    const result = splitBlamePage(Array.from({ length: BLAME_PAGE_SIZE + 1 }, (_, index) => index + 1));

    expect(result.lines).toHaveLength(BLAME_PAGE_SIZE);
    expect(result.lines[result.lines.length - 1]).toBe(BLAME_PAGE_SIZE);
    expect(result.hasMore).toBe(true);
  });
});
