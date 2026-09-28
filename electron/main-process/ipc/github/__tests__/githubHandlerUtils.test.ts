import { describe, expect, it, vi } from 'vitest';
import { assertGithubAuthenticated, getGithubApiErrorDetails, githubReadFailure, normalizePrState, toErrorMessage } from '../githubHandlerUtils';

describe('githubHandlerUtils', () => {
  it('normalizes thrown values into user-facing messages', () => {
    expect(toErrorMessage(new Error('explicit'), 'fallback')).toBe('explicit');
    expect(toErrorMessage('plain failure', 'fallback')).toBe('fallback');
  });

  it('replaces GitHub HTML service pages with a concise retryable error', () => {
    expect(
      toErrorMessage(
        Object.assign(new Error('<!DOCTYPE html><html><head><title>Unicorn! &middot; GitHub</title></head></html>'), { status: 503 }),
        'Workflow runs could not be loaded.',
      ),
    ).toBe('GitHub is temporarily unavailable (HTTP 503). Please try again shortly.');
  });

  it('extracts API status, API message and generic message defensively', () => {
    expect(
      getGithubApiErrorDetails({
        status: '404',
        message: 'Request failed',
        response: { data: { message: 'Not Found' } },
      }),
    ).toEqual({
      status: 404,
      apiMessage: 'Not Found',
      message: 'Request failed',
    });
    const emptyDetails = getGithubApiErrorDetails(null);
    expect(Number.isNaN(emptyDetails.status)).toBe(true);
    expect(emptyDetails).toEqual({
      status: NaN,
      apiMessage: '',
      message: '',
    });
  });

  it.each([
    { status: 429, headers: { 'retry-after': '12' }, wait: 12_000 },
    { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000090' }, wait: 90_000 },
    { status: 403, message: 'Secondary rate limit', wait: 60_000 },
    { status: 429, headers: { 'x-ratelimit-reset': '1' }, wait: 1000 },
    { status: 403, message: 'Permission denied', wait: undefined },
    { status: 401, wait: undefined },
  ])('preserves rate-limit scheduling information: $status, $wait', ({ status, headers, message, wait }) => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000_000_000_000);
    try {
      const error = Object.assign(new Error(message || 'Request failed'), { status, response: { headers } });
      expect(githubReadFailure(error, 'Fallback')).toEqual({
        success: false,
        status,
        error: message || 'Request failed',
        retryAt: wait === undefined ? undefined : 2_000_000_000_000 + wait,
      });
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('does not invent a retry deadline for a network error without an HTTP response', () => {
    expect(githubReadFailure(null, 'Offline')).toEqual({ success: false, error: 'Offline', status: null, retryAt: undefined });
  });

  it('normalizes PR state and authentication guards', () => {
    expect(normalizePrState('closed')).toBe('closed');
    expect(normalizePrState('all')).toBe('all');
    expect(normalizePrState('unexpected')).toBe('open');

    expect(assertGithubAuthenticated({ isAuthenticated: vi.fn().mockReturnValue(true) } as any)).toBeNull();
    expect(assertGithubAuthenticated({ isAuthenticated: vi.fn().mockReturnValue(false) } as any)).toEqual({
      success: false,
      error: 'Not authenticated',
    });
  });
});
