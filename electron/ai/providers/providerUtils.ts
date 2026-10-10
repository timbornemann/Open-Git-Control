export const safeString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

/** Fast enough for settings UI checks while still tolerating local model startup. */
export const AI_DISCOVERY_TIMEOUT_MS = 15_000;

/** Discovery must keep its deadline active while consuming the response body. */
export function fetchJsonWithTimeout<T>(url: string, init: RequestInit, timeoutMs: number, errorPrefix: string): Promise<T> {
  return fetchWithTimeout(url, init, timeoutMs, undefined, async (response) => {
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${errorPrefix} (${response.status}): ${text || response.statusText}`);
    }
    return response.json() as Promise<T>;
  });
}

export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, shouldCancel?: () => boolean): Promise<Response>;
export function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  shouldCancel: (() => boolean) | undefined,
  consume: (response: Response) => Promise<T>,
): Promise<T>;
export async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  shouldCancel?: () => boolean,
  consume?: (response: Response) => Promise<T>,
): Promise<T | Response> {
  const controller = new AbortController();
  let abortedByCancel = false;
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  const cancelPoll = setInterval(() => {
    if (!shouldCancel?.()) return;
    abortedByCancel = true;
    controller.abort();
  }, 120);

  try {
    if (shouldCancel?.()) {
      abortedByCancel = true;
      controller.abort();
    }
    // Redirects can forward prompts and custom credential headers (such as
    // x-goog-api-key) to a destination the user did not configure.
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
    return consume ? await consume(response) : response;
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : '';
    if (errorName === 'AbortError') {
      if (abortedByCancel || shouldCancel?.()) {
        throw new Error('KI Auto-Commit wurde abgebrochen.');
      }
      throw new Error(`KI Anfrage Zeitlimit ueberschritten (${Math.round(timeoutMs / 1000)}s).`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    clearInterval(cancelPoll);
  }
}
