import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { GitRunner } from '../GitRunner';
import { CommitMessageEditService } from '../CommitMessageEditService';
import { configureFixtureRepository, fastImportHistory } from './gitFixtureHistory';

export function editFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-reword-test-'));
  const repo = path.join(root, 'repo with spaces');
  fs.mkdirSync(repo);
  const git = (args: string[], cwd = repo, input?: string) =>
    execFileSync('git', args, { cwd, input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trimEnd();
  git(['init', '-b', 'main']);
  configureFixtureRepository(repo, 'Original Author', 'author@example.test');
  git(
    ['fast-import', '--quiet'],
    repo,
    fastImportHistory(
      [
        { message: 'root', files: { 'file.txt': 'root\n' } },
        { message: 'middle\n\nOriginal body\n\n# Keep this', files: { 'file.txt': 'middle\n' } },
        { message: 'last' },
      ],
      'Original Author <author@example.test>',
    ),
  );
  git(['reset', '--hard', 'HEAD']);
  const hashes = git(['rev-list', '--reverse', 'HEAD']).split(/\r?\n/);
  const commit = (subject: string, contents?: string) => {
    if (contents !== undefined) {
      fs.writeFileSync(path.join(repo, 'file.txt'), contents);
      git(['add', 'file.txt']);
    }
    git(['commit', '--allow-empty', '-m', subject]);
    return git(['rev-parse', 'HEAD']);
  };
  const runner = new GitRunner();
  const service = new CommitMessageEditService(runner);
  const controller = new AbortController();
  const context = { signal: controller.signal, ensureActive: () => controller.signal.throwIfAborted(), progress: (_phase: string) => {} };
  const request = (hash = hashes[1], title = 'Corrected title', description = 'Corrected body') => ({
    repoPath: repo,
    commitHash: hash,
    expectedHead: git(['rev-parse', 'HEAD']),
    expectedBranch: git(['symbolic-ref', 'HEAD']),
    title,
    description,
    operationId: randomUUID(),
  });
  const dispose = () => {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-reword-test-'))
      throw new Error('Unsafe edit fixture cleanup');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  return { root, repo, git, commit, hashes, service, runner, controller, context, request, dispose };
}
