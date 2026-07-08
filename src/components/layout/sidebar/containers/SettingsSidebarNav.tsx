import React from 'react';
import { useSettingsContext } from '../../../../contexts/AppStateContext';
import { useI18n } from '../../../../i18n';

export const SettingsSidebarNav: React.FC = React.memo(() => {
  const settings = useSettingsContext();
  const { tr } = useI18n();
  const settingsTabs = [
    { id: 'general' as const, label: tr('Allgemein', 'General') },
    { id: 'integrations' as const, label: tr('Integrationen', 'Integrations') },
    { id: 'api' as const, label: tr('API & MCP', 'API & MCP') },
    { id: 'security' as const, label: tr('Sicherheit', 'Security') },
    { id: 'system' as const, label: tr('System', 'System') },
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
