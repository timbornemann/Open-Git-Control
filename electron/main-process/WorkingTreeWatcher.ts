import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitRunner } from '../git/GitRunner';
import { isInside } from '../git/RepositoryPathSafety';
import type { WatchDirectory } from './OpenGitControlAssetWatcher';

const MAX_SOURCE_DIRECTORIES = 192;
const metadataNames = new Set(['HEAD', 'index', 'config', 'shallow', 'packed-refs', 'refs', 'commondir']);
const normalized = (value: string | Buffer | null) => value?.toString().replace(/\\/g, '/') || '';

/** Notifications are hints, never a substitute for stable snapshot validation.
 * Native recursive watches are used on Windows/macOS. On other platforms a
 * bounded set of tracked directories avoids recursively watching dependencies. */
export class WorkingTreeWatcher {
  private readonly controller = new AbortController();
  private readonly watches = new Map<string, fs.FSWatcher>();
  private readonly sourceDirectories = new Set<string>();
  private timer?: NodeJS.Timeout;
  private topologyTimer?: NodeJS.Timeout;
  private root = '';
  private gitDir = '';
  private commonDir = '';
  private stopped = false;
  private needsRescan = false;
  private topologyRunning = false;
  recursive = false;

  constructor(
    private readonly repoPath: string,
    private readonly git: Pick<GitRunner, 'run' | 'runBuffer'>,
    private readonly onChange: (rescan: boolean) => void,
    private readonly createWatcher: WatchDirectory = (directory, options, listener) => fs.watch(directory, options, listener),
    private readonly nativeRecursive = process.platform === 'win32' || process.platform === 'darwin',
  ) {}

  async start(): Promise<void> {
    try {
      const directories = (
        await this.git.run(this.repoPath, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], {
          signal: this.controller.signal,
          requestedKind: 'background',
        })
      )
        .trim()
        .split(/\r?\n/);
      if (directories.length !== 2 || directories.some((directory) => !path.isAbsolute(directory))) throw new Error('Invalid Git directories.');
      [this.root, this.gitDir, this.commonDir] = await Promise.all([this.repoPath, ...directories].map((directory) => fs.promises.realpath(directory)));
      if (this.stopped) return;
      const bare = this.root === this.gitDir;
      if (!bare) {
        this.recursive = this.nativeRecursive && this.add(this.root, true, this.worktreeChanged);
        if (!this.recursive) this.add(this.root, false, this.worktreeChanged);
      }
      for (const directory of new Set([this.gitDir, this.commonDir])) this.add(directory, false, this.metadataChanged);
      await this.watchHead();
      if (!bare && !this.recursive) await this.watchTrackedDirectories();
    } catch {
      if (!this.stopped) this.notify(true);
    }
  }

  dispose(): void {
    this.stopped = true;
    this.controller.abort();
    clearTimeout(this.timer);
    clearTimeout(this.topologyTimer);
    for (const watcher of this.watches.values()) watcher.close();
    this.watches.clear();
    this.sourceDirectories.clear();
  }

  private add(directory: string, recursive: boolean, changed: (name: string) => void): boolean {
    if (this.stopped || this.watches.has(directory)) return false;
    try {
      const watcher = this.createWatcher(directory, { persistent: false, recursive, encoding: 'utf8' }, (_event, name) => {
        if (!this.stopped) changed(normalized(name));
      });
      watcher.on('error', () => {
        if (this.watches.get(directory) !== watcher) return;
        watcher.close();
        this.watches.delete(directory);
        this.sourceDirectories.delete(directory);
        if (directory === this.root) this.recursive = false;
        this.notify(true);
      });
      this.watches.set(directory, watcher);
      return true;
    } catch {
      return false;
    }
  }

  private worktreeChanged = (name: string) => {
    if (name.split('/').some((part) => part.toLowerCase() === '.git')) {
      if (name === '.git') this.notify(true);
      return;
    }
    this.notify(!name);
    if (!this.recursive && name) void this.watchSourceDirectory(path.join(this.root, name));
  };
  private metadataChanged = (name: string) => {
    if (name && !metadataNames.has(name.split('/')[0])) return;
    this.notify(!name);
    if (!name || name === 'HEAD' || name.startsWith('refs')) void this.watchHead();
    if ((!name || name === 'index') && !this.recursive && !this.topologyTimer) {
      this.topologyTimer = setTimeout(() => {
        this.topologyTimer = undefined;
        void this.watchTrackedDirectories();
      }, 750);
      this.topologyTimer.unref?.();
    }
  };
  private async watchHead(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(path.join(this.gitDir, 'HEAD'), 'utf8');
      if (raw.length > 4096 || !raw.startsWith('ref: refs/')) return;
      const target = path.dirname(path.resolve(this.commonDir, raw.slice(5).trim()));
      if (!isInside(this.commonDir, target) || this.watches.size > MAX_SOURCE_DIRECTORIES + 16) return;
      for (const directory of new Set([path.join(this.commonDir, 'refs'), path.join(this.commonDir, 'refs', 'heads'), target])) {
        this.add(directory, false, () => {
          this.notify(false);
          void this.watchHead();
        });
      }
    } catch {
      // Unborn refs and replacement directories are covered by bounded polling.
    }
  }
  private async watchSourceDirectory(directory: string): Promise<void> {
    if (this.stopped || this.sourceDirectories.size >= MAX_SOURCE_DIRECTORIES) return;
    try {
      const physical = await fs.promises.realpath(directory);
      if (this.stopped || !isInside(this.root, physical) || !(await fs.promises.stat(physical)).isDirectory()) return;
      if (
        path
          .relative(this.root, physical)
          .split(path.sep)
          .some((part) => part.toLowerCase() === '.git')
      )
        return;
      if (this.sourceDirectories.size >= MAX_SOURCE_DIRECTORIES) return;
      if (
        this.add(physical, false, (name) => {
          this.notify(!name);
          if (name) void this.watchSourceDirectory(path.join(physical, name));
        })
      )
        this.sourceDirectories.add(physical);
    } catch {
      // Missing, renamed and external symlink targets do not create watches.
    }
  }
  private async watchTrackedDirectories(): Promise<void> {
    if (this.stopped || this.topologyRunning) return;
    this.topologyRunning = true;
    try {
      const raw = await this.git.runBuffer(this.repoPath, ['ls-files', '--cached', '-z'], {
        signal: this.controller.signal,
        requestedKind: 'background',
        maxBytes: 16 * 1024 * 1024,
        tooLargeMessage: 'Tracked paths exceed the watch limit.',
      });
      const parents = new Set(
        raw
          .toString()
          .split('\0')
          .filter(Boolean)
          .map((file) => path.dirname(file)),
      );
      for (const directory of [...parents].slice(0, MAX_SOURCE_DIRECTORIES)) {
        if (this.stopped) break;
        await this.watchSourceDirectory(path.resolve(this.root, directory));
      }
    } catch {
      if (!this.stopped) this.notify(true);
    } finally {
      this.topologyRunning = false;
    }
  }
  private notify(rescan: boolean) {
    if (this.stopped) return;
    this.needsRescan ||= rescan;
    // At most one event per burst, with a bounded wait even during a build.
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const uncertain = this.needsRescan;
      this.needsRescan = false;
      if (!this.stopped) this.onChange(uncertain);
    }, 150);
    this.timer.unref?.();
  }
}
