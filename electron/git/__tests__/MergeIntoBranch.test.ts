import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { GitRunner } from '../GitRunner';
import { mergeIntoBranch } from '../MergeIntoBranch';
import type { MergeIntoBranchRequest } from '../../../src/shared/git/merge';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('ogc-merge-into-')) throw new Error('Unsafe fixture cleanup.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

function fixture(diverge = false, conflict = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-merge-into-'));
  roots.push(root);
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Merge Test');
  git('config', 'user.email', 'merge@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'merge.ff', 'true');
  git('config', 'core.hooksPath', path.join(root, 'no-hooks'));
  git('config', 'core.autocrlf', 'false');
  const write = (file: string, contents: string) => fs.writeFileSync(path.join(repo, file), contents);
  write('shared.txt', 'base\n');
  git('add', '.');
  git('commit', '-m', 'base');
  git('checkout', '-b', 'feature');
  write(conflict ? 'shared.txt' : 'feature.txt', 'feature\n');
  git('add', '.');
  git('commit', '-m', 'feature change');
  if (diverge) {
    git('checkout', 'main');
    write(conflict ? 'shared.txt' : 'target.txt', 'target\n');
    git('add', '.');
    git('commit', '-m', 'target change');
    git('checkout', 'feature');
  }
  git('remote', 'add', 'origin', 'https://example.invalid/untouched.git');
  git('config', 'branch.main.remote', 'origin');
  git('config', 'branch.main.merge', 'refs/heads/main');
  git('config', 'branch.feature.remote', 'origin');
  git('config', 'branch.feature.merge', 'refs/heads/feature');
  const sourceOid = git('rev-parse', 'feature'),
    targetOid = git('rev-parse', 'main');
  const request: MergeIntoBranchRequest = { sourceBranch: 'feature', targetBranch: 'main', sourceOid, targetOid, mode: 'default' };
  const runner = new GitRunner();
  return {
    root,
    repo,
    git,
    write,
    runner,
    request,
    run: (changes: Partial<MergeIntoBranchRequest> = {}) => mergeIntoBranch(runner, repo, { ...request, ...changes }),
  };
}

// This suite starts many real Git processes, including on shared Windows CI runners.
describe('merge the current branch into another local branch with real Git', { timeout: 30_000 }, () => {
  it('automatically switches and fast-forwards the target while preserving source and tracking', async () => {
    const f = fixture(),
      config = f.git('config', '--local', '--list');
    await f.run();
    expect(f.git('branch', '--show-current')).toBe('main');
    expect(f.git('rev-parse', 'main')).toBe(f.request.sourceOid);
    expect(f.git('rev-parse', 'feature')).toBe(f.request.sourceOid);
    expect(f.git('config', '--local', '--list')).toBe(config);
    expect(fs.readFileSync(path.join(f.repo, 'feature.txt'), 'utf8')).toBe('feature\n');
  });

  it.each(['default', 'noFf'] as const)('preserves both histories with a %s merge commit', async (mode) => {
    const f = fixture(mode === 'default');
    await f.run({ mode });
    expect(f.git('show', '-s', '--format=%P', 'main').split(' ')).toEqual([f.request.targetOid, f.request.sourceOid]);
    expect(f.git('show', '-s', '--format=%s', 'main')).toBe("Merge branch 'feature' into main");
    expect(f.git('rev-parse', 'feature')).toBe(f.request.sourceOid);
  });

  it('prepares squash changes in target staging without creating a commit', async () => {
    const f = fixture(true);
    await f.run({ mode: 'squash' });
    expect(f.git('branch', '--show-current')).toBe('main');
    expect(f.git('rev-parse', 'main')).toBe(f.request.targetOid);
    expect(f.git('diff', '--cached', '--name-only')).toBe('feature.txt');
    expect(f.git('rev-parse', 'feature')).toBe(f.request.sourceOid);
    expect(f.git('status', '--porcelain')).toBe('A  feature.txt');
  });

  it('supports fast-forward-only and stops safely when the target has separate commits', async () => {
    const simple = fixture();
    await simple.run({ mode: 'ffOnly' });
    expect(simple.git('rev-parse', 'main')).toBe(simple.request.sourceOid);
    const f = fixture(true);
    await expect(f.run({ mode: 'ffOnly' })).rejects.toThrow('This target branch remains active');
    expect(f.git('branch', '--show-current')).toBe('main');
    expect(f.git('rev-parse', 'main')).toBe(f.request.targetOid);
    expect(f.git('status', '--porcelain')).toBe('');
  });

  it('leaves conflicts on the selected target for the existing conflict resolver', async () => {
    const f = fixture(true, true);
    await expect(f.run()).rejects.toThrow('Merge into "main" did not finish');
    expect(f.git('branch', '--show-current')).toBe('main');
    expect(f.git('status', '--porcelain')).toBe('UU shared.txt');
    expect(f.git('rev-parse', 'MERGE_HEAD')).toBe(f.request.sourceOid);
    expect(f.git('rev-parse', 'main')).toBe(f.request.targetOid);
    expect(f.git('rev-parse', 'feature')).toBe(f.request.sourceOid);
  });

  it.each(['unstaged', 'staged', 'untracked'])('refuses %s changes before switching branches', async (state) => {
    const f = fixture();
    f.write(state === 'untracked' ? 'new.txt' : 'shared.txt', 'keep my edits\n');
    if (state === 'staged') f.git('add', 'shared.txt');
    const before = f.git('status', '--porcelain');
    await expect(f.run()).rejects.toThrow('Commit or stash');
    expect(f.git('branch', '--show-current')).toBe('feature');
    expect(f.git('status', '--porcelain')).toBe(before);
    expect(f.git('rev-parse', 'main')).toBe(f.request.targetOid);
  });

  it.each(['sourceOid', 'targetOid'] as const)('rejects a stale %s before switching', async (field) => {
    const f = fixture();
    await expect(f.run({ [field]: '0'.repeat(40) })).rejects.toThrow('changed. Open the merge menu again');
    expect(f.git('branch', '--show-current')).toBe('feature');
  });

  it('rejects an active-branch change and an active Git operation', async () => {
    const f = fixture();
    f.git('checkout', 'main');
    await expect(f.run()).rejects.toThrow('active branch changed');
    f.git('checkout', 'feature');
    fs.writeFileSync(path.join(f.repo, '.git', 'MERGE_HEAD'), `${f.request.targetOid}\n`);
    await expect(f.run()).rejects.toThrow('Another Git operation is in progress');
    expect(f.git('branch', '--show-current')).toBe('feature');
  });

  it('does not take over a target checked out in another worktree', async () => {
    const f = fixture();
    f.git('worktree', 'add', path.join(f.root, 'other'), 'main');
    await expect(f.run()).rejects.toThrow();
    expect(f.git('branch', '--show-current')).toBe('feature');
    expect(f.git('rev-parse', 'main')).toBe(f.request.targetOid);
  });

  it('protects ignored working files that would be overwritten by the target checkout', async () => {
    const f = fixture();
    f.git('checkout', 'main');
    f.write('generated.txt', 'tracked on target\n');
    f.git('add', 'generated.txt');
    f.git('commit', '-m', 'target file');
    f.git('checkout', 'feature');
    f.write('.gitignore', 'generated.txt\n');
    f.git('add', '.gitignore');
    f.git('commit', '-m', 'ignore local generated files');
    f.write('generated.txt', 'local data to preserve\n');
    expect(f.git('status', '--porcelain')).toBe('');
    await expect(f.run({ sourceOid: f.git('rev-parse', 'feature'), targetOid: f.git('rev-parse', 'main') })).rejects.toThrow();
    expect(f.git('branch', '--show-current')).toBe('feature');
    expect(fs.readFileSync(path.join(f.repo, 'generated.txt'), 'utf8')).toBe('local data to preserve\n');
  });

  it('serializes double submissions and creates only one merge commit', async () => {
    const f = fixture(true);
    const results = await Promise.allSettled([f.run(), f.run()]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(f.git('rev-list', '--count', 'main')).toBe('4');
    expect(f.git('status', '--porcelain')).toBe('');
  });

  it('checks repository authorization again before checkout and blocks branch shortcuts', async () => {
    const f = fixture();
    let checks = 0;
    await expect(
      mergeIntoBranch(f.runner, f.repo, f.request, () => {
        if (++checks === 2) throw new Error('Repository changed');
      }),
    ).rejects.toThrow('Repository changed');
    await expect(f.run({ targetBranch: '@{-1}' })).rejects.toThrow();
    expect(f.git('branch', '--show-current')).toBe('feature');
  });
});
