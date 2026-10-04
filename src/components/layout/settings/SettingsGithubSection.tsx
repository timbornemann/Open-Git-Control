import type { SettingsSectionProps } from './SettingsSectionPrimitives';
import { HostingConnections } from '@/components/hosting/HostingConnections';
import '@/components/hosting/hosting.css';

export const SettingsGithubSection = ({ variant }: SettingsSectionProps) => (
  <section className={variant === 'sidebar' ? 'ssc-section' : 'settings-card'}>
    <HostingConnections />
  </section>
);
