import React from 'react';
import type { CatalogTranslateFn } from '@/i18n';
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
  t: CatalogTranslateFn;
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
  t,
}) => (
  <div
    className="commit-search-toolbar"
    style={{
      position: 'sticky',
      top: 0,
      zIndex: 3,
      background: 'var(--bg-darker)',
      borderBottom: '1px solid var(--border-color)',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}
  >
    {activeSearchPanel === 'commits' && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {t('generated.components.commit_graph.commitsearchtoolbar.search_mode_c1fd11c1')}
          <select
            value={activeSearchPanel}
            onChange={(event) => onActiveSearchPanelChange(event.target.value as SearchPanel)}
            style={{
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '5px 8px',
              fontSize: '0.78rem',
            }}
          >
            <option value="commits">{t('generated.components.commit_graph.commitsearchtoolbar.commit_search_a8ecc962')}</option>
            <option value="forensic">{t('generated.components.commit_graph.commitsearchtoolbar.forensic_history_739b7d2c')}</option>
          </select>
        </label>
        <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          {t('generated.components.commit_graph.commitsearchtoolbar.field_efd9469b')}
          <select
            value={searchScope}
            onChange={(event) => onSearchScopeChange(event.target.value as SearchScope)}
            style={{
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-panel)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              padding: '5px 8px',
              fontSize: '0.78rem',
            }}
          >
            {(Object.keys(searchScopeLabels) as SearchScope[]).map((scope) => (
              <option key={scope} value={scope}>
                {searchScopeLabels[scope]}
              </option>
            ))}
          </select>
        </label>
        <input
          className="commit-search-input"
          style={{
            flex: 1,
            minWidth: '240px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '0.82rem',
          }}
          type="text"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={t('generated.components.commit_graph.commitsearchtoolbar.search_commits_hash_author_message_ref_60774e98')}
        />
        <button
          className="commit-search-nav"
          style={{
            border: '1px solid var(--border-color)',
            backgroundColor: showRecoveryCenter ? 'var(--accent-primary-soft)' : 'var(--bg-panel)',
            color: showRecoveryCenter ? 'var(--text-accent)' : 'var(--text-primary)',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
          }}
          onClick={onToggleRecoveryCenter}
        >
          {showRecoveryCenter
            ? t('generated.components.commit_graph.commitsearchtoolbar.history_e5fd93ca')
            : t('generated.components.layout.main.mainprimarypane.recovery_center_0adebec8')}
        </button>
        {normalizedSearch && (
          <div
            className="commit-search-meta"
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', color: 'var(--text-secondary)' }}
          >
            <span>
              {matchCount} {t('generated.components.commit_graph.commitsearchtoolbar.matches_7020567c')}
            </span>
            <button
              className="commit-search-nav"
              style={{
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '0.72rem',
              }}
              onClick={onJumpToPreviousMatch}
              disabled={matchCount === 0}
            >
              {t('generated.components.commit_graph.commitsearchtoolbar.prev_fa5decb3')}
            </button>
            <button
              className="commit-search-nav"
              style={{
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-panel)',
                color: 'var(--text-primary)',
                borderRadius: '4px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '0.72rem',
              }}
              onClick={onJumpToNextMatch}
              disabled={matchCount === 0}
            >
              {t('generated.components.staging_area.conflictresolverpanel.next_b53e1a35')}
            </button>
          </div>
        )}
      </div>
    )}
  </div>
);
