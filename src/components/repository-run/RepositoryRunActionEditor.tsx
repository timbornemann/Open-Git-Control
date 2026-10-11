import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type {
  RepositoryRunActionId,
  RepositoryRunConfigDto,
  RepositoryRunParser,
  RepositoryRunPlatform,
  RepositoryRunShell,
  RepositoryRunStepDto,
  RepositoryRunTemplateDto,
} from '@/types/repositoryRun';
import { COMMON_REPOSITORY_RUN_TEMPLATES, applyRepositoryRunTemplate, type RepositoryRunCommandTemplate } from '@/utils/repositoryRunTemplates';
import type { RepositoryRunPrerequisitesDto } from '@/shared/repositoryRunPrerequisites';
import { RunPrerequisiteHint } from './RunPrerequisites';

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

export const RepositoryRunActionEditor: React.FC<{
  action: RepositoryRunActionId;
  config: RepositoryRunConfigDto;
  templates: Array<{ id: string; label: string; action: RepositoryRunActionId; step: Omit<RepositoryRunStepDto, 'id'> }>;
  report?: RepositoryRunPrerequisitesDto;
  updateSteps: (action: RepositoryRunActionId, update: (steps: RepositoryRunStepDto[]) => RepositoryRunStepDto[]) => void;
  tr: (de: string, en: string) => string;
}> = ({ action, config, templates, report, updateSteps, tr }) => {
  const [open, setOpen] = useState(false);
  const steps = config.actions[action].steps;
  const detectedTemplates = templates.filter((template) => template.action === action);
  const actionTemplates: TemplateOption[] = [...detectedTemplates, ...COMMON_REPOSITORY_RUN_TEMPLATES.filter((template) => template.action === action)];
  return (
    <div className="repository-run-settings__action">
      <button className="repository-run-settings__action-header" onClick={() => setOpen((value) => !value)}>
        <span>
          <strong>{ACTION_LABELS[action]}</strong>
          <RunPrerequisiteHint steps={steps} report={report} />
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
                <RunPrerequisiteHint steps={[template.step]} report={report} />
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
              report={report}
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
  report?: RepositoryRunPrerequisitesDto;
  tr: (de: string, en: string) => string;
}> = ({ step, index, onChange, onRemove, onMove, templates, report, tr }) => (
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
    <RunPrerequisiteHint steps={[step]} report={report} />
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
