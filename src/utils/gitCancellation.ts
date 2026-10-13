/** Match cancellation diagnostics, never words inside branch names or paths. */
export function isGitCancellation(error: unknown): boolean {
  if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return true;
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  return /^(?:(?:Error|AbortError):\s*)?(?:(?:Git\s+)?(?:operation|command|read|file read|diff preview|stream|clone)|The read|This operation|Transfer)(?: was)? (?:aborted|cancelled|canceled)(?: before this endpoint started)?[.!]?$/i.test(
    message.trim(),
  );
}
