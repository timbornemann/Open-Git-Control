import { useCallback, useEffect, useState } from 'react';
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
  const [settings, setSettings] = useState<AppSettingsDto>(DEFAULT_SETTINGS);

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
    [setGitActionToast, t],
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
        setSettings(DEFAULT_SETTINGS);
      }
    };

    loadSettings();
  }, []);

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
