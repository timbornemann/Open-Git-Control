import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../../../GitService';
import { handleGitCommand } from '../gitCommandRouter';

const roots: string[] = [];
const privateContents = ['PRIVATE_DIFF_LEFT', 'PRIVATE_DIFF_RIGHT'];

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-diff-security-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const service = new GitService();
  const run = (args: string[]) => service.runCommandAtPath(repo, args);
  await run(['init', '-b', 'main']);
  await run(['config', 'core.autocrlf', 'false']);
  await run(['config', 'maintenance.auto', 'false']);
  await run(['config', 'gc.auto', '0']);
  const write = (file: string, contents: string) => fs.writeFileSync(path.join(repo, file), contents);
  write('tracked.txt', 'base\nstable line 1\nstable line 2\nstable line 3\n');
  await run(['add', '--', 'tracked.txt']);
  const commit = (message: string) =>
    run(['-c', 'user.name=Diff Test', '-c', 'user.email=diff@example.test', '-c', 'commit.gpgSign=false', 'commit', '-m', message]);
  await commit('initial');
  const outside = privateContents.map((contents, index) => {
    const file = path.join(root, `private-${index}.txt`);
    fs.writeFileSync(file, `${contents}\n`);
    return file;
  });
  const diff = (args: string[], explicitRepo = true) => handleGitCommand({ sender: {} }, service, 'diff', args, explicitRepo ? repo : undefined);
  service.setRepoPath(repo);
  return { repo, service, run, write, commit, outside, diff };
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-diff-security-')) {
      throw new Error('Unexpected diff security fixture cleanup path.');
    }
    await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

describe('gitCommandRouter diff filesystem boundary', { timeout: 30000 }, () => {
  it.each([false, true])('rejects outside files before execution with an explicit repository: %s', async (explicitRepo) => {
    const { service, outside, diff } = await fixture();
    const run = vi.spyOn(service, 'runCommand');
    const runAtPath = vi.spyOn(service, 'runCommandAtPath');
    const polling = vi.spyOn(service, 'runPollingCommandAtPath');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const options of [[], ['--numstat']]) {
      const result = await diff([...options, ...outside], explicitRepo);
      expect(result).toEqual({ success: false, error: expect.stringContaining('Diff revision') });
      for (const contents of privateContents) expect(JSON.stringify(result)).not.toContain(contents);
    }

    expect(run).not.toHaveBeenCalled();
    expect(runAtPath).not.toHaveBeenCalled();
    expect(polling).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('rejects traversal, outside directories, and mixed inside/outside paths', async () => {
    const { repo, service, outside, diff } = await fixture();
    const run = vi.spyOn(service, 'runCommandAtPath');
    const pairs = [
      ['../private-0.txt', '../private-1.txt'],
      ['..\\private-0.txt', '..\\private-1.txt'],
      [path.dirname(outside[0]), repo],
      ['tracked.txt', outside[0]],
      [outside[0], '--', 'tracked.txt'],
      ['--', ...outside],
    ];
    for (const args of pairs) {
      expect(await diff(args)).toMatchObject({ success: false });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('does not reinterpret filenames or filesystem aliases as revisions', async () => {
    const { repo, outside, write, diff } = await fixture();
    write('other.txt', 'other\n');
    fs.symlinkSync(path.dirname(outside[0]), path.join(repo, 'outside-link'), process.platform === 'win32' ? 'junction' : 'dir');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    for (const args of [
      ['tracked.txt', 'other.txt'],
      ['outside-link/private-0.txt', 'outside-link/private-1.txt'],
    ]) {
      const result = await diff(args);
      expect(result).toMatchObject({ success: false, error: expect.stringContaining('bad revision') });
      expect(JSON.stringify(result)).not.toContain('diff --git');
      for (const contents of privateContents) expect(JSON.stringify(result)).not.toContain(contents);
    }
  });

  it('preserves unstaged, staged, revision, range, rename-aware, and literal file diffs', async () => {
    const { repo, run, write, commit, diff } = await fixture();
    const initial = await run(['rev-parse', 'HEAD']);
    await run(['branch', 'feature/topic']);
    write('tracked.txt', 'committed\nstable line 1\nstable line 2\nstable line 3\n');
    await run(['mv', '--', 'tracked.txt', 'renamed [file].txt']);
    await run(['add', '--', 'renamed [file].txt']);
    await commit('rename and update');
    const latest = await run(['rev-parse', 'HEAD']);
    expect(await run(['diff', '--name-status', '-M', '-z', initial, latest])).toMatch(/^R\d+\0tracked.txt\0renamed \[file\]\.txt\0$/);
    write('renamed [file].txt', 'staged\n');
    await run(['add', '--', 'renamed [file].txt']);
    write('renamed [file].txt', 'unstaged\n');

    const cases = [
      [],
      ['--numstat'],
      ['--numstat', '--cached'],
      ['--cached', '--', 'renamed [file].txt'],
      ['--', 'renamed [file].txt'],
      ['--name-status', '-M', '-z', initial, latest],
      ['--stat', 'HEAD~1', 'HEAD'],
      ['feature/topic..main'],
      ['feature/topic...main'],
      ['HEAD~1', 'HEAD', '--', 'renamed [file].txt'],
    ];
    const status = await run(['status', '--porcelain=v1', '-z']);

    for (const args of cases) {
      const expected = await run(['diff', ...args]);
      expect(expected).not.toBe('');
      expect(await diff(args)).toEqual({ success: true, data: expected });
    }

    expect((await diff(['--', 'renamed f.txt'])).data).toBe('');
    expect(await run(['status', '--porcelain=v1', '-z'])).toBe(status);
    expect(fs.readFileSync(path.join(repo, 'renamed [file].txt'), 'utf8')).toBe('unstaged\n');
  });
});
