import React from 'react';
import { PanelRightClose } from 'lucide-react';
import { CommitDetails } from '../../CommitDetails';
import { StagingArea } from '../../staging-area';
import { WorkingTreeFileDetails } from '../../WorkingTreeFileDetails';
import {
  useRepositoryContext,
  useSettingsContext,
} from '../../../contexts/AppStateContext';
import { useI18n } from '../../../i18n';
import type { DiffRequest } from '../../../types/diff';
import type { WorkingTreeState } from '../../../hooks/useWorkingTreeSnapshot';
import { INSPECTOR_PANE_MIN_WIDTH } from '../hooks/useMainViewPaneResizer';

type WorkingTreeSelection = {
  path: string;
  source: 'staged' | 'unstaged';
};

type MainInspectorPaneProps = {
  isContentResizing: boolean;
  onContentResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onHideInspectorPane: () => void;
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
  onHideInspectorPane,
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
  const { tr } = useI18n();

  return (
    <>
      <div
        className={`pane-resizer content-pane-resizer ${isContentResizing ? 'dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label={tr('Breite zwischen Verlauf und Inspector anpassen', 'Resize history and inspector')}
        onPointerDown={onContentResizeStart}
      />

      <div className="pane inspector-pane" style={{ minWidth: `${INSPECTOR_PANE_MIN_WIDTH}px` }}>
        <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {isCommitInspectorOpen && repository.selectedCommit
              ? tr('Commit Inspector', 'Commit Inspector')
              : workingTreeSelection
                ? tr('Datei-Inspector', 'File inspector')
                : tr('Working Directory', 'Working Directory')}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {((isCommitInspectorOpen && repository.selectedCommit) || workingTreeSelection) && (
              <>
                {isCommitInspectorOpen && repository.selectedCommit && commitHistoryStack.length > 0 && (
                  <button className="icon-btn" onClick={handleCommitBack} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                    {tr('Zurueck', 'Back')}
                  </button>
                )}
                <button className="icon-btn" onClick={closeInspector} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                  {tr('Schliessen', 'Close')}
                </button>
              </>
            )}
            <button
              className="icon-btn inspector-pane-close"
              onClick={onHideInspectorPane}
              title={tr('Inspector ausblenden', 'Hide inspector')}
              aria-label={tr('Inspector ausblenden', 'Hide inspector')}
            >
              <PanelRightClose size={16} />
            </button>
          </div>
        </div>
        <div className="pane-content" style={{ overflow: 'hidden' }}>
          {isCommitInspectorOpen && repository.selectedCommit ? (
            <CommitDetails
              hash={repository.selectedCommit}
              onSelectCommit={(hash) => handleSelectCommitFromHistory(hash, repository.selectedCommit)}
              onOpenDiff={handleOpenDiff}
            />
          ) : workingTreeSelection ? (
            <WorkingTreeFileDetails
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
