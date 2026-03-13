import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GitBranch, RefreshCw, ExternalLink, Check, Copy } from 'lucide-react';
import { TopbarActions } from '../topbar/TopbarActions';
import { CommitGraph } from '../CommitGraph';
import { CommitDetails } from '../CommitDetails';
import { StagingArea } from '../StagingArea';
import { DiffViewer } from '../DiffViewer';
import { RecoveryCenter } from '../RecoveryCenter';
import { RemoteSyncState } from '../../types/git';
import { DiffRequest } from '../../types/diff';
import { AppSettingsDto } from '../../global';
import { useI18n } from '../../i18n';
import { GithubAuthHelpMethod } from './sidebar/AppSidebar.types';
import appLogo from '../../../logo.png';

type RemoteStatus = {
  title: string;
  detail: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

type Props = {
  activeTab: 'repos' | 'github' | 'settings';
  isAuthenticated: boolean;
  selectedGithubAuthHelpMethod: GithubAuthHelpMethod;
  onClearGithubAuthHelpMethod: () => void;
  activeRepo: string | null;
  currentBranch: string;
  remoteSync: RemoteSyncState;
  remoteStatus: RemoteStatus;
  isGitActionRunning: boolean;
  activeGitActionLabel: string | null;
  selectedCommit: string | null;
  setSelectedCommit: (hash: string | null) => void;
  refreshTrigger: number;
  triggerRefresh: () => void;
  showSecondaryHistory: boolean;
  onFetch: () => void;
  onPull: () => void;
  onPush: () => void;
  settings: AppSettingsDto;
};

const normalizeCommitHash = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const match = String(value).match(/[0-9a-f]{7,40}/i);
  return match ? match[0] : null;
};

const PRIMARY_PANE_DEFAULT_RATIO = 0.7;
const PRIMARY_PANE_MIN_WIDTH = 320;
const INSPECTOR_PANE_MIN_WIDTH = 280;
const CONTENT_RESIZER_WIDTH = 8;
const MAIN_CONTENT_MIN_WIDTH = PRIMARY_PANE_MIN_WIDTH + INSPECTOR_PANE_MIN_WIDTH + CONTENT_RESIZER_WIDTH;

const clampPrimaryPaneRatio = (ratio: number, containerWidth: number): number => {
  const effectiveWidth = Math.max(containerWidth, MAIN_CONTENT_MIN_WIDTH);
  const minRatio = PRIMARY_PANE_MIN_WIDTH / effectiveWidth;
  const maxRatio = (effectiveWidth - INSPECTOR_PANE_MIN_WIDTH - CONTENT_RESIZER_WIDTH) / effectiveWidth;
  const lower = Math.min(minRatio, maxRatio);
  const upper = Math.max(minRatio, maxRatio);
  return Math.min(upper, Math.max(lower, ratio));
};

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

