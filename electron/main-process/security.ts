import { app, Menu, session } from 'electron';
import type { WebContents } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';

type ShortcutInput = {
  key?: string;
  control?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
};

type NavigationOptions = {
  isDev: boolean;
  mainProcessDir: string;
};

type InstallSecurityOptions = NavigationOptions;

const DEV_SERVER_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const UNSAFE_DEBUG_SWITCHES = [
  '--remote-debugging-port',
  '--remote-debugging-pipe',
  '--inspect',
  '--inspect-brk',
];

const normalizePathForCompare = (value: string): string => {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

const productionDistPath = (mainProcessDir: string): string => (
  normalizePathForCompare(path.join(mainProcessDir, '../../dist'))
);

export function hasUnsafeDebugSwitch(argv: readonly string[] = process.argv): boolean {
  return argv.some((arg) => UNSAFE_DEBUG_SWITCHES.some((switchName) => (
    arg === switchName || arg.startsWith(`${switchName}=`)
  )));
}

export function isDevToolsAccelerator(input: ShortcutInput): boolean {
  const key = String(input.key || '').toLowerCase();
  if (key === 'f12') return true;

  const ctrlOrCommand = Boolean(input.control || input.meta);
  const commandOption = Boolean(input.meta && input.alt);
  if ((!ctrlOrCommand || !input.shift) && !commandOption) return false;

  return key === 'i' || key === 'j' || key === 'c';
}

export function isAllowedAppNavigation(url: string, options: NavigationOptions): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (options.isDev) {
    return DEV_SERVER_ORIGINS.has(parsed.origin);
  }

  if (parsed.protocol !== 'file:') return false;

  try {
    const targetPath = normalizePathForCompare(fileURLToPath(parsed));
    const allowedRoot = productionDistPath(options.mainProcessDir);
    return targetPath === allowedRoot || targetPath.startsWith(`${allowedRoot}${path.sep}`);
  } catch {
    return false;
  }
}

export function buildContentSecurityPolicy(isDev: boolean): string {
  if (isDev) {
    return [
      "default-src 'self' http://localhost:5173 http://127.0.0.1:5173",
      "script-src 'self' 'unsafe-eval' http://localhost:5173 http://127.0.0.1:5173",
      "style-src 'self' 'unsafe-inline' http://localhost:5173 http://127.0.0.1:5173",
      "img-src 'self' data: blob: file:",
      "font-src 'self' data:",
      "connect-src 'self' http://localhost:5173 http://127.0.0.1:5173 ws://localhost:5173 ws://127.0.0.1:5173",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "connect-src 'self' http://127.0.0.1:* http://localhost:*",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function enforceProductionCommandLineSecurity(isDev: boolean, argv: readonly string[] = process.argv): void {
  if (isDev || !hasUnsafeDebugSwitch(argv)) return;

  console.error('[security] Refusing to start with remote debugging or inspect switches in production.');
  app.exit(1);
}

function protectWebContents(contents: WebContents, options: InstallSecurityOptions): void {
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  contents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url, options)) {
      event.preventDefault();
    }
  });

  contents.on('will-redirect', (event, url) => {
    if (!isAllowedAppNavigation(url, options)) {
      event.preventDefault();
    }
  });

  if (!options.isDev) {
    contents.on('before-input-event', (event, input) => {
      if (isDevToolsAccelerator(input)) {
        event.preventDefault();
        contents.closeDevTools();
      }
    });

    contents.on('devtools-opened', () => {
      contents.closeDevTools();
    });
  }
}

export function installAppSecurity(options: InstallSecurityOptions): void {
  if (!options.isDev) {
    Menu.setApplicationMenu(null);
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [buildContentSecurityPolicy(options.isDev)],
      },
    });
  });

  app.on('web-contents-created', (_event, contents) => {
    protectWebContents(contents, options);
  });
}
