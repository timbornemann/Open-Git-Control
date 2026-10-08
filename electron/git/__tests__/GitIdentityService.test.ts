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
  fs.rmSync(root, { recursive: true, force: true });
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
});
