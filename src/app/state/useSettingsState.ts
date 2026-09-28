import { useCachedResult } from '@/data/resourceHooks';
import { resourceKey } from '@/data/clientCache';
import { updateResource } from '@/data/queryClient';
import { useCallback, useEffect } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { translateFromCatalog, trByLanguage, type TranslationVariables } from '@/i18nCore';
import { appClient } from '@/services/appClient';
import { DEFAULT_SETTINGS } from './defaultSettings';
import type { SettingsUpdateResult } from './contracts';

type Toast = { msg: string; isError: boolean };

type UseSettingsStateParams = {
  setGitActionToast: (toast: Toast) => void;
};

export const useSettingsState = ({ setGitActionToast }: UseSettingsStateParams) => {
  const cached = useCachedResult<AppSettingsDto>(resourceKey('app', 'getSettings'));
  const settings = cached.data || DEFAULT_SETTINGS;
  const setSettings = useCallback((value: AppSettingsDto) => updateResource(resourceKey('app', 'getSettings'), value), []);

  const tr = useCallback(
    (deText: string, enText: string) => {
      return trByLanguage(settings.language, deText, enText);
    },
    [settings.language],
  );

  const t = useCallback((key: string, variables?: TranslationVariables) => translateFromCatalog(settings.language, key, variables), [settings.language]);

  const updateSettingsWithResult = useCallback(
    async (partial: Partial<AppSettingsDto>): Promise<SettingsUpdateResult> => {
      if (!appClient.isAvailable()) {
        const error = t('generated.components.layout.useappstate.could_not_save_settings_bc762a3b');
        setGitActionToast({ msg: error, isError: true });
        return { success: false, error };
      }

      try {
        const next = await appClient.setSettings(partial);
        setSettings(next);
        setGitActionToast({ msg: t('generated.components.layout.useappstate.settings_saved_d81d1258'), isError: false });
        return { success: true, settings: next };
      } catch (e: any) {
        const error = e?.message || t('generated.components.layout.useappstate.could_not_save_settings_bc762a3b');
        setGitActionToast({ msg: error, isError: true });
        return { success: false, error };
      }
    },
    [setGitActionToast, t, setSettings],
  );

  const handleUpdateSettings = useCallback(
    async (partial: Partial<AppSettingsDto>): Promise<void> => {
      await updateSettingsWithResult(partial);
    },
    [updateSettingsWithResult],
  );

  useEffect(() => {
    const loadSettings = async () => {
      if (!appClient.isAvailable()) return;
      try {
        const loaded = await appClient.getSettings();
        setSettings(loaded);
      } catch {
        // Keep already restored settings when a background read fails.
      }
    };

    loadSettings();
  }, [setSettings]);

  useEffect(() => {
    document.body.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  return {
    settings,
    handleUpdateSettings,
    updateSettingsWithResult,
    t,
    tr,
  };
};
