import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../GitService';
import { SecretScanService } from '../SecretScanService';
import type { PushSecretScanScope } from '../git/PushSecretScanScope';

const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-secret-preflight-'));
  directories.push(root);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Secret Scan Test');
  git('config', 'user.email', 'scan@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.autocrlf', 'false');
  git('config', 'core.hooksPath', path.join(root, 'no-hooks'));
  git('config', 'core.attributesFile', path.join(root, 'global-attributes'));
  const service = new GitService();
  service.setRepoPath(root);
  const repoPath = service.getRepoPath()!;
  const scanner = new SecretScanService(service);
  const stream = vi.spyOn(service, 'streamCommandLinesAtPath');
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const commit = (file: string, content: string) => {
    write(file, content);
    git('add', '--', file);
    git('commit', '-m', 'Fixture commit');
    return git('rev-parse', 'HEAD');
  };
  const options = { repoPath, strictness: 'low' as const, allowlistText: '' };
  const warm = (extra = {}) => scanner.scanPushDiffs({ ...options, revisions: ['HEAD'], background: true, ...extra });
  const scan = (historyCommits: string[], tagCommits: string[] = [], extra = {}) => {
    const scope: PushSecretScanScope = {
      historyCommits,
      tagCommits,
      notes: [],
      summary: { mode: 'incremental', endpointCount: 1, totalCommits: historyCommits.length + tagCommits.length, fallbackReasons: [] },
      assertCurrent: async () => {},
    };
    return scanner.scanPushDiffs({ ...options, pushScanScope: scope, ...extra });
  };
  const shown = () => stream.mock.calls.filter(([, args]) => args[0] === 'show').flatMap(([, args]) => args.filter((arg) => /^[a-f0-9]{40,64}$/.test(arg)));
  return { root, git, service, scanner, stream, write, commit, warm, scan, shown };
}

