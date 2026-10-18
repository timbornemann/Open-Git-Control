import { afterEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '../appClient';

afterEach(() => vi.unstubAllGlobals());
describe('opening the independent recovery updater', () => {
  it('delegates every explicit launch without accepting executable paths or caching the launch result', async () => {
    const openRecoveryUpdater = vi.fn().mockResolvedValue({ success: true });
    vi.stubGlobal('window', { electronAPI: { app: { openRecoveryUpdater } } });
    await expect(appClient.openRecoveryUpdater()).resolves.toEqual({ success: true });
    await expect(appClient.openRecoveryUpdater()).resolves.toEqual({ success: true });
    expect(openRecoveryUpdater.mock.calls).toEqual([[], []]);
  });
  it('preserves an actionable main-process failure for the settings UI', async () => {
    const result = { success: false, error: 'Download the standalone helper from official GitHub Releases.' };
    vi.stubGlobal('window', { electronAPI: { app: { openRecoveryUpdater: vi.fn().mockResolvedValue(result) } } });
    await expect(appClient.openRecoveryUpdater()).resolves.toEqual(result);
  });
});
