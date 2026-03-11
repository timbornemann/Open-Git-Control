import React from 'react';
import { DownloadCloud } from 'lucide-react';
import { useI18n } from '../../i18n';

type Props = {
  isCloning: boolean;
  cloneRepoName: string | null;
  cloneFinished: boolean;
  cloneError: string | null;
  cloneLog: string[];
  onClose: () => void;
};

export const CloneProgressModal: React.FC<Props> = ({
  isCloning,
  cloneRepoName,
  cloneFinished,
  cloneError,
  cloneLog,
  onClose,
}) => {
  const { tr } = useI18n();

  if (!isCloning) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          width: '520px',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <DownloadCloud size={18} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{tr('Klone', 'Cloning')}: {cloneRepoName || tr('Repository', 'Repository')}</span>
          <div style={{ flex: 1 }} />
          {!cloneFinished && !cloneError && <div className="clone-spinner" />}
          {cloneFinished && <span style={{ color: '#3fb950', fontSize: '0.85rem', fontWeight: 600 }}>{tr('Fertig', 'Done')}</span>}
          {cloneError && <span style={{ color: '#f85149', fontSize: '0.85rem', fontWeight: 600 }}>{tr('Fehler', 'Error')}</span>}
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '12px 16px',
            fontFamily: 'monospace',
            fontSize: '0.78rem',
            lineHeight: '1.6',
            color: 'var(--text-secondary)',
            maxHeight: '260px',
          }}
        >
          {cloneLog.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>{tr('Starte Clone-Prozess...', 'Starting clone process...')}</span>}
          {cloneLog.map((line, i) => (
            <div key={i} style={{ color: line.startsWith('ERROR:') ? '#f85149' : line.startsWith('SUCCESS:') ? '#3fb950' : 'var(--text-secondary)' }}>
              {line}
            </div>
          ))}
        </div>

        {(cloneFinished || cloneError) && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              style={{
                padding: '6px 16px',
                backgroundColor: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              {tr('Schließen', 'Close')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
