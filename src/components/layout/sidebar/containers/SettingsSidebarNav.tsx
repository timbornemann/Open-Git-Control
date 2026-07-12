import React from 'react';
import { useSettingsContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';

export const SettingsSidebarNav: React.FC = React.memo(() => {
  const settings = useSettingsContext();
  const { t, tr } = useI18n();
  const settingsTabs = [
    { id: 'general' as const, label: t('generated.components.layout.sidebar.containers.settingssidebarnav.general_c71a04d3') },
    { id: 'integrations' as const, label: t('generated.components.layout.sidebar.containers.settingssidebarnav.integrations_872375c4') },
    { id: 'api' as const, label: t('generated.components.layout.sidebar.containers.settingssidebarnav.api_mcp_923d6875') },
    { id: 'security' as const, label: t('generated.components.layout.sidebar.containers.settingssidebarnav.security_5d4ed0ec') },
    { id: 'run' as const, label: tr('Run', 'Run') },
    { id: 'system' as const, label: t('generated.components.layout.sidebar.containers.settingssidebarnav.system_b6f65d1b') },
  ];

  return (
    <div className="settings-sidebar-nav">
      {settingsTabs.map((tab) => (
        <button
          key={tab.id}
          className={`settings-sidebar-nav-btn ${settings.settingsTab === tab.id ? 'active' : ''}`}
          onClick={() => settings.onSelectSettingsTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
});

SettingsSidebarNav.displayName = 'SettingsSidebarNav';
