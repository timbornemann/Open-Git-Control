import React from 'react';
import { CommitDetails } from '@/components/commit-details/CommitDetails';
import { StagingArea } from '@/components/staging-area';
import { WorkingTreeFileDetails } from '@/components/WorkingTreeFileDetails';
import { useRepositoryContext, useSettingsContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { DiffRequest } from '@/types/diff';
import type { WorkingTreeState } from '@/hooks/useWorkingTreeSnapshot';
import { INSPECTOR_PANE_MIN_WIDTH } from '@/components/layout/hooks/useMainViewPaneResizer';
import { WorkingDirectoryTree } from '@/components/working-directory/WorkingDirectoryTree';
import type { CommitHistoryEntry } from '../hooks/useMainViewInspector';
import './workingTreeInspector.css';

type WorkingTreeSelection = {
  path: string;
  source: 'staged' | 'unstaged';
};

function getSelectedEntry(workingTree: WorkingTreeState, selection: WorkingTreeSelection | null) {
  if (!selection) return undefined;
  const entries =
    selection.source === 'staged' ? workingTree.status?.staged : [...(workingTree.status?.unstaged ?? []), ...(workingTree.status?.untracked ?? [])];
  return entries?.find((entry) => entry.path === selection.path);
}

type MainInspectorPaneProps = {
  isContentResizing: boolean;
  onContentResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  workingTree: WorkingTreeState;
  commitHistoryStack: CommitHistoryEntry[];
  activeDiffRequest: DiffRequest | null;
  workingTreeSelection: WorkingTreeSelection | null;
  isCommitInspectorOpen: boolean;
  handleOpenDiff: (request: DiffRequest) => void;
  handleOpenConflictResolver: (filePath: string) => void;
  handleSelectCommitFromHistory: (hash: string, selectedCommit: string | null) => void;
  handleSelectWorkingTreeFile: (path: string, source: 'staged' | 'unstaged') => void;
  handleSelectCommitFromWorkingTree: (hash: string, path?: string) => void;
  handleCommitBack: () => void;
  closeInspector: () => void;
  closeWorkingTreeFileDetails: () => void;
  onOpenWorkingDirectoryFile: (path: string) => void;
  workingDirectoryFilePath: string | null;
  onWorkingDirectoryEntryInvalidated: (path: string) => void;
  directoryMode: 'staging' | 'tree';
  onDirectoryModeChange: (mode: 'staging' | 'tree') => void;
  expandedDirectoryPaths: Set<string>;
  onExpandedDirectoryPathsChange: React.Dispatch<React.SetStateAction<Set<string>>>;
};

export const MainInspectorPane: React.FC<MainInspectorPaneProps> = ({
  isContentResizing,
  onContentResizeStart,
  workingTree,
  commitHistoryStack,
  activeDiffRequest,
  workingTreeSelection,
  isCommitInspectorOpen,
  handleOpenDiff,
  handleOpenConflictResolver,
  handleSelectCommitFromHistory,
  handleSelectWorkingTreeFile,
  handleSelectCommitFromWorkingTree,
  handleCommitBack,
  closeInspector,
  closeWorkingTreeFileDetails,
  onOpenWorkingDirectoryFile,
  workingDirectoryFilePath,
  onWorkingDirectoryEntryInvalidated,
  directoryMode,
  onDirectoryModeChange,
  expandedDirectoryPaths,
  onExpandedDirectoryPathsChange,
}) => {
  const repository = useRepositoryContext();
  const settingsState = useSettingsContext();
  const { t } = useI18n();
  const isDirectoryMode = !isCommitInspectorOpen && !workingTreeSelection;
  const selectedEntry = getSelectedEntry(workingTree, workingTreeSelection);

  return (
    <>
      <div
        className={`pane-resizer content-pane-resizer ${isContentResizing ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={t('generated.components.layout.main.maininspectorpane.resize_history_and_inspector_58741690')}
        onPointerDown={onContentResizeStart}
      />

      <div className="pane inspector-pane" style={{ minWidth: `${INSPECTOR_PANE_MIN_WIDTH}px` }}>
        <div
          className={`pane-header${isDirectoryMode ? ' pane-header--directory-switch' : ''}`}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          {isDirectoryMode ? (
            <div className="directory-mode-switch" role="group" aria-label="Inspector view">
              <button
                className={`directory-mode-switch__option${directoryMode === 'staging' ? ' is-active' : ''}`}
                onClick={() => onDirectoryModeChange('staging')}
                aria-pressed={directoryMode === 'staging'}
              >
                Staging Area
              </button>
              <button
                className={`directory-mode-switch__option${directoryMode === 'tree' ? ' is-active' : ''}`}
                onClick={() => onDirectoryModeChange('tree')}
                aria-pressed={directoryMode === 'tree'}
              >
                Working Directory
              </button>
            </div>
          ) : (
            <span>
              {isCommitInspectorOpen && repository.selectedCommit
                ? t('generated.components.layout.main.maininspectorpane.commit_inspector_3b636d23')
                : t('generated.components.layout.main.maininspectorpane.file_inspector_57b931aa')}
            </span>
          )}
          {!isDirectoryMode && (
            <div style={{ display: 'flex', gap: '6px' }}>
              {((isCommitInspectorOpen && repository.selectedCommit) || workingTreeSelection) && (
                <>
                  {isCommitInspectorOpen && repository.selectedCommit && commitHistoryStack.length > 0 && (
                    <button className="icon-btn" onClick={handleCommitBack} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                      {t('generated.components.layout.main.maininspectorpane.back_c5e2bc76')}
                    </button>
                  )}
                  <button className="icon-btn" onClick={closeInspector} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                    {t('generated.components.actiontoastviewport.close_181764fa')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="pane-content" style={{ overflow: 'hidden' }}>
          {isCommitInspectorOpen && repository.selectedCommit ? (
            <CommitDetails
              repoPath={workingTree.dataRepoPath}
              hash={repository.selectedCommit}
              activeDiffRequest={activeDiffRequest}
              refreshTrigger={repository.refreshTrigger}
              onSelectCommit={(hash) => handleSelectCommitFromHistory(hash, repository.selectedCommit)}
              onOpenDiff={handleOpenDiff}
            />
          ) : (
            <div className={`working-tree-inspector${workingTreeSelection ? ' has-selection' : ''}`}>
              {workingTreeSelection && repository.activeRepo && (
                <WorkingTreeFileDetails
                  repoPath={repository.activeRepo}
                  path={workingTreeSelection.path}
                  source={workingTreeSelection.source}
                  status={selectedEntry ? (workingTreeSelection.source === 'staged' ? selectedEntry.x : selectedEntry.y) : undefined}
                  oldPath={selectedEntry?.originalPath}
                  refreshTrigger={repository.refreshTrigger}
                  onSelectCommit={handleSelectCommitFromWorkingTree}
                  onClose={closeWorkingTreeFileDetails}
                />
              )}
              <div className="working-tree-inspector__directory">
                <div style={{ display: directoryMode === 'tree' && !workingTreeSelection ? 'block' : 'none', height: '100%' }}>
                  <WorkingDirectoryTree
                    repoPath={repository.activeRepo}
                    refreshTrigger={repository.refreshTrigger}
                    expandedPaths={expandedDirectoryPaths}
                    onExpandedPathsChange={onExpandedDirectoryPathsChange}
                    onOpenFile={onOpenWorkingDirectoryFile}
                    activeFilePath={workingDirectoryFilePath}
                    onEntryInvalidated={onWorkingDirectoryEntryInvalidated}
                    onRepoChanged={repository.triggerRefresh}
                  />
                </div>
                <div
                  className="working-tree-inspector__staging"
                  style={{ display: directoryMode === 'staging' || workingTreeSelection ? 'block' : 'none', height: '100%' }}
                  role="region"
                  aria-label="Staging Area"
                >
                  <StagingArea
                    repoPath={repository.activeRepo}
                    onRepoChanged={repository.triggerRefresh}
                    onCommitsCreated={repository.triggerCommitRefresh}
                    onOpenDiff={handleOpenDiff}
                    onSelectFileInspect={handleSelectWorkingTreeFile}
                    selectedFile={workingTreeSelection}
                    onOpenConflictResolver={handleOpenConflictResolver}
                    settings={settingsState.settings}
                    workingTreeRepoPath={workingTree.dataRepoPath}
                    workingTreeSnapshot={workingTree.snapshot}
                    workingTreeStatus={workingTree.status}
                    workingTreeStats={workingTree.stats}
                    onRefreshWorkingTree={workingTree.refresh}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
