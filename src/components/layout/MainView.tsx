import React from 'react';
import { GitBranch, RefreshCw, ExternalLink, Check, Copy } from 'lucide-react';
import { TopbarActions } from '../topbar/TopbarActions';
import { CommitGraph } from '../CommitGraph';
import { CommitDetails } from '../CommitDetails';
import { StagingArea } from '../StagingArea';
import { ReleaseCreator } from '../ReleaseCreator';
import { WorkingTreeFileDetails } from '../WorkingTreeFileDetails';
import { DiffViewer } from '../DiffViewer';
import { RecoveryCenter } from '../RecoveryCenter';
import { SettingsMainContent } from './SettingsMainContent';
import { useI18n } from '../../i18n';
import { GithubAuthHelpMethod } from './sidebar/AppSidebar.types';
import { useMainViewPaneResizer, INSPECTOR_PANE_MIN_WIDTH, PRIMARY_PANE_MIN_WIDTH } from './hooks/useMainViewPaneResizer';
import { useMainViewInspector } from './hooks/useMainViewInspector';
import { useAppContext } from '../../contexts/AppStateContext';
import appLogo from '../../../logo.png';

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  backgroundColor: 'var(--bg-dark)',
  color: 'var(--text-primary)',
  padding: '6px 8px',
  fontSize: '0.76rem',
  cursor: 'pointer',
};

const openExternal = (url: string) => window.open(url, '_blank');

type CopyableValueRowProps = {
  label: string;
  value: string;
};

