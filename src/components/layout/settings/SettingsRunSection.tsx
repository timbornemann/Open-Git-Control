import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Save, Trash2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepositoryContext, useWorkflowContext } from '@/contexts/AppStateContext';
import {
  REPOSITORY_RUN_ACTION_IDS,
  createEmptyRepositoryRunConfig,
  type RepositoryRunActionId,
  type RepositoryRunConfigDto,
  type RepositoryRunParser,
  type RepositoryRunPlatform,
  type RepositoryRunShell,
  type RepositoryRunStepDto,
  type RepositoryRunTemplateDto,
} from '@/types/repositoryRun';
import { repositoryRunClient } from '@/services/repositoryRunClient';
import { COMMON_REPOSITORY_RUN_TEMPLATES, applyRepositoryRunTemplate, type RepositoryRunCommandTemplate } from '@/utils/repositoryRunTemplates';
import '@/styles/repository-run-settings.css';

const ACTION_LABELS: Record<RepositoryRunActionId, string> = { run: 'Run', test: 'Test', format: 'Format', start: 'Start', build: 'Build' };
const PLATFORMS: Array<{ id: RepositoryRunPlatform; label: string; shells: RepositoryRunShell[] }> = [
  { id: 'windows', label: 'Windows', shells: ['powershell', 'cmd'] },
  { id: 'macos', label: 'macOS', shells: ['zsh'] },
  { id: 'linux', label: 'Linux', shells: ['bash'] },
];
const PARSERS: Array<{ value: RepositoryRunParser; label: string }> = [
  { value: 'none', label: 'Raw output' },
  { value: 'vitest-jest', label: 'Vitest / Jest' },
  { value: 'eslint', label: 'ESLint' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'prettier', label: 'Prettier' },
  { value: 'diagnostic', label: 'File : line : column' },
];
type TemplateOption = RepositoryRunTemplateDto | RepositoryRunCommandTemplate;

const createStep = (label: string): RepositoryRunStepDto => ({
  id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label,
  parser: 'none',
  windows: { shell: 'powershell', command: '' },
  macos: { shell: 'zsh', command: '' },
  linux: { shell: 'bash', command: '' },
});

