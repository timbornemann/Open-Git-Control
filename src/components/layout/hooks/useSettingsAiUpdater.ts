import { useEffect, useMemo, useState } from 'react';
import type { AppSettingsDto, UpdaterStatusDto } from '../../../global';

type TranslateFn = (deText: string, enText: string) => string;

type Params = {
  settings: AppSettingsDto;
  onUpdateSettings: (partial: Partial<AppSettingsDto>) => Promise<void>;
  tr: TranslateFn;
};

export const useSettingsAiUpdater = ({ settings, onUpdateSettings, tr }: Params) => {
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
    if (!updaterStatus) return tr('Lade Update-Status...', 'Loading updater status...');

    switch (updaterStatus.state) {
      case 'checking':
        return tr('Suche nach Updates...', 'Checking for updates...');
      case 'update-available':
        return tr('Update verfuegbar', 'Update available');
      case 'no-update':
        return tr('App ist aktuell', 'App is up to date');
      case 'downloading':
        return tr('Update wird heruntergeladen...', 'Downloading update...');
      case 'downloaded':
        return tr('Update bereit zur Installation', 'Update ready to install');
      case 'error':
        return tr('Update-Fehler', 'Updater error');
      case 'idle':
      default:
        return tr('Bereit', 'Ready');
    }
  }, [updaterStatus, tr]);

  const updaterSupported = Boolean(updaterStatus?.isSupported);
  const installedVersion = appVersion || updaterStatus?.currentVersion || tr('unbekannt', 'unknown');

  const oneClickUpdateLabel = useMemo(() => {
    if (isInstallingUpdate) return tr('Installiere Update...', 'Installing update...');
    if (isRunningUpdate || updaterStatus?.state === 'checking') return tr('Suche nach Updates...', 'Checking for updates...');
    if (updaterStatus?.state === 'downloading') return tr('Update wird heruntergeladen...', 'Downloading update...');
    if (updaterStatus?.state === 'downloaded') return tr('Update installieren', 'Install update');
    if (updaterStatus?.state === 'update-available') return tr('Update herunterladen', 'Download update');
    return tr('Nach Updates suchen', 'Check for updates');
  }, [isInstallingUpdate, isRunningUpdate, updaterStatus?.state, tr]);

  const oneClickUpdateDisabled =
    !updaterSupported
    || isRunningUpdate
    || isInstallingUpdate
    || updaterStatus?.state === 'checking'
    || updaterStatus?.state === 'downloading';

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
    if (!window.electronAPI) return;
    setIsTestingAi(true);
    setAiStatus(null);
    try {
      const result = await window.electronAPI.aiTestConnection();
      if (!result.success) {
        setAiStatus(tr(`Verbindung fehlgeschlagen: ${result.error}`, `Connection failed: ${result.error}`));
        return;
      }
      setAiStatus(tr(`Verbunden: ${result.data.provider} / ${result.data.model} (${result.data.detail})`, `Connected: ${result.data.provider} / ${result.data.model} (${result.data.detail})`));
    } catch (error: unknown) {
      setAiStatus(error instanceof Error ? error.message : tr('Verbindung fehlgeschlagen.', 'Connection failed.'));
    } finally {
      setIsTestingAi(false);
    }
  };

  const loadModels = async () => {
    if (!window.electronAPI) return;
    setIsLoadingModels(true);
    setAiStatus(null);
    try {
      const result = await window.electronAPI.aiListModels();
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
      setAiStatus(error instanceof Error ? error.message : tr('Modelle konnten nicht geladen werden.', 'Could not load models.'));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleRunOneClickUpdate = async () => {
    if (!window.electronAPI) return;

    if (updaterStatus?.state === 'downloaded') {
      setIsInstallingUpdate(true);
      setUpdaterMessage(null);
      try {
        const result = await window.electronAPI.installAppUpdate();
        if (!result.success) {
          setUpdaterMessage(result.error || tr('Update-Installation konnte nicht gestartet werden.', 'Could not start update installation.'));
          return;
        }
        setUpdaterMessage(tr('App wird fuer das Update neu gestartet...', 'Restarting app to install update...'));
      } catch (error: unknown) {
        setUpdaterMessage(error instanceof Error ? error.message : tr('Update-Installation konnte nicht gestartet werden.', 'Could not start update installation.'));
      } finally {
        setIsInstallingUpdate(false);
      }
      return;
    }

    setIsRunningUpdate(true);
    setUpdaterMessage(null);
    try {
      const result = await window.electronAPI.runOneClickAppUpdate();
      if (!result.success) {
        setUpdaterMessage(result.error || tr('Update konnte nicht gestartet werden.', 'Could not start update.'));
        return;
      }
      if (result.action === 'downloaded') {
        setUpdaterMessage(tr('Update heruntergeladen und bereit zur Installation.', 'Update downloaded and ready to install.'));
        return;
      }
      if (result.action === 'no-update') {
        setUpdaterMessage(tr('App ist bereits aktuell.', 'App is already up to date.'));
        return;
      }
      setUpdaterMessage(tr('Update-Pruefung abgeschlossen.', 'Update check completed.'));
    } catch (error: unknown) {
      setUpdaterMessage(error instanceof Error ? error.message : tr('Update konnte nicht gestartet werden.', 'Could not start update.'));
    } finally {
      setIsRunningUpdate(false);
    }
  };

  useEffect(() => {
    if (!window.electronAPI) return;
    let active = true;

    const bootstrapUpdater = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        if (active) setAppVersion(version);
      } catch {
        if (active) setUpdaterMessage(tr('App-Version konnte nicht geladen werden.', 'Could not load app version.'));
      }

      try {
        const status = await window.electronAPI.getUpdaterStatus();
        if (!active) return;
        setUpdaterStatus(status);
        if (status.currentVersion) setAppVersion((current) => current || status.currentVersion);
      } catch {
        if (!active) return;
        setUpdaterMessage((current) => current || tr('Update-Status konnte nicht geladen werden.', 'Could not load updater status.'));
      }
    };

    void bootstrapUpdater();

    const unsubscribe = window.electronAPI.onUpdaterEvent((status) => {
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
