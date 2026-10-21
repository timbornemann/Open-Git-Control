import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { DiffLineStagingService } from '../DiffLineStagingService';
import { toLiteralPathspec } from '../RepositoryPathSafety';
import { parseDiff } from '../../../src/shared/diff/parser';
import { diffSelectionUnits } from '../../../src/shared/diff/lineSelection';
import type { ApplyDiffLineSelectionRequest } from '../../../src/shared/ipc/diffLineSelection';

const repos: string[] = [];
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
function fixture(content = 'one\ntwo\nthree\n', file = 'file.txt', commit = true) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-line-stage-'));
  repos.push(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Line staging test');
  git(repo, 'config', 'user.email', 'lines@example.test');
  git(repo, 'config', 'core.autocrlf', 'false');
  const write = (text: string | Buffer) => fs.writeFileSync(path.join(repo, file), text);
  write(content);
  if (commit) {
    git(repo, 'add', '--', file);
    git(repo, 'commit', '-m', 'base');
  }
  const runner = new GitRunner();
  const service = new DiffLineStagingService(runner);
  const preview = async (source: 'staged' | 'unstaged' = 'unstaged', selected = [0]): Promise<ApplyDiffLineSelectionRequest> => {
    const diff = await runner.getDiffPreview(repo, ['diff', ...(source === 'staged' ? ['--cached'] : []), '--', toLiteralPathspec(file)]);
    const units = diffSelectionUnits(parseDiff(diff.text));
    return { repoPath: repo, path: file, source, expectedDiff: diff.text, selectedUnitIds: selected.map((index) => units[index]!.id) };
  };
  const apply = async (source: 'staged' | 'unstaged' = 'unstaged', selected = [0]) => service.apply(await preview(source, selected), () => {});
  return {
    repo,
    file,
    write,
    runner,
    service,
    preview,
    apply,
    index: () => git(repo, 'show', ':' + file),
    working: () => fs.readFileSync(path.join(repo, file)),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const repo of repos.splice(0)) {
    if (path.dirname(path.resolve(repo)) !== path.resolve(os.tmpdir()) || !path.basename(repo).startsWith('ogc-line-stage-'))
      throw new Error('Unsafe test cleanup');
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('line staging against real Git indexes', { timeout: 30_000 }, () => {
  it('stages separated replacements within one hunk, then unstages only selected pairs', async () => {
    const f = fixture();
    f.write('ONE\nTWO\nTHREE\n');
    const working = f.working();
    expect(await f.apply('unstaged', [0, 2])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('ONE\ntwo\nTHREE\n');
    expect(await f.apply()).toEqual({ status: 'applied' });
    expect(f.index()).toBe('ONE\nTWO\nTHREE\n');
    expect(await f.apply('staged', [0, 2])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('one\nTWO\nthree\n');
    expect(f.working()).toEqual(working);
  });

  it('recalculates offsets across selected and skipped hunks with insertions and deletions', async () => {
    const lines = Array.from({ length: 70 }, (_, index) => `line ${index}`);
    const f = fixture(lines.join('\n') + '\n');
    const changed = [...lines];
    changed.splice(2, 0, 'first extra', 'second extra');
    changed.splice(30, 1);
    changed[60] = 'last changed';
    f.write(changed.join('\n') + '\n');
    expect(await f.apply('unstaged', [0, 3])).toEqual({ status: 'applied' });
    const expected = [...lines];
    expected.splice(2, 0, 'first extra');
    expected[60] = 'last changed';
    expect(f.index()).toBe(expected.join('\n') + '\n');
    expect(await f.apply('staged', [0, 1])).toEqual({ status: 'applied' });
    expect(f.index()).toBe(lines.join('\n') + '\n');
  });

  it.each(['\n', '\r\n'])('preserves %j line endings, Unicode and a missing final newline', async (ending) => {
    const f = fixture(`alt${ending}bleibt${ending}letzte`, 'ä file [1].txt');
    f.write(`neu${ending}bleibt${ending}Änderung`);
    const working = f.working();
    expect(await f.apply('unstaged', [1])).toEqual({ status: 'applied' });
    expect(f.index()).toBe(`alt${ending}bleibt${ending}Änderung`);
    expect(await f.apply('staged')).toEqual({ status: 'applied' });
    expect(f.index()).toBe(`alt${ending}bleibt${ending}letzte`);
    expect(f.working()).toEqual(working);
  });

  it('treats +++ and --- within a hunk as added and deleted source text', async () => {
    const f = fixture('---old\nkeep\n');
    f.write('+++new\nkeep\n');
    expect(await f.apply()).toEqual({ status: 'applied' });
    expect(f.index()).toBe('+++new\nkeep\n');
    expect(await f.apply('staged')).toEqual({ status: 'applied' });
    expect(f.index()).toBe('---old\nkeep\n');
  });

  it('partially adds and unstages a new file, including an unborn HEAD', async () => {
    const f = fixture('one\ntwo\nthree\n', 'file.txt', false);
    expect(await f.apply('unstaged', [0, 2])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('one\nthree\n');
    expect(await f.apply('staged', [0])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('three\n');
    expect(await f.apply('staged')).toEqual({ status: 'applied' });
    expect(git(f.repo, 'ls-files')).toBe('');
    expect(f.working().toString()).toBe('one\ntwo\nthree\n');
  });

  it('keeps remaining indexed lines on partial file deletion and restores selected lines after full deletion', async () => {
    const f = fixture();
    fs.unlinkSync(path.join(f.repo, f.file));
    expect(await f.apply('unstaged', [0, 2])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('two\n');
    expect(await f.apply()).toEqual({ status: 'applied' });
    expect(git(f.repo, 'ls-files')).toBe('');
    expect(await f.apply('staged', [1])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('two\n');
    expect(fs.existsSync(path.join(f.repo, f.file))).toBe(false);
  });

  it('retains the current index mode for pure content actions', async () => {
    const f = fixture();
    git(f.repo, 'update-index', '--chmod=+x', f.file);
    f.write('ONE\ntwo\nthree\n');
    expect(await f.apply()).toEqual({ status: 'applied' });
    expect(git(f.repo, 'ls-files', '--stage')).toMatch(/^100755 /);
    expect(await f.apply('staged')).toEqual({ status: 'applied' });
    expect(git(f.repo, 'ls-files', '--stage')).toMatch(/^100755 /);
  });

  it('preserves a staged rename when unstaging selected content changes', async () => {
    const content = Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n') + '\n';
    const f = fixture(content);
    git(f.repo, 'mv', f.file, 'renamed.txt');
    fs.writeFileSync(path.join(f.repo, 'renamed.txt'), content.replace('line 2\n', 'changed 2\n').replace('line 15\n', 'changed 15\n'));
    git(f.repo, 'add', '--', 'renamed.txt');
    const current = await f.runner.getDiffPreview(f.repo, ['diff', '--cached', '--', toLiteralPathspec('renamed.txt')]);
    const units = diffSelectionUnits(parseDiff(current.text));
    const target = units.find((unit) => {
      const hunk = parseDiff(current.text).hunks.find((item) => item.id === unit.hunkId)!;
      return unit.rowIndices.some((index) => hunk.rows[index].text === 'changed 2');
    })!;
    expect(
      await f.service.apply({ repoPath: f.repo, path: 'renamed.txt', source: 'staged', expectedDiff: current.text, selectedUnitIds: [target.id] }, () => {}),
    ).toEqual({ status: 'applied' });
    expect(git(f.repo, 'ls-files')).toBe('renamed.txt\n');
    expect(git(f.repo, 'show', ':renamed.txt')).toBe(content.replace('line 15\n', 'changed 15\n'));
  });

  it('detects index changes after preview validation instead of overwriting them', async () => {
    const f = fixture();
    f.write('ONE\ntwo\nthree\n');
    const request = await f.preview();
    let calls = 0;
    const result = await f.service.apply(request, () => {
      if (++calls === 3) {
        f.write('external\n');
        git(f.repo, 'add', '--', f.file);
      }
    });
    expect(result).toEqual({ status: 'stale' });
    expect(f.index()).toBe('external\n');
  });

  it('preserves the index if Git rejects any hunk of the selection', async () => {
    const f = fixture();
    f.write('ONE\nTWO\nthree\n');
    const real = f.runner.withExclusiveWrite.bind(f.runner);
    vi.spyOn(f.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
      real(
        repo,
        command,
        (scoped) =>
          work({
            ...scoped,
            input: async () => {
              throw new Error('Index lock rejected');
            },
          }),
        signal,
      ),
    );
    await expect(f.apply('unstaged', [0, 1])).rejects.toThrow('Index lock rejected');
    expect(f.index()).toBe('one\ntwo\nthree\n');
  });

  it('requires the adjacent newline-changing replacement rather than silently including it', async () => {
    const f = fixture('last');
    f.write('last\nextra\n');
    expect(await f.apply('unstaged', [1])).toEqual({ status: 'unsupported', reason: 'lineEndingDependency' });
    expect(f.index()).toBe('last');
    expect(await f.apply('unstaged', [0, 1])).toEqual({ status: 'applied' });
    expect(f.index()).toBe('last\nextra\n');
  });

  it('rejects stale working and index previews without mutating any entry', async () => {
    const f = fixture();
    f.write('ONE\ntwo\nthree\n');
    const request = await f.preview();
    f.write('EXTERNAL\ntwo\nthree\n');
    expect(await f.service.apply(request, () => {})).toEqual({ status: 'stale' });
    expect(f.index()).toBe('one\ntwo\nthree\n');
    git(f.repo, 'add', '--', f.file);
    const staged = await f.preview('staged');
    f.write('other\n');
    git(f.repo, 'add', '--', f.file);
    expect(await f.service.apply(staged, () => {})).toEqual({ status: 'stale' });
    expect(f.index()).toBe('other\n');
  });

  it('checks repository context again after reading and before writing', async () => {
    const f = fixture();
    f.write('ONE\ntwo\nthree\n');
    const request = await f.preview();
    let calls = 0;
    await expect(
      f.service.apply(request, () => {
        if (++calls === 3) throw new Error('Repository changed');
      }),
    ).rejects.toThrow('Repository changed');
    expect(f.index()).toBe('one\ntwo\nthree\n');
  });

  it('rejects unknown or duplicate units and out-of-repository paths', async () => {
    const f = fixture();
    f.write('ONE\ntwo\nthree\n');
    const request = await f.preview();
    for (const overrides of [
      { selectedUnitIds: ['hunk-9:0'] },
      { selectedUnitIds: [...request.selectedUnitIds, ...request.selectedUnitIds] },
      { path: '../outside' },
      { path: '.git/config' },
    ])
      await expect(f.service.apply({ ...request, ...overrides }, () => {})).rejects.toThrow();
    expect(f.index()).toBe('one\ntwo\nthree\n');
  });

  it('blocks binary files and combined conflict diffs', async () => {
    const f = fixture();
    f.write(Buffer.from([0, 1, 2, 3]));
    const binary = await f.runner.getDiffPreview(f.repo, ['diff', '--', toLiteralPathspec(f.file)]);
    expect(
      await f.service.apply({ repoPath: f.repo, path: f.file, source: 'unstaged', expectedDiff: binary.text, selectedUnitIds: ['hunk-1:0'] }, () => {}),
    ).toEqual({ status: 'unsupported', reason: 'binary' });
    git(f.repo, 'checkout', '-b', 'other');
    f.write('other\n');
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'other');
    git(f.repo, 'checkout', 'main');
    f.write('main\n');
    git(f.repo, 'add', '.');
    git(f.repo, 'commit', '-m', 'main');
    try {
      git(f.repo, 'merge', 'other');
    } catch {
      /* Expected merge conflict. */
    }
    expect(await f.service.apply({ repoPath: f.repo, path: f.file, source: 'unstaged', expectedDiff: '', selectedUnitIds: ['hunk-1:0'] }, () => {})).toEqual({
      status: 'unsupported',
      reason: 'conflict',
    });
  });
});
