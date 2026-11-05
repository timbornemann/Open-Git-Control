import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { GitRunner } from '../../../electron/git/GitRunner';
import { CommitMessageEditService } from '../../../electron/git/CommitMessageEditService';
import { configureFixtureRepository } from '../../../electron/git/__tests__/gitFixtureHistory';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { createDemoApi } from '../demoApi';
import { DEMO_REPO } from '../demoRepository';
import { demoBlobBytes } from '../demoBlob';
import { resolveDemoCommit } from '../demoHistory';

export function rewordParityFixture(language: 'de' | 'en', independent = false) {
  const prepare = branchRecipe();
  prepare.branches = {
    ...(independent ? { fixture: 'linear-independent' as const } : {}),
    heads: [
      { name: 'main', commit: 4 },
      { name: 'feature/begruessung', commit: 1 },
    ],
    remotes: [{ name: 'origin/main', commit: 2 }],
    current: 'main',
  };
  const { repo, api } = createDemoApi(
    { request: { chapterId: 'history' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], prepare },
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-reword-parity-'));
  const cwd = path.join(root, 'repo with spaces'),
    config = path.join(root, 'empty-config');
  fs.mkdirSync(cwd);
  fs.writeFileSync(config, '');
  // These process-local overrides also cover the real service's child processes.
  for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith('GIT_')) vi.stubEnv(key, undefined);
  vi.stubEnv('GIT_CONFIG_GLOBAL', config);
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  const git = (args: string[], overrides: Record<string, string> = {}, expected = 0) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, ...overrides } });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(expected);
    return result.stdout;
  };
  git(['init', '-b', 'main']);
  configureFixtureRepository(cwd, 'Alex Beispiel', 'alex@example.invalid');
  const revisions = new Map<string, string>();
  for (const number of [1, 2, 3, 4]) {
    const commit = resolveDemoCommit(repo, hash(number))!;
    const removed = git(['ls-files', '-z'])
      .split('\0')
      .filter((name) => name && !Object.hasOwn(commit.files!, name));
    if (removed.length) git(['rm', '-f', '--', ...removed]);
    for (const [name, blob] of Object.entries(commit.files!)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      fs.writeFileSync(path.join(cwd, name), demoBlobBytes(blob));
    }
    git(['add', '-A']);
    git(['commit', '-m', commit.subject, '-m', commit.body || ''], {
      GIT_AUTHOR_NAME: commit.author!,
      GIT_AUTHOR_EMAIL: commit.email!,
      GIT_AUTHOR_DATE: commit.date,
      GIT_COMMITTER_DATE: commit.date,
    });
    revisions.set(commit.hash, git(['rev-parse', 'HEAD']).trim());
  }
  git(['branch', 'feature/begruessung', revisions.get(hash(1))!]);
  git(['update-ref', 'refs/remotes/origin/main', revisions.get(hash(2))!]);
  git(['tag', 'v1.0.0', revisions.get(hash(2))!]);
  const runner = new GitRunner(),
    service = new CommitMessageEditService(runner);
  const controller = new AbortController();
  const context = { signal: controller.signal, ensureActive: () => controller.signal.throwIfAborted(), progress: () => {} };
  const input = {
    repoPath: cwd,
    commitHash: revisions.get(hash(3))!,
    expectedHead: revisions.get(hash(4))!,
    expectedBranch: 'refs/heads/main',
    operationId: randomUUID(),
    title: language === 'de' ? 'docs: Lernprojekt genauer erklären' : 'docs: clarify the learning project',
    description: language === 'de' ? 'Eine bewusste Korrektur.\n\n# Dieser Absatz bleibt erhalten.' : 'A deliberate correction.\n\n# Keep this paragraph.',
  };
  const simulated = { ...input, repoPath: DEMO_REPO, commitHash: hash(3), expectedHead: hash(4) };
  const dispose = async () => {
    await runner.close();
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-reword-parity-')) throw new Error('Unsafe fixture');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    vi.unstubAllEnvs();
  };
  return { repo, api, git, revisions, service, runner, context, input, simulated, cwd, dispose };
}
