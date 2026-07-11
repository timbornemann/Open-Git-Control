import { useCallback, useEffect, useState } from 'react';
import type { AppSettingsDto } from '@/types/appDtos';
import { translateFromCatalog, trByLanguage, type TranslationVariables } from '@/i18nCore';
import { appClient } from '@/services/appClient';
import { DEFAULT_SETTINGS } from './defaultSettings';

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

  const handleUpdateSettings = useCallback(
    async (partial: Partial<AppSettingsDto>) => {
      if (!appClient.isAvailable()) return;

      try {
        const next = await appClient.setSettings(partial);
        setSettings(next);
        setGitActionToast({ msg: t('generated.components.layout.useappstate.settings_saved_d81d1258'), isError: false });
      } catch (e: any) {
        setGitActionToast({ msg: e?.message || t('generated.components.layout.useappstate.could_not_save_settings_bc762a3b'), isError: true });
      }
    },
    [setGitActionToast, t],
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
    t,
    tr,
  };
};
