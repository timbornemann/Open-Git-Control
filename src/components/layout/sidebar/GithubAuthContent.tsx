import React from 'react';
import { Key, ExternalLink, Github, ShieldCheck, Copy, Info } from 'lucide-react';
import { AppSidebarProps, GithubAuthHelpMethod } from './AppSidebar.types';
import { useI18n } from '../../../i18n';
import { appClient } from '../../../services/appClient';

type GithubAuthContentProps = Pick<
  AppSidebarProps,
  | 'tokenInput'
  | 'setTokenInput'
  | 'isAuthenticating'
  | 'authError'
  | 'setAuthError'
  | 'onTokenLogin'
  | 'oauthConfigured'
  | 'deviceFlow'
  | 'isDeviceFlowRunning'
  | 'deviceFlowError'
  | 'onStartDeviceFlowLogin'
  | 'onCancelDeviceFlow'
  | 'isWebFlowRunning'
  | 'webFlowError'
  | 'onStartWebFlowLogin'
  | 'selectedGithubAuthHelpMethod'
  | 'onSelectGithubAuthHelpMethod'
>;

const HelpMethodButton: React.FC<{
  active: boolean;
  onClick: () => void;
  title: string;
}> = ({ active, onClick, title }) => (
  <button
    className={`icon-btn sidebar-help-action ${active ? 'sidebar-help-action-active' : 'sidebar-help-action-inactive'}`}
    onClick={onClick}
    title={title}
  >
    <Info size={12} />
  </button>
);

const toggleMethod = (
  current: GithubAuthHelpMethod,
  next: Exclude<GithubAuthHelpMethod, null>,
  onSelect: (method: GithubAuthHelpMethod) => void,
) => {
  onSelect(current === next ? null : next);
};

