import React from 'react';
import type { AppSidebarProps } from './AppSidebar.types';
import { SettingsDiagnosticsSection } from '@/components/layout/settings/SettingsDiagnosticsSection';
import {
  SettingsAiSection,
  SettingsGeneralSection,
  SettingsGithubSection,
  SettingsFeedbackSection,
  SettingsJobsSection,
  SettingsSecuritySection,
  SettingsUpdatesSection,
} from '@/components/layout/settings/SettingsSections';
import { useSettingsPanelModel } from '@/components/layout/settings/useSettingsPanelModel';

type SettingsSidebarContentProps = Pick<AppSidebarProps, 'settings' | 'onUpdateSettings' | 'jobs' | 'onClearJobs'>;

export const SettingsSidebarContent: React.FC<SettingsSidebarContentProps> = ({ settings, onUpdateSettings, jobs, onClearJobs }) => {
  const { locale, sortedJobs, aiUpdater } = useSettingsPanelModel({ settings, onUpdateSettings, jobs });

  return (
    <div className="ssc-root">
      <SettingsGeneralSection settings={settings} onUpdateSettings={onUpdateSettings} variant="sidebar" />
      <SettingsSecuritySection settings={settings} onUpdateSettings={onUpdateSettings} variant="sidebar" />
      <SettingsGithubSection settings={settings} onUpdateSettings={onUpdateSettings} variant="sidebar" />
      <SettingsAiSection settings={settings} onUpdateSettings={onUpdateSettings} variant="sidebar" ai={aiUpdater} />
      <SettingsUpdatesSection settings={settings} onUpdateSettings={onUpdateSettings} variant="sidebar" ai={aiUpdater} locale={locale} />
      <SettingsFeedbackSection settings={settings} onUpdateSettings={onUpdateSettings} variant="sidebar" />
      <SettingsDiagnosticsSection />
      <SettingsJobsSection jobs={sortedJobs} onClearJobs={onClearJobs} variant="sidebar" locale={locale} />
    </div>
  );
};
