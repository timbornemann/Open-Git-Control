import React from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import type { GitJobEventDto } from '@/types/aiDtos';
import type { SettingsTabId } from '@/app/state/contracts';
import { ApiMcpSettingsPanel } from './ApiMcpSettingsPanel';
import {
  SettingsAiSection,
  SettingsGeneralSection,
  SettingsGithubSection,
  SettingsJobsSection,
  SettingsReleaseNotesCard,
  SettingsSecuritySection,
  SettingsRunSection,
  SettingsUpdatesSection,
} from './settings/SettingsSections';
import { useSettingsPanelModel } from './settings/useSettingsPanelModel';

type SettingsMainContentProps = {
  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  jobs: GitJobEventDto[];
  onClearJobs: () => void;
  activeTab: SettingsTabId;
  onResetLayout: () => void;
};

export const SettingsMainContent: React.FC<SettingsMainContentProps> = ({ settings, onUpdateSettings, jobs, onClearJobs, activeTab, onResetLayout }) => {
  const { locale, sortedJobs, aiUpdater } = useSettingsPanelModel({ settings, onUpdateSettings, jobs });

  return (
    <div className="settings-main">
      <div className="settings-content">
        {activeTab === 'general' && (
          <SettingsGeneralSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" onResetLayout={onResetLayout} />
        )}

        {activeTab === 'integrations' && (
          <div className="settings-grid">
            <SettingsAiSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" ai={aiUpdater} />
            <SettingsGithubSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" />
          </div>
        )}

        {activeTab === 'api' && <ApiMcpSettingsPanel />}

        {activeTab === 'security' && <SettingsSecuritySection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" />}

        {activeTab === 'run' && <SettingsRunSection />}

        {activeTab === 'system' && (
          <div className="settings-grid">
            <SettingsUpdatesSection settings={settings} onUpdateSettings={onUpdateSettings} variant="main" ai={aiUpdater} locale={locale} />
            <SettingsReleaseNotesCard releaseNotes={aiUpdater.updaterStatus?.releaseNotes} />
            <SettingsJobsSection jobs={sortedJobs} onClearJobs={onClearJobs} variant="main" locale={locale} />
          </div>
        )}
      </div>
    </div>
  );
};
