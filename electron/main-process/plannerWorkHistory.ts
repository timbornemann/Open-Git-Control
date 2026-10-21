import type { PlannerBranchReference } from '../../src/types/projectPlanner';
import type { PlannerWorkDetails, PlannerCommitReference } from '../../src/types/plannerWork';
import { WORK_OID, workAncestor, workSha, type WorkGit } from './plannerWorkInspection';

export async function readWorkHistory(git: WorkGit, repo: string, branch: PlannerBranchReference, previous: PlannerWorkDetails): Promise<PlannerWorkDetails> {
  const headSha = await workSha(git, repo, `refs/heads/${branch.name}`);
  const historyIncomplete = (await git.run(repo, ['rev-parse', '--is-shallow-repository'])).trim() === 'true';
  if (!headSha) return { ...previous, branchMissing: true, historyIncomplete, checkedAt: Date.now() };
  if (headSha === previous.headSha && previous.historyIncomplete === historyIncomplete) return { ...previous, branchMissing: false };
  let base = branch.baseSha;
  if (!(await workAncestor(git, repo, base, headSha))) {
    if (historyIncomplete) return { ...previous, headSha, historyIncomplete: true, checkedAt: Date.now(), error: 'The local history is incomplete.' };
    const target = await workSha(git, repo, branch.baseRef);
    if (!target) return { ...previous, headSha, historyIncomplete: true, error: 'The branch history changed and its comparison base is unavailable.' };
    base = (await git.run(repo, ['merge-base', headSha, target]).catch(() => '')).trim();
    if (!WORK_OID.test(base)) return { ...previous, headSha, historyIncomplete: true, checkedAt: Date.now(), error: 'Incomplete branch history.' };
  }
  const output = await git.run(repo, ['log', '--first-parent', '--max-count=501', '--format=%H%x00%ct%x00%s', `${base}..${headSha}`]);
  const current: PlannerCommitReference[] = output
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(0, 500)
    .map((row) => {
      const [sha, timestamp, subject] = row.split('\0');
      if (!WORK_OID.test(sha)) throw new Error('Invalid commit revision.');
      return { sha, timestamp: Number(timestamp) * 1000, subject: (subject || '').slice(0, 240), state: 'current' };
    });
  const replaced = previous.commits.filter((commit) => !current.some((entry) => entry.sha === commit.sha)).slice(0, 500);
  for (const commit of replaced) commit.state = (await workSha(git, repo, commit.sha)) ? 'replaced' : 'unavailable';
  return {
    ...previous,
    headSha,
    branchMissing: false,
    historyIncomplete,
    truncated: output.trim().split('\n').length > 500,
    commits: [...current, ...replaced],
    checkedAt: Date.now(),
    error: undefined,
  };
}
