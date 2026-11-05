import type { ElectronGitAPI } from '@/shared/ipc/contracts/git';
import type { DemoRepository } from './demoRepository';
import { inspectDemoRebase } from './demoRebaseInspection';
import { planDemoRebase } from './demoRebasePlan';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { prepareDemoRebaseFiles, publishDemoRebase } from './demoRebasePublication';
/** The exercise never calls native Git, even for unsupported instructions. */
export function createDemoRebaseApi(repo: DemoRepository): Partial<ElectronGitAPI> {
  let writing = false;
  return {
    startInteractiveRebase: async (baseHash, todoLines, repoPath) => {
      let claimed = false;
      try {
        if (repoPath && repoPath !== repo.activeRepo) throw new Error('The practice repository changed.');
        if (writing) throw new Error('A practice rebase is already active.');
        const { base, instructions } = inspectDemoRebase(repo, baseHash, todoLines);
        const fingerprint = demoRepositoryFingerprint(repo),
          context = repo.contextVersion;
        const origin = { originalBranch: repo.branch, originalHead: repo.commits[0].hash };
        const planned = planDemoRebase(repo, base, instructions),
          prepared = prepareDemoRebaseFiles(repo, planned);
        writing = claimed = true;
        await Promise.resolve();
        if (context !== repo.contextVersion || fingerprint !== demoRepositoryFingerprint(repo))
          throw new Error('The practice repository changed before rebase publication.');
        return publishDemoRebase(repo, planned, origin, prepared);
      } catch (cause) {
        return { success: false, error: cause instanceof Error ? cause.message : String(cause) };
      } finally {
        if (claimed) writing = false;
      }
    },
  };
}
