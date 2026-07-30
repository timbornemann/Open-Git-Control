import type { AppSettingsDto } from '@/types/appDtos';
import type { GitReflogEntryDto } from '@/types/git';
import { formatDateTime } from '@/utils/dateTime';

export type RecoveryCenterProps = {
  repoPath: string | null;
  refreshTrigger: number;
  onRepoChanged: () => void;
  settings: AppSettingsDto;
};

export type RecoveryActionId = 'branch' | 'checkout' | 'reset';

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

export const selectLoadedRecoveryKey = (current: string | null, entries: GitReflogEntryDto[]): string | null => {
  if (current && entries.some((entry) => getRecoveryEntryKey(entry) === current)) return current;
  return entries[0] ? getRecoveryEntryKey(entries[0]) : null;
};

export const filterRecoveryEntries = (entries: GitReflogEntryDto[], filter: string): GitReflogEntryDto[] => {
  const query = filter.trim().toLowerCase();
  if (!query) return entries;
  return entries.filter((entry) => [entry.selector, entry.subject, entry.hash, entry.abbrevHash, entry.date].join(' ').toLowerCase().includes(query));
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
