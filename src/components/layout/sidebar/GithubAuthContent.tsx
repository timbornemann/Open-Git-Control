import React from 'react';
import { Key, ExternalLink, Github } from 'lucide-react';
import { AppSidebarProps } from './AppSidebar.types';

type GithubAuthContentProps = Pick<
  AppSidebarProps,
  | 'tokenInput'
  | 'setTokenInput'
  | 'isAuthenticating'
  | 'authError'
  | 'setAuthError'
  | 'onTokenLogin'
>;

export const GithubAuthContent: React.FC<GithubAuthContentProps> = ({
  tokenInput,
  setTokenInput,
  isAuthenticating,
  authError,
  setAuthError,
  onTokenLogin,
}) => (
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
    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
      Verbinde deinen Account mit einem PAT.
    </p>
    <a
      href="#"
      onClick={e => {
        e.preventDefault();
        window.open('https://github.com/settings/tokens/new?scopes=repo,user&description=Git-Organizer');
      }}
      style={{
        fontSize: '0.8rem',
        color: 'var(--accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        textDecoration: 'none',
      }}
    >
      <ExternalLink size={12} /> Token erstellen
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
      {isAuthenticating ? 'Verbinde...' : 'Verbinden'}
    </button>
  </div>
);

