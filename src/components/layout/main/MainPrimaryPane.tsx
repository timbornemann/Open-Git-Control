import React from 'react';
import { DiffViewer } from '@/components/diff-viewer';
import { FileTimelineView } from '@/components/FileTimelineView';
import { CommitGraph } from '@/components/commit-graph';
import { RecoveryCenter } from '@/components/RecoveryCenter';
import { ReleaseCreator } from '@/components/release-creator/ReleaseCreator';
import { StagingArea } from '@/components/staging-area';
import { ProjectPlannerView } from '@/components/project-planner';
import { SettingsMainContent } from '@/components/layout/SettingsMainContent';
import { useGithubContext, useRepositoryContext, useSettingsContext, useUIContext, useWorkflowContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { DiffRequest } from '@/types/diff';
import type { FileTimelineCommitDto } from '@/global';
import type { WorkingTreeState } from '@/hooks/useWorkingTreeSnapshot';
import { PRIMARY_PANE_MIN_WIDTH } from '@/components/layout/hooks/useMainViewPaneResizer';
import { GithubAuthGuide } from './GithubAuthGuide';
import type { GithubAuthHelpMethod } from '@/components/layout/sidebar/AppSidebar.types';

type MainPrimaryPaneProps = {
  primaryPaneBasis: string;
  showInspectorPane: boolean;
  showTimeline: boolean;
  setShowTimeline: (value: boolean) => void;
  timelineCommits: FileTimelineCommitDto[];
  workingTree: WorkingTreeState;
  activeDiffRequest: DiffRequest | null;
  activeConflictPath: string | null;
  showRecoveryCenter: boolean;
  setActiveConflictPath: (path: string | null) => void;
  setShowRecoveryCenter: (value: boolean) => void;
  closeInspector: () => void;
  handleOpenDiff: (request: DiffRequest) => void;
  handleToggleRecoveryCenter: () => void;
  handleSelectCommitDirect: (hash: string | null) => void;
};

export const MainPrimaryPane: React.FC<MainPrimaryPaneProps> = ({
  primaryPaneBasis,
  showInspectorPane,
  showTimeline,
  setShowTimeline,
  timelineCommits,
  workingTree,
  activeDiffRequest,
  activeConflictPath,
  showRecoveryCenter,
  setActiveConflictPath,
  setShowRecoveryCenter,
  closeInspector,
  handleOpenDiff,
  handleToggleRecoveryCenter,
  handleSelectCommitDirect,
}) => {
  const ui = useUIContext();
  const settingsState = useSettingsContext();
  const repository = useRepositoryContext();
  const github = useGithubContext();
  const workflow = useWorkflowContext();
  const { t } = useI18n();

  const showGithubGuide = ui.activeTab === 'github' && !github.isAuthenticated && Boolean(github.selectedGithubAuthHelpMethod);
  const isSettingsView = ui.activeTab === 'settings';
  const isPlannerView = ui.activeTab === 'planner';
  const isReleaseView = ui.activeTab === 'repo' && github.showReleaseCreator;
  const isTimelineView = ui.activeTab === 'repo' && showTimeline;
  const primaryPaneTitle = isSettingsView
    ? t('generated.components.layout.main.mainprimarypane.settings_c6256784')
    : isReleaseView
      ? t('generated.components.layout.main.mainprimarypane.release_creator_e28377be')
      : isTimelineView
        ? t('generated.components.layout.main.mainprimarypane.codebase_timeline_cd023f25')
        : showGithubGuide
          ? t('generated.components.layout.main.mainprimarypane.github_login_guide_c2a55182')
          : showRecoveryCenter
            ? t('generated.components.layout.main.mainprimarypane.recovery_center_0adebec8')
            : activeConflictPath
              ? t('generated.components.layout.main.mainprimarypane.conflict_resolver_1f790ac5')
              : activeDiffRequest
                ? t('generated.components.layout.main.mainprimarypane.diff_viewer_979e21a6')
                : '';
  const shouldShowPrimaryPaneHeader =
    isSettingsView || isReleaseView || isTimelineView || showGithubGuide || showRecoveryCenter || Boolean(activeConflictPath) || Boolean(activeDiffRequest);

  return (
    <div
      className="pane"
      style={
        isSettingsView || isPlannerView || isReleaseView || !showInspectorPane
          ? { minWidth: 0 }
          : { flex: `0 0 ${primaryPaneBasis}`, minWidth: `${PRIMARY_PANE_MIN_WIDTH}px` }
      }
    >
      {shouldShowPrimaryPaneHeader && (
        <div className={`pane-header pane-header-main${activeConflictPath ? ' pane-header-main--conflict' : ''}`}>
          <span className="pane-header-main-title">{primaryPaneTitle}</span>
          {activeConflictPath ? (
            <div className="pane-header-main-center">
              <div className="conflict-global-actions-rail conflict-global-actions-rail--topbar">
                <div className="conflict-action-group">
                  <span className="conflict-action-group-label">{t('generated.components.layout.main.mainprimarypane.merge_83b759bf')}</span>
                  <button
                    className="staging-btn-sm conflict-action-btn"
                    onClick={workflow.onConflictMergeContinue}
                    disabled={workflow.isGitActionRunning}
                    title={t('generated.components.layout.main.mainprimarypane.complete_merge_a4b16236')}
                  >
                    {t('generated.components.layout.main.mainprimarypane.continue_6c41ab57')}
                  </button>
                  <button
                    className="staging-btn-sm danger conflict-action-btn conflict-action-btn--danger"
                    onClick={workflow.onConflictMergeAbort}
                    disabled={workflow.isGitActionRunning}
                    title={t('generated.components.layout.main.mainprimarypane.abort_merge_8f3c2f66')}
                  >
                    {t('generated.components.confirm.cancel_035b7526')}
                  </button>
                </div>
                <div className="conflict-action-group">
                  <span className="conflict-action-group-label">{t('generated.components.layout.main.mainprimarypane.rebase_26c8effa')}</span>
                  <button
                    className="staging-btn-sm conflict-action-btn"
                    onClick={workflow.onConflictRebaseContinue}
                    disabled={workflow.isGitActionRunning}
                    title={t('generated.components.layout.main.mainprimarypane.continue_rebase_828a1cd9')}
                  >
                    {t('generated.components.layout.main.mainprimarypane.continue_6c41ab57')}
                  </button>
                  <button
                    className="staging-btn-sm danger conflict-action-btn conflict-action-btn--danger"
                    onClick={workflow.onConflictRebaseAbort}
                    disabled={workflow.isGitActionRunning}
                    title={t('generated.components.layout.main.mainprimarypane.abort_rebase_c924fd71')}
                  >
                    {t('generated.components.confirm.cancel_035b7526')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {isSettingsView ? null : isReleaseView ? (
            <button className="icon-btn pane-header-nav-btn" onClick={github.onCloseReleaseCreator}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : isTimelineView ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setShowTimeline(false)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : showGithubGuide ? (
            <button className="icon-btn pane-header-nav-btn" onClick={ui.onClearGithubAuthHelpMethod}>
              {t('generated.components.layout.main.maininspectorpane.back_c5e2bc76')}
            </button>
          ) : showRecoveryCenter ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setShowRecoveryCenter(false)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : activeConflictPath ? (
            <button className="icon-btn pane-header-nav-btn" onClick={() => setActiveConflictPath(null)}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : activeDiffRequest ? (
            <button className="icon-btn pane-header-nav-btn" onClick={closeInspector}>
              {t('generated.components.layout.main.mainprimarypane.back_to_graph_07687079')}
            </button>
          ) : null}
        </div>
      )}

      <div className="pane-content" style={{ padding: 0 }}>
        {isPlannerView ? (
          <ProjectPlannerView />
        ) : isSettingsView ? (
          <SettingsMainContent
            settings={settingsState.settings}
            onUpdateSettings={settingsState.onUpdateSettings}
            jobs={workflow.jobs}
            onClearJobs={workflow.onClearJobs}
            activeTab={settingsState.settingsTab}
            onResetLayout={ui.onResetLayout}
          />
        ) : isReleaseView ? (
          <ReleaseCreator
            ownerRepo={github.prOwnerRepo}
            releaseForm={github.releaseForm}
            setReleaseForm={github.setReleaseForm}
            releaseSubmitting={github.releaseSubmitting}
            releaseError={github.releaseError}
            releaseSuccess={github.releaseSuccess}
            onCreateRelease={github.onCreateRelease}
            contextLoading={github.releaseContextLoading}
            contextError={github.releaseContextError}
            context={github.releaseContext}
            onRefreshContext={github.onRefreshReleaseContext}
            onGenerateNotes={github.onGenerateReleaseNotes}
            notesGenerating={github.releaseNotesGenerating}
            notesLanguage={github.releaseNotesLanguage}
            setNotesLanguage={github.setReleaseNotesLanguage}
            notesOptions={github.releaseNotesOptions}
            setNotesOptions={github.setReleaseNotesOptions}
          />
        ) : isTimelineView ? (
          <FileTimelineView onClose={() => setShowTimeline(false)} commits={timelineCommits} />
        ) : activeConflictPath ? (
          <StagingArea
            repoPath={repository.activeRepo}
            onRepoChanged={repository.triggerRefresh}
            onCommitsCreated={repository.triggerCommitRefresh}
            onOpenDiff={handleOpenDiff}
            onCloseConflictResolver={() => setActiveConflictPath(null)}
            viewMode="conflictOnly"
            initialConflictPath={activeConflictPath}
            settings={settingsState.settings}
            workingTreeSnapshot={workingTree.snapshot}
            workingTreeStatus={workingTree.status}
            workingTreeStats={workingTree.stats}
            onRefreshWorkingTree={workingTree.refresh}
          />
        ) : activeDiffRequest || (!showGithubGuide && !showRecoveryCenter) ? (
          <>
            <div
              aria-hidden={activeDiffRequest ? true : undefined}
              style={{
                display: activeDiffRequest ? 'none' : 'block',
                height: '100%',
                overflow: 'auto',
                overflowAnchor: 'none',
              }}
            >
              <CommitGraph
                repoPath={repository.activeRepo}
                selectedHash={repository.selectedCommit}
                navigationRequest={repository.commitNavigationRequest}
                onSelectCommit={handleSelectCommitDirect}
                refreshTrigger={repository.refreshTrigger}
                commitRefreshTrigger={repository.commitRefreshTrigger}
                showSecondaryHistory={repository.showSecondaryHistory}
                onOpenDiff={handleOpenDiff}
                showRecoveryCenter={showRecoveryCenter}
                onToggleRecoveryCenter={handleToggleRecoveryCenter}
                currentBranch={repository.currentBranch}
                branches={repository.branches}
                onMergeBranch={repository.onMergeBranch}
                onRunGitCommand={workflow.runGitCommand}
                onOpenConflictResolverForPath={workflow.onOpenConflictResolverForPath}
                workingTreeStatus={workingTree.status}
                onRefreshWorkingTree={workingTree.refresh}
              />
            </div>
            {activeDiffRequest && (
              <DiffViewer
                repoPath={repository.activeRepo}
                request={activeDiffRequest}
                onClose={closeInspector}
                onRepoChanged={repository.triggerRefresh}
                onNavigateToCommit={(hash) => {
                  repository.onNavigateToCommit(hash);
                  closeInspector();
                }}
              />
            )}
          </>
        ) : showGithubGuide ? (
          <GithubAuthGuide method={github.selectedGithubAuthHelpMethod as Exclude<GithubAuthHelpMethod, null>} onClose={ui.onClearGithubAuthHelpMethod} />
        ) : showRecoveryCenter ? (
          <RecoveryCenter refreshTrigger={repository.refreshTrigger} onRepoChanged={repository.triggerRefresh} settings={settingsState.settings} />
        ) : null}
      </div>
    </div>
  );
};