describe('cached background push secret scans with real Git', () => {
  it('caches complete commits after a finding limit while never reusing a truncated commit as clean', async () => {
    const f = fixture();
    const many = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n'.repeat(1001));
    const safe = f.commit('safe.ts', 'export const safe = true;\n');
    await f.warm();
    f.stream.mockClear();
    expect((await f.scan([safe])).findings).toEqual([]);
    expect(f.shown()).toEqual([]);
    f.stream.mockClear();
    expect((await f.scan([many])).findings).toHaveLength(1000);
    expect(f.shown()).toEqual([many]);
  }, 20_000);

  it('reuses patches, changed-path metadata and pointer classifications across upstream and identity changes', async () => {
    const f = fixture();
    const oid = f.commit('safe.ts', 'export const initial = true;\n');
    await f.warm();
    f.git('config', 'branch.main.remote', 'another-remote');
    f.git('config', 'user.email', 'other@example.invalid');
    f.stream.mockClear();
    const blobs = vi.spyOn(f.service.runner, 'runBuffer');
    const pointers = vi.spyOn(f.service.runner, 'inspectLfsObjects');
    const result = await f.scan([oid]);
    expect(f.shown()).toEqual([]);
    expect(blobs.mock.calls.some(([, args]) => args[0] === 'diff-tree')).toBe(false);
    expect(pointers.mock.calls.every(([, objects]) => objects.length === 0)).toBe(true);
    expect(result.notes.join('\n')).toContain('Reused verified secret-scan results for 1 commit');
  }, 20_000);

  it('invalidates cached patches for diff configuration while keeping transport configuration separate', async () => {
    const f = fixture();
    const oid = f.commit('safe.ts', 'export const initial = true;\n');
    await f.warm();
    f.git('config', 'diff.algorithm', 'patience');
    f.stream.mockClear();
    await f.scan([oid]);
    expect(f.shown()).toEqual([oid]);
  }, 20_000);

  it('keeps completed small checkpoints when idle work yields and scans only the unfinished commit on push', async () => {
    const f = fixture();
    const oids = Array.from({ length: 9 }, (_, index) => f.commit('safe.ts', `export const value = ${index};\n`));
    let yieldRequested = false;
    const stream = GitService.prototype.streamCommandLinesAtPath.bind(f.service);
    f.stream.mockImplementationOnce(async (...args) => {
      await stream(...args);
      yieldRequested = true;
    });
    const partial = await f.warm({ preflightCommits: oids, shouldYield: () => yieldRequested });
    expect(partial.historyScanIncomplete).toBe(true);
    expect(f.shown()).toEqual(oids.slice(0, 8));
    f.stream.mockClear();
    const result = await f.scan(oids);
    expect(result.historyScanIncomplete).toBeUndefined();
    expect(f.shown()).toEqual([oids[8]]);
  }, 30_000);

  it('reuses a full-history preflight for the published subset and leaves new staging to the pre-commit check', async () => {
    const f = fixture();
    f.commit('safe.ts', 'export const initial = true;\n');
    const secret = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const removed = f.commit('private.env', 'Removed again\n');
    const warm = await f.warm();
    expect(warm.findings).toHaveLength(1);
    expect(f.shown()).toHaveLength(3);
    expect(f.stream.mock.calls.every(([, args, , , options]) => args[0] === 'show' && options?.requestedKind === 'background')).toBe(true);
    expect(f.service.runner.getSchedulerDiagnostics().every(({ kind }) => kind === 'background')).toBe(true);
    f.stream.mockClear();
    f.write('staged.env', 'AWS_ACCESS_KEY_ID=AKIAFEDCBA0987654321\n');
    f.git('add', 'staged.env');
    const result = await f.scan([secret, removed]);
    expect(result.historyScanIncomplete).toBeUndefined();
    expect(result.findings.map(({ source, filePath }) => [source, filePath])).toEqual([['to-push', 'private.env']]);
    expect(result.stats).toMatchObject({ stagedLines: 0, toPushLines: 2 });
    expect(f.shown()).toEqual([]);
    expect(f.stream.mock.calls.some(([, args]) => args[0] === 'diff')).toBe(false);
    expect((await f.scanner.scanStagedDiffs({ repoPath: f.root, strictness: 'low', allowlistText: '' })).findings).toEqual([
      expect.objectContaining({ source: 'staged', filePath: 'staged.env' }),
    ]);
  }, 20_000);

  it('scans only the new commit after a second commit and reclassifies cached results for tag pushes', async () => {
    const f = fixture();
    const initial = f.commit('safe.ts', 'export const initial = true;\n');
    await f.warm();
    f.stream.mockClear();
    const next = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    await f.warm();
    expect(f.shown()).toEqual([next]);
    f.stream.mockClear();
    const result = await f.scan([], [initial, next]);
    expect(f.shown()).toEqual([]);
    expect(result.findings).toEqual([expect.objectContaining({ source: 'tag', ruleId: 'aws-access-key-id' })]);
    expect(result.stats).toMatchObject({ toPushLines: 0, tagLines: 2 });
  }, 20_000);

  it('rescans for changed allowlists and strictness rather than reusing a previous clean decision', async () => {
    const f = fixture();
    const oid = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    expect((await f.warm({ allowlistText: 'path:private.env' })).findings).toEqual([]);
    f.stream.mockClear();
    expect((await f.scan([oid])).findings).toHaveLength(1);
    expect(f.shown()).toEqual([oid]);
    f.stream.mockClear();
    await f.scan([oid], [], { strictness: 'high' });
    expect(f.shown()).toEqual([oid]);
  }, 20_000);

  it.each(['.gitattributes', '.git/info/attributes', 'global-attributes'])(
    'invalidates clean results when effective attributes change in %s',
    async (attributes) => {
      const f = fixture();
      f.write(attributes, '*.env -diff\n');
      const oid = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
      expect((await f.warm()).findings).toEqual([]);
      f.stream.mockClear();
      f.write(attributes, '*.env diff\n');
      expect((await f.scan([oid])).findings).toHaveLength(1);
      expect(f.shown()).toEqual([oid]);
    },
    20_000,
  );

  it('does the ordinary scan when no preflight exists and never caches an interrupted batch', async () => {
    const f = fixture();
    const oid = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const controller = new AbortController();
    const original = GitService.prototype.streamCommandLinesAtPath.bind(f.service);
    f.stream.mockImplementationOnce(async (...args) => {
      await original(...args);
      controller.abort();
    });
    await expect(f.warm({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    f.stream.mockClear();
    const result = await f.scan([oid]);
    expect(result.findings).toHaveLength(1);
    expect(f.shown()).toEqual([oid]);
  }, 20_000);

  it('keeps findings out of cached decisions when attributes change during the scan', async () => {
    const f = fixture();
    const oid = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    const original = GitService.prototype.streamCommandLinesAtPath.bind(f.service);
    f.stream.mockImplementationOnce(async (...args) => {
      await original(...args);
      f.write('.gitattributes', '*.env -diff\n');
    });
    const result = await f.warm();
    expect(result.historyScanIncomplete).toBe(true);
    f.write('.gitattributes', '*.env diff\n');
    f.stream.mockClear();
    expect((await f.scan([oid])).findings).toHaveLength(1);
    expect(f.shown()).toEqual([oid]);
  }, 20_000);

  it('rechecks LFS contents instead of treating a cached commit as proof of readable LFS objects', async () => {
    const f = fixture();
    const content = 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n';
    const object = createHash('sha256').update(content).digest('hex');
    const location = `.git/lfs/objects/${object.slice(0, 2)}/${object.slice(2, 4)}/${object}`;
    f.write(location, content);
    const run = f.service.runner.run.bind(f.service.runner);
    vi.spyOn(f.service.runner, 'run').mockImplementation((repo, args, options) =>
      args[0] === 'lfs' && args[1] === 'env' ? Promise.resolve(`LocalMediaDir=${path.join(f.root, '.git/lfs/objects')}\n`) : run(repo, args, options),
    );
    const oid = f.commit('data.bin', `version https://git-lfs.github.com/spec/v1\noid sha256:${object}\nsize ${Buffer.byteLength(content)}\n`);
    expect((await f.warm()).findings).toHaveLength(1);
    f.stream.mockClear();
    fs.unlinkSync(path.join(f.root, location));
    const result = await f.scan([oid]);
    expect(f.shown()).toEqual([]);
    expect(result.historyScanIncomplete).toBe(true);
    expect(result.notes.join('\n')).toContain('LFS content is not available locally');
  }, 20_000);

  it('falls back to scanning when cache validity cannot be determined', async () => {
    const f = fixture();
    const oid = f.commit('private.env', 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    await f.warm();
    f.stream.mockClear();
    vi.spyOn(f.service.runner, 'runWithInput').mockRejectedValueOnce(new Error('Attribute read failed'));
    expect((await f.scan([oid])).findings).toHaveLength(1);
    expect(f.shown()).toEqual([oid]);
  }, 20_000);
});
