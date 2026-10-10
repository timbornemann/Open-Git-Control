import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { GitService } from '../GitService';
import { AiAutoCommitIndexTransaction } from '../ai/AiAutoCommitIndexTransaction';
import { parseStatusPorcelain } from '../ai/gitStatusSnapshot';
import { baseSettings, okJsonResponse } from './helpers/aiServiceTestUtils';
import { GitIntegrationLifecycle } from '../git/__tests__/gitIntegrationLifecycle';

const tempRoots: string[] = [];
const lifecycles: GitIntegrationLifecycle[] = [];
// A full workflow starts dozens of real Git processes before calling the AI.
// Keep its deadline bounded, but allow for shared Windows CI process startup.
const integrationTest = (name: string, work: (lifecycle: GitIntegrationLifecycle) => Promise<void>) =>
  it(
    name,
    () => {
      const lifecycle = new GitIntegrationLifecycle();
      lifecycles.push(lifecycle);
      return lifecycle.track(Promise.resolve().then(() => work(lifecycle)));
    },
    60_000,
  );

const createRepository = async (lifecycle: GitIntegrationLifecycle): Promise<{ git: GitService; repoPath: string; filePath: string }> => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-ai-index-test-'));
  tempRoots.push(repoPath);
  const git = new GitService(undefined, lifecycle.scheduler);
  await git.runCommandAtPath(repoPath, ['init']);
  await git.runCommandAtPath(repoPath, ['config', 'maintenance.auto', 'false']);
  await git.runCommandAtPath(repoPath, ['config', 'gc.auto', '0']);
  await git.runCommandAtPath(repoPath, ['config', 'commit.gpgsign', 'false']);
  await git.runCommandAtPath(repoPath, ['config', 'user.name', 'AI Transaction Test']);
  await git.runCommandAtPath(repoPath, ['config', 'user.email', 'ai-transaction@example.test']);
  const filePath = path.join(repoPath, 'example.txt');
  fs.writeFileSync(filePath, 'base-one\nbase-two\n', 'utf8');
  await git.runCommandAtPath(repoPath, ['add', '--', 'example.txt']);
  await git.runCommandAtPath(repoPath, ['commit', '-m', 'initial']);
  return { git, repoPath, filePath };
};

const realIndexPath = async (git: GitService, repoPath: string): Promise<string> => {
  return (await git.runCommandAtPath(repoPath, ['rev-parse', '--path-format=absolute', '--git-path', 'index'])).trim();
};

const createPartiallyStagedChange = async (git: GitService, repoPath: string, filePath: string): Promise<void> => {
  fs.writeFileSync(filePath, 'staged-one\nbase-two\n', 'utf8');
  await git.runCommandAtPath(repoPath, ['add', '--', 'example.txt']);
  fs.writeFileSync(filePath, 'staged-one\nsnapshot-two\n', 'utf8');
};

const exampleBatch = () => [
  {
    path: 'example.txt',
    changeType: 'modified' as const,
    additions: 2,
    deletions: 2,
    isBinary: false,
    preview: '',
    keyChanges: [],
    groupKey: 'root:txt:modified',
    hydrated: true,
  },
];

const writeHook = (repoPath: string, name: string, script: string): void => {
  fs.writeFileSync(path.join(repoPath, '.git', 'hooks', name), `#!/bin/sh\n${script.trim()}\n`, {
    encoding: 'utf8',
    mode: 0o755,
  });
};

