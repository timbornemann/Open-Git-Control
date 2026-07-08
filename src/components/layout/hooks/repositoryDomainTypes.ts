import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ConfirmDialogState, InputDialogState } from '@/components/layout/layoutTypes';
import type { AppLanguage, CatalogTranslateFn } from '@/i18n';

export type GitActionToast = { msg: string; isError: boolean };

export type RepositoryRemote = {
  name: string;
  url: string;
};

export type RepositoryTranslator = {
  t: CatalogTranslateFn;
  tr: (deText: string, enText: string) => string;
};

export type RepositoryDomainParams = {
  activeRepo: string | null;
  refreshTrigger: number;
  triggerRefresh: () => void;
  setGitActionToast: (toast: GitActionToast) => void;
  setActiveGitActionLabel: Dispatch<SetStateAction<string | null>>;
  isGitActionRunningRef: MutableRefObject<boolean>;
  runGitCommand: (args: string[], successMsg: string, actionLabel?: string) => Promise<boolean>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  setInputDialog: Dispatch<SetStateAction<InputDialogState | null>>;
  autoFetchIntervalMs: number;
  language: AppLanguage;
  onNavigateToCommit: (hash: string) => void;
};
