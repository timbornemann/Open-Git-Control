import React from 'react';
import type { SearchPanel } from './ForensicSearchPanel';
import type { SearchScope } from './useCommitGraphSearch';

type CommitSearchToolbarProps = {
  activeSearchPanel: SearchPanel;
  onActiveSearchPanelChange: (panel: SearchPanel) => void;
  searchScope: SearchScope;
  onSearchScopeChange: (scope: SearchScope) => void;
  searchScopeLabels: Record<SearchScope, string>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  showRecoveryCenter: boolean;
  onToggleRecoveryCenter?: () => void;
  normalizedSearch: string;
  matchCount: number;
  onJumpToPreviousMatch: () => void;
  onJumpToNextMatch: () => void;
  tr: (deText: string, enText: string) => string;
};

export const CommitSearchToolbar: React.FC<CommitSearchToolbarProps> = ({
  activeSearchPanel,
  onActiveSearchPanelChange,
  searchScope,
  onSearchScopeChange,
  searchScopeLabels,
  searchQuery,
  onSearchQueryChange,
  showRecoveryCenter,
  onToggleRecoveryCenter,
  normalizedSearch,
  matchCount,
  onJumpToPreviousMatch,
  onJumpToNextMatch,
  tr,
}) => (
  <div className="commit-search-toolbar" style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg-darker)', borderBottom: '1px solid var(--border-color)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
    {activeSearchPanel === 'commits' && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {tr('Suchmodus:', 'Search mode:')}
          <select
            value={activeSearchPanel}
            onChange={(event) => onActiveSearchPanelChange(event.target.value as SearchPanel)}
            style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
          >
            <option value="commits">{tr('Commit-Suche', 'Commit search')}</option>
            <option value="forensic">{tr('Forensische Historie', 'Forensic history')}</option>
          </select>
        </label>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {tr('Feld:', 'Field:')}
          <select
            value={searchScope}
            onChange={(event) => onSearchScopeChange(event.target.value as SearchScope)}
            style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '5px 8px', fontSize: '0.78rem' }}
          >
            {(Object.keys(searchScopeLabels) as SearchScope[]).map((scope) => (
              <option key={scope} value={scope}>{searchScopeLabels[scope]}</option>
            ))}
          </select>
        </label>
        <input
          className="commit-search-input"
          style={{ flex: 1, minWidth: '240px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', fontSize: '0.82rem' }}
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={tr('Commits durchsuchen (Hash, Autor, Nachricht, Ref)', 'Search commits (hash, author, message, ref)')}
        />
        <button
          className="commit-search-nav"
          style={{ border: '1px solid var(--border-color)', backgroundColor: showRecoveryCenter ? 'var(--accent-primary-soft)' : 'var(--bg-panel)', color: showRecoveryCenter ? 'var(--text-accent)' : 'var(--text-primary)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          onClick={onToggleRecoveryCenter}
        >
          {showRecoveryCenter ? tr('Verlauf', 'History') : tr('Recovery Center', 'Recovery Center')}
        </button>
        {normalizedSearch && (
          <div className="commit-search-meta" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            <span>{matchCount} {tr('Treffer', 'matches')}</span>
            <button className="commit-search-nav" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }} onClick={onJumpToPreviousMatch} disabled={matchCount === 0}>{tr('Zurueck', 'Prev')}</button>
            <button className="commit-search-nav" style={{ border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '0.72rem' }} onClick={onJumpToNextMatch} disabled={matchCount === 0}>{tr('Weiter', 'Next')}</button>
          </div>
        )}
      </div>
    )}
  </div>
);
