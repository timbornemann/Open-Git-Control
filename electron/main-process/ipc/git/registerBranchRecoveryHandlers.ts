import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, type WebContents } from 'electron';
import type { GitService } from '../../../GitService';
import { BranchBackupService } from '../../../git/BranchBackupService';
import { BranchRecoveryService, type BranchRepairPlan } from '../../../git/BranchRecoveryService';
import { BranchRepairSnapshots } from '../../../git/BranchRepairSnapshots';
import { BranchTipJournal } from '../../../git/BranchTipJournal';
import { branchGitFailure, RepositoryHeadService } from '../../../git/RepositoryHeadService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { RepairBranchRequest } from '../../../../src/shared/ipc/branchRecovery';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { beginCommitProtection, COMMIT_PROTECTION_BUSY_ERROR } from '../../RepositoryCommitProtection';
import { repoJobRegistry } from '../../repoJobRegistry';
import { onRepoStoreChanged, readStoreData } from '../../repoStore';
import { readSettings } from '../../settingsStore';
import { registerBranchBackupHandlers } from './registerBranchBackupHandlers';

export function registerBranchRecoveryHandlers(gitService: GitService) {
  const profile = app.getPath('userData');
  const journal = new BranchTipJournal(path.join(profile, 'branch-tips'), gitService.runner);
  const snapshots = new BranchRepairSnapshots(path.join(profile, 'branch-repair-snapshots'));
  const heads = new RepositoryHeadService(gitService.runner, {
    previousTip: async (repo, ref): Promise<string | undefined> =>
      (await journal.previousTip(repo, ref)) ?? (await backups.versions(repo).catch(() => [])).find((bundle) => bundle.refs[ref])?.refs[ref],
    observeTip: (tip) => journal.observe(tip),
  });
  const backups: BranchBackupService = new BranchBackupService(profile, gitService.runner, heads, journal, () => readStoreData().repos.map(({ path }) => path));
  registerBranchBackupHandlers(backups);
  const service = new BranchRecoveryService(gitService.runner, heads, journal, backups, snapshots);
  const stop = onRepoStoreChanged(() => backups.repositoriesChanged());
  const confirmations = new WeakMap<WebContents, { id: string; generation: number; plan: BranchRepairPlan }>();
  const authorize = (repo: unknown, channel: IpcChannel) => requireActiveRepositoryPath(repo, gitService.getRepoPath(), channel);
  const respond = async <T>(operation: () => T | Promise<T>) => {
    try {
      return { success: true as const, data: await operation() };
    } catch (error) {
      return branchGitFailure(error);
    }
  };

  ipcMain.handle(IpcChannel.GitRepositoryHead, (_event, requested: unknown) =>
    respond(async () => {
      const repo = authorize(requested, IpcChannel.GitRepositoryHead);
      const head = await heads.read(repo, { requestedKind: 'interactive' });
      authorize(repo, IpcChannel.GitRepositoryHead);
      return head;
    }),
  );
  ipcMain.handle(IpcChannel.GitInspectBranchRecovery, (event, requested: unknown) =>
    respond(async () => {
      const repo = authorize(requested, IpcChannel.GitInspectBranchRecovery);
      confirmations.delete(event.sender);
      const job = repoJobRegistry.begin(repo);
      try {
        const plan = await service.inspect(repo, job.signal);
        job.ensureActive();
        authorize(repo, IpcChannel.GitInspectBranchRecovery);
        if (!plan) return null;
        const id = plan.candidates.length ? randomUUID() : null;
        if (id) confirmations.set(event.sender, { id, generation: job.generation, plan });
        return { ...plan.inspection, confirmationId: id };
      } finally {
        job.complete();
      }
    }),
  );
  ipcMain.handle(IpcChannel.GitRepairBranch, (event, request: RepairBranchRequest) =>
    respond(async () => {
      const repo = authorize(request?.repoPath, IpcChannel.GitRepairBranch);
      const confirmation = confirmations.get(event.sender);
      const candidate = confirmation?.plan.candidates.find((item) => item.oid === request?.oid);
      if (
        !confirmation ||
        !candidate ||
        confirmation.id !== request?.confirmationId ||
        confirmation.plan.repo?.repoPath !== repo ||
        confirmation.generation !== repoJobRegistry.getGeneration()
      )
        throw new Error('The recovery review expired. Inspect the branch again.');
      confirmations.delete(event.sender);
      const job = repoJobRegistry.begin(repo);
      const ensureActive = () => {
        job.ensureActive();
        if (event.sender.isDestroyed()) throw new Error('Window closed.');
        authorize(repo, IpcChannel.GitRepairBranch);
      };
      try {
        const german = readSettings().language === 'de';
        const options = {
          type: 'warning' as const,
          message: german ? 'Branch-Verweis wiederherstellen?' : 'Restore branch reference?',
          detail: [confirmation.plan.inspection.problem.ref, candidate.oid, candidate.subject].filter(Boolean).join('\n'),
          buttons: german ? ['Abbrechen', 'Wiederherstellen'] : ['Cancel', 'Restore'],
          defaultId: 0,
          cancelId: 0,
          signal: job.signal,
        };
        const window = BrowserWindow.fromWebContents(event.sender);
        const choice = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
        if (choice.response !== 1) return null;
        ensureActive();
        const release = beginCommitProtection(repo);
        if (!release) throw new Error(COMMIT_PROTECTION_BUSY_ERROR);
        try {
          return await service.repair(confirmation.plan, candidate.oid, ensureActive, job.signal);
        } finally {
          release();
        }
      } finally {
        job.complete();
      }
    }),
  );
  return {
    heads,
    snapshots,
    dispose: async () => {
      stop();
      await backups.dispose();
    },
  };
}
