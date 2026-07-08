import React from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { useI18n } from '../../../i18n';
import type { GithubAuthHelpMethod } from '../sidebar/AppSidebar.types';

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

const openExternal = (url: string) => {
  void window.electronAPI?.openExternalUrl(url);
};

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

type GithubAuthGuideProps = {
  method: Exclude<GithubAuthHelpMethod, null>;
  onClose: () => void;
};

export const GithubAuthGuide: React.FC<GithubAuthGuideProps> = ({ method, onClose }) => {
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
