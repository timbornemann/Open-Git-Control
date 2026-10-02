import { afterEach, expect, it, vi } from 'vitest';
import { gitClient } from '@/services/gitClient';

afterEach(() => vi.unstubAllGlobals());

it('subscribes to repository job progress and returns the preload unsubscribe function', () => {
  const listener = vi.fn();
  const unsubscribe = vi.fn();
  const onJobEvent = vi.fn(() => unsubscribe);
  vi.stubGlobal('window', { electronAPI: { git: { onJobEvent } } });

  const stop = gitClient.onJobEvent(listener);

  expect(onJobEvent).toHaveBeenCalledWith(listener);
  expect(stop).toBe(unsubscribe);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
