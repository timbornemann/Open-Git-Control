import type { TutorialStep } from '@/shared/tutorial/types';
import type { DemoRepository } from './demoRepository';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { demoCheckout } from './demoBranchCommands';
import { validateBranchName } from '@/utils/gitRefValidation';
import { normalizeCleanupPreferences } from '@/shared/git/branchCleanupProtection';
import { prepareDemoMergeFixture } from './demoMergeFixture';
import { prepareDemoRebaseFixture } from './demoRebaseFixture';

/** Fresh chapter recipes name real saved example trees, never personal refs. */
export function prepareDemoBranches(repo: DemoRepository, setup: NonNullable<TutorialStep['prepare']>['branches'], language: 'de' | 'en' = 'de') {
  if (!setup) return;
  if (setup.fixture === 'linear-independent') prepareDemoRebaseFixture(repo, language);
  else prepareDemoMergeFixture(repo, setup.fixture, language);
  if (setup.protectedPatterns)
    repo.branchProtectionPatterns = normalizeCleanupPreferences({ protectedPatterns: [...setup.protectedPatterns] }).protectedPatterns;
  const heads = new Map<string, string>();
  for (const entry of setup.heads) {
    if (
      validateBranchName(entry.name) ||
      entry.name.startsWith('-') ||
      entry.name === 'HEAD' ||
      [...heads.keys()].some((name) => name === entry.name || name.startsWith(entry.name + '/') || entry.name.startsWith(name + '/'))
    )
      throw new Error('Invalid practice branch recipe.');
    const commit = repo.commits.find((commit) => commit.hash === practiceCommitHash(entry.commit));
    if (!commit) throw new Error('Missing practice branch revision.');
    heads.set(entry.name, commit.hash);
  }
  if (!heads.has(setup.current)) throw new Error('The current practice branch must exist.');
  repo.branches = [...heads.keys()];
  repo.branchHeads = heads;
  for (const name of repo.branchUpstreams.keys()) if (!heads.has(name)) repo.branchUpstreams.delete(name);
  if (setup.remotes)
    repo.remoteHeads = new Map(
      setup.remotes.map((entry) => {
        const commit = repo.commits.find((commit) => commit.hash === practiceCommitHash(entry.commit));
        if (!commit) throw new Error('Missing remote practice revision.');
        return [entry.name, commit.hash];
      }),
    );
  repo.branch = '';
  const result = demoCheckout(repo, [setup.current]);
  if (!result.success) throw new Error(result.error);
}
