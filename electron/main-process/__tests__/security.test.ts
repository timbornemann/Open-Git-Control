import * as path from 'path';
import { pathToFileURL } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { appExitMock, appOnMock, setApplicationMenuMock, permissionRequestMock, permissionCheckMock, headersReceivedMock } = vi.hoisted(() => ({
  appExitMock: vi.fn(),
  appOnMock: vi.fn(),
  setApplicationMenuMock: vi.fn(),
  permissionRequestMock: vi.fn(),
  permissionCheckMock: vi.fn(),
  headersReceivedMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    exit: appExitMock,
    on: appOnMock,
  },
  Menu: {
    setApplicationMenu: setApplicationMenuMock,
  },
  session: {
    defaultSession: {
      setPermissionRequestHandler: permissionRequestMock,
      setPermissionCheckHandler: permissionCheckMock,
      webRequest: {
        onHeadersReceived: headersReceivedMock,
      },
    },
  },
}));

import {
  buildContentSecurityPolicy,
  enforceProductionCommandLineSecurity,
  hasUnsafeDebugSwitch,
  installAppSecurity,
  isAllowedAppNavigation,
  isDevToolsAccelerator,
} from '../security';

describe('Electron security guards', () => {
  beforeEach(() => {
    appExitMock.mockClear();
    appOnMock.mockClear();
    setApplicationMenuMock.mockClear();
    permissionRequestMock.mockClear();
    permissionCheckMock.mockClear();
    headersReceivedMock.mockClear();
  });

  it('detects devtools keyboard shortcuts', () => {
    expect(isDevToolsAccelerator({ key: 'F12' })).toBe(true);
    expect(isDevToolsAccelerator({ key: 'I', control: true, shift: true })).toBe(true);
    expect(isDevToolsAccelerator({ key: 'J', meta: true, alt: true })).toBe(true);
    expect(isDevToolsAccelerator({ key: 'R', control: true })).toBe(false);
  });

  it('detects unsafe production debugging switches', () => {
    expect(hasUnsafeDebugSwitch(['app.exe', '--remote-debugging-port=9222'])).toBe(true);
    expect(hasUnsafeDebugSwitch(['app.exe', '--inspect-brk'])).toBe(true);
    expect(hasUnsafeDebugSwitch(['app.exe'])).toBe(false);
  });

  it('allows only the dev server in development navigation', () => {
    const options = { isDev: true, mainProcessDir: __dirname };

    expect(isAllowedAppNavigation('http://localhost:5173/src/main.tsx', options)).toBe(true);
    expect(isAllowedAppNavigation('http://127.0.0.1:5173/', options)).toBe(true);
    expect(isAllowedAppNavigation('https://example.com/', options)).toBe(false);
  });

  it('allows only built app files in production navigation', () => {
    const mainProcessDir = path.join(process.cwd(), 'dist-electron', 'electron');
    const appFile = pathToFileURL(path.join(mainProcessDir, '../../dist/index.html')).toString();
    const outsideFile = pathToFileURL(path.join(mainProcessDir, '../../package.json')).toString();
    const options = { isDev: false, mainProcessDir };

    expect(isAllowedAppNavigation(appFile, options)).toBe(true);
    expect(isAllowedAppNavigation(outsideFile, options)).toBe(false);
    expect(isAllowedAppNavigation('https://github.com/', options)).toBe(false);
  });

  it('builds production CSP without remote font sources', () => {
    const policy = buildContentSecurityPolicy(false);

    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('fonts.googleapis.com');
    expect(policy).not.toContain('font.gstatic.com');
  });

  it('allows Vite React refresh inline scripts only in development CSP', () => {
    expect(buildContentSecurityPolicy(true)).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
    expect(buildContentSecurityPolicy(false)).toContain("script-src 'self'");
    expect(buildContentSecurityPolicy(false)).not.toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'");
  });

  it('exits production when debug switches are present', () => {
    enforceProductionCommandLineSecurity(false, ['app.exe', '--remote-debugging-port=9222']);

    expect(appExitMock).toHaveBeenCalledWith(1);
  });

  it('installs process-wide Electron security handlers', () => {
    installAppSecurity({ isDev: false, mainProcessDir: __dirname });

    expect(setApplicationMenuMock).toHaveBeenCalledWith(null);
    expect(permissionRequestMock).toHaveBeenCalledOnce();
    expect(permissionCheckMock).toHaveBeenCalledOnce();
    expect(headersReceivedMock).toHaveBeenCalledOnce();
    expect(appOnMock).toHaveBeenCalledWith('web-contents-created', expect.any(Function));
  });

  it('denies permissions and attaches CSP headers', () => {
    installAppSecurity({ isDev: false, mainProcessDir: __dirname });

    const permissionHandler = permissionRequestMock.mock.calls[0][0];
    const permissionCallback = vi.fn();
    permissionHandler({}, 'media', permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);

    const permissionCheckHandler = permissionCheckMock.mock.calls[0][0];
    expect(permissionCheckHandler()).toBe(false);

    const headersHandler = headersReceivedMock.mock.calls[0][0];
    const headersCallback = vi.fn();
    headersHandler({ responseHeaders: { Existing: ['yes'] } }, headersCallback);
    expect(headersCallback).toHaveBeenCalledWith({
      responseHeaders: expect.objectContaining({
        Existing: ['yes'],
        'Content-Security-Policy': [buildContentSecurityPolicy(false)],
      }),
    });
  });

  it('blocks unsafe navigation and devtools shortcuts on protected web contents', () => {
    installAppSecurity({ isDev: false, mainProcessDir: __dirname });

    const webContentsCreatedHandler = appOnMock.mock.calls.find((call) => call[0] === 'web-contents-created')?.[1];
    const listeners = new Map<string, (...args: any[]) => void>();
    const closeDevTools = vi.fn();
    const contents = {
      on: vi.fn((eventName: string, handler: (...args: any[]) => void) => {
        listeners.set(eventName, handler);
      }),
      closeDevTools,
    };

    webContentsCreatedHandler({}, contents);

    const preventNavigation = vi.fn();
    listeners.get('will-navigate')?.({ preventDefault: preventNavigation }, 'https://example.com');
    expect(preventNavigation).toHaveBeenCalledOnce();

    const preventShortcut = vi.fn();
    listeners.get('before-input-event')?.({ preventDefault: preventShortcut }, { key: 'I', control: true, shift: true });
    expect(preventShortcut).toHaveBeenCalledOnce();
    expect(closeDevTools).toHaveBeenCalledOnce();

    listeners.get('devtools-opened')?.();
    expect(closeDevTools).toHaveBeenCalledTimes(2);

    const preventWebview = vi.fn();
    listeners.get('will-attach-webview')?.({ preventDefault: preventWebview });
    expect(preventWebview).toHaveBeenCalledOnce();
  });
});
