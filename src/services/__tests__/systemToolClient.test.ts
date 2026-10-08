import { afterEach, describe, expect, it, vi } from 'vitest';
import { appClient } from '../appClient';

afterEach(() => vi.unstubAllGlobals());
describe('app tool contract', () => {
  it('delegates status, explicit installation and detachable events to the app bridge', async () => {
    const stop = vi.fn();
    const status = { tools: [] };
    const event = { operationId: 'one', toolId: 'git', phase: 'done' };
    const api = {
      getSystemToolsStatus: vi.fn().mockResolvedValue(status),
      recheckSystemTools: vi.fn().mockResolvedValue(status),
      installSystemTool: vi.fn().mockResolvedValue({ success: true, data: event }),
      onSystemToolsStatus: vi.fn().mockReturnValue(stop),
      onSystemToolInstallation: vi.fn().mockReturnValue(stop),
    };
    vi.stubGlobal('window', { electronAPI: { app: api } });
    expect(await appClient.getSystemToolsStatus()).toBe(status);
    expect(await appClient.recheckSystemTools()).toBe(status);
    expect(await appClient.installSystemTool({ toolId: 'git' })).toMatchObject({ data: event });
    expect(api.installSystemTool).toHaveBeenCalledExactlyOnceWith({ toolId: 'git' });
    const listener = vi.fn();
    expect(appClient.onSystemToolsStatus(listener)).toBe(stop);
    expect(appClient.onSystemToolInstallation(listener)).toBe(stop);
    expect(api.onSystemToolsStatus).toHaveBeenCalledExactlyOnceWith(listener);
    expect(api.onSystemToolInstallation).toHaveBeenCalledExactlyOnceWith(listener);
  });
});
