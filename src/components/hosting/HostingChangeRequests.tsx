import { useCallback, useEffect, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useGitStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostedRepository, HostedRepositoryRef, HostingCapabilities, HostingChangeRequest, HostingPage } from '@/types/hostingDtos';
import { hostedRepositoryKey, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { HostingChangeRequestChecks } from './HostingChangeRequestChecks';

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
      <div className="hosting-actions">
        <select aria-label="State" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="open">{tr('Offen', 'Open')}</option>
          <option value="closed">{tr('Geschlossen', 'Closed')}</option>
          <option value="all">{tr('Alle', 'All')}</option>
        </select>
        <button disabled={task.busy} onClick={() => void task.run(reload, setPage)}>
          {tr('Aktualisieren', 'Refresh')}
        </button>
      </div>
      {page.items.map((change) => (
        <article className="hosting-card" key={change.id}>
          <h3>
            #{change.number} {change.title}
          </h3>
          <small>
            {change.author} · {change.state}
            {change.draft ? ' · Draft' : ''}
          </small>
          <p>
            {change.source.fullPath}:{change.sourceBranch} → {change.target.fullPath}:{change.targetBranch}
          </p>
          <code>{change.headSha}</code>
          <HostingChangeRequestChecks key={change.headSha} change={change} />
          <div className="hosting-actions">
            <button onClick={() => void appClient.openExternalUrl(change.htmlUrl)}>{tr('Öffnen', 'Open')}</button>
            <button onClick={() => void navigator.clipboard.writeText(change.htmlUrl)}>{tr('Link kopieren', 'Copy link')}</button>
            {repoPath && (
              <button
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
              </button>
            )}
            {change.state === 'open' && !change.draft && (
              <button disabled={task.busy} onClick={() => inspectMergeOptions(change)}>
                Merge
              </button>
            )}
          </div>
        </article>
      ))}
      {page.nextCursor && (
        <button
          disabled={task.busy}
          onClick={() =>
            void task.run(
              () => hostingClient.request('changeRequests', { repository: repository.ref, state: filter, cursor: page.nextCursor! }),
              (next) => setPage({ ...next, items: [...page.items, ...next.items] }),
            )
          }
        >
          {tr('Weitere laden', 'Load more')}
        </button>
      )}
      {!task.busy && !page.items.length && !task.error && <p>{tr('Keine Einträge für diesen Filter.', 'No entries for this filter.')}</p>}
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
            <button
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
            </button>
            <button onClick={() => setMergeCandidate(null)}>{tr('Abbrechen', 'Cancel')}</button>
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
          <label>
            {tr('Quellrepository', 'Source repository')}
            <span>{source.fullPath}</span>
            <button
              type="button"
              disabled={task.busy}
              onClick={() => {
                const url = window.prompt(tr('Web-URL des Quellrepositorys', 'Source repository web URL'), repository.htmlUrl);
                if (url) void task.run(() => resolveRef(url), setSource);
              }}
            >
              {tr('Auswählen', 'Select')}
            </button>
          </label>
          <label>
            {tr('Zielrepository', 'Target repository')}
            <span>{target.fullPath}</span>
            <button
              type="button"
              disabled={task.busy}
              onClick={() => {
                const url = window.prompt(tr('Web-URL des Zielrepositorys', 'Target repository web URL'));
                if (url) void task.run(() => resolveRef(url), setTarget);
              }}
            >
              {tr('Auswählen', 'Select')}
            </button>
            {repository.parent && (
              <button type="button" onClick={() => setTarget(repository.parent!)}>
                {tr('Übergeordnetes Repository', 'Parent repository')}
              </button>
            )}
          </label>
          <label>
            {tr('Quellbranch', 'Source branch')}
            <input required value={sourceBranch} onChange={(e) => setSourceBranch(e.target.value)} />
          </label>
          <label>
            {tr('Zielbranch', 'Target branch')}
            <input required value={targetBranch} onChange={(e) => setTargetBranch(e.target.value)} />
          </label>
          <label>
            {tr('Titel', 'Title')}
            <input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            {tr('Beschreibung', 'Description')}
            <textarea value={body} onChange={(e) => setBody(e.target.value)} />
          </label>
          <button disabled={task.busy}>{tr('Erstellen', 'Create')}</button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
      {task.busy && <p role="status">{tr('Laden …', 'Loading …')}</p>}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </div>
  );
}
