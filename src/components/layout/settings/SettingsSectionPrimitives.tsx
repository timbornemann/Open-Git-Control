import type { AppSettingsDto } from '@/types/appDtos';
import type { SettingsUpdateResult } from '@/app/state/contracts';

export type SettingsLayoutVariant = 'main' | 'sidebar';
export type SettingsUpdateHandler = (partial: Partial<AppSettingsDto>) => Promise<SettingsUpdateResult | void>;

export type SettingsSectionProps = {
  settings: AppSettingsDto;
  onUpdateSettings: SettingsUpdateHandler;
  variant: SettingsLayoutVariant;
};

export const fieldClass = (variant: SettingsLayoutVariant, full = false) =>
  variant === 'sidebar' ? 'ssc-label' : `settings-field${full ? ' settings-field--full' : ''}`;

export const inputClass = (variant: SettingsLayoutVariant) => (variant === 'sidebar' ? 'ssc-input' : undefined);
export const actionRowClass = (variant: SettingsLayoutVariant) => (variant === 'sidebar' ? 'ssc-row' : 'settings-inline-actions');
export const hintClass = (variant: SettingsLayoutVariant, extra?: string) => [variant === 'sidebar' ? 'ssc-hint' : undefined, extra].filter(Boolean).join(' ');

export const SettingsSwitch = ({
  variant,
  checked,
  label,
  onChange,
  compact = false,
}: {
  variant: SettingsLayoutVariant;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  compact?: boolean;
}) => {
  if (variant === 'sidebar' && !compact) {
    return (
      <label className="ssc-label-inline">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    );
  }

  return (
    <label
      className={`settings-switch-row${variant === 'main' ? '' : ' settings-switch-row--compact'}${
        variant === 'main' ? ' settings-general-switch settings-field--full' : ''
      }`}
    >
      <input className="settings-switch-input" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="settings-switch-track" aria-hidden="true">
        <span className="settings-switch-thumb" />
      </span>
      <span className="settings-switch-label">{label}</span>
    </label>
  );
};