export const SettingsRunSection: React.FC = () => {
  const { openRepos, activeRepo } = useRepositoryContext();
  const workflow = useWorkflowContext();
  const { tr } = useI18n();
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [config, setConfig] = useState<RepositoryRunConfigDto | null>(null);
  const [configRepositoryPath, setConfigRepositoryPath] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState('');
  const [templates, setTemplates] = useState<RepositoryRunTemplateDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const repositories = useMemo(() => Array.from(new Set(openRepos)), [openRepos]);
  const selectedRepoRef = useRef(selectedRepo);
  const loadRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);
  selectedRepoRef.current = selectedRepo;

  useEffect(() => {
    if (selectedRepo || !activeRepo) return;
    setSelectedRepo(activeRepo);
  }, [activeRepo, selectedRepo]);

  useEffect(() => {
    const repoPath = selectedRepo;
    const requestId = ++loadRequestIdRef.current;
    let cancelled = false;

    // A configuration draft must never be reused for a newly selected
    // repository while its own configuration is still loading.
    setConfig(null);
    setConfigRepositoryPath(null);
    setConfigPath('');
    setTemplates([]);
    setError(null);
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
          setError(result.error);
          return;
        }

        setConfigPath(result.data.configPath);
        setTemplates(result.data.templates);
        setConfig(result.data.config);
        setConfigRepositoryPath(repoPath);
        setError(result.data.error || null);
      } catch (loadError: unknown) {
        if (cancelled || loadRequestIdRef.current !== requestId || selectedRepoRef.current !== repoPath) return;
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRepo]);

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
          setError(result.error);
          return;
        }
        setConfig(result.data);
        setConfigRepositoryPath(repoPath);
        setError(null);
      }
      if (result.success) await workflow.onRefreshRunConfig();
    } catch (saveError: unknown) {
      if (saveRequestIdRef.current !== requestId || selectedRepoRef.current !== repoPath) return;
      setSaving(false);
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    }
  };

  if (!repositories.length)
    return (
      <section className="settings-card">
        <h3>{tr('Run-Konfiguration', 'Run configuration')}</h3>
        <p>{tr('Öffne zuerst ein lokales Repository.', 'Open a local repository first.')}</p>
      </section>
    );

  return (
    <section className="settings-card settings-card-full repository-run-settings">
      <div className="settings-card-header-row">
        <div>
          <h3>{tr('Run-Konfiguration', 'Run configuration')}</h3>
          <p className="settings-hint">{tr('Versionierte Befehle in .Open-Git-Control/run.json', 'Versioned commands in .Open-Git-Control/run.json')}</p>
        </div>
        <button className="staging-tool-btn" onClick={() => void save()} disabled={!config || configRepositoryPath !== selectedRepo || loading || saving}>
          <Save size={13} /> {saving ? tr('Speichern…', 'Saving…') : tr('Speichern', 'Save')}
        </button>
      </div>
      <label className="settings-field">
        <span>{tr('Repository', 'Repository')}</span>
        <select value={selectedRepo} onChange={(event) => setSelectedRepo(event.target.value)}>
          {repositories.map((repoPath) => (
            <option key={repoPath} value={repoPath}>
              {repoPath}
            </option>
          ))}
        </select>
      </label>
      {configPath && <p className="settings-hint repository-run-settings__path">{configPath}</p>}
      {error && <div className="settings-danger repository-run-settings__error">{error}</div>}
      {!config && !loading && (
        <button
          className="staging-tool-btn"
          onClick={() => {
            setConfig(createEmptyRepositoryRunConfig());
            setConfigRepositoryPath(selectedRepo);
            setError(null);
          }}
        >
          {tr('Neue Konfiguration erstellen', 'Create new configuration')}
        </button>
      )}
      {config &&
        REPOSITORY_RUN_ACTION_IDS.map((action) => (
          <ActionCard key={action} action={action} config={config} templates={templates} updateSteps={updateSteps} tr={tr} />
        ))}
    </section>
  );
};

