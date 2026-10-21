import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import { hostingClient } from '@/services/hostingClient';
import type { HostedRepository, HostedRepositoryRef, HostingChangeRequest } from '@/types/hostingDtos';
import { HostingRepositoryPicker } from './HostingRepositoryPicker';
import { useHostingTask } from './useHostingTask';

export type HostingChangeRequestDraft = { title: string; body: string; sourceBranch: string; targetBranch: string; target?: HostedRepositoryRef };

export function HostingCreateChangeRequest({
  repository,
  initialDraft,
  onCreated,
}: {
  repository: HostedRepository;
  initialDraft: HostingChangeRequestDraft;
  onCreated(change: HostingChangeRequest): void;
}) {
  const { tr } = useI18n();
  const task = useHostingTask(`create/${repository.ref.connectionId}/${repository.ref.repositoryId}`);
  const [target, setTarget] = useState(initialDraft.target || repository.ref);
  const [source, setSource] = useState(repository.ref);
  const [draft, setDraft] = useState(initialDraft);
  const change = (key: keyof HostingChangeRequestDraft, value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  const resolve = async (url: string) => {
    const resolved = await hostingClient.request('resolveRepository', { connectionId: repository.ref.connectionId, url });
    if (!resolved) throw new Error(tr('Repository gehört nicht zu diesem Server und Konto.', 'Repository does not belong to this server and account.'));
    return resolved.ref;
  };
  return (
    <form
      className="hosting-form"
      onSubmit={(event) => {
        event.preventDefault();
        void task.run(
          () =>
            hostingClient.request('createChangeRequest', {
              repository: target,
              source,
              title: draft.title,
              body: draft.body,
              sourceBranch: draft.sourceBranch,
              targetBranch: draft.targetBranch,
            }),
          (created) => {
            setDraft((value) => ({ ...value, title: '', body: '' }));
            onCreated(created);
          },
        );
      }}
    >
      <div className="hosting-form-grid">
        <HostingRepositoryPicker
          label={tr('Quellrepository', 'Source repository')}
          selected={source}
          defaultUrl={repository.htmlUrl}
          busy={task.busy}
          onResolve={(url) => void task.run(() => resolve(url), setSource)}
        />
        <HostingRepositoryPicker
          label={tr('Zielrepository', 'Target repository')}
          selected={target}
          defaultUrl={repository.htmlUrl}
          busy={task.busy}
          onResolve={(url) => void task.run(() => resolve(url), setTarget)}
        >
          {repository.parent && (
            <Button type="button" onClick={() => setTarget(repository.parent!)}>
              {tr('Übergeordnetes Repository', 'Parent repository')}
            </Button>
          )}
        </HostingRepositoryPicker>
      </div>
      <div className="hosting-form-grid">
        <label>
          {tr('Quellbranch', 'Source branch')}
          <TextField required value={draft.sourceBranch} onChange={(e) => change('sourceBranch', e.target.value)} />
        </label>
        <label>
          {tr('Zielbranch', 'Target branch')}
          <TextField required value={draft.targetBranch} onChange={(e) => change('targetBranch', e.target.value)} />
        </label>
      </div>
      <label>
        {tr('Titel', 'Title')}
        <TextField required value={draft.title} onChange={(e) => change('title', e.target.value)} />
      </label>
      <label>
        {tr('Beschreibung', 'Description')}
        <TextField as="textarea" value={draft.body} onChange={(e) => change('body', e.target.value)} />
      </label>
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={task.busy}>
        {task.busy ? tr('Wird erstellt …', 'Creating …') : tr('Erstellen', 'Create')}
      </Button>
    </form>
  );
}
