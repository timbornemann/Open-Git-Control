import React from 'react';
import { useSettingsContext } from '@/contexts/AppStateContext';
import { SettingsCategoryNavigation } from '@/components/layout/settings/SettingsCategoryNavigation';

export const SettingsSidebarNav: React.FC = React.memo(() => {
  const settings = useSettingsContext();
  return <SettingsCategoryNavigation activeTab={settings.settingsTab} onSelectTab={settings.onSelectSettingsTab} />;
});

SettingsSidebarNav.displayName = 'SettingsSidebarNav';
