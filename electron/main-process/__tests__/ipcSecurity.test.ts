import * as path from 'path';
import { pathToFileURL } from 'url';
import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ ipcMain: {}, app: {}, Menu: {}, session: {} }));

import { installIpcSenderValidation } from '../ipcSecurity';

const options = { isDev: false, mainProcessDir: path.join(process.cwd(), 'dist-electron/electron') };
const appUrl = pathToFileURL(path.join(options.mainProcessDir, '../../dist/index.html')).href;
const eventFor = (url = appUrl): IpcMainInvokeEvent => {
  const frame = { url };
  return { senderFrame: frame, sender: { mainFrame: frame, isDestroyed: () => false } } as unknown as IpcMainInvokeEvent;
};

function register() {
  const handle = vi.fn();
  const registry = { handle };
  installIpcSenderValidation(options, registry);
  const listener = vi.fn((_event, value) => value);
  registry.handle('sensitive-operation', listener);
  const invoke = handle.mock.calls[0][1];
  return { registry, handle, listener, invoke };
}

describe('global IPC sender validation', () => {
  it('passes arguments and results through for the application main frame', async () => {
    const { invoke, listener } = register();
    const event = eventFor();
    expect(await invoke(event, 'value')).toBe('value');
    expect(listener).toHaveBeenCalledWith(event, 'value');
  });

  it.each(['https://example.com/', 'file:///tmp/untrusted.html', 'about:blank', 'http://localhost:5173/'])(
    'rejects a main frame loaded from %s before executing the handler',
    (url) => {
      const { invoke, listener } = register();
      expect(() => invoke(eventFor(url))).toThrow('trusted application window');
      expect(listener).not.toHaveBeenCalled();
    },
  );

  it('rejects subframes even when they claim the app URL', () => {
    const { invoke, listener } = register();
    const event = eventFor();
    expect(() => invoke({ ...event, senderFrame: { url: appUrl } })).toThrow('trusted application window');
    expect(listener).not.toHaveBeenCalled();
  });

  it('rejects missing frames and destroyed senders', () => {
    const { invoke, listener } = register();
    const event = eventFor();
    expect(() => invoke({ ...event, senderFrame: null })).toThrow('trusted application window');
    expect(() => invoke({ ...event, sender: { ...event.sender, isDestroyed: () => true } })).toThrow('trusted application window');
    expect(listener).not.toHaveBeenCalled();
  });

  it('protects later registrations and installs only once', () => {
    const { registry, handle } = register();
    const protectedHandle = registry.handle;
    installIpcSenderValidation(options, registry);
    expect(registry.handle).toBe(protectedHandle);
    const listener = vi.fn();
    registry.handle('later-operation', listener);
    expect(() => handle.mock.calls[1][1](eventFor('https://example.com/'))).toThrow('trusted application window');
    expect(listener).not.toHaveBeenCalled();
  });
});
