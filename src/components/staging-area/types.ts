import type { AppSettingsDto } from '../../global';
import type { FileEntry, GitStatusDetailed } from '../../utils/gitParsing';
import type { DialogContextItem } from '../Confirm';
import type { InputDialogField } from '../Input';
import type { DiffRequest } from '../../types/diff';

export interface StagingAreaProps {
  repoPath: string | null;
  onRepoChanged?: () => void;
  onOpenDiff?: (request: DiffRequest) => void;
  onSelectFileInspect?: (filePath: string, source: 'staged' | 'unstaged') => void;
  onOpenConflictResolver?: (filePath: string) => void;
  viewMode?: 'default' | 'conflictOnly';
  initialConflictPath?: string | null;
  settings: AppSettingsDto;
}

export type ConfirmDialogState = {
  variant: 'confirm' | 'danger';
  title: string;
  message: string;
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

export type InputDialogState = {
  title: string;
  message: string;
  fields: InputDialogField[];
  contextItems: DialogContextItem[];
  irreversible: boolean;
  consequences: string;
  confirmLabel?: string;
  onSubmit: (values: Record<string, string>) => Promise<void> | void;
};

export type ConflictEntry = FileEntry & { code: string };
export type GitStatusWithConflicts = GitStatusDetailed & { conflicts: ConflictEntry[] };
export type DiffStats = { files: number; additions: number; deletions: number };
export type FileSection = 'staged' | 'unstaged' | 'untracked';
export type ConflictResolutionChoice = 'ours' | 'theirs' | 'both';

export type ConflictEditorState = {
  filePath: string;
  originalContent: string;
  content: string;
  isSaving: boolean;
};

export type ConflictBlock = {
  start: number;
  end: number;
  marker: string;
  oursLabel: string;
  theirsLabel: string;
  ours: string;
  theirs: string;
  startLine: number;
  endLine: number;
};

export type StagingContextMenuState = {
  x: number;
  y: number;
  entry: FileEntry;
  section: FileSection;
};
