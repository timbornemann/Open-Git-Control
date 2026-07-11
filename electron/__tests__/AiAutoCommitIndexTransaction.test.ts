import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiService } from '../AiService';
import { GitService } from '../GitService';
import { AiAutoCommitIndexTransaction } from '../ai/AiAutoCommitIndexTransaction';
import { parseStatusPorcelain } from '../ai/gitStatusSnapshot';
import { baseSettings, okJsonResponse } from './helpers/aiServiceTestUtils';

const tempRoots: string[] = [];

const createRepository = async (): Promise<{ git: GitService; repoPath: string; filePath: string }> => {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-ai-index-test-'));
  tempRoots.push(repoPath);
  const git = new GitService();
  await git.runCommandAtPath(repoPath, ['init']);
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
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    for (const root of tempRoots.splice(0)) {
      // Windows can briefly hold a handle to a just-exited git subprocess's
      // directory under parallel load; retry the removal instead of failing.
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it('leaves the exact partially staged tree unchanged when cancellation happens during AI generation', async () => {
    const { git, repoPath, filePath } = await createRepository();
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
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new AiService(git);
    const run = service.runAutoCommit(
      repoPath,
      { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' },
      () => '',
      undefined,
      () => cancelRequested,
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 5_000 });
    cancelRequested = true;
    await expect(run).rejects.toThrow('abgebrochen');

    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe(stagedBefore);
    expect(await git.runCommandAtPath(repoPath, ['write-tree'])).toBe(stagedTreeBefore);
    expect(await git.runCommandAtPath(repoPath, ['rev-list', '--count', 'HEAD'])).toBe('1');
  });

  it('commits immutable snapshot blobs and leaves later working-tree edits unstaged', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('keeps the full AI workflow pinned to the snapshot while its message request is pending', async () => {
    const { git, repoPath, filePath } = await createRepository();
    await createPartiallyStagedChange(git, repoPath, filePath);
    let resolveMessage: ((value: ReturnType<typeof okJsonResponse>) => void) | undefined;
    const fetchMock = vi.fn(
      async () =>
        new Promise<ReturnType<typeof okJsonResponse>>((resolve) => {
          resolveMessage = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const service = new AiService(git);
    const run = service.runAutoCommit(repoPath, { ...baseSettings, aiProvider: 'ollama', ollamaModel: 'test-model' }, () => '');

    await vi.waitFor(() => expect(resolveMessage).toBeTypeOf('function'), { timeout: 5_000 });
    fs.writeFileSync(filePath, 'edited-after-snapshot\nstill-uncommitted\n', 'utf8');
    resolveMessage?.(okJsonResponse({ message: { content: '{"title":"test: snapshot commit","description":""}' } }));
    await expect(run).resolves.toMatchObject({ commits: [{ subject: 'test: snapshot commit' }] });

    expect(await git.runCommandAtPath(repoPath, ['show', 'HEAD:example.txt'])).toBe('staged-one\nsnapshot-two');
    expect(await git.runCommandAtPath(repoPath, ['show', ':example.txt'])).toBe('staged-one\nsnapshot-two');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('edited-after-snapshot\nstill-uncommitted\n');
  });

  it('surfaces hook failures and restores the exact pre-run index without a commit', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('rolls back the complete nonce-owned chain when a post-commit hook creates another commit', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('rolls back commits created by a hook before that hook rejects the outer commit', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('rolls back an amended hook tree instead of committing unsnapshotted working-tree content', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('does not delete an unowned commit that lands after the AI commit', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('rolls back only the original branch when a hook attaches HEAD elsewhere', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('keeps the exact index and HEAD when deterministic commit signing fails', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('keeps the exact index and HEAD when the repository has no usable author identity', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('aborts on an externally changed index while preserving that exact external index', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('aborts before committing when the branch moved and preserves the foreign commit plus partial index', async () => {
    const { git, repoPath, filePath } = await createRepository();
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

  it('deletes a failed unborn AI ref after a nested post-commit hook and restores the initial index byte-for-byte', async () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-ai-unborn-index-test-'));
    tempRoots.push(repoPath);
    const git = new GitService();
    await git.runCommandAtPath(repoPath, ['init']);
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

  it('commits both sides of a NUL-delimited rename', async () => {
    const { git, repoPath, filePath } = await createRepository();
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
