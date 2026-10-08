import type { SettingsSectionProps } from './SettingsSectionPrimitives';
import { HostingConnections } from '@/components/hosting/HostingConnections';
import '@/components/hosting/hosting.css';

export const SettingsGithubSection = ({ variant }: SettingsSectionProps) => (
  <section id="settings-accounts" className={`${variant === 'sidebar' ? 'ssc-section' : 'settings-integrations'} hosting-settings`}>
    <HostingConnections headingId="settings-accounts-title" />
  </section>
);
