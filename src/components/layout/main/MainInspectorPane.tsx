import React from 'react';
import { CommitDetails } from '@/components/commit-details/CommitDetails';
import { StagingArea } from '@/components/staging-area';
import { WorkingTreeFileDetails } from '@/components/WorkingTreeFileDetails';
import { useRepositoryContext, useSettingsContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { DiffRequest } from '@/types/diff';
import type { WorkingTreeState } from '@/hooks/useWorkingTreeSnapshot';
import { INSPECTOR_PANE_MIN_WIDTH } from '@/components/layout/hooks/useMainViewPaneResizer';

type WorkingTreeSelection = {
  path: string;
  source: 'staged' | 'unstaged';
};

type MainInspectorPaneProps = {
  isContentResizing: boolean;
  onContentResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  workingTree: WorkingTreeState;
  commitHistoryStack: string[];
  workingTreeSelection: WorkingTreeSelection | null;
  isCommitInspectorOpen: boolean;
  handleOpenDiff: (request: DiffRequest) => void;
  handleOpenConflictResolver: (filePath: string) => void;
  handleSelectCommitFromHistory: (hash: string, selectedCommit: string | null) => void;
  handleSelectWorkingTreeFile: (path: string, source: 'staged' | 'unstaged') => void;
  handleSelectCommitFromWorkingTree: (hash: string) => void;
  handleCommitBack: () => void;
  closeInspector: () => void;
};

export const MainInspectorPane: React.FC<MainInspectorPaneProps> = ({
  isContentResizing,
  onContentResizeStart,
  workingTree,
  commitHistoryStack,
  workingTreeSelection,
  isCommitInspectorOpen,
  handleOpenDiff,
  handleOpenConflictResolver,
  handleSelectCommitFromHistory,
  handleSelectWorkingTreeFile,
  handleSelectCommitFromWorkingTree,
  handleCommitBack,
  closeInspector,
}) => {
  const repository = useRepositoryContext();
  const settingsState = useSettingsContext();
  const { t } = useI18n();

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
        <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {isCommitInspectorOpen && repository.selectedCommit
              ? t('generated.components.layout.main.maininspectorpane.commit_inspector_3b636d23')
              : workingTreeSelection
                ? t('generated.components.layout.main.maininspectorpane.file_inspector_57b931aa')
                : t('generated.components.layout.main.maininspectorpane.working_directory_d9a68dee')}
          </span>
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
        </div>
        <div className="pane-content" style={{ overflow: 'hidden' }}>
          {isCommitInspectorOpen && repository.selectedCommit ? (
            <CommitDetails
              repoPath={workingTree.dataRepoPath}
              hash={repository.selectedCommit}
              onSelectCommit={(hash) => handleSelectCommitFromHistory(hash, repository.selectedCommit)}
              onOpenDiff={handleOpenDiff}
            />
          ) : workingTreeSelection ? (
            <WorkingTreeFileDetails
              repoPath={workingTree.dataRepoPath!}
              path={workingTreeSelection.path}
              source={workingTreeSelection.source}
              onSelectCommit={handleSelectCommitFromWorkingTree}
              onOpenDiff={handleOpenDiff}
            />
          ) : (
            <StagingArea
              repoPath={repository.activeRepo}
              onRepoChanged={repository.triggerRefresh}
              onCommitsCreated={repository.triggerCommitRefresh}
              onOpenDiff={handleOpenDiff}
              onSelectFileInspect={handleSelectWorkingTreeFile}
              onOpenConflictResolver={handleOpenConflictResolver}
              settings={settingsState.settings}
              workingTreeRepoPath={workingTree.dataRepoPath}
              workingTreeSnapshot={workingTree.snapshot}
              workingTreeStatus={workingTree.status}
              workingTreeStats={workingTree.stats}
              onRefreshWorkingTree={workingTree.refresh}
            />
          )}
        </div>
      </div>
    </>
  );
};