const CopyableValueRow: React.FC<CopyableValueRowProps> = ({ label, value }) => {
  const { tr } = useI18n();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '130px 1fr auto',
        alignItems: 'center',
        gap: '8px',
        border: '1px solid var(--border-color)',
        borderRadius: '6px',
        padding: '6px 8px',
        backgroundColor: 'var(--bg-dark)',
      }}
    >
      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{label}</div>
      <code style={{ fontSize: '0.74rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</code>
      <button
        className="icon-btn"
        onClick={() => void navigator.clipboard.writeText(value)}
        style={{ fontSize: '0.72rem', padding: '3px 7px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      >
        <Copy size={11} /> {tr('Kopieren', 'Copy')}
      </button>
    </div>
  );
};

const GithubAuthGuide: React.FC<{
  method: Exclude<GithubAuthHelpMethod, null>;
  onClose: () => void;
}> = ({ method, onClose }) => {
  const { tr } = useI18n();

  if (method === 'pat') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontWeight: 700 }}>{tr('Methode 1: PAT - Schritt fuer Schritt', 'Method 1: PAT - step by step')}</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
            {tr('Schliessen', 'Close')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tr('Direkt kopierbare Werte', 'Direct copy values')}</div>
          <CopyableValueRow label={tr('PAT URL', 'PAT URL')} value="https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control" />
          <CopyableValueRow label={tr('Note', 'Note')} value="Open-Git-Control" />
          <CopyableValueRow label={tr('Scopes', 'Scopes')} value="repo,read:user" />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control')}>
            <ExternalLink size={12} /> {tr('Token-Seite oeffnen', 'Open token page')}
          </button>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/personal-access-tokens')}>
            <ExternalLink size={12} /> {tr('Alle Tokens ansehen', 'View all tokens')}
          </button>
        </div>

        <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5, fontSize: '0.82rem' }}>
          <li>{tr('Browser oeffnen: github.com -> oben rechts Profilbild -> Settings.', 'Open browser: github.com -> top-right avatar -> Settings.')}</li>
          <li>{tr('Links in der Seitenleiste: Developer settings -> Personal access tokens -> Tokens (classic).', 'In left sidebar: Developer settings -> Personal access tokens -> Tokens (classic).')}</li>
          <li>{tr('Auf "Generate new token" klicken.', 'Click "Generate new token".')}</li>
          <li>{tr('Feld "Note": z.B. "Open-Git-Control" eintragen.', 'Field "Note": enter e.g. "Open-Git-Control".')}</li>
          <li>{tr('Feld "Expiration": z.B. 90 Tage waehlen.', 'Field "Expiration": choose e.g. 90 days.')}</li>
          <li>{tr('Checkboxen setzen: "repo" und "read:user".', 'Set checkboxes: "repo" and "read:user".')}</li>
          <li>{tr('Unten auf "Generate token" klicken und den Token sofort kopieren.', 'Click "Generate token" and copy token immediately.')}</li>
          <li>{tr('Zur App zurueck: Token ins PAT-Feld einfuellen und "Mit Token verbinden" klicken.', 'Back in app: paste token into PAT field and click "Connect with token".')}</li>
        </ol>
      </div>
    );
  }

  if (method === 'device') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontWeight: 700 }}>{tr('Methode 2: OAuth Device Flow - Schritt fuer Schritt', 'Method 2: OAuth Device Flow - step by step')}</div>
          <button className="icon-btn" onClick={onClose} style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
            {tr('Schliessen', 'Close')}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tr('Direkt kopierbare Werte', 'Direct copy values')}</div>
          <CopyableValueRow label={tr('Application name', 'Application name')} value="Open-Git-Control Local" />
          <CopyableValueRow label={tr('Homepage URL', 'Homepage URL')} value="https://localhost" />
          <CopyableValueRow label={tr('Callback URL', 'Callback URL')} value="http://localhost/callback" />
          <CopyableValueRow label={tr('Settings Feld', 'Settings field')} value="GitHub OAuth Client ID (Device Flow)" />
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/developers')}>
            <ExternalLink size={12} /> {tr('Developer Settings', 'Developer settings')}
          </button>
          <button style={linkStyle} onClick={() => openExternal('https://github.com/settings/apps/new')}>
            <ExternalLink size={12} /> {tr('Neue OAuth App', 'New OAuth app')}
          </button>
        </div>

        <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5, fontSize: '0.82rem' }}>
          <li>{tr('In GitHub: Settings -> Developer settings -> OAuth Apps -> New OAuth App.', 'In GitHub: Settings -> Developer settings -> OAuth Apps -> New OAuth App.')}</li>
          <li>{tr('Feld "Application name": z.B. "Open-Git-Control Local".', 'Field "Application name": e.g. "Open-Git-Control Local".')}</li>
          <li>{tr('Feld "Homepage URL": z.B. https://localhost.', 'Field "Homepage URL": e.g. https://localhost.')}</li>
          <li>{tr('Feld "Authorization callback URL": z.B. http://localhost/callback.', 'Field "Authorization callback URL": e.g. http://localhost/callback.')}</li>
          <li>{tr('Auf "Register application" klicken und dann die "Client ID" kopieren.', 'Click "Register application" and then copy the "Client ID".')}</li>
          <li>{tr('In der App: Tab Settings -> Feld "GitHub OAuth Client ID (Device Flow)" -> Client ID einfuegen.', 'In app: Settings tab -> field "GitHub OAuth Client ID (Device Flow)" -> paste Client ID.')}</li>
          <li>{tr('Zurueck zum GitHub-Tab -> "Device Flow starten" klicken.', 'Go back to GitHub tab -> click "Start Device Flow".')}</li>
          <li>{tr('Im Browser die angezeigte URL besuchen, den Code eingeben, auf "Continue" und dann "Authorize" klicken.', 'In browser visit shown URL, enter code, click "Continue" and then "Authorize".')}</li>
        </ol>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontWeight: 700 }}>{tr('Methode 3: 1-Klick Login - Schritt fuer Schritt', 'Method 3: One-click login - step by step')}</div>
        <button className="icon-btn" onClick={onClose} style={{ fontSize: '0.74rem', padding: '3px 8px' }}>
          {tr('Schliessen', 'Close')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{tr('Direkt kopierbare Werte', 'Direct copy values')}</div>
        <CopyableValueRow label={tr('CLI URL', 'CLI URL')} value="https://cli.github.com/" />
        <CopyableValueRow label={tr('Scopes', 'Scopes')} value="repo,read:user" />
        <CopyableValueRow label={tr('gh Kommando', 'gh command')} value="gh auth login --hostname github.com --web --git-protocol https --scopes repo,read:user" />
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button style={linkStyle} onClick={() => openExternal('https://cli.github.com/')}>
          <ExternalLink size={12} /> {tr('GitHub CLI herunterladen', 'Download GitHub CLI')}
        </button>
        <button style={linkStyle} onClick={() => openExternal('https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/authorizing-oauth-apps')}>
          <ExternalLink size={12} /> {tr('OAuth Freigabe Hilfe', 'OAuth approval help')}
        </button>
      </div>

      <ol style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.5, fontSize: '0.82rem' }}>
        <li>{tr('Falls noch nicht installiert: GitHub CLI (gh) von cli.github.com installieren.', 'If not installed yet: install GitHub CLI (gh) from cli.github.com.')}</li>
        <li>{tr('App im GitHub-Tab offen lassen und auf "Bei GitHub anmelden" klicken.', 'Keep app open on GitHub tab and click "Sign in with GitHub".')}</li>
        <li>{tr('Es oeffnet sich der Browser: GitHub-Login ausfuehren und evtl. 2FA bestaetigen.', 'Browser opens: complete GitHub login and confirm 2FA if needed.')}</li>
        <li>{tr('Wenn abgefragt: den Zugriff fuer GitHub CLI erlauben (Authorize).', 'If asked: allow access for GitHub CLI (Authorize).')}</li>
        <li>{tr('Nach der Freigabe kehrt die App automatisch zurueck und verbindet dein Konto.', 'After approval, app returns automatically and connects your account.')}</li>
      </ol>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Check size={12} />
        {tr('Hinweis: Diese Methode braucht keine eigene OAuth Client ID in den App-Settings.', 'Note: this method does not require your own OAuth Client ID in app settings.')}
      </div>
    </div>
  );
};

