import type { AppSettingsDto } from '@/global';

export const THEME_OPTIONS: Array<{
  value: AppSettingsDto['theme'];
  label: string;
}> = [
  { value: 'copper-night', label: 'Copper Night' },
  { value: 'midnight-teal', label: 'Midnight Teal' },
  { value: 'graphite-blue', label: 'Graphite Blue' },
  { value: 'forest-copper', label: 'Forest Copper' },
  { value: 'porcelain-light', label: 'Porcelain Light' },
  { value: 'ember-slate', label: 'Ember Slate' },
  { value: 'arctic-mint', label: 'Arctic Mint' },
  { value: 'mono-dark-red', label: 'Mono Dark Red' },
  { value: 'mono-light-red', label: 'Mono Light Red' },
  { value: 'mono-dark-green', label: 'Mono Dark Green' },
  { value: 'mono-light-green', label: 'Mono Light Green' },
];
