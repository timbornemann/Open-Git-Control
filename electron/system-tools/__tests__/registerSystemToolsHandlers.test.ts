import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { IpcChannel } from '../../../src/types/ipcContract';
import { registerSystemToolsHandlers } from '../registerSystemToolsHandlers';
import type { SystemToolsService } from '../SystemToolsService';

const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), send: vi.fn() }));
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => state.handlers.set(name, handler) },
  BrowserWindow: {
    fromWebContents: () => ({}),
    getAllWindows: () => [{ isDestroyed: () => false, webContents: { getURL: () => 'http://localhost:5173/', send: state.send } }],
  },
}));
beforeEach(() => {
  state.handlers.clear();
  state.send.mockReset();
});
describe('trusted tool installation IPC', () => {
  it('only accepts fixed tool IDs from the app main frame and forwards status events', async () => {
    const install = vi.fn().mockResolvedValue({ phase: 'done', toolId: 'git', operationId: 'test' });
    let statusListener!: (status: any) => void;
    let installListener!: (event: any) => void;
    const stopStatus = vi.fn();
    const stopInstall = vi.fn();
    const snapshot = { tools: [] };
    const service = {
      install,
      snapshot: () => snapshot,
      recheck: vi.fn().mockResolvedValue(snapshot),
      onStatus: (listener: typeof statusListener) => {
        statusListener = listener;
        return stopStatus;
      },
      onInstall: (listener: typeof installListener) => {
        installListener = listener;
        return stopInstall;
      },
    } as unknown as SystemToolsService;
    const dispose = registerSystemToolsHandlers({ isDev: true, mainProcessDir: '/main' }, service);
    const frame = { url: 'http://localhost:5173/' };
    const event = { senderFrame: frame, sender: { mainFrame: frame } } as IpcMainInvokeEvent;
    const request = state.handlers.get(IpcChannel.AppSystemToolInstall)!;
    expect(await request({ ...event, senderFrame: { url: frame.url } }, { toolId: 'git' })).toMatchObject({ success: false });
    expect(await request({ ...event, senderFrame: { url: 'https://example.com' } }, { toolId: 'git' })).toMatchObject({ success: false });
    expect(await request(event, { toolId: 'git', command: 'arbitrary' })).toMatchObject({ success: false });
    expect(await request(event, { toolId: 'arbitrary' })).toMatchObject({ success: false });
    expect(install).not.toHaveBeenCalled();
    expect(await request(event, { toolId: 'git' })).toMatchObject({ success: true });
    expect(install).toHaveBeenCalledExactlyOnceWith({ toolId: 'git' });
    expect(await state.handlers.get(IpcChannel.AppSystemToolsStatus)!(event)).toBe(snapshot);
    expect(await state.handlers.get(IpcChannel.AppSystemToolsRecheck)!(event)).toBe(snapshot);
    expect(() => state.handlers.get(IpcChannel.AppSystemToolsStatus)!({ senderFrame: null })).toThrow('trusted');
    statusListener(snapshot);
    installListener({ phase: 'installing' });
    expect(state.send).toHaveBeenCalledWith(IpcChannel.AppSystemToolsChanged, snapshot);
    expect(state.send).toHaveBeenCalledWith(IpcChannel.AppSystemToolInstallation, { phase: 'installing' });
    dispose();
    expect(stopStatus).toHaveBeenCalledOnce();
    expect(stopInstall).toHaveBeenCalledOnce();
  });
});
