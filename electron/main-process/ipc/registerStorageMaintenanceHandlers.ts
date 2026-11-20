import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import * as path from 'node:path';
import type { GitService } from '../../GitService';
import { branchRepairId, type BranchRepairSnapshots } from '../../git/BranchRepairSnapshots';
import type { CommitStatsService } from '../../CommitStatsService';
import type { RepositoryRunService } from '../RepositoryRunService';
import type { RepositoryIconService } from '../RepositoryIconService';
import type { RepositoryAnalyticsService } from '../../analytics/RepositoryAnalyticsService';
import { IpcChannel } from '../../../src/types/ipcContract';
import type { CompletedRecoveryBackup, StorageOverview } from '../../../src/shared/ipc/storageMaintenance';
import { StorageMaintenanceService } from '../StorageMaintenanceService';
import { MaintenanceScheduler } from '../MaintenanceScheduler';
import { BrowserCachePressureMonitor } from '../BrowserCachePressureMonitor';
import { probeRepositoryHealth, probedCommonDirectory } from '../storageRepositoryHealth';
import { inventoryRecovery } from '../storageRecoveryInventory';
import { readStoreData, writeStoreData, onRepoStoreChanged, onRepoStoreWillChange } from '../repoStore';
import { readSettings } from '../settingsStore';
import { repoJobRegistry } from '../repoJobRegistry';
import { repositoryPathKey } from '../activeRepositoryAuthorization';
import { clearBrowserCaches } from '../browserCacheMaintenance';
import { isDevelopmentRuntime } from '../security';
import { isStorageBusy } from '../managedStorage';
import { inspectPrivateTempFiles, cleanPrivateTempFiles, privateTempRoot } from '../../git/PrivateTempFiles';
import { CommitMessageEditService } from '../../git/CommitMessageEditService';
import { beginCommitProtection, isCommitProtectionBusy } from '../RepositoryCommitProtection';
import { EDIT_ID } from '../../git/commitMessageEditJournal';
import { readRepositoryUiPreferences, updateRepositoryUiPreferences } from '../repositoryUiPreferences';
import { validateMaintenanceRequest } from '../storageMaintenanceRequests';
export function registerStorageMaintenanceHandlers(deps: {
  gitService: GitService;
  branchRepairSnapshots?: BranchRepairSnapshots;
  commitStatsService: CommitStatsService;
  runService: RepositoryRunService;
  iconService: RepositoryIconService;
  analyticsService: RepositoryAnalyticsService;
}) {
  const root = app.getPath('userData');
  const browserBusy = () => BrowserWindow.getAllWindows().some((window) => !window.isDestroyed() && window.webContents.isLoading());
  const busy = (repo: string) => {
    return (
      isCommitProtectionBusy(repo, probedCommonDirectory(repo)) ||
      repoJobRegistry.isRepositoryBusy(repo) ||
      deps.gitService.runner.isRepositoryBusy(repo, probedCommonDirectory(repo)) ||
      deps.runService.isRepositoryBusy(repo) ||
      deps.commitStatsService.isRepositoryBusy(repo)
    );
  };
  const service = new StorageMaintenanceService({
    root,
    readRepos: readStoreData,
    writeRepos: writeStoreData,
    probe: probeRepositoryHealth,
    commonDirectory: probedCommonDirectory,
    recoveryInventory: inventoryRecovery,
    isRepoBusy: (repo) => {
      const active = deps.gitService.getRepoPath();
      return busy(repo) || Boolean(active && repositoryPathKey(active) === repositoryPathKey(repo));
    },
    clearBrowser: (categories) => clearBrowserCaches(categories, isDevelopmentRuntime()),
    isBrowserBusy: browserBusy,
    maintainStatistics: (clear, cutoff) => deps.commitStatsService.maintain(clear, cutoff),
    clearIcon: (repo) => deps.iconService.clearGenerated(repo),
    invalidateAnalytics: () => deps.analyticsService.invalidateCache(),
    temporary: inspectPrivateTempFiles,
    cleanTemporary: (allowed) => cleanPrivateTempFiles(Date.now(), privateTempRoot(), allowed),
    ...(process.platform === 'win32' ? { updatesDirectory: path.join(path.dirname(app.getPath('appData')), 'Local', 'open-git-control-updater') } : {}),
  });
  const broadcast = (value: StorageOverview) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(IpcChannel.StorageEvent, value);
  };
  const scheduler = new MaintenanceScheduler({
    enabled: () => readSettings().automaticMaintenanceEnabled !== false,
    busy: () => browserBusy() || isStorageBusy(path.join(root, 'repository-analytics')),
    run: () => service.run({ mode: 'eligible' }),
    publish: broadcast,
    error: (error) => console.warn('[storage-maintenance]', error),
  });
  const pressure = new BrowserCachePressureMonitor(
    root,
    () => scheduler.schedule(0),
    () => readSettings().automaticMaintenanceEnabled !== false,
  );
  const stopBefore = onRepoStoreWillChange((before, after) => {
    service.beforeRegistryChange(before, after);
    const prior = new Set(before.repos.map((repo) => repositoryPathKey(repo.path)));
    if (after.repos.length < before.repos.length || after.repos.some((repo) => !prior.has(repositoryPathKey(repo.path)))) scheduler.schedule();
  });
  const stopChanged = onRepoStoreChanged(() => {
    const data = readStoreData();
    for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send(IpcChannel.ReposChanged, data);
  });
  const response = async <T>(operation: () => Promise<T> | T) => {
    try {
      return { success: true as const, data: await operation() };
    } catch (error) {
      return { success: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  };
  ipcMain.handle(IpcChannel.StorageInspect, () =>
    response(async () => {
      const value = await service.inspect();
      broadcast(value);
      return value;
    }),
  );
  ipcMain.handle(IpcChannel.RepositoryUiGet, (_event, legacy: unknown) => response(() => readRepositoryUiPreferences(legacy)));
  ipcMain.handle(IpcChannel.RepositoryUiUpdate, (_event, request) => response(() => updateRepositoryUiPreferences(request)));
  ipcMain.handle(IpcChannel.StorageRun, (_event, request: unknown) =>
    response(async () => {
      const value = await service.run(validateMaintenanceRequest(request));
      broadcast(value);
      return value;
    }),
  );
  ipcMain.handle(IpcChannel.StorageRestore, (_event, repo: unknown) =>
    response(() => {
      if (typeof repo !== 'string' || !path.isAbsolute(repo)) throw new Error('Choose a removed repository.');
      return service.restore(repo);
    }),
  );
  const recovery = new CommitMessageEditService(deps.gitService.runner);
  ipcMain.handle(IpcChannel.StorageRecoveryList, () =>
    response(async () => {
      const result: CompletedRecoveryBackup[] = (await deps.branchRepairSnapshots?.list()) ?? [];
      const scanned = new Set<string>();
      for (const repo of [...readStoreData().repos.map((entry) => entry.path), ...service.recoveryDirectories()]) {
        if (busy(repo) || (await probeRepositoryHealth(repo)) !== 'available') continue;
        const common = probedCommonDirectory(repo);
        if (!common || scanned.has(repositoryPathKey(common))) continue;
        scanned.add(repositoryPathKey(common));
        result.push(...(await recovery.completedBackups(repo)));
      }
      return result;
    }),
  );
  ipcMain.handle(IpcChannel.StorageRecoveryRemove, (event, request: { repoPath: string; ids: string[] }) =>
    response(async () => {
      if (
        !request ||
        typeof request.repoPath !== 'string' ||
        !Array.isArray(request.ids) ||
        !request.ids.length ||
        request.ids.length > 100 ||
        request.ids.some((id) => typeof id !== 'string' || (!EDIT_ID.test(id) && !branchRepairId.test(id)))
      )
        throw new Error('Choose completed recovery operations.');
      const resolveOwner = () =>
        readStoreData().repos.find((entry) => repositoryPathKey(entry.path) === repositoryPathKey(request.repoPath))?.path ||
        service.recoveryDirectories().find((common) => repositoryPathKey(common) === repositoryPathKey(request.repoPath));
      const editIds = request.ids.filter((id) => EDIT_ID.test(id));
      const snapshotIds = request.ids.filter((id) => branchRepairId.test(id));
      const repo = editIds.length ? resolveOwner() : null;
      if (editIds.length && (!repo || busy(repo) || (await probeRepositoryHealth(repo)) !== 'available'))
        throw new Error('Repository is unavailable or in use.');
      const common = repo ? probedCommonDirectory(repo) : null;
      const release = repo ? beginCommitProtection(repo) : null;
      if (repo && !release) throw new Error('A protected operation is running.');
      try {
        const german = readSettings().language === 'de';
        const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender)!, {
          type: 'warning',
          title: german ? 'Wiederherstellungssicherungen entfernen' : 'Remove recovery backups',
          message: german
            ? `${request.ids.length} ausgewählte Wiederherstellungssicherungen entfernen?`
            : `Remove ${request.ids.length} selected recovery backups?`,
          detail: german
            ? 'Diese Rückkehrmöglichkeit entfällt. Git-Objekte werden nicht durch git gc gelöscht.'
            : 'This recovery option will be lost. Git objects are not removed with git gc.',
          buttons: german ? ['Abbrechen', 'Entfernen'] : ['Cancel', 'Remove'],
          defaultId: 0,
          cancelId: 0,
        });
        if (result.response !== 1) return 0;
        if (repo && (!resolveOwner() || (await probeRepositoryHealth(repo)) !== 'available' || probedCommonDirectory(repo) !== common))
          throw new Error('Repository ownership changed.');
        const removedEdits = repo ? await recovery.removeCompletedBackups(repo, editIds) : 0;
        const removedSnapshots = snapshotIds.length ? ((await deps.branchRepairSnapshots?.remove(request.repoPath, snapshotIds)) ?? 0) : 0;
        return removedEdits + removedSnapshots;
      } finally {
        release?.();
      }
    }),
  );
  return {
    service,
    dispose: () => {
      scheduler.dispose();
      pressure.dispose();
      stopBefore();
      stopChanged();
      service.dispose();
    },
  };
}
