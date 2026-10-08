import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitService } from '../GitService';
import { SecretScanService } from '../SecretScanService';
import { RepositorySecretScanAllowlistService } from './RepositorySecretScanAllowlistService';
import { registerSecretScanCommitGuard } from './ipc/git/secretScanCommitGuard';
import { RepoJobRegistry } from './repoJobRegistry';
import { DEFAULT_SETTINGS } from '../settings';
import { SECRET_SCAN_ALLOWLIST_PATH } from '../../src/types/repositorySecretScanAllowlist';

const files = new RepositorySecretScanAllowlistService();
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-allowlist-git-'));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});
function fixture(name: string) {
  const repo = path.join(root, name);
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Allowlist Test');
  git(repo, 'config', 'user.email', 'allowlist@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false');
  git(repo, 'config', 'core.autocrlf', 'false');
  fs.writeFileSync(path.join(repo, '.env'), 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
  git(repo, 'add', '.env');
  return repo;
}
async function scan(repo: string) {
  const service = new GitService();
  service.setRepoPath(repo);
  const canonicalRepo = service.getRepoPath()!;
  const scanner = new SecretScanService(service);
  const guard = registerSecretScanCommitGuard({
    gitService: service,
    secretScanService: scanner,
    readSettingsWithMigration: () => DEFAULT_SETTINGS,
    repoJobRegistry: new RepoJobRegistry(),
    allowlistReader: {
      read: (repoPath) => files.read(repoPath),
      prepare: async (repoPath) => files.read(repoPath),
      assertVersion: (repoPath, version) => files.assertVersion(repoPath, version),
    },
  });
  return guard.scanCommitSecrets({ sender: { id: 1, send: vi.fn() } }, { repoPath: canonicalRepo, recordRendererScan: true });
}

describe('shared repository policy with real Git', () => {
  it.each(['new', 'partially staged'])(
    'includes the %s allowlist in the same commit without staging other working changes',
    async (state) => {
      const repo = fixture('source');
      if (state === 'partially staged') {
        const staged = files.save(repo, '# Team exceptions\n', 'missing');
        git(repo, 'add', SECRET_SCAN_ALLOWLIST_PATH);
        files.save(repo, '# Team exceptions\npath:docs/example.env\n', staged.version);
      }
      fs.writeFileSync(path.join(repo, 'other.txt'), 'Staged content\n');
      git(repo, 'add', 'other.txt');
      fs.appendFileSync(path.join(repo, 'other.txt'), 'Keep this unstaged\n');
      const otherIndexOid = git(repo, 'rev-parse', ':other.txt');
      const before = await scan(repo);
      if (!before.success) throw new Error(before.error);
      expect(before.data.findings).toEqual(expect.arrayContaining([expect.objectContaining({ filePath: '.env' })]));
      const policy = files.read(repo);
      const updated = files.addPaths(
        repo,
        before.data.findings.map((finding) => finding.filePath),
        policy.version,
      );
      const service = new GitService();
      await service.commits.stagePathsAtPath(repo, [SECRET_SCAN_ALLOWLIST_PATH]);
      expect(git(repo, 'rev-parse', ':other.txt')).toBe(otherIndexOid);
      expect(git(repo, 'diff', '--cached', '--name-only').split('\n')).toEqual([SECRET_SCAN_ALLOWLIST_PATH, '.env', 'other.txt']);
      expect(await scan(repo)).toMatchObject({ success: true, data: { findings: [] } });
      await service.commits.commitWithMessageAtPath(repo, { title: 'Commit with shared exception' });
      expect(git(repo, 'rev-list', '--count', 'HEAD')).toBe('1');
      expect(git(repo, 'show', `HEAD:${SECRET_SCAN_ALLOWLIST_PATH}`)).toBe(updated.text.trim());
      expect(git(repo, 'show', 'HEAD:other.txt')).toBe('Staged content');
      expect(git(repo, 'diff', '--name-only')).toBe('other.txt');
      expect(git(repo, 'diff', '--cached', '--name-only')).toBe('');
    },
    30_000,
  );

  it('uses saved worktree policy without staging it and leaves the index policy independent', async () => {
    const repo = fixture('source');
    const staged = files.save(repo, 'path:unrelated.env', 'missing');
    git(repo, 'add', SECRET_SCAN_ALLOWLIST_PATH);
    expect(await scan(repo)).toMatchObject({ success: true, data: { findings: expect.arrayContaining([expect.objectContaining({ filePath: '.env' })]) } });
    files.save(repo, 'path:.env', staged.version);
    expect(await scan(repo)).toMatchObject({ success: true, data: { findings: [] } });
    expect(git(repo, 'show', `:${SECRET_SCAN_ALLOWLIST_PATH}`)).toBe('path:unrelated.env');
    const other = fixture('other');
    expect(await scan(other)).toMatchObject({ success: true, data: { findings: expect.arrayContaining([expect.objectContaining({ filePath: '.env' })]) } });
  }, 30_000);

  it('shares committed policy with a clone and applies it to new staged changes', async () => {
    const repo = fixture('source');
    files.save(repo, 'path:.env', 'missing');
    git(repo, 'add', SECRET_SCAN_ALLOWLIST_PATH);
    git(repo, 'commit', '-m', 'Shared policy');
    const clone = path.join(root, 'clone');
    git(root, 'clone', '--quiet', repo, clone);
    fs.appendFileSync(path.join(clone, '.env'), 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    git(clone, 'add', '.env');
    expect(await scan(clone)).toMatchObject({ success: true, data: { findings: [] } });
    expect(files.read(clone).text).toBe('path:.env');
  }, 30_000);

  it('keeps linked worktree policies separate', async () => {
    const repo = fixture('source');
    git(repo, 'commit', '-m', 'Initial');
    const worktree = path.join(root, 'worktree');
    git(repo, 'worktree', 'add', '-b', 'other', worktree);
    files.save(repo, 'path:.env', 'missing');
    expect(files.read(worktree).text).toBe('');
    fs.appendFileSync(path.join(worktree, '.env'), 'AWS_ACCESS_KEY_ID=AKIA1234567890ABCDEF\n');
    git(worktree, 'add', '.env');
    expect(await scan(worktree)).toMatchObject({ success: true, data: { findings: expect.arrayContaining([expect.objectContaining({ filePath: '.env' })]) } });
  }, 30_000);
});
