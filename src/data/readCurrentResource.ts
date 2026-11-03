import { CancelledError } from '@tanstack/react-query';

/** Invalidation can cancel a cold read before it has any cached data. A
 * consumer that still needs that resource must read its replacement, while
 * disposed consumers must stop without starting work for the previous view. */
export async function readCurrentResource<T>(read: () => Promise<T>, isCurrent: () => boolean): Promise<T | undefined> {
  while (isCurrent()) {
    try {
      const result = await read();
      return isCurrent() ? result : undefined;
    } catch (error) {
      if (!isCurrent()) return undefined;
      if (!(error instanceof CancelledError)) throw error;
    }
  }
  return undefined;
}
