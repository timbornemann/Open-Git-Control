import { isCancelledError } from '@tanstack/react-query';

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error || ''));
export const isGitOperationAborted = (error: unknown): boolean =>
  isCancelledError(error) ||
  (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') ||
  /\b(?:operation|read) was (?:aborted|cancelled)\b/i.test(errorMessage(error));
export const cancelDeferredRetry = (timeoutRef: { current: number | null }): void => {
  if (timeoutRef.current === null) return;
  window.clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
};
export const requestDeferredFrame = (callback: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(callback) : window.setTimeout(() => callback(performance.now()), 0);
export const cancelDeferredFrame = (id: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
  else window.clearTimeout(id);
};
