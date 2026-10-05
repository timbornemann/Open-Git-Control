import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { GitPullRequest, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostedRepositoryRef, HostingCapabilities, HostingChangeRequest, HostingPage } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingChangeRequestChecks } from './HostingChangeRequestChecks';
import { HostingRepositoryPicker } from './HostingRepositoryPicker';
import { HostingStateBadge } from './HostingStateBadge';

export function HostingChangeRequests({
  repository,
  capabilities,
  repoPath,
}: {
  repository: HostedRepository;
  capabilities: HostingCapabilities;
  repoPath: string | null;
}) {
  const { tr } = useI18n();
  const revision = useHostingState((s) => s.revision);
  const refresh = useGitStore((s) => s.triggerRefresh);
  const currentBranch = useGitStore((s) => s.currentBranch);
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const task = useHostingTask(`${hostedRepositoryKey(repository)}/${filter}`);
  const { run } = task;
  const [page, setPage] = useState<HostingPage<HostingChangeRequest>>({ items: [], nextCursor: null });
  const [target, setTarget] = useState<HostedRepositoryRef>(repository.ref);
  const [source, setSource] = useState<HostedRepositoryRef>(repository.ref);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceBranch, setSourceBranch] = useState(currentBranch || repository.defaultBranch);
  const [targetBranch, setTargetBranch] = useState(repository.defaultBranch);
  const [method, setMethod] = useState(capabilities.mergeMethods[0] ?? 'merge');
  const [mergeMethods, setMergeMethods] = useState(capabilities.mergeMethods);
  const [message, setMessage] = useState('');
  const [mergeCandidate, setMergeCandidate] = useState<HostingChangeRequest | null>(null);
  const reload = useCallback(() => hostingClient.request('changeRequests', { repository: repository.ref, state: filter }), [repository, filter]);
  useEffect(() => {
    setPage({ items: [], nextCursor: null });
    if (capabilities.changeRequests) void run(reload, setPage);
  }, [capabilities.changeRequests, reload, revision, run]);
  const resolveRef = async (url: string) => {
    const resolved = await hostingClient.request('resolveRepository', { connectionId: repository.ref.connectionId, url });
    if (!resolved) throw new Error(tr('Repository gehört nicht zu diesem Server und Konto.', 'Repository does not belong to this server and account.'));
    return resolved.ref;
  };
  const inspectMergeOptions = (change: HostingChangeRequest) =>
    void task.run(
      () => hostingClient.request('capabilities', { connectionId: change.target.connectionId, repository: change.target, targetBranch: change.targetBranch }),
      (allowed) => {
        setMergeMethods(allowed.mergeMethods);
        setMethod(allowed.mergeMethods[0] ?? '');
        setMergeCandidate(change);
      },
    );
  if (!capabilities.changeRequests) return <p>{tr('Dieser Server unterstützt keine PR/MR-API.', 'This server does not support a change request API.')}</p>;
  return (
    <div className="hosting-changes">
      <div className="hosting-panel-toolbar">
        <SegmentedControl
          ariaLabel={tr('Status filtern', 'Filter state')}
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: tr('Offen', 'Open') },
            { value: 'closed', label: tr('Geschlossen', 'Closed') },
            { value: 'all', label: tr('Alle', 'All') },
          ]}
        />
        <Button icon={<RefreshCw size={14} />} disabled={task.busy} onClick={() => void task.run(reload, setPage)}>
          {tr('Aktualisieren', 'Refresh')}
        </Button>
      </div>
      {page.items.map((change) => (
        <article className="hosting-card" key={change.id}>
          <div className="hosting-item-heading">
            <h3>
              #{change.number} {change.title}
            </h3>
            <HostingStateBadge state={change.state} />
          </div>
          <div className="hosting-item-meta">
            {change.author}
            {change.draft ? ' · Draft' : ''}
          </div>
          <p>
            {change.source.fullPath}:{change.sourceBranch} → {change.target.fullPath}:{change.targetBranch}
          </p>
          <code>{change.headSha}</code>
          <HostingChangeRequestChecks key={change.headSha} change={change} />
          <div className="hosting-actions">
            <Button onClick={() => void appClient.openExternalUrl(change.htmlUrl)}>{tr('Öffnen', 'Open')}</Button>
            <Button onClick={() => void navigator.clipboard.writeText(change.htmlUrl)}>{tr('Link kopieren', 'Copy link')}</Button>
            {repoPath && (
              <Button
                disabled={task.busy}
                onClick={() =>
                  void task.run(
                    () =>
                      hostingClient.request('checkoutChangeRequest', { repoPath, repository: repository.ref, id: change.id, expectedHeadSha: change.headSha }),
                    refresh,
                  )
                }
              >
                Checkout
              </Button>
            )}
            {change.state === 'open' && !change.draft && (
              <Button disabled={task.busy} onClick={() => inspectMergeOptions(change)}>
                Merge
              </Button>
            )}
          </div>
        </article>
      ))}
      {page.nextCursor && (
        <Button
          disabled={task.busy}
          onClick={() =>
            void task.run(
              () => hostingClient.request('changeRequests', { repository: repository.ref, state: filter, cursor: page.nextCursor! }),
              (next) => setPage({ ...next, items: [...page.items, ...next.items] }),
            )
          }
        >
          {tr('Weitere laden', 'Load more')}
        </Button>
      )}
      {!task.busy && !page.items.length && !task.error && (
        <div className="hosting-empty">
          <GitPullRequest size={30} aria-hidden="true" />
          <h3>{tr('Keine Einträge für diesen Filter.', 'No entries for this filter.')}</h3>
        </div>
      )}
      {mergeCandidate && (
        <div className="hosting-card">
          <p>
            {tr('Diesen geprüften Stand zusammenführen:', 'Merge this reviewed revision:')} #{mergeCandidate.number}
          </p>
          <code>{mergeCandidate.headSha}</code>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {mergeMethods.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          {!mergeMethods.length && <p>{tr('Für diesen Zielbranch ist keine Merge-Aktion erlaubt.', 'No merge action is permitted for this target branch.')}</p>}
          <div className="hosting-actions">
            <Button
              variant="primary"
              disabled={task.busy || !mergeMethods.length}
              onClick={() =>
                void task.run(
                  async () => {
                    const result = await hostingClient.request('merge', {
                      repository: repository.ref,
                      id: mergeCandidate.id,
                      expectedHeadSha: mergeCandidate.headSha,
                      version: mergeCandidate.version,
                      method,
                    });
                    if (!result.merged) throw new Error(result.message);
                    return result;
                  },
                  (result) => {
                    setMessage(result.message);
                    setMergeCandidate(null);
                    void task.run(reload, setPage);
                    refresh();
                  },
                )
              }
            >
              {tr('Merge bestätigen', 'Confirm merge')}
            </Button>
            <Button onClick={() => setMergeCandidate(null)}>{tr('Abbrechen', 'Cancel')}</Button>
          </div>
        </div>
      )}
      <details className="hosting-card">
        <summary>
          {capabilities.changeRequestLabel} {tr('erstellen', 'create')}
        </summary>
        <form
          className="hosting-form"
          onSubmit={(e) => {
            e.preventDefault();
            void task.run(
              async () => {
                const created = await hostingClient.request('createChangeRequest', { repository: target, source, sourceBranch, targetBranch, title, body });
                return created;
              },
              (created) => {
                setMessage(`#${created.number}: ${created.title}`);
                setTitle('');
                setBody('');
                void task.run(reload, setPage);
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
              onResolve={(url) => void task.run(() => resolveRef(url), setSource)}
            />
            <HostingRepositoryPicker
              label={tr('Zielrepository', 'Target repository')}
              selected={target}
              defaultUrl={repository.htmlUrl}
              busy={task.busy}
              onResolve={(url) => void task.run(() => resolveRef(url), setTarget)}
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
              <TextField required value={sourceBranch} onChange={(e) => setSourceBranch(e.target.value)} />
            </label>
            <label>
              {tr('Zielbranch', 'Target branch')}
              <TextField required value={targetBranch} onChange={(e) => setTargetBranch(e.target.value)} />
            </label>
          </div>
          <label>
            {tr('Titel', 'Title')}
            <TextField required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            {tr('Beschreibung', 'Description')}
            <TextField as="textarea" value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <Button type="submit" variant="primary" disabled={task.busy}>
            {tr('Erstellen', 'Create')}
          </Button>
        </form>
      </details>
      {message && (
        <p className="hosting-notice" role="status">
          {message}
        </p>
      )}
      {task.busy && (
        <p className="hosting-notice" role="status">
          {tr('Laden …', 'Loading …')}
        </p>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