const ActionCard: React.FC<{
  action: RepositoryRunActionId;
  config: RepositoryRunConfigDto;
  templates: Array<{ id: string; label: string; action: RepositoryRunActionId; step: Omit<RepositoryRunStepDto, 'id'> }>;
  updateSteps: (action: RepositoryRunActionId, update: (steps: RepositoryRunStepDto[]) => RepositoryRunStepDto[]) => void;
  tr: (de: string, en: string) => string;
}> = ({ action, config, templates, updateSteps, tr }) => {
  const [open, setOpen] = useState(false);
  const steps = config.actions[action].steps;
  const detectedTemplates = templates.filter((template) => template.action === action);
  const actionTemplates: TemplateOption[] = [...detectedTemplates, ...COMMON_REPOSITORY_RUN_TEMPLATES.filter((template) => template.action === action)];
  return (
    <div className="repository-run-settings__action">
      <button className="repository-run-settings__action-header" onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>{ACTION_LABELS[action]}</strong>
          <small>{steps.length ? tr(`${steps.length} Schritt(e)`, `${steps.length} step(s)`) : tr('Nicht konfiguriert', 'Not configured')}</small>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="repository-run-settings__action-body">
          <div className="repository-run-settings__templates">
            {detectedTemplates.map((template) => (
              <button
                key={template.id}
                className="staging-tool-btn"
                onClick={() => updateSteps(action, (entries) => [...entries, { ...template.step, id: `template-${Date.now()}-${template.id}` }])}
              >
                + {template.label}
              </button>
            ))}
            <button className="staging-tool-btn" onClick={() => updateSteps(action, (entries) => [...entries, createStep(ACTION_LABELS[action])])}>
              <Plus size={13} /> {tr('Schritt', 'Step')}
            </button>
          </div>
          {steps.map((step, index) => (
            <StepEditor
              key={step.id}
              step={step}
              index={index}
              onChange={(next) => updateSteps(action, (entries) => entries.map((entry) => (entry.id === step.id ? next : entry)))}
              onRemove={() => updateSteps(action, (entries) => entries.filter((entry) => entry.id !== step.id))}
              onMove={(delta) =>
                updateSteps(action, (entries) => {
                  const next = [...entries];
                  const target = index + delta;
                  if (target < 0 || target >= next.length) return entries;
                  [next[index], next[target]] = [next[target], next[index]];
                  return next;
                })
              }
              templates={actionTemplates}
              tr={tr}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const StepEditor: React.FC<{
  step: RepositoryRunStepDto;
  index: number;
  onChange: (step: RepositoryRunStepDto) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  templates: TemplateOption[];
  tr: (de: string, en: string) => string;
}> = ({ step, index, onChange, onRemove, onMove, templates, tr }) => (
  <article className="repository-run-settings__step">
    <div className="repository-run-settings__step-title">
      <strong>{index + 1}.</strong>
      <input value={step.label} onChange={(event) => onChange({ ...step, label: event.target.value })} aria-label={tr('Schrittname', 'Step name')} />
      <label className="repository-run-settings__select-label">
        <span>{tr('Befehlsvorlage', 'Command template')}</span>
        <select
          defaultValue=""
          onChange={(event) => {
            const template = templates.find((entry) => entry.id === event.target.value);
            if (template) onChange(applyRepositoryRunTemplate(step.id, template));
            event.currentTarget.value = '';
          }}
        >
          <option value="" disabled>
            {tr('Vorlage wählen…', 'Choose template…')}
          </option>
          {Array.from(
            new Set(templates.map((template) => ('group' in template ? template.group : tr('Für dieses Repository erkannt', 'Detected for this repository')))),
          ).map((group) => (
            <optgroup key={group} label={group}>
              {templates
                .filter((template) => ('group' in template ? template.group : tr('Für dieses Repository erkannt', 'Detected for this repository')) === group)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="repository-run-settings__select-label">
        <span>{tr('Ausgabe auswerten', 'Output parser')}</span>
        <select value={step.parser} onChange={(event) => onChange({ ...step, parser: event.target.value as RepositoryRunParser })}>
          {PARSERS.map((parser) => (
            <option key={parser.value} value={parser.value}>
              {parser.label}
            </option>
          ))}
        </select>
      </label>
      <button className="icon-btn" onClick={() => onMove(-1)} title={tr('Nach oben', 'Move up')}>
        ↑
      </button>
      <button className="icon-btn" onClick={() => onMove(1)} title={tr('Nach unten', 'Move down')}>
        ↓
      </button>
      <button className="icon-btn danger" onClick={onRemove} title={tr('Löschen', 'Delete')}>
        <Trash2 size={14} />
      </button>
    </div>
    <div className="repository-run-settings__platforms">
      {PLATFORMS.map((platform) => {
        const command = step[platform.id] || { shell: platform.shells[0], command: '' };
        return (
          <label key={platform.id}>
            <span>{platform.label}</span>
            <select
              value={command.shell}
              onChange={(event) => onChange({ ...step, [platform.id]: { ...command, shell: event.target.value as RepositoryRunShell } })}
            >
              {platform.shells.map((shell) => (
                <option key={shell} value={shell}>
                  {shell}
                </option>
              ))}
            </select>
            <textarea
              value={command.command}
              onChange={(event) => onChange({ ...step, [platform.id]: { ...command, command: event.target.value } })}
              placeholder={tr('Befehl', 'Command')}
              rows={2}
            />
          </label>
        );
      })}
    </div>
  </article>
);
