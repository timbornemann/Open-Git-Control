import { useEffect, useMemo, useState } from 'react';
import type { AppSettingsDto, UpdaterStatusDto } from '@/global';
import type { TranslationVariables } from '@/i18n';
import { aiClient } from '@/services/aiClient';
import { appClient } from '@/services/appClient';

type TranslateFn = (deText: string, enText: string) => string;
type CatalogTranslateFn = (key: string, variables?: TranslationVariables) => string;

type Params = {
  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  t: CatalogTranslateFn;
  tr: TranslateFn;
};

export const useSettingsAiUpdater = ({ settings, onUpdateSettings, t, tr }: Params) => {
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [geminiApiKeyInput, setGeminiApiKeyInput] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatusDto | null>(null);
  const [updaterMessage, setUpdaterMessage] = useState<string | null>(null);
  const [isRunningUpdate, setIsRunningUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

  const selectedModel = settings.aiProvider === 'gemini' ? settings.geminiModel : settings.ollamaModel;

  const mergedModelOptions = useMemo(() => {
    const values = [...modelOptions, selectedModel].filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b));
  }, [modelOptions, selectedModel]);

  const updaterStatusLabel = useMemo(() => {
    if (!updaterStatus) return t('generated.components.layout.hooks.usesettingsaiupdater.loading_updater_status_6a392297');

    switch (updaterStatus.state) {
      case 'checking':
        return t('generated.components.layout.hooks.usesettingsaiupdater.checking_for_updates_67d1a534');
      case 'update-available':
        return t('generated.components.layout.hooks.usesettingsaiupdater.update_available_7d5009e4');
      case 'no-update':
        return t('generated.components.layout.hooks.usesettingsaiupdater.app_is_up_to_date_a8f83489');
      case 'downloading':
        return t('generated.components.layout.hooks.usesettingsaiupdater.downloading_update_b2499c0b');
      case 'downloaded':
        return t('generated.components.layout.hooks.usesettingsaiupdater.update_ready_to_install_adfcba43');
      case 'error':
        return t('generated.components.layout.hooks.usesettingsaiupdater.updater_error_36334f65');
      case 'idle':
      default:
        return t('generated.components.layout.hooks.usesettingsaiupdater.ready_544f4b02');
    }
  }, [updaterStatus, tr]);

  const updaterSupported = Boolean(updaterStatus?.isSupported);
  const installedVersion = appVersion || updaterStatus?.currentVersion || t('generated.components.layout.hooks.usesettingsaiupdater.unknown_3f835544');

  const oneClickUpdateLabel = useMemo(() => {
    if (isInstallingUpdate) return t('generated.components.layout.hooks.usesettingsaiupdater.installing_update_b4260e49');
    if (isRunningUpdate || updaterStatus?.state === 'checking')
      return t('generated.components.layout.hooks.usesettingsaiupdater.checking_for_updates_67d1a534');
    if (updaterStatus?.state === 'downloading') return t('generated.components.layout.hooks.usesettingsaiupdater.downloading_update_b2499c0b');
    if (updaterStatus?.state === 'downloaded') return t('generated.components.layout.hooks.usesettingsaiupdater.install_update_f3aa2988');
    if (updaterStatus?.state === 'update-available') return t('generated.components.layout.hooks.usesettingsaiupdater.download_update_8917c04f');
    return t('generated.components.layout.hooks.usesettingsaiupdater.check_for_updates_a131e2c5');
  }, [isInstallingUpdate, isRunningUpdate, updaterStatus?.state, tr]);

  const oneClickUpdateDisabled =
    !updaterSupported || isRunningUpdate || isInstallingUpdate || updaterStatus?.state === 'checking' || updaterStatus?.state === 'downloading';

  const setSelectedModel = async (model: string) => {
    if (settings.aiProvider === 'gemini') {
      await onUpdateSettings({ geminiModel: model });
      return;
    }
    await onUpdateSettings({ ollamaModel: model });
  };

  const formatBytes = (bytes: number | null): string => {
    if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const testConnection = async () => {
    if (!aiClient.isAvailable()) return;
    setIsTestingAi(true);
    setAiStatus(null);
    try {
      const result = await aiClient.testConnection();
      if (!result.success) {
        setAiStatus(tr(`Verbindung fehlgeschlagen: ${result.error}`, `Connection failed: ${result.error}`));
        return;
      }
      setAiStatus(
        tr(
          `Verbunden: ${result.data.provider} / ${result.data.model} (${result.data.detail})`,
          `Connected: ${result.data.provider} / ${result.data.model} (${result.data.detail})`,
        ),
      );
    } catch (error: unknown) {
      setAiStatus(error instanceof Error ? error.message : t('generated.components.layout.hooks.usesettingsaiupdater.connection_failed_8780a183'));
    } finally {
      setIsTestingAi(false);
    }
  };

  const loadModels = async () => {
    if (!aiClient.isAvailable()) return;
    setIsLoadingModels(true);
    setAiStatus(null);
    try {
      const result = await aiClient.listModels();
      if (!result.success) {
        setAiStatus(tr(`Modelle konnten nicht geladen werden: ${result.error}`, `Could not load models: ${result.error}`));
        return;
      }
      setModelOptions(result.data);
      if (!selectedModel && result.data.length > 0) {
        await setSelectedModel(result.data[0]);
      }
      setAiStatus(tr(`${result.data.length} Modell(e) geladen.`, `${result.data.length} model(s) loaded.`));
    } catch (error: unknown) {
      setAiStatus(error instanceof Error ? error.message : t('generated.components.layout.hooks.usesettingsaiupdater.could_not_load_models_c6582ed1'));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleRunOneClickUpdate = async () => {
    if (!appClient.isAvailable()) return;

    if (updaterStatus?.state === 'downloaded') {
      setIsInstallingUpdate(true);
      setUpdaterMessage(null);
      try {
        const result = await appClient.installAppUpdate();
        if (!result.success) {
          setUpdaterMessage(result.error || t('generated.components.layout.hooks.usesettingsaiupdater.could_not_start_update_installation_21a3223d'));
          return;
        }
        setUpdaterMessage(t('generated.components.layout.hooks.usesettingsaiupdater.restarting_app_to_install_update_f142b007'));
      } catch (error: unknown) {
        setUpdaterMessage(
          error instanceof Error ? error.message : t('generated.components.layout.hooks.usesettingsaiupdater.could_not_start_update_installation_21a3223d'),
        );
      } finally {
        setIsInstallingUpdate(false);
      }
      return;
    }

    setIsRunningUpdate(true);
    setUpdaterMessage(null);
    try {
      const result = await appClient.runOneClickAppUpdate();
      if (!result.success) {
        setUpdaterMessage(result.error || t('generated.components.layout.hooks.usesettingsaiupdater.could_not_start_update_cc36018f'));
        return;
      }
      if (result.action === 'downloaded') {
        setUpdaterMessage(t('generated.components.layout.hooks.usesettingsaiupdater.update_downloaded_and_ready_to_install_06156b66'));
        return;
      }
      if (result.action === 'no-update') {
        setUpdaterMessage(t('generated.components.layout.hooks.usesettingsaiupdater.app_is_already_up_to_date_0f3d23f1'));
        return;
      }
      setUpdaterMessage(t('generated.components.layout.hooks.usesettingsaiupdater.update_check_completed_bde0b1e8'));
    } catch (error: unknown) {
      setUpdaterMessage(error instanceof Error ? error.message : t('generated.components.layout.hooks.usesettingsaiupdater.could_not_start_update_cc36018f'));
    } finally {
      setIsRunningUpdate(false);
    }
  };

  useEffect(() => {
    if (!appClient.isAvailable()) return;
    let active = true;

    const bootstrapUpdater = async () => {
      try {
        const version = await appClient.getAppVersion();
        if (active) setAppVersion(version);
      } catch {
        if (active) setUpdaterMessage(t('generated.components.layout.hooks.usesettingsaiupdater.could_not_load_app_version_417cc507'));
      }

      try {
        const status = await appClient.getUpdaterStatus();
        if (!active) return;
        setUpdaterStatus(status);
        if (status.currentVersion) setAppVersion((current) => current || status.currentVersion);
      } catch {
        if (!active) return;
        setUpdaterMessage((current) => current || t('generated.components.layout.hooks.usesettingsaiupdater.could_not_load_updater_status_2df70231'));
      }
    };

    void bootstrapUpdater();

    const unsubscribe = appClient.onUpdaterEvent((status) => {
      if (!active) return;
      setUpdaterStatus(status);
      if (status.currentVersion) setAppVersion((current) => current || status.currentVersion);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [tr]);

  return {
    isTestingAi,
    isLoadingModels,
    aiStatus,
    modelOptions,
    geminiApiKeyInput,
    setGeminiApiKeyInput,
    appVersion,
    updaterStatus,
    updaterMessage,
    isRunningUpdate,
    selectedModel,
    mergedModelOptions,
    updaterStatusLabel,
    updaterSupported,
    installedVersion,
    oneClickUpdateLabel,
    oneClickUpdateDisabled,
    setSelectedModel,
    formatBytes,
    testConnection,
    loadModels,
    handleRunOneClickUpdate,
  };
};
