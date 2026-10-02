import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiTextRequest } from '../AiProviderClient';
import { SecretScanService } from '../../SecretScanService';
import { cleanRepositories, repository } from './repositoryFixture';
import { policy } from './autoCommitFixtures';

describe('global auto-commit workflow with real Git', { timeout: 30000 }, () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanRepositories();
  });

  it('commits the exact partial index first, then remaining changes, preserving later edits', async () => {
    const repo = await repository();
    repo.write('base.txt', 'staged\n');
    await repo.run(['add', 'base.txt']);
    const index = await repo.run(['write-tree']);
    repo.write('base.txt', 'worktree snapshot\n');
    const provider = vi.fn(async (request: AiTextRequest) => {
      repo.write('base.txt', 'later edit\n');
      return repo.provider(request);
    });
    const result = await repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'key');
    expect(result.commits).toHaveLength(2);
    expect(await repo.run(['rev-parse', 'HEAD~1^{tree}'])).toBe(index);
    expect(await repo.run(['show', 'HEAD:base.txt'])).toBe('worktree snapshot');
    expect(await repo.run(['diff', '--cached', '--name-only'])).toBe('');
    expect(fs.readFileSync(path.join(repo.repoPath, 'base.txt'), 'utf8')).toBe('later edit\n');
    expect(result.remainingFiles).toBe(1);
    expect(result.processedFiles).toBe(1);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('preserves staged changes even if the worktree was reverted to HEAD', async () => {
    const repo = await repository();
    const originalTree = await repo.run(['rev-parse', 'HEAD^{tree}']);
    repo.write('base.txt', 'staged\n');
    await repo.run(['add', '.']);
    const stagedTree = await repo.run(['write-tree']);
    repo.write('base.txt', 'base\n');
    const result = await repo.execute();
    expect(result.commits).toHaveLength(2);
    expect(await repo.run(['rev-parse', 'HEAD~1^{tree}'])).toBe(stagedTree);
    expect(await repo.run(['rev-parse', 'HEAD^{tree}'])).toBe(originalTree);
  });

  it('keeps a large staged set together on an unborn branch and applies sign-off', async () => {
    const repo = await repository(false);
    for (let index = 0; index < 12; index += 1) repo.write(`part-${index}/file.ts`, Array(60).fill(`export const feature${index} = true;`).join('\n'));
    await repo.run(['add', '.']);
    const staged = await repo.run(['write-tree']);
    const result = await repo.service().runAutoCommit(repo.repoPath, { ...policy, commitSignoffByDefault: true }, () => 'key');
    expect(result.commits).toHaveLength(1);
    expect(await repo.run(['rev-parse', 'HEAD^{tree}'])).toBe(staged);
    expect(await repo.run(['show', '-s', '--format=%B', 'HEAD'])).toContain('Signed-off-by: Autocommit Test <autocommit@example.test>');
  });

  it('provides cross-folder code, alias imports, contracts and tests in one global request', async () => {
    const repo = await repository();
    repo.write('tsconfig.json', '{"compilerOptions":{"baseUrl":".","paths":{"@core/*":["packages/core/*"]}}}');
    repo.write('packages/core/contracts.ts', 'export type SessionResult = { ready: boolean };\n');
    repo.write(
      'apps/desktop/feature.ts',
      "import { SessionResult } from '@core/contracts';\nexport function startSession(): SessionResult { return { ready: true }; }\n",
    );
    repo.write(
      'specs/session.test.ts',
      "import { startSession } from '../apps/desktop/feature';\nit('starts', () => expect(startSession().ready).toBe(true));\n",
    );
    const provider = vi.fn(repo.provider);
    const result = await repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'key');
    expect(result.commits).toHaveLength(1);
    const input = JSON.parse(provider.mock.calls[0][0].userPrompt);
    expect(input.changes.find((item: { path: string }) => item.path === 'apps/desktop/feature.ts').hunks.join('\n')).toContain('startSession');
    expect(input.relationships.some((edge: { reason: string; strong: boolean }) => edge.reason.includes('SessionResult') && edge.strong)).toBe(true);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('creates one coherent fallback for all unstaged files after one failed repair', async () => {
    const repo = await repository();
    for (let index = 0; index < 10; index += 1) repo.write(`directory${index}/file.txt`, 'changed\n');
    const provider = vi.fn(async () => 'not a plan');
    const result = await repo
      .service(provider)
      .runAutoCommit(repo.repoPath, { ...policy, aiCommitMessageStyle: 'detailed', aiCommitMessageLanguage: 'de' }, () => 'key');
    expect(provider).toHaveBeenCalledTimes(2);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].subject).toBe('aktualisiere die erfassten Änderungen');
    expect(result.groups?.[0].messageSource).toBe('fallback');
    expect(await repo.run(['status', '--porcelain'])).toBe('');
  });

  it('stops on a hook rejection without retrying or shrinking the group', async () => {
    const repo = await repository();
    const head = await repo.run(['rev-parse', 'HEAD']);
    repo.write('base.txt', 'changed\n');
    repo.write('.git/hooks/pre-commit', '#!/bin/sh\necho attempt >> hook-attempts.txt\nexit 1\n');
    const provider = vi.fn(repo.provider);
    await expect(repo.service(provider).runAutoCommit(repo.repoPath, policy, () => 'key')).rejects.toThrow();
    expect(await repo.run(['rev-parse', 'HEAD'])).toBe(head);
    expect(fs.readFileSync(path.join(repo.repoPath, 'hook-attempts.txt'), 'utf8')).toBe('attempt\n');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await repo.run(['diff', '--cached', '--name-only'])).toBe('');
  });

  it('blocks staged secrets before transmission even when the worktree removes them', async () => {
    const repo = await repository();
    repo.write('base.txt', `OPENAI_API_KEY=sk-proj-${'X'.repeat(40)}\n`);
    await repo.run(['add', '.']);
    repo.write('base.txt', 'safe\n');
    const provider = vi.fn(repo.provider);
    const scanner = new SecretScanService(repo.git);
    await expect(
      repo.service(provider).runAutoCommitWithOptions(
        repo.repoPath,
        policy,
        () => 'key',
        undefined,
        undefined,
        () => '',
        {
          beforeCommit: async (index, base) => {
            const result = await scanner.scanStagedDiffs({
              repoPath: repo.repoPath,
              strictness: 'medium',
              allowlistText: '',
              stagedBaseTree: base,
              envOverrides: { GIT_INDEX_FILE: index },
            });
            if (result.findings.length) throw new Error('secret blocked');
          },
        },
      ),
    ).rejects.toThrow('secret blocked');
    expect(provider).not.toHaveBeenCalled();
    expect(await repo.run(['rev-list', '--count', 'HEAD'])).toBe('1');
  });

  it('returns durable partial results when cancelled after the staged commit', async () => {
    const repo = await repository();
    repo.write('base.txt', 'staged\n');
    await repo.run(['add', '.']);
    repo.write('other.txt', 'remaining\n');
    let cancelled = false;
    const result = await repo.service().runAutoCommit(
      repo.repoPath,
      policy,
      () => 'key',
      (update) => {
        if (update.details?.totalCommits === 1) cancelled = true;
      },
      () => cancelled,
    );
    expect(result.outcome).toBe('cancelled');
    expect(result.commits).toHaveLength(1);
    expect(result.groups?.map((group) => group.status)).toEqual(['committed', 'pending']);
    expect(await repo.run(['show', 'HEAD:base.txt'])).toBe('staged');
    expect(await repo.run(['status', '--porcelain'])).toContain('other.txt');
  });

  it('handles staged renames followed by unstaged edits and binary additions', async () => {
    const repo = await repository();
    await repo.run(['mv', 'base.txt', 'renamed ü file.txt']);
    repo.write('renamed ü file.txt', 'changed\n');
    repo.write('image.bin', Buffer.from([0, 1, 2, 3]));
    const result = await repo.execute();
    expect(result.commits).toHaveLength(2);
    expect(await repo.run(['show', 'HEAD~1:renamed ü file.txt'])).toBe('base');
    expect(await repo.run(['show', 'HEAD:renamed ü file.txt'])).toBe('changed');
    expect(await repo.run(['status', '--porcelain'])).toBe('');
  });
});
