import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey } from '@/data/clientCache';
import type { AppSettingsDto } from '@/types/appDtos';
import { EMPTY_SHORTCUT_OVERRIDES } from '@/shared/keyboardShortcuts';

/** Subscribe to confirmed settings without creating another settings loader. */
export function useKeyboardShortcuts() {
  const settings = useCachedResult<AppSettingsDto>(resourceKey('app', 'getSettings'));
  return settings.data?.keyboardShortcuts ?? EMPTY_SHORTCUT_OVERRIDES;
}
