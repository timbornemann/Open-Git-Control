import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GitIntegrationLifecycle } from '../../git/__tests__/gitIntegrationLifecycle';
import { cleanupTransferFixtures, git } from '../../git/__tests__/remoteTransferFixture';
import { workFixture } from './plannerWorkFixture';
import { BranchChangeService } from '../BranchChangeService';
import { PlannerWorkService } from '../PlannerWorkService';

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() } }));
const lifecycles: GitIntegrationLifecycle[] = [];
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', path.join(os.tmpdir(), `ogc-planner-change-${randomUUID()}`));
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
});
afterEach(async () => {
  await Promise.all(lifecycles.splice(0).map((entry) => entry.close()));
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await cleanupTransferFixtures();
}, 60_000);
function setup() {
  const lifecycle = new GitIntegrationLifecycle();
  lifecycles.push(lifecycle);
  const f = workFixture(lifecycle);
  const changes = new BranchChangeService(lifecycle.runner, f.cache);
  const planner = new PlannerWorkService(lifecycle.runner, f.cache, f.hosting, changes);
  fs.writeFileSync(path.join(f.repo, 'new.txt'), 'saved task draft');
  const start = async (mode: 'carry' | 'park') => {
    const plan = await planner.inspect(f.request, f.context);
    const change = await changes.inspect({ repoPath: f.repo, target: { kind: 'create', branch: plan.suggestedName, startPoint: plan.defaultBase } }, f.context);
    return planner.start(
      {
        ...f.request,
        planId: plan.planId,
        branchName: plan.suggestedName,
        baseRef: plan.defaultBase,
        acceptChanges: true,
        branchChange: { planId: change.planId, mode, name: 'Task draft' },
      },
      f.context,
    );
  };
  return { ...f, changes, planner, start };
}
it('parks all changes before creating and assigning a task branch', async () => {
  const f = setup();
  await f.lifecycle.track(
    (async () => {
      const result = await f.start('park');
      expect(result.item?.status).toBe('in-progress');
      expect(result.branchChange).toMatchObject({ switched: true, restored: false });
      expect(git(f.repo, 'branch', '--show-current')).toBe(result.branch);
      expect(fs.existsSync(path.join(f.repo, 'new.txt'))).toBe(false);
      expect((await f.changes.list(f.repo))[0].name).toBe('Task draft');
      expect(f.current().item.references?.branches[0].name).toBe(result.branch);
    })(),
  );
}, 120_000);
it('keeps failed carry and task assignment recoverable across restart and requires explicit review', async () => {
  const f = setup();
  const original = f.lifecycle.runner.withExclusiveWrite.bind(f.lifecycle.runner);
  vi.spyOn(f.lifecycle.runner, 'withExclusiveWrite').mockImplementation((repo, command, work, signal) =>
    original(
      repo,
      command,
      (runner) =>
        work({
          ...runner,
          run: async (cwd, args, options) => {
            if (args[0] === 'stash' && args[1] === 'apply') throw new Error('Restoration refused');
            return runner.run(cwd, args, options);
          },
        }),
      signal,
    ),
  );
  await f.lifecycle.track(
    (async () => {
      const result = await f.start('carry');
      expect(result.branchChange).toMatchObject({ switched: true, restored: false });
      expect(result.requiresChangesReview).toBe(true);
      expect(f.current().item.status).toBe('planned');
      const restarted = new PlannerWorkService(f.lifecycle.runner, f.cache, f.hosting);
      expect((await restarted.inspect(f.request, f.context)).requiresChangesReview).toBe(true);
      const recover = { ...f.request, action: 'recover' as const, recoveryId: result.recoveryId!, expectedRevision: f.current().revision };
      await expect(restarted.update(recover, f.context)).rejects.toThrow('confirm their restoration or intentional parking');
      expect(f.current().item.status).toBe('planned');
      expect((await restarted.update({ ...recover, acceptRecoveredChanges: true }, f.context)).status).toBe('in-progress');
      expect(git(f.repo, 'stash', 'list')).toContain('Task draft');
      expect(fs.existsSync(path.join(f.repo, 'new.txt'))).toBe(false);
    })(),
  );
}, 120_000);
