import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkingTreeWatcher } from '../WorkingTreeWatcher';
import type { WatchDirectory } from '../OpenGitControlAssetWatcher';

type Watched = { directory: string; recursive: boolean; events: EventEmitter; close: ReturnType<typeof vi.fn>; change: (name: string | null) => void };
let root: string, repo: string, gitDir: string, commonDir: string;
let watches: Watched[], monitors: WorkingTreeWatcher[];
const changed = vi.fn();
const directory = (...parts: string[]) => {
  const name = path.join(...parts);
  fs.mkdirSync(name, { recursive: true });
  return name;
};
const watch: WatchDirectory = (directory, options, callback) => {
  const events = new EventEmitter();
  const close = vi.fn();
  const watched = { directory, recursive: Boolean(options.recursive), events, close, change: (name: string | null) => callback('rename', name) };
  watches.push(watched);
  return Object.assign(events, { close }) as unknown as fs.FSWatcher;
};
function fixture(recursive = true, files = ['src/file.txt'], create: WatchDirectory = watch) {
  const git = { run: vi.fn(async () => `${gitDir}\n${commonDir}\n`), runBuffer: vi.fn(async () => Buffer.from(files.join('\0') + '\0')) };
  const monitor = new WorkingTreeWatcher(repo, git as any, changed, create, recursive);
  monitors.push(monitor);
  return { monitor, git };
}
const at = (name: string) => watches.find((entry) => entry.directory === name)!;
const flush = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // Real paths avoid macOS /var -> /private/var aliases in watcher expectations.
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-working-watch-')));
  repo = directory(root, 'repo');
  gitDir = directory(repo, '.git');
  commonDir = gitDir;
  directory(commonDir, 'refs', 'heads', 'feature');
  directory(repo, 'src');
  fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/feature/current\n');
  watches = [];
  monitors = [];
  changed.mockReset();
});
afterEach(async () => {
  for (const monitor of monitors) monitor.dispose();
  await flush();
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  vi.useRealTimers();
});

describe('native working tree change hints', () => {
  it('uses recursive source notifications, coalesces bursts and ignores Git object and fetch noise', async () => {
    const { monitor, git } = fixture();
    await monitor.start();
    expect(monitor.recursive).toBe(true);
    expect(at(repo).recursive).toBe(true);
    expect(git.runBuffer).not.toHaveBeenCalled();
    at(repo).change('.git/objects/ab/blob');
    at(gitDir).change('FETCH_HEAD');
    at(gitDir).change('index.lock');
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).not.toHaveBeenCalled();
    for (let i = 0; i < 30; i++) at(repo).change('src/file.txt');
    await vi.advanceTimersByTimeAsync(149);
    expect(changed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    at(gitDir).change('index'); // Watches directory, so an atomic index replacement is detected too.
    at(path.join(commonDir, 'refs', 'heads', 'feature')).change('current');
    await vi.advanceTimersByTimeAsync(150);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('falls back to bounded tracked-directory watches when recursive watching is unsupported', async () => {
    const { monitor, git } = fixture(true, ['src/file.txt'], (target, options, listener) => {
      if (options.recursive) throw new Error('not supported');
      return watch(target, options, listener);
    });
    await monitor.start();
    expect(monitor.recursive).toBe(false);
    expect(git.runBuffer).toHaveBeenCalledExactlyOnceWith(repo, ['ls-files', '--cached', '-z'], expect.objectContaining({ requestedKind: 'background' }));
    expect(at(repo).recursive).toBe(false);
    at(path.join(repo, 'src')).change('file.txt');
    await vi.advanceTimersByTimeAsync(150);
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    at(gitDir).change('index');
    at(gitDir).change('index');
    await vi.advanceTimersByTimeAsync(750);
    expect(git.runBuffer).toHaveBeenCalledTimes(2);
  });

  it('bounds portable watches, excludes Git internals and rejects tracked paths outside the working tree', async () => {
    const files = Array.from({ length: 220 }, (_, index) => `d-${index}/file.txt`);
    files.forEach((file) => directory(repo, path.dirname(file)));
    const { monitor } = fixture(false, ['../outside/file', '.git/objects/blob', ...files]);
    await monitor.start();
    const source = watches.filter((entry) => entry.directory.startsWith(path.join(repo, 'd-')));
    expect(source.length).toBeGreaterThan(100);
    expect(source.length).toBeLessThanOrEqual(192);
    expect(watches.some((entry) => entry.directory === path.join(root, 'outside'))).toBe(false);
    expect(watches.some((entry) => entry.directory === path.join(gitDir, 'objects'))).toBe(false);
  });

  it('watches linked worktree index and shared branch refs without watching metadata as source files', async () => {
    commonDir = gitDir;
    gitDir = directory(commonDir, 'worktrees', 'linked');
    repo = directory(root, 'linked');
    fs.writeFileSync(path.join(repo, '.git'), 'gitdir: ' + gitDir);
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/feature/current\n');
    const { monitor } = fixture();
    await monitor.start();
    expect(at(gitDir)).toBeDefined();
    expect(at(commonDir)).toBeDefined();
    expect(at(path.join(commonDir, 'refs', 'heads', 'feature'))).toBeDefined();
    at(gitDir).change('index');
    at(commonDir).change('packed-refs');
    at(repo).change('.git');
    await vi.advanceTimersByTimeAsync(150);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('treats a bare repository as metadata only', async () => {
    repo = gitDir;
    const { monitor, git } = fixture();
    await monitor.start();
    expect(monitor.recursive).toBe(false);
    expect(git.runBuffer).not.toHaveBeenCalled();
    expect(watches.every((entry) => !entry.recursive)).toBe(true);
    at(gitDir).change('HEAD');
    await vi.advanceTimersByTimeAsync(150);
    expect(changed).toHaveBeenCalledWith(false);
  });

  it('reports uncertain events and watch failures, and ignores all callbacks after disposal', async () => {
    const { monitor } = fixture();
    await monitor.start();
    at(repo).change(null);
    await vi.advanceTimersByTimeAsync(150);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    at(repo).events.emit('error', new Error('watch unavailable'));
    expect(monitor.recursive).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(changed).toHaveBeenCalledTimes(2);
    monitor.dispose();
    for (const entry of watches) entry.change('file.txt');
    await vi.advanceTimersByTimeAsync(3000);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(watches.every((entry) => entry.close.mock.calls.length === 1)).toBe(true);
  });

  it('does not attach late watches when initialization is cancelled', async () => {
    const { monitor, git } = fixture();
    let finish!: (value: string) => void;
    git.run.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const starting = monitor.start();
    monitor.dispose();
    finish(`${gitDir}\n${commonDir}`);
    await starting;
    expect(watches).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changed).not.toHaveBeenCalled();
  });

  it('observes a real edit below a tracked directory with the platform filesystem watcher', async () => {
    vi.useRealTimers();
    const git = { run: async () => `${gitDir}\n${commonDir}\n`, runBuffer: async () => Buffer.from('src/file.txt\0') };
    const monitor = new WorkingTreeWatcher(repo, git as any, changed);
    monitors.push(monitor);
    await monitor.start();
    fs.writeFileSync(path.join(repo, 'src', 'file.txt'), 'changed\n');
    await vi.waitFor(() => expect(changed).toHaveBeenCalled(), { timeout: 3000, interval: 25 });
  });
});
