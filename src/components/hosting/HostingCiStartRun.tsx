import { useId, useRef, useState } from 'react';
import { ChevronRight, Loader2, Play, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepository } from '@/types/hostingDtos';
import { hostedRepositoryKey } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingCiWorkflowField } from './HostingCiWorkflowField';

export function HostingCiStartRun({
  id,
  repository,
  defaultRef,
  repoPath,
  onClose,
  onStarted,
}: {
  id: string;
  repository: HostedRepository;
  defaultRef: string;
  repoPath?: string | null;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { tr } = useI18n();
  const task = useHostingTask(hostedRepositoryKey(repository));
  const fieldsId = useId();
  const pending = useRef(false);
  const [workflow, setWorkflow] = useState('');
  const [ref, setRef] = useState(defaultRef);
  const [inputs, setInputs] = useState('{}');
  return (
    <section className="hosting-ci-start" id={id} aria-labelledby={`${fieldsId}-title`}>
      <header className="hosting-ci-start__heading">
        <Play size={14} aria-hidden="true" />
        <h3 id={`${fieldsId}-title`}>{tr('Manueller Lauf', 'Manual run')}</h3>
        <span>{repository.fullName}</span>
      </header>
      <form
        className="hosting-ci-start__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending.current) return;
          pending.current = true;
          void task
            .run(async () => {
              if (!ref.trim()) throw new Error(tr('Bitte einen Branch oder Tag angeben.', 'Enter a branch or tag.'));
              let parsed: unknown;
              try {
                parsed = inputs.trim() ? JSON.parse(inputs) : {};
              } catch {
                throw new Error(tr('Inputs müssen ein gültiges JSON-Objekt mit Textwerten sein.', 'Inputs must be a valid JSON object with string values.'));
              }
              if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some((value) => typeof value !== 'string'))
                throw new Error(tr('Inputs müssen ein JSON-Objekt mit Textwerten sein.', 'Inputs must be a JSON object with string values.'));
              return hostingClient.request('dispatch', {
                repository: repository.ref,
                workflow: workflow.trim(),
                ref: ref.trim(),
                inputs: parsed as Record<string, string>,
              });
            }, onStarted)
            .finally(() => {
              pending.current = false;
            });
        }}
      >
        <div className="hosting-ci-start__fields">
          <HostingCiWorkflowField
            id={`${fieldsId}-workflow`}
            repository={repository}
            repoPath={repoPath}
            value={workflow}
            onChange={setWorkflow}
            disabled={task.busy}
          />
          <div className="hosting-ci-start__field">
            <label htmlFor={`${fieldsId}-ref`}>{tr('Branch / Tag', 'Branch / tag')}</label>
            <TextField
              id={`${fieldsId}-ref`}
              aria-describedby={`${fieldsId}-ref-help`}
              required
              value={ref}
              onChange={(event) => setRef(event.target.value)}
              disabled={task.busy}
            />
            <small id={`${fieldsId}-ref-help`}>{tr('Branch oder Tag für den neuen Lauf.', 'Branch or tag for the new run.')}</small>
          </div>
        </div>
        <details className="hosting-ci-start__inputs">
          <summary>
            <ChevronRight size={13} className="hosting-ci-start__chevron" aria-hidden="true" />
            <SlidersHorizontal size={13} aria-hidden="true" />
            {tr('Inputs (optional)', 'Inputs (optional)')}
          </summary>
          <label htmlFor={`${fieldsId}-inputs`}>
            Inputs (JSON)
            <TextField
              as="textarea"
              id={`${fieldsId}-inputs`}
              value={inputs}
              onChange={(event) => setInputs(event.target.value)}
              rows={4}
              spellCheck={false}
              disabled={task.busy}
            />
            <small>{tr('Textwerte als JSON, z. B. {"environment": "staging"}.', 'String values as JSON, e.g. {"environment": "staging"}.')}</small>
          </label>
        </details>
        {task.error && (
          <p className="hosting-error" role="alert">
            {task.error}
          </p>
        )}
        <div className="hosting-ci-start__actions">
          <Button onClick={onClose} disabled={task.busy}>
            {tr('Abbrechen', 'Cancel')}
          </Button>
          <Button type="submit" variant="primary" icon={task.busy ? <Loader2 size={14} className="spin" /> : <Play size={14} />} disabled={task.busy}>
            {task.busy ? tr('Wird gestartet …', 'Starting …') : tr('Lauf starten', 'Start run')}
          </Button>
        </div>
      </form>
    </section>
  );
}
