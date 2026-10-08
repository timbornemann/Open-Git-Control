import { useOptionalSettingsContext, useOptionalUIContext } from '@/contexts/AppStateContext';
import { requestSettingsDestination, type SettingsDestination } from '@/app/state/settingsNavigationStore';

export function useOpenSettingsGroup() {
  const ui = useOptionalUIContext();
  const settings = useOptionalSettingsContext();
  return ui && settings
    ? (destination: SettingsDestination) => {
        requestSettingsDestination(destination);
        settings.onSelectSettingsTab(destination.tab);
        // Use the normal navigation path, including the unsaved-editor guard.
        ui.setActiveTab('settings');
      }
    : undefined;
}
