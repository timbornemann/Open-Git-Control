import type { GitRunner } from './GitRunner';
import type { CommitEditGit } from './CommitEditGit';
import { CommitService } from './CommitService';
import { assertGitWorkingTreePaths } from './GitWorkingTreePathGuard';

export type StagingDiagnostic = { repoPath: string; queueWaitMs: number; validationMs: number; gitMs: number; success: boolean; timestamp: number };

/** Validation and Git own one write lane, so previews cannot delay or interleave them. */
export class StagingService {
  private diagnostics: StagingDiagnostic[] = [];
  constructor(private readonly runner: GitRunner) {}
  getDiagnostics() {
    return [...this.diagnostics];
  }

  private execute(repo: string, work: (git: CommitEditGit, assertReady: () => void) => Promise<string>, assertReady = () => {}) {
    const queued = performance.now();
    return this.runner.withExclusiveWrite(
      repo,
      'stage',
      async (git) => {
        const started = performance.now();
        let gitMs = 0;
        let success = false;
        const session: CommitEditGit = {
          ...git,
          run: async (cwd, args, options) => {
            if (args[0] !== 'add') return git.run(cwd, args, options);
            assertReady();
            const begin = performance.now();
            try {
              return await git.run(cwd, args, options);
            } finally {
              gitMs += performance.now() - begin;
            }
          },
        };
        try {
          assertReady();
          const result = await work(session, assertReady);
          success = true;
          return result;
        } finally {
          this.diagnostics.push({
            repoPath: repo,
            queueWaitMs: started - queued,
            validationMs: performance.now() - started - gitMs,
            gitMs,
            success,
            timestamp: Date.now(),
          });
          if (this.diagnostics.length > 100) this.diagnostics.shift();
        }
      },
      undefined,
      { standardCommands: true, beforeCommand: assertReady },
    );
  }

  stagePathsAtPath(repo: string, paths: string[], assertReady?: () => void): Promise<string> {
    return this.execute(
      repo,
      (git) => new CommitService((cwd, args, envOverrides) => git.run(cwd, args, { envOverrides })).stagePathsAtPath(repo, paths),
      assertReady,
    );
  }

  stageCommandAtPath(repo: string, args: string[], assertReady?: () => void): Promise<string> {
    if (args[0] !== 'add') return Promise.reject(new Error('Expected a staging command.'));
    return this.execute(
      repo,
      async (git) => {
        await assertGitWorkingTreePaths(repo, args, (query) => git.run(repo, query));
        return git.run(repo, args);
      },
      assertReady,
    );
  }
}
