import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { GitIdentityService } from '../GitIdentityService';
import type { GitIdentityScope } from '../../../src/shared/ipc/gitIdentity';

let root: string, repo: string, globalConfig: string;
let service: GitIdentityService;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
const read = (scope: GitIdentityScope = 'repository', repoPath: string | null = repo) => service.read({ repoPath, scope });
const save = async (scope: GitIdentityScope, name = 'Ada Lovelace', email = 'ada@example.invalid', repoPath: string | null = repo) => {
  const status = await read(scope, repoPath);
  return service.save({ repoPath, scope, name, email, expectedRevision: status.revision }, () => {});
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-identity-'));
  repo = path.join(root, 'repo');
  globalConfig = path.join(root, 'global.gitconfig');
  fs.mkdirSync(repo);
  fs.writeFileSync(globalConfig, '');
  // Never read or modify the developer's global identity in these integration tests.
  vi.stubEnv('GIT_CONFIG_GLOBAL', globalConfig);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  for (const key of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'EMAIL', 'GIT_CONFIG_COUNT'])
    vi.stubEnv(key, undefined);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'commit.gpgsign', 'false');
  service = new GitIdentityService(new GitRunner());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-identity-')) throw new Error('Unsafe fixture');
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('effective Git commit identity', () => {
  it('does not infer identity from the operating system and preserves partial configuration', async () => {
    expect(await read()).toMatchObject({ name: '', email: '', ready: false, missing: ['name', 'email'] });
    git(repo, 'config', 'user.name', 'Existing Name');
    expect(await read()).toMatchObject({ name: 'Existing Name', email: '', ready: false, missing: ['email'] });
  }, 15_000);

  it('configures only this repository and uses that identity in its first commit without altering the index', async () => {
    fs.writeFileSync(path.join(repo, 'file.txt'), 'staged snapshot');
    git(repo, 'add', 'file.txt');
    const index = git(repo, 'write-tree');
    expect(await save('repository', 'Jörg Example', '123+joerg@users.noreply.github.com')).toMatchObject({ ready: true, name: 'Jörg Example' });
    expect(git(repo, 'write-tree')).toBe(index);
    expect(fs.readFileSync(globalConfig, 'utf8')).toBe('');
    git(repo, 'commit', '-m', 'First commit');
    expect(git(repo, 'show', '-s', '--format=%an <%ae>')).toBe('Jörg Example <123+joerg@users.noreply.github.com>');
  }, 15_000);

  it('allows global setup without an open repository and retains local overrides when global values change', async () => {
    expect(await save('global', 'Global Name', 'global@example.invalid', null)).toMatchObject({ scope: 'global', repoPath: null, ready: true });
    expect(await read()).toMatchObject({ name: 'Global Name', ready: true });
    await save('repository', 'Local Name', 'local@example.invalid');
    await save('global', 'Updated Global', 'updated@example.invalid');
    expect(await read('global')).toMatchObject({ name: 'Updated Global', email: 'updated@example.invalid' });
    expect(await read()).toMatchObject({ name: 'Local Name', email: 'local@example.invalid', ready: true });
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    git(other, 'init', '-b', 'main');
    expect(await read('repository', other)).toMatchObject({ name: 'Updated Global', ready: true });
  }, 20_000);

  it('checks author and committer overrides instead of declaring a configured user identity sufficient', async () => {
    await save('repository');
    git(repo, 'config', 'author.email', 'not-an-email');
    expect(await read()).toMatchObject({ name: 'Ada Lovelace', ready: false });
    vi.stubEnv('GIT_AUTHOR_EMAIL', 'explicit-author@example.invalid');
    expect(await read()).toMatchObject({ ready: true });
  }, 15_000);

  it('rejects stale configuration and repository-context changes before writing', async () => {
    const original = await read();
    git(repo, 'config', 'user.name', 'External Change');
    const request = { repoPath: repo, scope: 'repository' as const, name: 'Our Name', email: 'ours@example.invalid', expectedRevision: original.revision };
    await expect(service.save(request, () => {})).rejects.toThrow('configuration changed');
    expect(git(repo, 'config', 'user.name')).toBe('External Change');
    request.expectedRevision = (await read()).revision;
    await expect(
      service.save(request, () => {
        throw new Error('Repository changed');
      }),
    ).rejects.toThrow('Repository changed');
    expect(git(repo, 'config', 'user.name')).toBe('External Change');
    expect(fs.readFileSync(globalConfig, 'utf8')).toBe('');
  }, 15_000);

  it.each([
    { name: '', email: 'valid@example.invalid', scope: 'repository' },
    { name: 'Unsafe\nName', email: 'valid@example.invalid', scope: 'repository' },
    { name: 'Name', email: 'invalid', scope: 'repository' },
    { name: 'Name', email: 'valid@example.invalid', scope: 'system' },
  ])('validates fixed keys and scope before executing Git: %j', async (values) => {
    await expect(service.save({ ...values, repoPath: repo, expectedRevision: 'a'.repeat(64) } as Parameters<typeof service.save>[0], () => {})).rejects.toThrow(
      'valid Git',
    );
    expect(fs.readFileSync(globalConfig, 'utf8')).toBe('');
  });

  it('reports unreadable configuration and missing repositories as errors', async () => {
    fs.writeFileSync(globalConfig, 'not valid config\n');
    await expect(read()).rejects.toThrow();
    fs.writeFileSync(globalConfig, '');
    await expect(read('repository', root)).rejects.toThrow('usable Git repository');
    await expect(read('repository', null)).rejects.toThrow('Choose a repository');
  }, 15_000);

  it('persists a changed global email across a new service and uses it as author and committer', async () => {
    await save('global', 'Global Name', 'old@example.invalid', null);
    await save('global', 'Global Name', 'new@example.invalid', null);
    service = new GitIdentityService(new GitRunner());
    expect(await read('global', null)).toMatchObject({ email: 'new@example.invalid', ready: true });
    expect(await read()).toMatchObject({ email: 'new@example.invalid', ready: true });
    git(repo, 'commit', '--allow-empty', '-m', 'Verify persisted identity');
    expect(git(repo, 'show', '-s', '--format=%ae|%ce')).toBe('new@example.invalid|new@example.invalid');
  }, 30_000);

  it('updates the selected worktree without overwriting the identity shared with another worktree', async () => {
    git(repo, 'config', 'user.name', 'Shared Name');
    git(repo, 'config', 'user.email', 'shared@example.invalid');
    git(repo, 'commit', '--allow-empty', '-m', 'Initial');
    git(repo, 'config', 'extensions.worktreeConfig', 'true');
    const other = path.join(root, 'linked');
    git(repo, 'worktree', 'add', '-b', 'linked', other);
    git(repo, 'config', '--worktree', 'user.email', 'worktree-old@example.invalid');
    await save('repository', 'Shared Name', 'worktree-new@example.invalid');
    service = new GitIdentityService(new GitRunner());
    expect(await read()).toMatchObject({ email: 'worktree-new@example.invalid', ready: true });
    expect(await read('repository', other)).toMatchObject({ email: 'shared@example.invalid', ready: true });
    expect(git(repo, 'config', '--local', '--get', 'user.email')).toBe('shared@example.invalid');
    expect(fs.readFileSync(globalConfig, 'utf8')).toBe('');
    git(repo, 'commit', '--allow-empty', '-m', 'Worktree identity');
    expect(git(repo, 'show', '-s', '--format=%ae|%ce')).toBe('worktree-new@example.invalid|worktree-new@example.invalid');
  }, 35_000);

  it.each(['global', 'repository'] as const)(
    'keeps a %s email effective after a later include and after reopening',
    async (scope) => {
      const profile = path.join(root, 'profile.gitconfig');
      git(root, 'config', '--file', profile, 'user.name', 'Profile Name');
      git(root, 'config', '--file', profile, 'user.email', 'profile-old@example.invalid');
      git(root, 'config', '--file', profile, 'author.email', 'author-old@example.invalid');
      git(root, 'config', '--file', profile, 'committer.email', 'committer-old@example.invalid');
      const originalProfile = fs.readFileSync(profile);
      const flag = scope === 'global' ? '--global' : '--local';
      git(repo, 'config', flag, 'user.name', 'Root Name');
      git(repo, 'config', flag, 'user.email', 'root-old@example.invalid');
      git(repo, 'config', flag, 'user.signingkey', 'preserved-key');
      git(repo, 'config', flag, 'include.path', profile.replace(/\\/g, '/'));
      expect(await read(scope)).toMatchObject({
        name: 'Profile Name',
        email: scope === 'global' ? 'profile-old@example.invalid' : 'committer-old@example.invalid',
      });
      await save(scope, 'Profile Name', 'new@example.invalid');
      service = new GitIdentityService(new GitRunner());
      expect(await read(scope)).toMatchObject({ name: 'Profile Name', email: 'new@example.invalid', ready: true });
      expect(await read()).toMatchObject({ email: 'new@example.invalid', ready: true });
      expect(fs.readFileSync(profile)).toEqual(originalProfile);
      expect(git(repo, 'config', '--get', 'user.signingkey')).toBe('preserved-key');
      await save(scope, 'Profile Name', 'updated-again@example.invalid');
      git(repo, 'commit', '--allow-empty', '-m', 'Included identity');
      expect(git(repo, 'show', '-s', '--format=%ae|%ce')).toBe('updated-again@example.invalid|updated-again@example.invalid');
      if (scope === 'repository') expect(fs.readFileSync(globalConfig, 'utf8')).toBe('');
    },
    45_000,
  );

  it('updates existing email role overrides locally while preserving deliberately different names and global defaults', async () => {
    git(repo, 'config', '--global', 'user.name', 'Commit User');
    git(repo, 'config', '--global', 'user.email', 'default-old@example.invalid');
    git(repo, 'config', '--global', 'author.name', 'Original Author');
    git(repo, 'config', '--global', 'author.email', 'author-old@example.invalid');
    git(repo, 'config', '--global', 'committer.email', 'committer-old@example.invalid');
    const originalGlobal = fs.readFileSync(globalConfig);
    await save('repository', 'Commit User', 'new@example.invalid');
    expect(fs.readFileSync(globalConfig)).toEqual(originalGlobal);
    service = new GitIdentityService(new GitRunner());
    expect(await read()).toMatchObject({ name: 'Commit User', email: 'new@example.invalid', ready: true });
    git(repo, 'commit', '--allow-empty', '-m', 'Role overrides');
    expect(git(repo, 'show', '-s', '--format=%an|%ae|%cn|%ce')).toBe('Original Author|new@example.invalid|Commit User|new@example.invalid');
  }, 30_000);

  it.each(['GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_EMAIL'])(
    'does not report success if %s still overrides the saved email',
    async (variable) => {
      git(repo, 'config', 'user.name', 'Configured Name');
      git(repo, 'config', 'user.email', 'old@example.invalid');
      vi.stubEnv(variable, 'environment@example.invalid');
      await expect(save('repository', 'Configured Name', 'new@example.invalid')).rejects.toThrow('still uses different identity values');
      expect(git(repo, 'config', '--local', '--get', 'user.email')).toBe('new@example.invalid');
    },
    25_000,
  );

  it('detects externally changed included identities and respects an existing config lock', async () => {
    const profile = path.join(root, 'profile.gitconfig');
    git(root, 'config', '--file', profile, 'user.name', 'Profile Name');
    git(root, 'config', '--file', profile, 'user.email', 'old@example.invalid');
    git(repo, 'config', '--global', 'include.path', profile.replace(/\\/g, '/'));
    const before = await read('global');
    git(root, 'config', '--file', profile, 'user.email', 'external@example.invalid');
    await expect(service.save({ ...before, name: 'Profile Name', email: 'ours@example.invalid', expectedRevision: before.revision }, () => {})).rejects.toThrow(
      'configuration changed',
    );
    fs.writeFileSync(`${globalConfig}.lock`, 'another writer');
    await expect(save('global', 'Profile Name', 'ours@example.invalid')).rejects.toThrow();
    expect(fs.readFileSync(`${globalConfig}.lock`, 'utf8')).toBe('another writer');
    expect(await read('global')).toMatchObject({ email: 'external@example.invalid' });
  }, 30_000);

  it.each(['cancelled', 'write failure'] as const)(
    'cleans up interrupted include updates after %s and permits a later save',
    async (failure) => {
      const profile = path.join(root, 'profile.gitconfig');
      git(root, 'config', '--file', profile, 'user.name', 'Profile Name');
      git(root, 'config', '--file', profile, 'user.email', 'old@example.invalid');
      git(repo, 'config', '--global', 'user.name', 'Root Name');
      git(repo, 'config', '--global', 'user.email', 'root@example.invalid');
      git(repo, 'config', '--global', 'include.path', profile.replace(/\\/g, '/'));
      const runner = new GitRunner();
      const exclusive = runner.withExclusiveWrite.bind(runner);
      let cancelled = false;
      let candidate = '';
      const intercept = vi.spyOn(runner, 'withExclusiveWrite').mockImplementation((cwd, command, work, signal) =>
        exclusive(
          cwd,
          command,
          (git) =>
            work({
              ...git,
              run: async (directory, args, options) => {
                if (args[0] === 'config' && args[1] === '--file' && args.includes('--add')) {
                  candidate = args[2];
                  if (failure === 'write failure') {
                    fs.writeFileSync(`${candidate}.lock`, 'interrupted helper');
                    throw new Error('Simulated write failure');
                  }
                  const value = await git.run(directory, args, options);
                  cancelled = true;
                  return value;
                }
                return git.run(directory, args, options);
              },
            }),
          signal,
        ),
      );
      service = new GitIdentityService(runner);
      const status = await read('global');
      await expect(
        service.save({ ...status, email: 'new@example.invalid', expectedRevision: status.revision }, () => {
          if (cancelled) throw new Error('Repository changed');
        }),
      ).rejects.toThrow(failure === 'cancelled' ? 'Repository changed' : 'Simulated write failure');
      expect(candidate).not.toBe('');
      expect(fs.existsSync(candidate)).toBe(false);
      expect(fs.existsSync(`${candidate}.lock`)).toBe(false);
      expect(fs.existsSync(`${globalConfig}.lock`)).toBe(false);
      expect(await read('global')).toMatchObject({ email: 'old@example.invalid' });
      intercept.mockRestore();
      await expect(save('global', 'Profile Name', 'new@example.invalid')).resolves.toMatchObject({ email: 'new@example.invalid', ready: true });
    },
    40_000,
  );
});
