import React from 'react';
import { Key, ExternalLink, Github, ShieldCheck, Copy } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';
import { useI18n } from '../../../i18n';

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
>;

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
      <h3 style={{ margin: '8px 0 4px', fontSize: '1.1rem' }}>GitHub Connect</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-panel)' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'left' }}>{tr('Methode 1: Personal Access Token (PAT)', 'Method 1: Personal Access Token (PAT)')}</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'left' }}>
          {tr('Klassische Anmeldung mit eigenem Token.', 'Classic sign-in with your own token.')}
        </p>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            window.open('https://github.com/settings/tokens/new?scopes=repo,user&description=Git-Organizer');
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
        <div style={{ position: 'relative' }}>
          <Key
            size={14}
            style={{
              position: 'absolute',
              left: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
            }}
          />
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
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '8px 8px 8px 28px',
              borderRadius: '4px',
              border: authError ? '1px solid #f85149' : '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-dark)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>
        {authError && (
          <p style={{ fontSize: '0.8rem', color: '#f85149', margin: 0, textAlign: 'left' }}>
            {authError}
          </p>
        )}
        <button
          disabled={!tokenInput.trim() || isAuthenticating}
          onClick={onTokenLogin}
          style={{
            padding: '8px',
            backgroundColor: tokenInput.trim() && !isAuthenticating ? 'var(--accent-primary)' : 'var(--bg-dark)',
            color: tokenInput.trim() && !isAuthenticating ? '#fff' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: '4px',
            cursor: tokenInput.trim() && !isAuthenticating ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          {isAuthenticating ? tr('Verbinde...', 'Connecting...') : tr('Mit Token verbinden', 'Connect with token')}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: 'var(--bg-panel)' }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, textAlign: 'left' }}>{tr('Methode 2: OAuth Device Flow (Alternative)', 'Method 2: OAuth Device Flow (Alternative)')}</div>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'left' }}>
          {tr('Browser-Öffnung mit Einmal-Code. PAT bleibt weiterhin möglich.', 'Browser-based sign-in with one-time code. PAT remains available.')}
        </p>

        {!oauthConfigured && (
          <div style={{ fontSize: '0.76rem', color: '#f85149', textAlign: 'left' }}>
            {tr('Device Flow ist nicht konfiguriert (GITHUB_OAUTH_CLIENT_ID fehlt).', 'Device Flow is not configured (missing GITHUB_OAUTH_CLIENT_ID).')}
          </div>
        )}

        {deviceFlowError && (
          <div style={{ fontSize: '0.76rem', color: '#f85149', textAlign: 'left' }}>
            {deviceFlowError}
          </div>
        )}

        {deviceFlow && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-primary)', textAlign: 'left', border: '1px solid var(--border-color)', borderRadius: '4px', padding: '8px', backgroundColor: 'var(--bg-dark)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={12} />
              {tr('Code', 'Code')}: <strong style={{ letterSpacing: '1px' }}>{deviceFlow.userCode}</strong>
              <button
                className="icon-btn"
                style={{ padding: '2px', marginLeft: 'auto' }}
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
              color: oauthConfigured && !isDeviceFlowRunning ? '#fff' : 'var(--text-secondary)',
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
    </div>
  );
};
