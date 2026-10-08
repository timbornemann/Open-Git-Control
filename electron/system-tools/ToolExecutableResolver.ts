import fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SystemToolId, SystemToolStatus } from '../../src/shared/ipc/systemTools';
import { systemToolDownloadUrl, systemToolInstructionsUrl } from '../../src/shared/ipc/systemTools';
import { runToolProcess, type ToolProcessRunner } from './ToolProcess';

export type ToolResolverOptions = { platform?: string; env?: NodeJS.ProcessEnv; exists?: (file: string) => boolean; run?: ToolProcessRunner };
export class ToolExecutableResolver {
  readonly platform: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly exists: (file: string) => boolean;
  readonly run: ToolProcessRunner;
  private registryDirectories: string[] = [];
  constructor(options: ToolResolverOptions = {}) {
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.exists =
      options.exists ||
      ((file) => {
        try {
          return fs.statSync(file).isFile();
        } catch (error) {
          // Windows App Execution Aliases (notably WinGet) can reject stat
          // with EACCES while remaining executable. The bounded probe is authoritative.
          const code = (error as NodeJS.ErrnoException).code;
          return code === 'EACCES' || code === 'EPERM';
        }
      });
    this.run = options.run || runToolProcess;
  }
  async refreshLocations(): Promise<void> {
    this.registryDirectories = [];
    if (this.platform !== 'win32') return;
    const reg = path.win32.join(this.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    for (const root of ['HKCU', 'HKLM']) {
      for (const key of [`${root}\\Software\\GitForWindows`, `${root}\\Software\\WOW6432Node\\GitForWindows`]) {
        try {
          const { stdout } = await this.run(reg, ['query', key, '/v', 'InstallPath'], 3000);
          const install = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)?.[1]?.trim();
          if (install && path.win32.isAbsolute(install)) this.registryDirectories.push(path.win32.join(install, 'cmd'), path.win32.join(install, 'bin'));
        } catch {
          /* A registry entry is optional. */
        }
      }
      try {
        const { stdout } = await this.run(
          reg,
          ['query', root === 'HKCU' ? 'HKCU\\Environment' : 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', 'Path'],
          3000,
        );
        const value = /Path\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(stdout)?.[1];
        if (value)
          this.registryDirectories.push(
            ...value
              .split(';')
              .map((part) =>
                part.replace(
                  /%([^%]+)%/g,
                  (_, name: string) => this.env[Object.keys(this.env).find((key) => key.toLowerCase() === name.toLowerCase()) || name] || '',
                ),
              ),
          );
      } catch {
        /* Continue with PATH and standard installation directories. */
      }
    }
  }
  candidates(name: string): string[] {
    const win = this.platform === 'win32';
    const paths = this.env[Object.keys(this.env).find((key) => key.toLowerCase() === 'path') || 'PATH'] || '';
    const known = win
      ? [
          path.win32.join(this.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd'),
          path.win32.join(this.env.ProgramFiles || 'C:\\Program Files', 'Git LFS'),
          path.win32.join(this.env.ProgramFiles || 'C:\\Program Files', 'GitHub CLI'),
          path.win32.join(this.env.LOCALAPPDATA || path.win32.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'Git', 'cmd'),
          path.win32.join(this.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps'),
        ]
      : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/local/git/bin'];
    const api = win ? path.win32 : path.posix;
    const dirs = [...paths.split(win ? ';' : ':'), ...this.registryDirectories, ...known]
      .map((entry) => entry.replace(/^"|"$/g, ''))
      .filter((entry) => api.isAbsolute(entry));
    return [...new Set(dirs.map((dir) => api.join(dir, win ? `${name}.exe` : name)))].filter(this.exists);
  }
  async find(name: string): Promise<string | null> {
    for (const executable of this.candidates(name)) {
      try {
        await this.run(executable, ['--version']);
        return executable;
      } catch {
        /* Try the next installed location, never a repository executable. */
      }
    }
    return null;
  }
  async inspect(id: SystemToolId, git?: SystemToolStatus): Promise<SystemToolStatus> {
    const base = {
      id,
      required: id === 'git',
      downloadUrl: systemToolDownloadUrl(id, this.platform),
      instructionsUrl: systemToolInstructionsUrl(id, this.platform),
    };
    const names = id === 'github-cli' ? 'gh' : id;
    let candidates = this.candidates(names);
    if (id === 'git-lfs' && git?.executable) {
      const api = this.platform === 'win32' ? path.win32 : path.posix;
      const root = api.dirname(api.dirname(git.executable));
      candidates = [
        ...new Set([
          ...candidates,
          ...['cmd', 'bin', 'usr/bin', 'mingw64/bin', 'mingw32/bin'].map((dir) => api.join(root, dir, this.platform === 'win32' ? 'git-lfs.exe' : 'git-lfs')),
        ]),
      ].filter(this.exists);
    }
    let detail: string | undefined;
    for (const executable of candidates) {
      if (this.platform === 'darwin' && id === 'git' && executable === '/usr/bin/git') {
        try {
          await this.run('/usr/bin/xcode-select', ['-p']);
        } catch {
          continue;
        }
      }
      try {
        const { stdout } = await this.run(executable, ['--version']);
        const version =
          id === 'git'
            ? /^git version ([^\r\n]+)/.exec(stdout)?.[1]
            : id === 'git-lfs'
              ? /^git-lfs\/([^\s]+)/.exec(stdout)?.[1]
              : /^gh version ([^\s]+)/.exec(stdout)?.[1];
        if (!version) throw new Error('The executable returned an unrecognized version.');
        return { ...base, state: 'available', version, executable };
      } catch (error) {
        detail = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      }
    }
    return { ...base, state: detail ? 'unusable' : 'missing', ...(detail ? { detail } : {}) };
  }
}
