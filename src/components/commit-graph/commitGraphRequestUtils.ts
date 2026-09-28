export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error || ''));
export const isGitOperationAborted = (error: unknown): boolean => /git operation was aborted/i.test(errorMessage(error));
export const requestDeferredFrame = (callback: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame(callback) : window.setTimeout(() => callback(performance.now()), 0);
export const cancelDeferredFrame = (id: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id);
  else window.clearTimeout(id);
};
