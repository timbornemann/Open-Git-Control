import * as path from 'node:path';

/**
 * Windows resolves a bare executable name against the working directory before
 * PATH (libuv mirrors CreateProcess here), so a repository or download folder
 * containing e.g. `taskkill.exe` could be started instead of the system tool.
 * System binaries are therefore always launched by their absolute path.
 */
export const windowsSystemExecutable = (...segments: string[]): string =>
  path.win32.join(process.env.SystemRoot || process.env.windir || 'C:\\Windows', 'System32', ...segments);