export const MainView: React.FC = () => {
  const {
    activeTab,
    isAuthenticated,
    selectedGithubAuthHelpMethod,
    onClearGithubAuthHelpMethod,
    activeRepo,
    currentBranch,
    branches,
    onMergeBranch,
    remoteSync,
    remoteStatus,
    isGitActionRunning,
    activeGitActionLabel,
    selectedCommit,
    setSelectedCommit,
    commitNavigationRequest,
    refreshTrigger,
    triggerRefresh,
    commitRefreshTrigger,
    triggerCommitRefresh,
    showSecondaryHistory,
    onFetch,
    onPull,
    onPullRebase,
    onPullFfOnly,
    onPullNoFf,
    onPush,
    onPushForceWithLease,
    onPushTags,
    onPushSetUpstream,
    onOpenRepoWorkspace,
    settings,
    onUpdateSettings,
    jobs,
    onClearJobs,
    settingsTab,
    onResetLayout,
    showReleaseCreator,
    onOpenReleaseCreator,
    onCloseReleaseCreator,
    prOwnerRepo,
    releaseForm,
    setReleaseForm,
    releaseSubmitting,
    releaseError,
    releaseSuccess,
    onCreateRelease,
    releaseContextLoading,
    releaseContextError,
    releaseContext,
    onRefreshReleaseContext,
    onGenerateReleaseNotes,
    releaseNotesGenerating,
    releaseNotesLanguage,
    setReleaseNotesLanguage,
    releaseNotesOptions,
    setReleaseNotesOptions,
    autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed,
    onOpenConflictResolverForPath,
    onConflictMergeContinue,
    onConflictMergeAbort,
    onConflictRebaseContinue,
    onConflictRebaseAbort,
  } = useAppContext();
  const { tr } = useI18n();

  const {
    primaryPaneBasis,
    isContentResizing,
    contentAreaRef,
    handleContentResizeStart,
  } = useMainViewPaneResizer();

  const {
    activeDiffRequest,
    activeConflictPath,
    setActiveConflictPath,
    showRecoveryCenter,
    setShowRecoveryCenter,
    commitHistoryStack,
    workingTreeSelection,
    isCommitInspectorOpen,
    handleToggleRecoveryCenter,
    handleOpenDiff,
    handleOpenConflictResolver,
    handleSelectCommitDirect,
    handleSelectCommitFromHistory,
    handleSelectWorkingTreeFile,
    handleSelectCommitFromWorkingTree,
    handleCommitBack,
    closeInspector,
    handleStageCommitOpen,
  } = useMainViewInspector({
    autoOpenConflictResolverPath,
    onAutoOpenConflictResolverConsumed,
    setSelectedCommit,
    activeRepo,
    onOpenRepoWorkspace,
    onCloseReleaseCreator,
    commitNavigationRequest,
  });

  const showGithubGuide = activeTab === 'github' && !isAuthenticated && Boolean(selectedGithubAuthHelpMethod);
  const isSettingsView = activeTab === 'settings';
  const isReleaseView = activeTab === 'repo' && showReleaseCreator;
  const primaryPaneTitle = isSettingsView
    ? tr('Einstellungen', 'Settings')
    : isReleaseView
    ? tr('Release Ersteller', 'Release creator')
    : showGithubGuide
    ? tr('GitHub Login Anleitung', 'GitHub login guide')
    : showRecoveryCenter
    ? tr('Recovery Center', 'Recovery Center')
    : activeConflictPath
    ? tr('Konflikt-Resolver', 'Conflict resolver')
    : activeDiffRequest
    ? tr('Diff Viewer', 'Diff Viewer')
    : '';
  const shouldShowPrimaryPaneHeader = isSettingsView || isReleaseView || showGithubGuide || showRecoveryCenter || Boolean(activeConflictPath) || Boolean(activeDiffRequest);

  return (
    <div className="main-view">
      <div className="topbar">
        <div className="topbar-left">
          <img
            src={appLogo}
            alt="Open-Git-Control"
            style={{ width: '22px', height: '22px', objectFit: 'contain', borderRadius: '4px' }}
          />
          <span className="topbar-repo-title">
            {activeRepo ? activeRepo.split(/[\\/]/).pop() : 'Open-Git-Control'}
          </span>
          {currentBranch && (
            <span className="topbar-chip topbar-chip-branch">
              <GitBranch size={12} /> {currentBranch}
            </span>
          )}
          {activeRepo && (
            <span className="topbar-chip topbar-chip-remote" style={{ backgroundColor: remoteStatus.backgroundColor, color: remoteStatus.color, borderColor: remoteStatus.borderColor }}>
              <RefreshCw size={12} style={{ opacity: remoteSync.isFetching ? 1 : 0.7 }} />
              {remoteStatus.title}
            </span>
          )}
        </div>

        <div className="topbar-right">
          <TopbarActions
            activeRepo={activeRepo}
            branches={branches}
            currentBranch={currentBranch}
            isGitActionRunning={isGitActionRunning}
            isFetching={remoteSync.isFetching}
            activeActionLabel={activeGitActionLabel}
            onFetch={onFetch}
            onPull={onPull}
            onPullRebase={onPullRebase}
            onPullFfOnly={onPullFfOnly}
            onPullNoFf={onPullNoFf}
            onPush={onPush}
            onPushForceWithLease={onPushForceWithLease}
            onPushTags={onPushTags}
            onPushSetUpstream={onPushSetUpstream}
            onMergeBranch={onMergeBranch}
            onStageCommit={handleStageCommitOpen}
            onOpenReleaseCreator={onOpenReleaseCreator}
          />
        </div>
      </div>

      <div ref={contentAreaRef} className="content-area">
        <div
          className="pane"
          style={
            isSettingsView || isReleaseView
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
                      <span className="conflict-action-group-label">{tr('Merge', 'Merge')}</span>
                      <button className="staging-btn-sm conflict-action-btn" onClick={onConflictMergeContinue} disabled={isGitActionRunning} title={tr('Merge abschliessen', 'Complete merge')}>{tr('Fortsetzen', 'Continue')}</button>
                      <button className="staging-btn-sm danger conflict-action-btn conflict-action-btn--danger" onClick={onConflictMergeAbort} disabled={isGitActionRunning} title={tr('Merge abbrechen', 'Abort merge')}>{tr('Abbrechen', 'Cancel')}</button>
                    </div>
                    <div className="conflict-action-group">
                      <span className="conflict-action-group-label">{tr('Rebase', 'Rebase')}</span>
                      <button className="staging-btn-sm conflict-action-btn" onClick={onConflictRebaseContinue} disabled={isGitActionRunning} title={tr('Rebase fortsetzen', 'Continue rebase')}>{tr('Fortsetzen', 'Continue')}</button>
                      <button className="staging-btn-sm danger conflict-action-btn conflict-action-btn--danger" onClick={onConflictRebaseAbort} disabled={isGitActionRunning} title={tr('Rebase abbrechen', 'Abort rebase')}>{tr('Abbrechen', 'Cancel')}</button>
                    </div>
                  </div>
                </div>
              ) : null}
              {isSettingsView ? null : isReleaseView ? (
                <button
                  className="icon-btn pane-header-nav-btn"
                  onClick={onCloseReleaseCreator}
                >
                  {tr('Zurueck zum Graph', 'Back to graph')}
                </button>
              ) : showGithubGuide ? (
                <button
                  className="icon-btn pane-header-nav-btn"
                  onClick={onClearGithubAuthHelpMethod}
                >
                  {tr('Zurueck', 'Back')}
                </button>
              ) : showRecoveryCenter ? (
                <button
                  className="icon-btn pane-header-nav-btn"
                  onClick={() => setShowRecoveryCenter(false)}
                >
                  {tr('Zurueck zum Graph', 'Back to graph')}
                </button>
              ) : activeConflictPath ? (
                <button
                  className="icon-btn pane-header-nav-btn"
                  onClick={() => setActiveConflictPath(null)}
                >
                  {tr('Zurueck zum Graph', 'Back to graph')}
                </button>
              ) : activeDiffRequest ? (
                <button
                  className="icon-btn pane-header-nav-btn"
                  onClick={closeInspector}
                >
                  {tr('Zurueck zum Graph', 'Back to graph')}
                </button>
              ) : null}
            </div>
          )}
          <div className="pane-content" style={{ padding: 0 }}>
            {isSettingsView ? (
              <SettingsMainContent
                settings={settings}
                onUpdateSettings={onUpdateSettings}
                jobs={jobs}
                onClearJobs={onClearJobs}
                activeTab={settingsTab}
                onResetLayout={onResetLayout}
              />
            ) : isReleaseView ? (
              <ReleaseCreator
                ownerRepo={prOwnerRepo}
                releaseForm={releaseForm}
                setReleaseForm={setReleaseForm}
                releaseSubmitting={releaseSubmitting}
                releaseError={releaseError}
                releaseSuccess={releaseSuccess}
                onCreateRelease={onCreateRelease}
                contextLoading={releaseContextLoading}
                contextError={releaseContextError}
                context={releaseContext}
                onRefreshContext={onRefreshReleaseContext}
                onGenerateNotes={onGenerateReleaseNotes}
                notesGenerating={releaseNotesGenerating}
                notesLanguage={releaseNotesLanguage}
                setNotesLanguage={setReleaseNotesLanguage}
                notesOptions={releaseNotesOptions}
                setNotesOptions={setReleaseNotesOptions}
              />
            ) : activeConflictPath ? (
              <StagingArea
                repoPath={activeRepo}
                onRepoChanged={triggerRefresh}
                onCommitsCreated={triggerCommitRefresh}
                onOpenDiff={handleOpenDiff}
                viewMode="conflictOnly"
                initialConflictPath={activeConflictPath}
                settings={settings}
              />
            ) : activeDiffRequest ? (
              <DiffViewer repoPath={activeRepo} request={activeDiffRequest} onClose={closeInspector} onRepoChanged={triggerRefresh} />
            ) : showGithubGuide ? (
              <GithubAuthGuide
                method={selectedGithubAuthHelpMethod as Exclude<GithubAuthHelpMethod, null>}
                onClose={onClearGithubAuthHelpMethod}
              />
            ) : showRecoveryCenter ? (
              <RecoveryCenter
                refreshTrigger={refreshTrigger}
                onRepoChanged={triggerRefresh}
                settings={settings}
              />
            ) : (
              <CommitGraph
                repoPath={activeRepo}
                selectedHash={selectedCommit}
                navigationRequest={commitNavigationRequest}
                onSelectCommit={handleSelectCommitDirect}
                refreshTrigger={refreshTrigger}
                commitRefreshTrigger={commitRefreshTrigger}
                showSecondaryHistory={showSecondaryHistory}
                onOpenDiff={handleOpenDiff}
                showRecoveryCenter={showRecoveryCenter}
                onToggleRecoveryCenter={handleToggleRecoveryCenter}
                currentBranch={currentBranch}
                branches={branches}
                onMergeBranch={onMergeBranch}
                onOpenConflictResolverForPath={onOpenConflictResolverForPath}
              />
            )}
          </div>
        </div>

        {!isSettingsView && !isReleaseView && (
          <>
            <div
              className={`pane-resizer content-pane-resizer ${isContentResizing ? 'dragging' : ''}`}
              role="separator"
              aria-orientation="vertical"
              aria-label={tr('Breite zwischen Verlauf und Inspector anpassen', 'Resize history and inspector')}
              onPointerDown={handleContentResizeStart}
            />

            <div className="pane" style={{ minWidth: `${INSPECTOR_PANE_MIN_WIDTH}px` }}>
              <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{isCommitInspectorOpen && selectedCommit ? tr('Commit Inspector', 'Commit Inspector') : workingTreeSelection ? tr('Datei-Inspector', 'File inspector') : tr('Working Directory', 'Working Directory')}</span>
                {((isCommitInspectorOpen && selectedCommit) || workingTreeSelection) && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {isCommitInspectorOpen && selectedCommit && commitHistoryStack.length > 0 && (
                      <button className="icon-btn" onClick={handleCommitBack} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                        {tr('Zurueck', 'Back')}
                      </button>
                    )}
                    <button className="icon-btn" onClick={closeInspector} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                      {tr('Schliessen', 'Close')}
                    </button>
                  </div>
                )}
              </div>
              <div className="pane-content" style={{ overflow: 'hidden' }}>
                {isCommitInspectorOpen && selectedCommit ? (
                  <CommitDetails
                    hash={selectedCommit}
                    onSelectCommit={(hash) => handleSelectCommitFromHistory(hash, selectedCommit)}
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
                    repoPath={activeRepo}
                    onRepoChanged={triggerRefresh}
                    onCommitsCreated={triggerCommitRefresh}
                    onOpenDiff={handleOpenDiff}
                    onSelectFileInspect={handleSelectWorkingTreeFile}
                    onOpenConflictResolver={handleOpenConflictResolver}
                    settings={settings}
                  />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

