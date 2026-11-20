import * as path from 'node:path';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { BranchBackupService } from '../../../git/BranchBackupService';
import { branchGitFailure } from '../../../git/RepositoryHeadService';
import { IpcChannel } from '../../../../src/types/ipcContract';
import type { BranchBackupRemoval, BranchBackupSelection } from '../../../../src/shared/ipc/branchRecovery';
import { readSettings } from '../../settingsStore';

export function registerBranchBackupHandlers(backups: BranchBackupService) {
  const respond = async <T>(operation: () => Promise<T>) => {
    try {
      return { success: true as const, data: await operation() };
    } catch (error) {
      return branchGitFailure(error);
    }
  };

  ipcMain.handle(IpcChannel.StorageBranchBackups, () => respond(() => backups.overview()));
  ipcMain.handle(IpcChannel.StorageBranchBackupDirectory, (event) =>
    respond(async () => {
      const german = readSettings().language === 'de';
      const options = {
        title: german ? 'Verzeichnis für Git-Sicherungen auswählen' : 'Choose Git backup directory',
        properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options));
      return result.canceled || !result.filePaths[0] ? backups.overview() : backups.chooseDirectory(result.filePaths[0]);
    }),
  );
  ipcMain.handle(IpcChannel.StorageBranchBackupDefaultDirectory, () => respond(() => backups.resetDirectory()));
  ipcMain.handle(IpcChannel.StorageBranchBackupEnabled, (_event, enabled: unknown) =>
    respond(async () => {
      if (typeof enabled !== 'boolean') throw new Error('Invalid backup setting.');
      return backups.enable(enabled);
    }),
  );
  ipcMain.handle(IpcChannel.StorageBranchBackupSelection, (_event, selection: Partial<BranchBackupSelection> | undefined) =>
    respond(async () => {
      if (typeof selection?.automatic !== 'boolean' || (selection.repoPath !== undefined && !absolutePath(selection.repoPath))) {
        throw new Error('Choose local repositories for automatic backup.');
      }
      return backups.setSelection({ automatic: selection.automatic, repoPath: selection.repoPath });
    }),
  );
  ipcMain.handle(IpcChannel.StorageBranchBackupNow, (_event, repoPath: unknown) =>
    respond(async () => {
      if (!absolutePath(repoPath)) throw new Error('Choose a registered local repository.');
      return backups.backupNow(repoPath);
    }),
  );
  ipcMain.handle(IpcChannel.StorageBranchBackupRemove, (event, selection: Partial<BranchBackupRemoval> | undefined) =>
    respond(async () => {
      if (typeof selection?.repositoryKey !== 'string' || (selection.versionId !== undefined && typeof selection.versionId !== 'string')) {
        throw new Error('Choose a managed backup version.');
      }
      const preview = await backups.previewRemoval({ repositoryKey: selection.repositoryKey, versionId: selection.versionId });
      const german = readSettings().language === 'de';
      const count = preview.remove.length;
      const bytes = preview.remove.reduce((sum, backup) => sum + backup.bytes, 0);
      const locale = german ? 'de-DE' : 'en-US';
      const size = formatBackupSize(bytes, locale);
      const date = preview.remove.length === 1 ? new Date(preview.remove[0].verifiedAt).toLocaleString(locale) : '';
      const options = {
        type: 'warning' as const,
        message: german
          ? count === 1
            ? 'Sicherung endgültig löschen?'
            : `${count} Sicherungen endgültig löschen?`
          : count === 1
            ? 'Permanently delete backup?'
            : `Permanently delete ${count} backups?`,
        detail: [
          preview.repositoryPath ?? selection.repositoryKey,
          date,
          size,
          preview.lastVersion ? (german ? 'Dies ist die letzte Version an diesem Speicherort.' : 'This is the last version at this destination.') : '',
        ]
          .filter(Boolean)
          .join('\n'),
        buttons: german ? ['Abbrechen', 'Löschen'] : ['Cancel', 'Delete'],
        defaultId: 0,
        cancelId: 0,
      };
      const window = BrowserWindow.fromWebContents(event.sender);
      const choice = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
      return choice.response === 1 && !event.sender.isDestroyed() ? backups.remove(preview) : 0;
    }),
  );
}

const absolutePath = (value: unknown): value is string => typeof value === 'string' && !value.includes('\0') && path.isAbsolute(value);

function formatBackupSize(bytes: number, locale: string): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${format.format(bytes)} B`;
  if (bytes < 1024 ** 2) return `${format.format(bytes / 1024)} KiB`;
  return `${format.format(bytes / 1024 ** 2)} MiB`;
}
