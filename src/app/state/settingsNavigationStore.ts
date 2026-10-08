import { create } from 'zustand';
import type { SettingsTabId } from './contracts';

export type SettingsDestination = { id: 'accounts' | 'ai-provider' | 'ai-automation' | 'tools'; tab: SettingsTabId };
export const useSettingsNavigation = create<{ destination: SettingsDestination | null }>(() => ({ destination: null }));
export const requestSettingsDestination = (destination: SettingsDestination) => useSettingsNavigation.setState({ destination });
export const clearSettingsDestination = (destination: SettingsDestination) => {
  if (useSettingsNavigation.getState().destination === destination) useSettingsNavigation.setState({ destination: null });
};
