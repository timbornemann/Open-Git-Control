import { describe, expect, it, vi } from 'vitest';
import { assertGithubAuthenticated, getGithubApiErrorDetails, normalizePrState, toErrorMessage } from '../githubHandlerUtils';

describe('githubHandlerUtils', () => {
  it('normalizes thrown values into user-facing messages', () => {
    expect(toErrorMessage(new Error('explicit'), 'fallback')).toBe('explicit');
    expect(toErrorMessage('plain failure', 'fallback')).toBe('fallback');
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
