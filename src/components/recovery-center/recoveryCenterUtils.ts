import type { AppSettingsDto } from '@/types/appDtos';
import type { GitReflogEntryDto } from '@/types/git';
import { formatDateTime } from '@/utils/dateTime';
import type { CommitMessageEditBackup } from '@/shared/ipc/commitMessageEdit';
import type { TranslateFn } from '@/i18n';

export const messageBackupEntries = (backups: CommitMessageEditBackup[], label: string): GitReflogEntryDto[] =>
  backups.map((backup) => ({
    hash: backup.hash,
    abbrevHash: backup.hash.slice(0, 7),
    selector: backup.ref,
    subject: `${label}: ${backup.branch.replace(/^refs\/heads\//, '')}`,
    date: new Date(backup.createdAt).toISOString(),
  }));

export type RecoveryCenterProps = {
  repoPath: string | null;
  refreshTrigger: number;
  onRepoChanged: () => void;
  settings: AppSettingsDto;
};

export type RecoveryActionId = 'branch' | 'checkout' | 'reset';
export type RecoveryEntryKind = 'backup' | 'commit' | 'checkout' | 'reset' | 'merge' | 'rebase' | 'other';
export type RecoveryEntryFilter = 'all' | 'backup' | 'history';
export type RecoveryIssue = { message: string; details: string };

export type RecoveryDangerAction = {
  title: string;
  message: string;
  confirmLabel: string;
  consequences: string;
  irreversible: boolean;
  contextItems: Array<{ label: string; value: string }>;
  run: () => Promise<void>;
} | null;

export const getRecoveryEntryKey = (entry: GitReflogEntryDto): string => `${entry.selector}\u0000${entry.hash}`;

export const selectLoadedRecoveryKey = (current: string | null, entries: GitReflogEntryDto[], previousEntries: GitReflogEntryDto[] = []): string | null => {
  const previous = previousEntries.find((entry) => getRecoveryEntryKey(entry) === current);
  const moved = previous && entries.find((entry) => entry.hash === previous.hash && entry.date === previous.date && entry.subject === previous.subject);
  if (moved) return getRecoveryEntryKey(moved);
  if (!previous && current && entries.some((entry) => getRecoveryEntryKey(entry) === current)) return current;
  return entries[0] ? getRecoveryEntryKey(entries[0]) : null;
};

export const filterRecoveryEntries = (entries: GitReflogEntryDto[], filter: string, source: RecoveryEntryFilter = 'all'): GitReflogEntryDto[] => {
  const query = filter.trim().toLowerCase();
  return entries.filter((entry) => {
    const backup = getRecoveryEntryKind(entry) === 'backup';
    if ((source === 'backup' && !backup) || (source === 'history' && backup)) return false;
    return !query || [entry.selector, entry.subject, entry.hash, entry.abbrevHash, entry.date].join(' ').toLowerCase().includes(query);
  });
};

export const sortRecoveryEntries = (entries: GitReflogEntryDto[]): GitReflogEntryDto[] =>
  [...entries].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

export const getRecoveryEntryKind = (entry: GitReflogEntryDto): RecoveryEntryKind => {
  if (entry.selector.startsWith('refs/ogc/commit-reword/')) return 'backup';
  const action = getRecoverySubjectParts(entry.subject).action.toLowerCase();
  if (action.startsWith('commit')) return 'commit';
  if (action.startsWith('checkout')) return 'checkout';
  if (action.startsWith('reset')) return 'reset';
  if (action.startsWith('merge') || action.startsWith('pull')) return 'merge';
  if (action.startsWith('rebase')) return 'rebase';
  return 'other';
};

export const getRecoveryActionLabel = (entry: GitReflogEntryDto, tr: TranslateFn): string => {
  switch (getRecoveryEntryKind(entry)) {
    case 'backup':
      return tr('Nachrichten-Sicherung', 'Message backup');
    case 'commit':
      return tr('Commit gespeichert', 'Commit saved');
    case 'checkout':
      return tr('Branch oder Commit gewechselt', 'Branch or commit switched');
    case 'reset':
      return tr('Branch zurückgesetzt', 'Branch reset');
    case 'merge':
      return tr('Änderungen zusammengeführt', 'Changes merged');
    case 'rebase':
      return tr('Historie neu angeordnet', 'History reorganized');
    default:
      return tr('Gespeicherter Git-Zustand', 'Recorded Git state');
  }
};

export const getRecoveryDescription = (entry: GitReflogEntryDto, tr: TranslateFn): string => {
  const description = getRecoverySubjectParts(entry.subject).description;
  const kind = getRecoveryEntryKind(entry);
  if (kind === 'backup') return tr(`Originaler Commit auf ${description}`, `Original commit on ${description}`);
  const checkout = kind === 'checkout' && /^moving from (.+) to (.+)$/.exec(description);
  if (checkout) return tr(`Von ${checkout[1]} zu ${checkout[2]}`, `From ${checkout[1]} to ${checkout[2]}`);
  const reset = kind === 'reset' && /^moving to (.+)$/.exec(description);
  if (reset) return tr(`Zurückgesetzt auf ${reset[1]}`, `Reset to ${reset[1]}`);
  return description;
};

export const getRecoveryLoadViewState = (isLoading: boolean, entryCount: number, hasLoadError: boolean, filteredCount: number) => {
  const isInitialLoading = isLoading && entryCount === 0;
  const showLoadError = !isLoading && hasLoadError && entryCount === 0;
  return {
    isInitialLoading,
    showLoadError,
    noResults: !isInitialLoading && !showLoadError && filteredCount === 0,
  };
};

export const getRecoverySubjectParts = (subject: string): { action: string; description: string } => {
  const normalized = subject.trim();
  if (!normalized) return { action: 'reflog', description: '-' };

  const separatorIndex = normalized.indexOf(':');
  if (separatorIndex <= 0) return { action: 'reflog', description: normalized };

  return {
    action: normalized.slice(0, separatorIndex).trim(),
    description: normalized.slice(separatorIndex + 1).trim() || normalized,
  };
};

export const formatRecoveryDate = (value: string, locale: string): string => {
  const formatted = formatDateTime(value, locale, { dateStyle: 'medium', timeStyle: 'short' });
  return formatted === '-' ? value || '-' : formatted;
};
