import * as path from 'node:path';
import * as os from 'node:os';
import type { SystemToolId, SystemToolStatus } from '../../src/shared/ipc/systemTools';
import { systemToolDownloadUrl, systemToolInstructionsUrl } from '../../src/shared/ipc/systemTools';
import { runToolProcess, type ToolProcessRunner } from './ToolProcess';
import { probeToolExecutables, type ToolExecutableProbeResult } from './ToolExecutableProbe';

export type ToolResolverOptions = { platform?: string; env?: NodeJS.ProcessEnv; exists?: (file: string) => boolean; run?: ToolProcessRunner };
const versions: Record<SystemToolId, string> = { git: '^git version ([^\\r\\n]+)', 'git-lfs': '^git-lfs/([^\\s]+)', 'github-cli': '^gh version ([^\\s]+)' };
export class ToolExecutableResolver {
  readonly platform: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly exists?: (file: string) => boolean;
  private readonly injectedProbe: boolean;
  readonly run: ToolProcessRunner;
  private registryDirectories: string[] = [];
  private found = new Map<string, Promise<string | null>>();
  private readonly cancellation = new AbortController();
  private readonly checks = new Set<Promise<ToolExecutableProbeResult>>();
  constructor(options: ToolResolverOptions = {}) {
    this.platform = options.platform || process.platform;
    this.env = options.env || process.env;
    this.exists = options.exists;
    this.injectedProbe = Boolean(options.exists || options.run);
    this.run = options.run || runToolProcess;
  }
  async refreshLocations(): Promise<void> {
    this.registryDirectories = [];
    this.found.clear();
    if (this.platform !== 'win32') return;
    const reg = path.win32.join(this.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
    const queries = ['HKCU', 'HKLM'].flatMap((root) => [
      ['query', `${root}\\Software\\GitForWindows`, '/v', 'InstallPath'],
      ['query', `${root}\\Software\\WOW6432Node\\GitForWindows`, '/v', 'InstallPath'],
      ['query', root === 'HKCU' ? 'HKCU\\Environment' : 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', '/v', 'Path'],
    ]);
    const results = await Promise.all(queries.map((args) => this.run(reg, args, 3000).catch(() => ({ stdout: '', stderr: '' }))));
    for (const { stdout } of results) {
      const install = /InstallPath\s+REG_SZ\s+(.+)/i.exec(stdout)?.[1]?.trim();
      if (install && path.win32.isAbsolute(install)) this.registryDirectories.push(path.win32.join(install, 'cmd'), path.win32.join(install, 'bin'));
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
    return [...new Set(dirs.map((dir) => api.join(dir, win ? `${name}.exe` : name)))];
  }
  async find(name: string): Promise<string | null> {
    if (this.cancellation.signal.aborted) return null;
    const candidates = this.candidates(name);
    const key = JSON.stringify(candidates);
    let pending = this.found.get(key);
    if (!pending) {
      pending = this.probe(candidates).then((result) => result.executable || null);
      this.found.set(key, pending);
    }
    return pending;
  }
  async dispose(): Promise<void> {
    this.cancellation.abort();
    this.found.clear();
    await Promise.allSettled(this.checks);
  }
  private async probe(candidates: string[], id?: SystemToolId): Promise<ToolExecutableProbeResult> {
    if (this.cancellation.signal.aborted) return { detail: 'Program check cancelled.', timedOut: 0 };
    const pattern = id ? versions[id] : undefined;
    if (!this.injectedProbe) {
      const pending = probeToolExecutables(candidates, pattern, { appleGit: this.platform === 'darwin' && id === 'git', signal: this.cancellation.signal });
      this.checks.add(pending);
      let result: ToolExecutableProbeResult;
      try {
        result = await pending;
      } finally {
        this.checks.delete(pending);
      }
      if (result.timedOut) console.warn(`[system-tools] Skipped ${result.timedOut} unresponsive program checks.`);
      return result;
    }
    // Injected in-memory probes keep resolver policy tests independent of a host's installations.
    let detail: string | undefined;
    for (const executable of candidates) {
      if (this.exists && !this.exists(executable)) continue;
      if (this.platform === 'darwin' && id === 'git' && executable === '/usr/bin/git') {
        try {
          await this.run('/usr/bin/xcode-select', ['-p']);
        } catch {
          continue;
        }
      }
      try {
        const { stdout } = await this.run(executable, ['--version']);
        if (pattern && !new RegExp(pattern).test(stdout)) throw new Error('The executable returned an unrecognized version.');
        return { executable, stdout, timedOut: 0 };
      } catch (error) {
        detail = error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500);
      }
    }
    return { detail, timedOut: 0 };
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
      ];
    }
    const { executable, stdout, detail } = await this.probe(candidates, id);
    const version = stdout && new RegExp(versions[id]).exec(stdout)?.[1];
    if (executable && version) return { ...base, state: 'available', version, executable };
    return { ...base, state: detail ? 'unusable' : 'missing', ...(detail ? { detail } : {}) };
  }
}
