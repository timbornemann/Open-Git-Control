import { Bot, ChevronRight, Monitor, Server, ShieldCheck, Wrench } from 'lucide-react';
import type { SettingsTabId } from '@/app/state/contracts';
import { useI18n } from '@/i18n';
import { getSettingsCategories } from './settingsNavigation';

const categoryIcons = { general: Monitor, integrations: Server, api: Bot, security: ShieldCheck, system: Wrench };

export function SettingsCategoryNavigation({ activeTab, onSelectTab }: { activeTab: SettingsTabId; onSelectTab: (tab: SettingsTabId) => void }) {
  const { tr } = useI18n();
  return (
    <nav className="settings-sidebar-nav" aria-label={tr('Einstellungskategorien', 'Settings categories')}>
      {getSettingsCategories(tr).map((category) => {
        const Icon = categoryIcons[category.id];
        return (
          <button
            key={category.id}
            type="button"
            className={`settings-sidebar-nav-btn${category.id === activeTab ? ' active' : ''}`}
            aria-current={category.id === activeTab ? 'page' : undefined}
            onClick={() => onSelectTab(category.id)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>
              <strong>{category.label}</strong>
              <small>{category.description}</small>
            </span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        );
      })}
      <p className="settings-sidebar-hint">{tr('Diese Einstellungen gelten für die gesamte App.', 'These settings apply to the entire app.')}</p>
    </nav>
  );
}