describe('AI auto-commit isolated index transaction', () => {
  afterEach(async () => {
    await Promise.all(lifecycles.splice(0).map((lifecycle) => lifecycle.close()));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const root of tempRoots.splice(0)) {
      const resolved = path.resolve(root);
      if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !/^ogc-ai-(?:unborn-)?index-test-/.test(path.basename(resolved))) {
        throw new Error('Unsafe AI index test cleanup');
      }
      await fs.promises.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }, 60_000);

  integrationTest('leaves the exact partially staged tree unchanged when cancellation happens during AI generation', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const stagedBefore = await git.runCommandAtPath(repoPath, ['show', ':example.txt']);
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    let cancelRequested = false;

    const fetchMock = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init.signal;
          signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
          // Cancel at the event this test is about, without a short polling
          // deadline that also includes all snapshot/context Git work.
          cancelRequested = true;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new AiService(git);
    const run = service.runAutoCommit(
      repoPath,
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
      undefined,
      () => cancelRequested || lifecycle.signal.aborted,
    );

    await expect(run).resolves.toMatchObject({ outcome: 'cancelled', commits: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe(stagedBefore);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
    expect(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD'])).toBe('1');
  });

  integrationTest('reports an exclusively dirty submodule without retrying an empty parent commit', async (lifecycle) => {
    const { git, repoPath } = await createRepository(lifecycle);
    const submodulePath = path.join(repoPath, 'nested-module');
    fs.mkdirSync(submodulePath);
    const nestedGit = new GitService(undefined, lifecycle.scheduler);
    await nestedGit.runCommandAtPath(submodulePath, ['init']);
    await nestedGit.runCommandAtPath(submodulePath, ['config', 'user.name', 'Nested Test']);
    await nestedGit.runCommandAtPath(submodulePath, ['config', 'user.email', 'nested@example.test']);
    fs.writeFileSync(path.join(submodulePath, 'nested.txt'), 'base\n', 'utf8');
    await nestedGit.runCommandAtPath(submodulePath, ['add', '--', 'nested.txt']);
    await nestedGit.runCommandAtPath(submodulePath, ['commit', '-m', 'nested initial']);
    const nestedHead = (await nestedGit.runCommandAtPath(submodulePath, ['rev-parse', 'HEAD'])).trim();
    await git.runCommandAtPath(repoPath, ['update-index', '--add', '--cacheinfo', '160000', nestedHead, 'nested-module']);
    await git.runCommandAtPath(repoPath, ['commit', '-m', 'add nested module']);
    const parentHead = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    fs.writeFileSync(path.join(submodulePath, 'nested.txt'), 'dirty internal change\n', 'utf8');
    expect(await git.getStatusPorcelainZAtPath(repoPath)).toContain('nested-module');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new AiService(git);

    await expect(service.runAutoCommit(repoPath, baseSettings, () => 'test-key')).rejects.toThrow(/Submodul|Submodulen/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(parentHead);
    expect(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD'])).toBe('2');

    // In a mixed snapshot the dirty submodule is skipped while an actual
    // parent-repository blob remains eligible for a commit.
    fs.writeFileSync(path.join(repoPath, 'example.txt'), 'parent change\n', 'utf8');
    const mixedEntries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);
    try {
      await transaction.initialize(mixedEntries);
      expect(transaction.isStatusEntryCommittable(mixedEntries.find((entry) => entry.path === 'nested-module')!)).toBe(false);
      expect(transaction.isStatusEntryCommittable(mixedEntries.find((entry) => entry.path === 'example.txt')!)).toBe(true);
    } finally {
      transaction.dispose();
    }
  });

  integrationTest('drains a pending AI request before fixture cleanup while preserving the exact partial index', async (testLifecycle) => {
    // Closing the operation's scope emulates teardown after a failed assertion
    // or deadline. The test itself lives outside that scope so it can inspect it.
    const operationLifecycle = new GitIntegrationLifecycle();
    lifecycles.push(operationLifecycle);
    const { git, repoPath, filePath } = await createRepository(operationLifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const indexPath = await realIndexPath(git, repoPath);
    const indexBefore = fs.readFileSync(indexPath);
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      requestStarted = resolve;
    });
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init.signal;
            requestSignal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
            requestStarted();
          }),
      ),
    );
    const run = operationLifecycle.track(
      new AiService(git).runAutoCommit(
        repoPath,
        { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
        () => '',
        undefined,
        () => operationLifecycle.signal.aborted,
      ),
    );
    await Promise.race([
      started,
      run.then(() => {
        throw new Error('AI workflow finished before requesting its message');
      }),
    ]);

    await operationLifecycle.close();

    await expect(run).resolves.toMatchObject({ outcome: 'cancelled', commits: [] });
    expect(requestSignal?.aborted).toBe(true);
    expect(fs.readFileSync(indexPath)).toEqual(indexBefore);
    expect(fs.existsSync(`${indexPath}.lock`)).toBe(false);
    const inspect = new GitService(undefined, testLifecycle.scheduler);
    expect(await inspect.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD'])).toBe('1');
    await expect(git.runCommandAtPath(repoPath, ['status'])).rejects.toMatchObject({ name: 'AbortError' });
  });

  integrationTest('commits immutable snapshot blobs and leaves later working-tree edits unstaged', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      fs.writeFileSync(filePath, 'later-one\nlater-two\n', 'utf8');
      await transaction.commit(
        [
          {
            path: 'example.txt',
            changeType: 'modified',
            additions: 2,
            deletions: 2,
            isBinary: false,
            preview: '',
            keyChanges: [],
            groupKey: 'root:txt:modified',
            hydrated: true,
          },
        ],
        { title: 'test: commit immutable snapshot', description: '' },
      );
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['show', 'HEAD:example.txt'])).toBe('staged-one\nsnapshot-two');
    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe('staged-one\nsnapshot-two');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('later-one\nlater-two\n');
    expect(await git.runCommandAtPath(repoPath, ['diff', '--name-only'])).toBe('example.txt');
    expect(await git.runCommandAtPath(repoPath, ['diff', '--cached', '--name-only'])).toBe('');
  });

  integrationTest('keeps the full AI workflow pinned to the snapshot while its message request is pending', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    let resolveMessage: ((value: ReturnType<typeof okJsonResponse>) => void) | undefined;
    let messageStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      messageStarted = resolve;
    });
    let cancelRequested = false;
    const fetchMock = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise<ReturnType<typeof okJsonResponse>>((resolve, reject) => {
          resolveMessage = resolve;
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
          messageStarted();
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new AiService(git);
    const run = lifecycle.track(
      service.runAutoCommit(
        repoPath,
        { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
        () => '',
        undefined,
        () => cancelRequested || lifecycle.signal.aborted,
      ),
    );

    try {
      await Promise.race([
        started,
        run.then(() => {
          throw new Error('AI workflow finished before requesting its message');
        }),
      ]);
      fs.writeFileSync(filePath, 'edited-after-snapshot\nstill-uncommitted\n', 'utf8');
      resolveMessage?.(
        okJsonResponse({
          message: {
            content: JSON.stringify({
              groups: [
                { changeIds: ['s1'], title: 'test: staged snapshot', description: '', rationale: 'Original index' },
                { changeIds: ['w1'], title: 'test: snapshot commit', description: '', rationale: 'Remaining worktree changes' },
              ],
            }),
          },
        }),
      );
      await expect(run).resolves.toMatchObject({ commits: [{ subject: 'test: staged snapshot' }, { subject: 'test: snapshot commit' }] });
    } finally {
      cancelRequested = true;
      await Promise.allSettled([run]);
    }

    expect(await git.runCommandAtPath(repoPath, ['show', 'HEAD:example.txt'])).toBe('staged-one\nsnapshot-two');
    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe('staged-one\nsnapshot-two');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('edited-after-snapshot\nstill-uncommitted\n');
  });

  integrationTest('surfaces hook failures and restores the exact pre-run index without a commit', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const indexPath = await realIndexPath(git, repoPath);
    const stagedBefore = await git.runCommandAtPath(repoPath, ['show', ':example.txt']);
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    const hookPath = path.join(repoPath, '.git', 'hooks', 'pre-commit');
    fs.writeFileSync(hookPath, '#!/bin/sh\necho hook rejected >&2\nexit 1\n', { encoding: 'utf8', mode: 0o755 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(
        transaction.commit(
          [
            {
              path: 'example.txt',
              changeType: 'modified',
              additions: 2,
              deletions: 2,
              isBinary: false,
              preview: '',
              keyChanges: [],
              groupKey: 'root:txt:modified',
              hydrated: true,
            },
          ],
          { title: 'test: rejected commit', description: '' },
        ),
      ).rejects.toThrow(/hook rejected|commit/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe(stagedBefore);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(fs.existsSync(`${indexPath}.lock`)).toBe(false);
  });

  integrationTest('rolls back the complete nonce-owned chain when a post-commit hook creates another commit', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    writeHook(
      repoPath,
      'post-commit',
      `git_dir=$(git rev-parse --git-dir)
marker="$git_dir/ogc-nested-post-commit"
if test ! -f "$marker"; then
  : >"$marker"
  git commit --allow-empty --no-verify -m "hook: nested commit"
fi`,
    );
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: outer AI commit', description: '' })).rejects.toThrow(/HEAD changed|AI commit/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD'])).toBe('1');
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
  });

  integrationTest('rolls back commits created by a hook before that hook rejects the outer commit', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    writeHook(
      repoPath,
      'commit-msg',
      `git_dir=$(git rev-parse --git-dir)
marker="$git_dir/ogc-rejecting-commit-msg"
if test ! -f "$marker"; then
  : >"$marker"
  git commit --allow-empty --no-verify -m "hook: commit before rejection"
fi
echo "commit-msg rejected" >&2
exit 1`,
    );
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: rejected after hook commit', description: '' })).rejects.toThrow(
        /commit-msg rejected|commit/i,
      );
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD'])).toBe('1');
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
  });

  integrationTest('rolls back an amended hook tree instead of committing unsnapshotted working-tree content', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    writeHook(
      repoPath,
      'post-commit',
      `git_dir=$(git rev-parse --git-dir)
marker="$git_dir/ogc-amending-post-commit"
if test ! -f "$marker"; then
  : >"$marker"
  printf 'hook-mutated-content\\n' >example.txt
  git add -- example.txt
  git commit --amend --no-edit --no-verify
fi`,
    );
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: immutable hook snapshot', description: '' })).rejects.toThrow(/hook changed|snapshot/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('hook-mutated-content\n');
  });

  integrationTest('does not delete an unowned commit that lands after the AI commit', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const countBefore = Number(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD']));
    writeHook(
      repoPath,
      'post-commit',
      `git_dir=$(git rev-parse --git-dir)
marker="$git_dir/ogc-unowned-post-commit"
if test ! -f "$marker"; then
  : >"$marker"
  env -u GIT_REFLOG_ACTION git commit --allow-empty --no-verify -m "external: preserve me"
fi`,
    );
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: AI parent', description: '' })).rejects.toThrow(/no foreign commit was removed/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['show', '-s', '--format=%s', 'HEAD'])).toBe('external: preserve me');
    expect(await git.runCommandAtPath(repoPath, ['show', '-s', '--format=%s', 'HEAD^'])).toBe('test: AI parent');
    expect(Number(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD']))).toBe(countBefore + 2);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
  });

  integrationTest('rolls back only the original branch when a hook attaches HEAD elsewhere', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    const originalBranch = (await git.runCommandAtPath(repoPath, ['symbolic-ref', '--short', 'HEAD'])).trim();
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    await git.runCommandAtPath(repoPath, ['branch', 'side']);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    writeHook(repoPath, 'post-commit', 'git symbolic-ref HEAD refs/heads/side');
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: branch switch hook', description: '' })).rejects.toThrow(/HEAD changed/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['symbolic-ref', '--short', 'HEAD'])).toBe('side');
    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'side'])).toBe(headBefore);
    expect(await git.runCommandAtPath(repoPath, ['rev-parse', originalBranch])).toBe(headBefore);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
  });

  integrationTest('keeps the exact index and HEAD when deterministic commit signing fails', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    const failingSigner = path.join(repoPath, '.git', 'hooks', 'failing-gpg');
    fs.writeFileSync(failingSigner, '#!/bin/sh\nexit 1\n', { encoding: 'utf8', mode: 0o755 });
    await git.runCommandAtPath(repoPath, ['config', 'commit.gpgsign', 'true']);
    await git.runCommandAtPath(repoPath, ['config', 'gpg.program', failingSigner.replace(/\\/g, '/')]);
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: signed AI commit', description: '' })).rejects.toThrow(/sign|gpg|commit/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
  });

  integrationTest('keeps the exact index and HEAD when the repository has no usable author identity', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const indexPath = await realIndexPath(git, repoPath);
    const indexBefore = fs.readFileSync(indexPath);
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    await git.runCommandAtPath(repoPath, ['config', 'user.name', '']);
    await git.runCommandAtPath(repoPath, ['config', 'user.email', '']);
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: missing identity', description: '' })).rejects.toThrow(/ident|name|email|commit/i);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
    expect(fs.readFileSync(indexPath)).toEqual(indexBefore);
  });

  integrationTest('aborts on an externally changed index while preserving that exact external index', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const headBefore = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      fs.writeFileSync(filePath, 'external-index-one\nexternal-index-two\n', 'utf8');
      await git.runCommandAtPath(repoPath, ['add', '--', 'example.txt']);
      const externalTree = await git.runCommandAtPath(repoPath, ['write-tree']);

      await expect(transaction.commit(exampleBatch(), { title: 'test: stale index must abort', description: '' })).rejects.toThrow(/index changed/i);
      expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(externalTree);
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(headBefore);
  });

  integrationTest('aborts before committing when the branch moved and preserves the foreign commit plus partial index', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    await createPartiallyStagedChange(git, repoPath, filePath);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const stagedTreeBefore = await git.runCommandAtPath(repoPath, ['write-tree']);
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await git.runCommandAtPath(repoPath, ['commit', '--allow-empty', '--only', '-m', 'external: branch moved']);
      const externalHead = await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD']);

      await expect(transaction.commit(exampleBatch(), { title: 'test: stale head must abort', description: '' })).rejects.toThrow(/HEAD changed/i);
      expect(await git.runCommandAtPath(repoPath, ['rev-parse', 'HEAD'])).toBe(externalHead);
      expect(await git.runCommandAtPath(repoPath, ['show', '-s', '--format=%s', 'HEAD'])).toBe('external: branch moved');
      expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
    } finally {
      transaction.dispose();
    }
  });

  integrationTest('deletes a failed unborn AI ref after a nested post-commit hook and restores the initial index byte-for-byte', async (lifecycle) => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-ai-unborn-index-test-'));
    tempRoots.push(repoPath);
    const git = new GitService(undefined, lifecycle.scheduler);
    await git.runCommandAtPath(repoPath, ['init']);
    await git.runCommandAtPath(repoPath, ['config', 'maintenance.auto', 'false']);
    await git.runCommandAtPath(repoPath, ['config', 'gc.auto', '0']);
    await git.runCommandAtPath(repoPath, ['config', 'commit.gpgsign', 'false']);
    await git.runCommandAtPath(repoPath, ['config', 'user.name', 'AI Transaction Test']);
    await git.runCommandAtPath(repoPath, ['config', 'user.email', 'ai-transaction@example.test']);
    const filePath = path.join(repoPath, 'example.txt');
    fs.writeFileSync(filePath, 'initial-staged\n', 'utf8');
    await git.runCommandAtPath(repoPath, ['add', '--', 'example.txt']);
    fs.writeFileSync(filePath, 'initial-snapshot\n', 'utf8');
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    const indexPath = await realIndexPath(git, repoPath);
    const indexBefore = fs.readFileSync(indexPath);
    writeHook(
      repoPath,
      'post-commit',
      `git_dir=$(git rev-parse --git-dir)
marker="$git_dir/ogc-unborn-nested-post-commit"
if test ! -f "$marker"; then
  : >"$marker"
  git commit --allow-empty --no-verify -m "hook: nested unborn commit"
fi`,
    );
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await expect(transaction.commit(exampleBatch(), { title: 'test: unborn AI commit', description: '' })).rejects.toThrow(/HEAD changed|AI commit/i);
    } finally {
      transaction.dispose();
    }

    await expect(git.runCommandAtPath(repoPath, ['rev-parse', '--verify', 'HEAD'])).rejects.toThrow();
    expect(fs.readFileSync(indexPath)).toEqual(indexBefore);
    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe('initial-staged');
  });

  integrationTest('commits both sides of a NUL-delimited rename', async (lifecycle) => {
    const { git, repoPath, filePath } = await createRepository(lifecycle);
    // `>` is not a legal Windows filename character; the parser unit test
    // covers a literal arrow independently on platforms where it is legal.
    const renamedName = process.platform === 'win32' ? 'renamed example.txt' : 'renamed -> example.txt';
    const renamedPath = path.join(repoPath, renamedName);
    fs.renameSync(filePath, renamedPath);
    await git.runCommandAtPath(repoPath, ['add', '-A']);
    const entries = parseStatusPorcelain(await git.getStatusPorcelainZAtPath(repoPath));
    expect(entries).toEqual([{ path: renamedName, originalPath: 'example.txt', x: 'R', y: ' ', code: 'R ' }]);
    const transaction = new AiAutoCommitIndexTransaction(git, repoPath);

    try {
      await transaction.initialize(entries);
      await transaction.commit(
        [
          {
            path: entries[0].path,
            originalPath: entries[0].originalPath,
            changeType: 'renamed',
            additions: 0,
            deletions: 0,
            isBinary: false,
            preview: '',
            keyChanges: [],
            groupKey: 'root:txt:renamed',
            hydrated: true,
          },
        ],
        { title: 'test: rename arrow file', description: '' },
      );
    } finally {
      transaction.dispose();
    }

    expect(await git.runCommandAtPath(repoPath, ['show', `HEAD:${renamedName}`])).toBe('base-one\nbase-two');
    expect(await git.runCommandAtPath(repoPath, ['ls-tree', '--name-only', 'HEAD', '--', 'example.txt'])).toBe('');
    expect(await git.getStatusPorcelainZAtPath(repoPath)).toBe('');
  });
});
