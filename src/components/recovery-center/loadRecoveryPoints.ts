import { gitClient } from '@/services/gitClient';
import { parseGitReflog } from '@/utils/gitParsing';
import type { TranslateFn } from '@/i18n';
import type { IpcResult } from '@/types/ipc';
import { messageBackupEntries, sortRecoveryEntries, type RecoveryIssue } from './recoveryCenterUtils';

function failureDetail(result: PromiseSettledResult<IpcResult<unknown>>): string {
  if (result.status === 'rejected') return result.reason instanceof Error ? result.reason.message : String(result.reason);
  return result.value.success ? '' : result.value.error;
}

export async function loadRecoveryPoints(repoPath: string, tr: TranslateFn) {
  const [history, backups] = await Promise.allSettled([
    gitClient.runGitCommandForRepo(repoPath, 'reflog', '300'),
    gitClient.getCommitMessageEditBackups(repoPath),
  ]);
  const historyResult = history.status === 'fulfilled' ? history.value : null;
  const backupResult = backups.status === 'fulfilled' ? backups.value : null;
  const historyAvailable = Boolean(historyResult?.success);
  const backupsAvailable = Boolean(backupResult?.success);
  let issue: RecoveryIssue | null = null;
  if (!historyAvailable || !backupsAvailable) {
    let message = tr('Wiederherstellungspunkte konnten nicht geladen werden.', 'Recovery points could not be loaded.');
    if (historyAvailable)
      message = tr(
        'Gespeicherte Sicherungen konnten nicht geladen werden. Der Git-Verlauf bleibt verfügbar.',
        'Saved backups could not be loaded. Git history is still available.',
      );
    else if (backupsAvailable)
      message = tr(
        'Der Git-Verlauf konnte nicht aktualisiert werden. Verfügbare Wiederherstellungspunkte bleiben sichtbar.',
        'Git history could not be refreshed. Available recovery points remain visible.',
      );
    issue = { message, details: [failureDetail(history), failureDetail(backups)].filter(Boolean).join('\n') };
  }
  const entries = sortRecoveryEntries([
    ...messageBackupEntries(backupResult?.success ? backupResult.data : [], tr('Nachrichten-Sicherung', 'Message backup')),
    ...parseGitReflog(historyResult?.success ? String(historyResult.data || '') : ''),
  ]);
  return { entries, issue, historyAvailable, backupsAvailable };
}
