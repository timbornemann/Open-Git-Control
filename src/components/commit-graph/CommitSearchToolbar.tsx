import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, History, MoreHorizontal } from 'lucide-react';
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
}) => {
  const [isCompactMenuOpen, setIsCompactMenuOpen] = useState(false);
  const searchModeLabel = t('generated.components.commit_graph.commitsearchtoolbar.search_mode_c1fd11c1');
  const searchScopeLabel = t('generated.components.commit_graph.commitsearchtoolbar.field_efd9469b');
  const recoveryLabel = showRecoveryCenter
    ? t('generated.components.commit_graph.commitsearchtoolbar.history_e5fd93ca')
    : t('generated.components.layout.main.mainprimarypane.recovery_center_0adebec8');
  const moreActionsLabel = t('generated.components.topbar.topbaractions.more_actions_a53b5e21');
  const previousLabel = t('generated.components.commit_graph.commitsearchtoolbar.prev_fa5decb3');
  const nextLabel = t('generated.components.staging_area.conflictresolverpanel.next_b53e1a35');
  const matchesLabel = t('generated.components.commit_graph.commitsearchtoolbar.matches_7020567c');

  const selectSearchPanel = (value: SearchPanel) => {
    onActiveSearchPanelChange(value);
    setIsCompactMenuOpen(false);
  };

  const selectSearchScope = (value: SearchScope) => {
    onSearchScopeChange(value);
    setIsCompactMenuOpen(false);
  };

  const toggleRecoveryCenter = () => {
    onToggleRecoveryCenter?.();
    setIsCompactMenuOpen(false);
  };

  return (
    <div className="commit-search-toolbar">
      {activeSearchPanel === 'commits' && (
        <div className="commit-search-toolbar__row">
          <label className="commit-search-toolbar__control commit-search-toolbar__mode">
            <span className="commit-search-toolbar__control-label">{searchModeLabel}</span>
            <select
              className="commit-search-toolbar__select"
              aria-label={searchModeLabel}
              value={activeSearchPanel}
              onChange={(event) => selectSearchPanel(event.target.value as SearchPanel)}
            >
              <option value="commits">{t('generated.components.commit_graph.commitsearchtoolbar.commit_search_a8ecc962')}</option>
              <option value="forensic">{t('generated.components.commit_graph.commitsearchtoolbar.forensic_history_739b7d2c')}</option>
            </select>
          </label>

          <label className="commit-search-toolbar__control commit-search-toolbar__scope">
            <span className="commit-search-toolbar__control-label">{searchScopeLabel}</span>
            <select
              className="commit-search-toolbar__select"
              aria-label={searchScopeLabel}
              value={searchScope}
              onChange={(event) => selectSearchScope(event.target.value as SearchScope)}
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
            type="text"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder={t('generated.components.commit_graph.commitsearchtoolbar.search_commits_hash_author_message_ref_60774e98')}
          />

          {onToggleRecoveryCenter && (
            <button type="button" className="commit-search-toolbar__recovery" onClick={toggleRecoveryCenter} title={recoveryLabel} aria-label={recoveryLabel}>
              <span className="commit-search-toolbar__recovery-label">{recoveryLabel}</span>
              <History size={15} className="commit-search-toolbar__compact-icon" aria-hidden="true" />
            </button>
          )}

          {normalizedSearch && (
            <div className="commit-search-meta" aria-label={`${matchCount} ${matchesLabel}`}>
              <span className="commit-search-meta__count">
                {matchCount} {matchesLabel}
              </span>
              <button
                type="button"
                className="commit-search-nav"
                onClick={onJumpToPreviousMatch}
                disabled={matchCount === 0}
                title={previousLabel}
                aria-label={previousLabel}
              >
                <span className="commit-search-nav__label">{previousLabel}</span>
                <ChevronLeft size={15} className="commit-search-toolbar__compact-icon" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="commit-search-nav"
                onClick={onJumpToNextMatch}
                disabled={matchCount === 0}
                title={nextLabel}
                aria-label={nextLabel}
              >
                <span className="commit-search-nav__label">{nextLabel}</span>
                <ChevronRight size={15} className="commit-search-toolbar__compact-icon" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="commit-search-toolbar__compact-menu">
            <button
              type="button"
              className="commit-search-toolbar__more-toggle"
              onClick={() => setIsCompactMenuOpen((open) => !open)}
              title={moreActionsLabel}
              aria-label={moreActionsLabel}
              aria-expanded={isCompactMenuOpen}
            >
              <MoreHorizontal size={17} aria-hidden="true" />
            </button>
            {isCompactMenuOpen && (
              <div className="commit-search-toolbar__more-menu">
                <label className="commit-search-toolbar__more-control">
                  <span>{searchModeLabel}</span>
                  <select
                    value={activeSearchPanel}
                    onChange={(event) => selectSearchPanel(event.target.value as SearchPanel)}
                    aria-label={searchModeLabel}
                    data-commit-search-more-mode
                  >
                    <option value="commits">{t('generated.components.commit_graph.commitsearchtoolbar.commit_search_a8ecc962')}</option>
                    <option value="forensic">{t('generated.components.commit_graph.commitsearchtoolbar.forensic_history_739b7d2c')}</option>
                  </select>
                </label>
                <label className="commit-search-toolbar__more-control">
                  <span>{searchScopeLabel}</span>
                  <select value={searchScope} onChange={(event) => selectSearchScope(event.target.value as SearchScope)} aria-label={searchScopeLabel}>
                    {(Object.keys(searchScopeLabels) as SearchScope[]).map((scope) => (
                      <option key={scope} value={scope}>
                        {searchScopeLabels[scope]}
                      </option>
                    ))}
                  </select>
                </label>
                {onToggleRecoveryCenter && (
                  <button type="button" className="commit-search-toolbar__more-action" onClick={toggleRecoveryCenter}>
                    {recoveryLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
