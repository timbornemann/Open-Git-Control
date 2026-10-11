import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Save } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepositoryContext, useWorkflowContext } from '@/contexts/AppStateContext';
import {
  REPOSITORY_RUN_ACTION_IDS,
  createEmptyRepositoryRunConfig,
  type RepositoryRunActionId,
  type RepositoryRunConfigDto,
  type RepositoryRunStepDto,
  type RepositoryRunTemplateDto,
} from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { copyTextToClipboard } from '@/utils/clipboard';
import { buildRepositoryRunAgentPrompt } from '@/utils/repositoryRunAgentPrompt';
import { RepositoryRunActionEditor } from './RepositoryRunActionEditor';
import { RunPrerequisites } from './RunPrerequisites';
import { useRunPrerequisiteChecks } from './useRunPrerequisiteChecks';
import type { RepositoryRunPrerequisitesDto } from '@/shared/repositoryRunPrerequisites';
import '@/styles/repository-run-settings.css';

type StoredRunConfigDraft = {
  config: RepositoryRunConfigDto;
  persistedConfig: RepositoryRunConfigDto | null;
};

const RUN_CONFIG_DRAFT_KEY_PREFIX = 'open-git-control:run-config-draft:';
const runConfigDraftKey = (repoPath: string): string => `${RUN_CONFIG_DRAFT_KEY_PREFIX}${encodeURIComponent(repoPath)}`;