export const GithubAuthContent: React.FC<GithubAuthContentProps> = ({
  tokenInput,
  setTokenInput,
  isAuthenticating,
  authError,
  setAuthError,
  onTokenLogin,
  oauthConfigured,
  deviceFlow,
  isDeviceFlowRunning,
  deviceFlowError,
  onStartDeviceFlowLogin,
  onCancelDeviceFlow,
  isWebFlowRunning,
  webFlowError,
  onStartWebFlowLogin,
  selectedGithubAuthHelpMethod,
  onSelectGithubAuthHelpMethod,
}) => {
  const { tr } = useI18n();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '8px',
        textAlign: 'center',
        marginTop: '16px',
      }}
    >
      <Github size={48} style={{ margin: '0 auto', color: 'var(--text-secondary)' }} />
      <h3 style={{ margin: '8px 0 4px', fontSize: '1.1rem' }}>{tr('GitHub verbinden', 'GitHub Connect')}</h3>

      <div className="sidebar-panel-block">
        <div className="sidebar-panel-row">
          <div className="sidebar-panel-title">{tr('Methode 1: Personal Access Token (PAT)', 'Method 1: Personal Access Token (PAT)')}</div>
          <HelpMethodButton
            active={selectedGithubAuthHelpMethod === 'pat'}
            onClick={() => toggleMethod(selectedGithubAuthHelpMethod, 'pat', onSelectGithubAuthHelpMethod)}
            title={tr('Schritt-fuer-Schritt-Anleitung fuer Methode 1 anzeigen', 'Show step-by-step guide for method 1')}
          />
        </div>
        <p className="sidebar-meta-text">
          {tr('Klassische Anmeldung mit eigenem Token.', 'Classic sign-in with your own token.')}
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onSelectGithubAuthHelpMethod('pat');
            if (appClient.isAvailable()) {
              void appClient.openExternalUrl('https://github.com/settings/tokens/new?scopes=repo,user&description=Open-Git-Control');
            }
          }}
          style={{
            fontSize: '0.8rem',
            color: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: '4px',
            textDecoration: 'none',
          }}
        >
          <ExternalLink size={12} /> {tr('Token erstellen', 'Create token')}
        </a>
        <div className="sidebar-search-wrap">
          <Key size={14} className="sidebar-search-icon" />
          <input
            type="password"
            placeholder="ghp_xxx"
            value={tokenInput}
            onChange={e => {
              setTokenInput(e.target.value);
              setAuthError(null);
            }}
            onKeyDown={e => {
              if (e.key === 'Enter') onTokenLogin();
            }}
            className="sidebar-filter-input"
            style={{
              padding: '8px 8px 8px 28px',
              borderRadius: '4px',
              border: authError ? '1px solid var(--status-danger)' : '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>
        {authError && (
          <p className="sidebar-meta-text" style={{ fontSize: '0.8rem', color: 'var(--status-danger)' }}>
            {authError}
          </p>
        )}
        <button
          disabled={!tokenInput.trim() || isAuthenticating}
          onClick={onTokenLogin}
          style={{
            padding: '8px',
            backgroundColor: tokenInput.trim() && !isAuthenticating ? 'var(--accent-primary)' : 'var(--bg-dark)',
            color: tokenInput.trim() && !isAuthenticating ? 'var(--on-accent)' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '4px',
            cursor: tokenInput.trim() && !isAuthenticating ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          {isAuthenticating ? tr('Verbinde...', 'Connecting...') : tr('Mit Token verbinden', 'Connect with token')}
        </button>
      </div>

      <div className="sidebar-panel-block">
        <div className="sidebar-panel-row">
          <div className="sidebar-panel-title">{tr('Methode 2: OAuth Device Flow (Alternative)', 'Method 2: OAuth Device Flow (Alternative)')}</div>
          <HelpMethodButton
            active={selectedGithubAuthHelpMethod === 'device'}
            onClick={() => toggleMethod(selectedGithubAuthHelpMethod, 'device', onSelectGithubAuthHelpMethod)}
            title={tr('Schritt-fuer-Schritt-Anleitung fuer Methode 2 anzeigen', 'Show step-by-step guide for method 2')}
          />
        </div>
        <p className="sidebar-meta-text">
          {tr('Browser-Oeffnung mit Einmal-Code. PAT bleibt weiterhin moeglich.', 'Browser-based sign-in with one-time code. PAT remains available.')}
        </p>

        {!oauthConfigured && (
          <div className="sidebar-meta-text" style={{ fontSize: '0.76rem', color: 'var(--status-danger)' }}>
            {tr('Device Flow ist nicht konfiguriert (GitHub OAuth Client ID fehlt: Settings oder GITHUB_OAUTH_CLIENT_ID).', 'Device flow is not configured (missing GitHub OAuth Client ID in settings or GITHUB_OAUTH_CLIENT_ID).')}
          </div>
        )}

        {deviceFlowError && (
          <div className="sidebar-meta-text" style={{ fontSize: '0.76rem', color: 'var(--status-danger)' }}>
            {deviceFlowError}
          </div>
        )}

        {deviceFlow && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', textAlign: 'left', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', backgroundColor: 'var(--bg-dark)' }}>
            <div className="sidebar-panel-row">
              <ShieldCheck size={12} />
              {tr('Code', 'Code')}: <strong style={{ letterSpacing: '1px' }}>{deviceFlow.userCode}</strong>
              <button
                className="icon-btn sidebar-row-action-icon"
                style={{ marginLeft: 'auto' }}
                onClick={() => navigator.clipboard.writeText(deviceFlow.userCode)}
                title={tr('Code kopieren', 'Copy code')}
              >
                <Copy size={12} />
              </button>
            </div>
            <div style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
              {tr('Gehe zu', 'Go to')}: {deviceFlow.verificationUri}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            disabled={!oauthConfigured || isDeviceFlowRunning}
            onClick={onStartDeviceFlowLogin}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: oauthConfigured && !isDeviceFlowRunning ? 'var(--accent-primary)' : 'var(--bg-dark)',
              color: oauthConfigured && !isDeviceFlowRunning ? 'var(--on-accent)' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '4px',
              cursor: oauthConfigured && !isDeviceFlowRunning ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            {isDeviceFlowRunning ? tr('Warte auf Freigabe...', 'Waiting for authorization...') : tr('Device Flow starten', 'Start Device Flow')}
          </button>
          {isDeviceFlowRunning && (
            <button
              onClick={onCancelDeviceFlow}
              style={{
                padding: '8px 10px',
                backgroundColor: 'var(--bg-dark)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {tr('Abbrechen', 'Cancel')}
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-panel-block">
        <div className="sidebar-panel-row">
          <div className="sidebar-panel-title">{tr('Methode 3: 1-Klick GitHub Login', 'Method 3: One-click GitHub login')}</div>
          <HelpMethodButton
            active={selectedGithubAuthHelpMethod === 'web'}
            onClick={() => toggleMethod(selectedGithubAuthHelpMethod, 'web', onSelectGithubAuthHelpMethod)}
            title={tr('Schritt-fuer-Schritt-Anleitung fuer Methode 3 anzeigen', 'Show step-by-step guide for method 3')}
          />
        </div>
        <p className="sidebar-meta-text">
          {tr('Ohne OAuth App oder Keys: Klick auf Button, im Browser anmelden, fertig.', 'No OAuth app or keys: click button, sign in in browser, done.')}
        </p>
        {webFlowError && (
          <div className="sidebar-meta-text" style={{ fontSize: '0.76rem', color: 'var(--status-danger)' }}>
            {webFlowError}
          </div>
        )}

        <button
          disabled={isWebFlowRunning || isDeviceFlowRunning}
          onClick={onStartWebFlowLogin}
          style={{
            padding: '8px',
            backgroundColor: !isWebFlowRunning && !isDeviceFlowRunning ? 'var(--accent-primary)' : 'var(--bg-dark)',
            color: !isWebFlowRunning && !isDeviceFlowRunning ? 'var(--on-accent)' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '4px',
            cursor: !isWebFlowRunning && !isDeviceFlowRunning ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          {isWebFlowRunning ? tr('Browser-Login laeuft...', 'Browser login in progress...') : tr('Bei GitHub anmelden', 'Sign in with GitHub')}
        </button>
      </div>
    </div>
  );
};
