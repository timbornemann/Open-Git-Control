import { afterEach, expect, it, vi } from 'vitest';
import type { ElectronAPI } from '@/shared/ipc/contracts/electronApi';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('uses a per-renderer simulation without exposing it as a native window bridge', async () => {
  vi.stubGlobal('window', {});
  const { getElectronApi, setIsolatedElectronApi } = await import('../electronApi');
  const simulated = { app: {} } as ElectronAPI;
  setIsolatedElectronApi(simulated);
  expect(getElectronApi()).toBe(simulated);
  expect(window.electronAPI).toBeUndefined();
});
it('refuses to replace an existing native application bridge', async () => {
  const native = { app: {} } as ElectronAPI;
  vi.stubGlobal('window', { electronAPI: native });
  const { getElectronApi, setIsolatedElectronApi } = await import('../electronApi');
  expect(() => setIsolatedElectronApi({} as ElectronAPI)).toThrow('Cannot replace');
  expect(getElectronApi()).toBe(native);
});