const readRunConfigDraft = (repoPath: string): StoredRunConfigDraft | null => {
  try {
    const raw = window.sessionStorage.getItem(runConfigDraftKey(repoPath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredRunConfigDraft>;
    return parsed?.config?.version === 1
      ? { config: parsed.config, persistedConfig: parsed.persistedConfig?.version === 1 ? parsed.persistedConfig : null }
      : null;
  } catch {
    return null;
  }
};

const writeRunConfigDraft = (repoPath: string, draft: StoredRunConfigDraft): void => {
  try {
    window.sessionStorage.setItem(runConfigDraftKey(repoPath), JSON.stringify(draft));
  } catch {
    // A full or unavailable session store must not make the editor unusable.
  }
};

const clearRunConfigDraft = (repoPath: string): void => {
  try {
    window.sessionStorage.removeItem(runConfigDraftKey(repoPath));
  } catch {
    // Ignore unavailable session storage; the in-memory draft remains intact.
  }
};

export const RepositoryRunConfigView: React.FC = () => {
  const { activeRepo: selectedRepo, onToast } = useRepositoryContext();
  const workflow = useWorkflowContext();
  const { language, tr } = useI18n();
  const [config, setConfig] = useState<RepositoryRunConfigDto | null>(null);
  const [persistedConfig, setPersistedConfig] = useState<RepositoryRunConfigDto | null>(null);
  const [configRepositoryPath, setConfigRepositoryPath] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState('');
  const [initialPrerequisites, setInitialPrerequisites] = useState<RepositoryRunPrerequisitesDto>();
  const [templates, setTemplates] = useState<RepositoryRunTemplateDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copyingAgentPrompt, setCopyingAgentPrompt] = useState(false);
  const prerequisites = useRunPrerequisiteChecks(selectedRepo, config, templates, initialPrerequisites);
  const configIsDirty = useMemo(() => config !== null && JSON.stringify(config) !== JSON.stringify(persistedConfig), [config, persistedConfig]);
  const selectedRepoRef = useRef(selectedRepo);
  const loadRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  selectedRepoRef.current = selectedRepo;

  useEffect(() => {
    const repoPath = selectedRepo;
    const requestId = ++loadRequestIdRef.current;
    let cancelled = false;

    // A configuration draft must never be reused for a newly selected
    // repository while its own configuration is still loading.
    setConfig(null);
    setPersistedConfig(null);
    setConfigRepositoryPath(null);
    setConfigPath('');
    setTemplates([]);
    setInitialPrerequisites(undefined);
    setLoadError(null);
    setSaving(false);

    if (!repoPath || !repositoryRunClient.isAvailable()) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const result = await repositoryRunClient.getConfig(repoPath);
        if (cancelled || loadRequestIdRef.current !== requestId || selectedRepoRef.current !== repoPath) return;

        setLoading(false);
        if (!result.success) {
          setLoadError(result.error);
          return;
        }

        const savedDraft = readRunConfigDraft(repoPath);
        setConfigPath(result.data.configPath);
        setTemplates(result.data.templates);
        setInitialPrerequisites(result.data.prerequisites);
        setConfig(savedDraft?.config || result.data.config);
        setPersistedConfig(savedDraft ? savedDraft.persistedConfig : result.data.config);
        setConfigRepositoryPath(repoPath);
        setLoadError(result.data.error || null);
      } catch (loadError: unknown) {
        if (cancelled || loadRequestIdRef.current !== requestId || selectedRepoRef.current !== repoPath) return;
        setLoading(false);
        setLoadError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRepo]);

  useEffect(() => {
    if (!selectedRepo || configRepositoryPath !== selectedRepo || !config) return;
    if (configIsDirty) {
      writeRunConfigDraft(selectedRepo, { config, persistedConfig });
    } else {
      clearRunConfigDraft(selectedRepo);
    }
  }, [config, configIsDirty, configRepositoryPath, persistedConfig, selectedRepo]);

  const updateSteps = (action: RepositoryRunActionId, update: (steps: RepositoryRunStepDto[]) => RepositoryRunStepDto[]) => {
    setConfig((previous) => {
      if (!previous) return previous;
      return { ...previous, actions: { ...previous.actions, [action]: { steps: update(previous.actions[action].steps) } } };
    });
  };

  const save = async () => {
    if (!selectedRepo || !config || configRepositoryPath !== selectedRepo || loading) return;
    const repoPath = selectedRepo;
    const configToSave = config;
    const requestId = ++saveRequestIdRef.current;
    setSaving(true);
    try {
      const result = await repositoryRunClient.saveConfig(repoPath, configToSave);
      if (saveRequestIdRef.current === requestId && selectedRepoRef.current === repoPath) {
        setSaving(false);
        if (!result.success) {
          onToast(result.error, true);
          return;
        }
        setConfig(result.data);
        setPersistedConfig(result.data);
        clearRunConfigDraft(repoPath);
        setConfigRepositoryPath(repoPath);
        setLoadError(null);
        onToast(tr('Run-Konfiguration gespeichert.', 'Run configuration saved.'), false);
      }
      if (result.success) await workflow.onRefreshRunConfig();
    } catch (saveError: unknown) {
      if (saveRequestIdRef.current !== requestId || selectedRepoRef.current !== repoPath) return;
      setSaving(false);
      onToast(saveError instanceof Error ? saveError.message : String(saveError), true);
    }
  };

  const copyAgentPrompt = async () => {
    if (!selectedRepo || copyingAgentPrompt) return;
    setCopyingAgentPrompt(true);
    try {
      const copied = await copyTextToClipboard(buildRepositoryRunAgentPrompt({ language, repositoryPath: selectedRepo }));
      onToast(
        copied
          ? tr('KI-Agent-Prompt kopiert.', 'AI agent prompt copied.')
          : tr('KI-Agent-Prompt konnte nicht kopiert werden.', 'Could not copy AI agent prompt.'),
        !copied,
      );
    } catch (copyError: unknown) {
      onToast(copyError instanceof Error ? copyError.message : tr('KI-Agent-Prompt konnte nicht kopiert werden.', 'Could not copy AI agent prompt.'), true);
    } finally {
      setCopyingAgentPrompt(false);
    }
  };

  if (!selectedRepo)
    return (
      <section className="repository-run-config-view repository-run-config-view--empty">
        <p>{tr('Öffne zuerst ein lokales Repository.', 'Open a local repository first.')}</p>
      </section>
    );

  return (
    <section className="settings-card settings-card-full repository-run-settings repository-run-config-view">
      <div className="settings-card-header-row">
        <div>
          <span className="repository-run-config-view__eyebrow">REPOSITORY / RUN</span>
          <h3 title={selectedRepo}>{selectedRepo.split(/[\\/]/).pop()}</h3>
          <p className="settings-hint">{tr('Versionierte Befehle in .Open-Git-Control/run.json', 'Versioned commands in .Open-Git-Control/run.json')}</p>
        </div>
        <div className="settings-inline-actions">
          <button className="staging-tool-btn" onClick={() => void copyAgentPrompt()} disabled={!selectedRepo || copyingAgentPrompt}>
            <Copy size={13} /> {copyingAgentPrompt ? tr('Kopiere...', 'Copying...') : tr('KI-Agent-Prompt kopieren', 'Copy AI agent prompt')}
          </button>
          <button className="staging-tool-btn" onClick={() => void save()} disabled={!config || configRepositoryPath !== selectedRepo || loading || saving}>
            <Save size={13} /> {saving ? tr('Speichern…', 'Saving…') : tr('Speichern', 'Save')}
          </button>
        </div>
      </div>
      <p className="repository-run-config-view__repo-path" title={selectedRepo}>
        {selectedRepo}
      </p>
      {configIsDirty && <p className="settings-hint repository-run-settings__dirty">{tr('Ungespeicherte Aenderungen', 'Unsaved changes')}</p>}
      {configPath && <p className="settings-hint repository-run-settings__path">{configPath}</p>}
      {loadError && <div className="settings-danger repository-run-settings__error">{loadError}</div>}
      {!config && !loading && (
        <button
          className="staging-tool-btn"
          onClick={() => {
            setConfig(createEmptyRepositoryRunConfig());
            setPersistedConfig(null);
            setConfigRepositoryPath(selectedRepo);
            setLoadError(null);
          }}
        >
          {tr('Neue Konfiguration erstellen', 'Create new configuration')}
        </button>
      )}
      {config && <RunPrerequisites {...prerequisites} onRecheck={prerequisites.recheck} />}
      {config &&
        REPOSITORY_RUN_ACTION_IDS.map((action) => (
          <RepositoryRunActionEditor
            key={action}
            report={prerequisites.report}
            action={action}
            config={config}
            templates={templates}
            updateSteps={updateSteps}
            tr={tr}
          />
        ))}
    </section>
  );
};