export const MainView: React.FC<Props> = ({
  activeTab,
  isAuthenticated,
  selectedGithubAuthHelpMethod,
  onClearGithubAuthHelpMethod,
  activeRepo,
  currentBranch,
  remoteSync,
  remoteStatus,
  isGitActionRunning,
  activeGitActionLabel,
  selectedCommit,
  setSelectedCommit,
  refreshTrigger,
  triggerRefresh,
  showSecondaryHistory,
  onFetch,
  onPull,
  onPush,
  settings,
}) => {
  const [activeDiffRequest, setActiveDiffRequest] = useState<DiffRequest | null>(null);
  const [showRecoveryCenter, setShowRecoveryCenter] = useState(false);
  const [commitHistoryStack, setCommitHistoryStack] = useState<string[]>([]);
  const [primaryPaneRatio, setPrimaryPaneRatio] = useState(PRIMARY_PANE_DEFAULT_RATIO);
  const [isContentResizing, setIsContentResizing] = useState(false);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const contentResizeActiveRef = useRef(false);
  const { tr } = useI18n();

  const primaryPaneBasis = `${(primaryPaneRatio * 100).toFixed(2)}%`;

  const handleContentResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    contentResizeActiveRef.current = true;
    setIsContentResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!contentResizeActiveRef.current || !contentAreaRef.current) return;
      const rect = contentAreaRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      const rawRatio = (event.clientX - rect.left) / rect.width;
      setPrimaryPaneRatio(clampPrimaryPaneRatio(rawRatio, rect.width));
    };

    const stopResize = () => {
      if (!contentResizeActiveRef.current) return;
      contentResizeActiveRef.current = false;
      setIsContentResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  useEffect(() => {
    const clampToCurrentWidth = () => {
      if (!contentAreaRef.current) return;
      const rect = contentAreaRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;

      setPrimaryPaneRatio(previous => clampPrimaryPaneRatio(previous, rect.width));
    };

    clampToCurrentWidth();
    window.addEventListener('resize', clampToCurrentWidth);
    return () => window.removeEventListener('resize', clampToCurrentWidth);
  }, []);

  const showGithubGuide = activeTab === 'github' && !isAuthenticated && Boolean(selectedGithubAuthHelpMethod);

  useEffect(() => {
    setActiveDiffRequest(null);
    setCommitHistoryStack([]);
    setShowRecoveryCenter(false);
  }, [activeRepo]);

  const handleOpenDiff = useCallback((diffRequest: DiffRequest) => {
    setActiveDiffRequest((previous) => {
      if (
        previous &&
        previous.source === diffRequest.source &&
        previous.path === diffRequest.path &&
        previous.commitHash === diffRequest.commitHash
      ) {
        return previous;
      }
      return diffRequest;
    });
  }, []);

  const handleSelectCommitDirect = useCallback((hash: string | null) => {
    const normalized = normalizeCommitHash(hash);
    setCommitHistoryStack([]);
    setSelectedCommit(normalized);
  }, [setSelectedCommit]);

  const handleSelectCommitFromHistory = useCallback((hash: string) => {
    const normalized = normalizeCommitHash(hash);
    if (!normalized) return;

    if (!selectedCommit) {
      setSelectedCommit(normalized);
      return;
    }

    if (selectedCommit === normalized) return;

    setCommitHistoryStack(prev => [...prev, selectedCommit]);
    setSelectedCommit(normalized);
  }, [selectedCommit, setSelectedCommit]);

  const handleCommitBack = useCallback(() => {
    setCommitHistoryStack(prev => {
      if (prev.length === 0) return prev;
      const nextHash = normalizeCommitHash(prev[prev.length - 1]);
      setSelectedCommit(nextHash);
      return prev.slice(0, -1);
    });
  }, [setSelectedCommit]);

  const closeInspector = useCallback(() => {
    setCommitHistoryStack([]);
    setSelectedCommit(null);
  }, [setSelectedCommit]);

  return (
    <div className="main-view">
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: 0 }}>
          <img
            src={appLogo}
            alt="Open-Git-Control"
            style={{ width: '22px', height: '22px', objectFit: 'contain', borderRadius: '4px' }}
          />
          <span style={{ fontWeight: 600, fontSize: '1.1rem', minWidth: 0, maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeRepo ? activeRepo.split(/[\\/]/).pop() : 'Open-Git-Control'}
          </span>
          {currentBranch && (
            <span
              style={{
                fontSize: '0.8rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--status-success-soft)',
                color: 'var(--status-success)',
                border: '1px solid var(--status-success-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <GitBranch size={12} /> {currentBranch}
            </span>
          )}
          {activeRepo && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: remoteStatus.backgroundColor,
                color: remoteStatus.color,
                border: `1px solid ${remoteStatus.borderColor}`,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={12} style={{ opacity: remoteSync.isFetching ? 1 : 0.7 }} />
              {remoteStatus.title}
            </span>
          )}
          {(isGitActionRunning || remoteSync.isFetching) && activeGitActionLabel && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '4px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--text-accent)',
                border: '1px solid var(--accent-primary-border)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={12} className="spin" />
              {activeGitActionLabel}
            </span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: '12px' }} />

        <TopbarActions
          activeRepo={activeRepo}
          isGitActionRunning={isGitActionRunning}
          isFetching={remoteSync.isFetching}
          activeActionLabel={activeGitActionLabel}
          onFetch={onFetch}
          onPull={onPull}
          onPush={onPush}
          onStageCommit={() => handleSelectCommitDirect(null)}
        />
      </div>

      <div ref={contentAreaRef} className="content-area">
        <div className="pane" style={{ flex: `0 0 ${primaryPaneBasis}`, minWidth: `${PRIMARY_PANE_MIN_WIDTH}px` }}>
          <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              {showGithubGuide
                ? tr('GitHub Login Anleitung', 'GitHub login guide')
                : (showRecoveryCenter ? tr('Recovery Center', 'Recovery Center') : (activeDiffRequest ? tr('Diff Viewer', 'Diff Viewer') : tr('Commit Graph', 'Commit Graph')))}
            </span>
            {showGithubGuide ? (
              <button
                className="icon-btn"
                onClick={onClearGithubAuthHelpMethod}
                style={{ fontSize: '0.75rem', padding: '2px 6px' }}
              >
                {tr('Zurueck', 'Back')}
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '6px' }}>
                {!activeDiffRequest && (
                  <button
                    className="icon-btn"
                    onClick={() => setShowRecoveryCenter((prev) => !prev)}
                    style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                  >
                    {showRecoveryCenter ? tr('Zum Graph', 'To graph') : tr('Recovery Center', 'Recovery Center')}
                  </button>
                )}
                {activeDiffRequest && (
                  <button
                    className="icon-btn"
                    onClick={() => setActiveDiffRequest(null)}
                    style={{ fontSize: '0.75rem', padding: '2px 6px' }}
                  >
                    {tr('Zurueck zum Graph', 'Back to graph')}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="pane-content" style={{ padding: 0 }}>
            {activeDiffRequest ? (
              <DiffViewer repoPath={activeRepo} request={activeDiffRequest} onClose={() => setActiveDiffRequest(null)} />
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
                onSelectCommit={handleSelectCommitDirect}
                refreshTrigger={refreshTrigger}
                showSecondaryHistory={showSecondaryHistory}
              />
            )}
          </div>
        </div>

        <div
          className={`pane-resizer content-pane-resizer ${isContentResizing ? 'dragging' : ''}`}
          role="separator"
          aria-orientation="vertical"
          aria-label={tr('Breite zwischen Verlauf und Inspector anpassen', 'Resize history and inspector')}
          onPointerDown={handleContentResizeStart}
        />

        <div className="pane" style={{ minWidth: `${INSPECTOR_PANE_MIN_WIDTH}px` }}>
          <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{selectedCommit ? tr('Commit Inspector', 'Commit Inspector') : tr('Working Directory', 'Working Directory')}</span>
            {selectedCommit && (
              <div style={{ display: 'flex', gap: '6px' }}>
                {commitHistoryStack.length > 0 && (
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
            {selectedCommit ? (
              <CommitDetails
                hash={selectedCommit}
                onSelectCommit={handleSelectCommitFromHistory}
                onOpenDiff={handleOpenDiff}
              />
            ) : (
              <StagingArea
                repoPath={activeRepo}
                onRepoChanged={triggerRefresh}
                onOpenDiff={handleOpenDiff}
                settings={settings}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
