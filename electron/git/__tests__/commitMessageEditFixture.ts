import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { GitRunner } from '../GitRunner';
import { CommitMessageEditService } from '../CommitMessageEditService';

export function editFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-reword-test-'));
  const repo = path.join(root, 'repo with spaces');
  fs.mkdirSync(repo);
  const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Original Author']);
  git(['config', 'user.email', 'author@example.test']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.autocrlf', 'false']);
  git(['config', 'core.hooksPath', path.join(repo, '.git', 'hooks')]);
  const commit = (subject: string, contents?: string) => {
    if (contents !== undefined) {
      fs.writeFileSync(path.join(repo, 'file.txt'), contents);
      git(['add', 'file.txt']);
    }
    git(['commit', '--allow-empty', '-m', subject]);
    return git(['rev-parse', 'HEAD']);
  };
  const hashes = [commit('root', 'root\n'), commit('middle\n\nOriginal body\n\n# Keep this', 'middle\n'), commit('last')];
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
  const dispose = () => fs.rmSync(root, { recursive: true, force: true });
  return { root, repo, git, commit, hashes, service, runner, controller, context, request, dispose };
}
