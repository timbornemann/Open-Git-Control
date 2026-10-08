import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import { TextField } from '@/components/ui/TextField';
import { IconButton } from '@/components/ui/IconButton';
import { useI18n } from '@/i18n';
import type { AppSettingsDto } from '@/types/appDtos';
import type { GitJobEventDto } from '@/types/aiDtos';
import type { SettingsTabId } from '@/app/state/contracts';
import type { SettingsUpdateHandler } from './settings/SettingsSectionPrimitives';
import { ApiMcpSettingsPanel } from './ApiMcpSettingsPanel';
import { SettingsToolsSection } from './settings/SettingsToolsSection';
import {
  SettingsAiSection,
  SettingsGeneralSection,
  SettingsGithubSection,
  SettingsFeedbackSection,
  SettingsJobsSection,
  SettingsReleaseNotesCard,
  SettingsSecuritySection,
  SettingsUpdatesSection,
} from './settings/SettingsSections';
import { useSettingsPanelModel } from './settings/useSettingsPanelModel';
import { SettingsDiagnosticsSection } from './settings/SettingsDiagnosticsSection';
import { getSettingsCategories, searchSettingsGroups } from './settings/settingsNavigation';
import { clearSettingsDestination, useSettingsNavigation } from '@/app/state/settingsNavigationStore';

type SettingsMainContentProps = {
  settings: AppSettingsDto;
  onUpdateSettings: SettingsUpdateHandler;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
  activeTab: SettingsTabId;
  onSelectTab: (tab: SettingsTabId) => void;
  onResetLayout: () => void;
};

export const SettingsMainContent: React.FC<SettingsMainContentProps> = ({
  settings,
  onUpdateSettings,
  jobs,
  onClearJobs,
  activeTab,
  onSelectTab,
  onResetLayout,
}) => {
  const { locale, sortedJobs, aiUpdater } = useSettingsPanelModel({ settings, onUpdateSettings, jobs });
  const { tr } = useI18n();
  const [query, setQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingGroupRef = useRef<{ id: string; tab: SettingsTabId } | null>(null);
  const previousTabRef = useRef(activeTab);
  const categories = getSettingsCategories(tr);
  const category = categories.find((item) => item.id === activeTab)!;
  const searching = Boolean(query.trim());
  const matches = searchSettingsGroups(query, tr);
  const destination = useSettingsNavigation((state) => state.destination);

  useEffect(() => {
    if (destination) {
      pendingGroupRef.current = destination;
      if (activeTab !== destination.tab) {
        onSelectTab(destination.tab);
        return;
      }
      if (searching) {
        setQuery('');
        return;
      }
    }
    if (previousTabRef.current !== activeTab) {
      previousTabRef.current = activeTab;
      setQuery('');
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
    const pending = pendingGroupRef.current;
    if (!searching && pending?.tab === activeTab) {
      const heading = contentRef.current?.querySelector<HTMLElement>(`#settings-${pending.id}-title`);
      heading?.scrollIntoView?.({ block: 'start' });
      heading?.focus({ preventScroll: true });
      pendingGroupRef.current = null;
      if (destination) clearSettingsDestination(destination);
    }
  }, [activeTab, searching, destination, onSelectTab]);

  return (
    <div className="settings-main">
      <header className="settings-page-header">
        <div className="settings-page-heading">
          <h2 id="settings-page-title">{searching ? tr('Suchergebnisse', 'Search results') : category.label}</h2>
          <p>
            {searching
              ? matches.length === 1
                ? tr('1 passende Einstellungsgruppe', '1 matching settings group')
                : tr(`${matches.length} passende Einstellungsgruppen`, `${matches.length} matching settings groups`)
              : category.description}
          </p>
        </div>
        <div className="settings-page-tools">
          <select
            className="ui-field ui-field--sm settings-mobile-category"
            aria-label={tr('Einstellungskategorie', 'Settings category')}
            value={activeTab}
            onChange={(event) => onSelectTab(event.target.value as SettingsTabId)}
          >
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="settings-search">
            <Search size={14} aria-hidden="true" />
            <TextField
              type="search"
              aria-label={tr('Einstellungen durchsuchen', 'Search settings')}
              placeholder={tr('Einstellungen durchsuchen …', 'Search settings …')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('');
              }}
            />
            {query && <IconButton aria-label={tr('Suche leeren', 'Clear search')} icon={<X size={13} />} size="xs" onClick={() => setQuery('')} />}
          </div>
        </div>
      </header>
      <div className="settings-content" ref={contentRef} aria-labelledby="settings-page-title">
        {searching && (
          <div className="settings-search-results">
            {matches.length === 0 && (
              <p className="settings-empty">
                {tr('Keine passenden Einstellungen gefunden. Suche nach einem anderen Begriff.', 'No matching settings found. Try another search term.')}
              </p>
            )}
            {matches.map((group) => (
              <button
                className="settings-search-result"
                type="button"
                key={group.id}
                onClick={() => {
                  pendingGroupRef.current = group;
                  onSelectTab(group.tab);
                  setQuery('');
                }}
              >
                <span>
                  <small>{categories.find((item) => item.id === group.tab)!.label}</small>
                  <strong>{group.title}</strong>
                  <span>{group.description}</span>
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
        <div hidden={searching} className="settings-category-content">
          {activeTab === 'general' && (
            <SettingsGeneralSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" onResetLayout={onResetLayout} />
          )}

          {activeTab === 'integrations' && (
            <div className="settings-grid">
              <SettingsGithubSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" />
            </div>
          )}

          {activeTab === 'api' && (
            <ApiMcpSettingsPanel aiSettings={<SettingsAiSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" ai={aiUpdater} />} />
          )}

          {activeTab === 'security' && <SettingsSecuritySection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" />}

          {activeTab === 'system' && (
            <div className="settings-grid">
              <SettingsToolsSection />
              <SettingsUpdatesSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" ai={aiUpdater} locale={locale} />
              <SettingsReleaseNotesCard releaseNotes={aiUpdater.updaterStatus?.releaseNotes} />
              <SettingsFeedbackSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" />
              <SettingsDiagnosticsSection variant="main" />
              <SettingsJobsSection jobs={sortedJobs} onClearJobs={onClearJobs} variant="main" locale={locale} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
