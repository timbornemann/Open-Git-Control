import { SettingsSection } from './SettingsSectionPrimitives';
import { SystemToolsList } from '@/components/system-tools/SystemToolsList';

export function SettingsToolsSection() {
  return (
    <SettingsSection group="tools">
      <SystemToolsList />
    </SettingsSection>
  );
}
