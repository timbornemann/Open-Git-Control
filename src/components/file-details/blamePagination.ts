export const BLAME_PAGE_SIZE = 500;
export const BLAME_LOOKAHEAD_COUNT = BLAME_PAGE_SIZE + 1;

export type BlamePage<T> = {
  lines: T[];
  hasMore: boolean;
};

/**
 * A blame response includes one look-ahead line. This makes the end of a
 * file distinguishable from a full page without issuing a failing request
 * beyond the final line of files whose length is an exact page multiple.
 */
export const splitBlamePage = <T>(lines: T[]): BlamePage<T> => ({
  lines: lines.slice(0, BLAME_PAGE_SIZE),
  hasMore: lines.length > BLAME_PAGE_SIZE,
});
