import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { AppSettingsDto } from '@/types/appDtos';
import type { SettingsUpdateResult } from '@/app/state/contracts';
import { getSettingsGroups, type SettingsGroupId } from './settingsNavigation';

export type SettingsLayoutVariant = 'main' | 'sidebar';
export type SettingsUpdateHandler = (partial: Partial<AppSettingsDto>) => Promise<SettingsUpdateResult | void>;

export type SettingsSectionProps = {
  settings: AppSettingsDto;
  onUpdateSettings: SettingsUpdateHandler;
  variant: SettingsLayoutVariant;
};

export const fieldClass = (variant: SettingsLayoutVariant, full = false) =>
  variant === 'sidebar' ? 'ssc-label' : `settings-field${full ? ' settings-field--full' : ''}`;

export const inputClass = (variant: SettingsLayoutVariant) => (variant === 'sidebar' ? 'ssc-input' : 'ui-field ui-field--sm');
export const actionRowClass = (variant: SettingsLayoutVariant) => (variant === 'sidebar' ? 'ssc-row' : 'settings-inline-actions');
export const hintClass = (variant: SettingsLayoutVariant, extra?: string) => [variant === 'sidebar' ? 'ssc-hint' : undefined, extra].filter(Boolean).join(' ');

export const SettingsSection = ({
  group,
  variant = 'main',
  children,
  actions,
}: {
  group: SettingsGroupId;
  variant?: SettingsLayoutVariant;
  children: ReactNode;
  actions?: ReactNode;
}) => {
  const { tr } = useI18n();
  const info = getSettingsGroups(tr).find((item) => item.id === group)!;
  return (
    <section className={variant === 'sidebar' ? 'ssc-section' : 'settings-section'} id={`settings-${group}`} aria-labelledby={`settings-${group}-title`}>
      <header className="settings-section-heading">
        <div>
          <h3 id={`settings-${group}-title`} tabIndex={-1}>
            {info.title}
          </h3>
          <p>{info.description}</p>
        </div>
        {actions && <div className="settings-inline-actions">{actions}</div>}
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
};

export const SettingsField = ({
  variant,
  label,
  description,
  children,
  multiline = false,
}: {
  variant: SettingsLayoutVariant;
  label: string;
  description?: string;
  children: ReactNode;
  multiline?: boolean;
}) => {
  return (
    <label className={`${fieldClass(variant)}${multiline ? ' settings-field--multiline' : ''}`}>
      <span className="settings-field-label">
        <span>{label}</span>
        {description && <small>{description}</small>}
      </span>
      <span className="settings-field-control">{children}</span>
    </label>
  );
};

export const SettingsDisclosure = ({ title, children }: { title: string; children: ReactNode }) => (
  <details className="settings-disclosure">
    <summary>
      <ChevronRight size={13} aria-hidden="true" />
      {title}
    </summary>
    <div className="settings-disclosure-content">{children}</div>
  </details>
);

export const SettingsSwitch = ({
  variant,
  checked,
  label,
  onChange,
  compact = false,
  description,
}: {
  variant: SettingsLayoutVariant;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  compact?: boolean;
  description?: string;
}) => {
  return (
    <label className={`settings-switch-row${variant === 'sidebar' || compact ? ' settings-switch-row--compact' : ''}`}>
      <span className="settings-switch-label">
        {label}
        {description && <small>{description}</small>}
      </span>
      <span className="settings-switch-control">
        <input className="settings-switch-input" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="settings-switch-track" aria-hidden="true">
          <span className="settings-switch-thumb" />
        </span>
      </span>
    </label>
  );
};
