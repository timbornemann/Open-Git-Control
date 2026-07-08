import type { AppSettingsDto, WorkingTreeSnapshotDto, WorkingTreeStatsDto } from '../../global';
import type { FileEntry, GitStatusDetailed } from '../../utils/gitParsing';
import type { DiffRequest } from '../../types/diff';
import type {
  ConfirmDialogState,
  InputDialogState,
} from '../layout/layoutTypes';

export type { ConfirmDialogState, InputDialogState };

export interface StagingAreaProps {
  repoPath: string | null;
  onRepoChanged?: () => void;
  onCommitsCreated?: () => void;
  onOpenDiff?: (request: DiffRequest) => void;
  onSelectFileInspect?: (filePath: string, source: 'staged' | 'unstaged') => void;
  onOpenConflictResolver?: (filePath: string) => void;
  onCloseConflictResolver?: () => void;
  viewMode?: 'default' | 'conflictOnly';
  initialConflictPath?: string | null;
  settings: AppSettingsDto;
  workingTreeSnapshot?: WorkingTreeSnapshotDto | null;
  workingTreeStatus?: GitStatusDetailed | null;
  workingTreeStats?: WorkingTreeStatsDto | null;
  onRefreshWorkingTree?: () => Promise<void>;
}

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
