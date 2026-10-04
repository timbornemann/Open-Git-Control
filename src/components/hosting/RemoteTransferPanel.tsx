import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hostingClient, transferClient } from '@/services/hostingClient';
import { gitClient } from '@/services/gitClient';
import { useGitStore, useSettingsStore, useUIStore } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type {
  GitPushBatchDto,
  GitPushPlanDto,
  GitRemoteSnapshotDto,
  RemotePreferences,
  RemoteTransferOperation,
  RemoteTransferOperations,
} from '@/types/remoteTransfers';
import type { SecretScanResultDto } from '@/types/gitDtos';
import { useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { RemoteEndpointEditor } from './RemoteEndpointEditor';
import { PullTransferRecovery } from './PullTransferRecovery';
import { PushTransferResults } from './PushTransferResults';
import { PushTransferReview } from './PushTransferReview';
import { RemoteTransferHeading } from './RemoteTransferHeading';
import { RemoteTransferProgress } from './RemoteTransferProgress';
import { PushDestinationFields } from './PushDestinationFields';
import { syncRemoteTags } from './syncRemoteTags';

export type TransferMode = 'remotes' | 'push' | 'pull' | 'fetch';
export function RemoteTransferPanel({
  repoPath,
  mode,
  force: initialForce = false,
  pullMode: initialPullMode = 'default',
  destinationBranch: initialDestinationBranch = '',
  onClose,
}: {
  repoPath: string;
  mode: TransferMode;
  force?: boolean;
  pullMode?: 'default' | 'rebase' | 'no-ff' | 'ff-only';
  destinationBranch?: string;
  onClose?: () => void;
}) {
  const { tr } = useI18n();
  const triggerRefresh = useGitStore((s) => s.triggerRefresh);
  const setActiveTab = useUIStore((s) => s.setActiveTab);
  const tags = useGitStore((s) => s.tags);
  const settings = useSettingsStore((s) => s.settings);
  const { connections, refresh: refreshHosting } = useHostingState();
  const task = useHostingTask(repoPath);
  const [snapshot, setSnapshot] = useState<GitRemoteSnapshotDto | null>(null);
  const [preferences, setPreferences] = useState<RemotePreferences>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [remote, setRemote] = useState('');
  const [branch, setBranch] = useState('');
  const [pullMode, setPullMode] = useState<'default' | 'rebase' | 'no-ff' | 'ff-only'>(initialPullMode);
  const [destinationBranch, setDestinationBranch] = useState(initialDestinationBranch);
  const [targetBranches, setTargetBranches] = useState<Record<string, string>>({});
  const [force, setForce] = useState(initialForce);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [plan, setPlan] = useState<GitPushPlanDto | null>(null);
  const [scan, setScan] = useState<SecretScanResultDto | null>(null);
  const [batch, setBatch] = useState<GitPushBatchDto | null>(null);
  const [batchPlan, setBatchPlan] = useState<GitPushPlanDto | null>(null);
  const [reviewingRetry, setReviewingRetry] = useState(false);
  const [failedPull, setFailedPull] = useState<RemoteTransferOperations['pull']['input'] | null>(null);
  const [profileName, setProfileName] = useState('');
  const [bindingConnection, setBindingConnection] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const scope = useRef(0);
  useLayoutEffect(() => {
    scope.current++;
    setSnapshot(null);
    setPreferences({});
    setSelected([]);
    setRemote('');
    setBranch('');
    setDestinationBranch(initialDestinationBranch);
    setTargetBranches({});
    setSelectedTags([]);
    setPlan(null);
    setScan(null);
    setBatch(null);
    setBatchPlan(null);
    setFailedPull(null);
    setReviewingRetry(false);
    setStatusMessage('');
    setProfileName('');
    const activeScope = scope;
    return () => {
      activeScope.current++;
    };
  }, [repoPath, initialDestinationBranch]);
  const scoped = async <T,>(operation: () => Promise<T>): Promise<T> => {
    const started = scope.current;
    const result = await operation();
    if (started !== scope.current) throw new Error(tr('Repository wurde gewechselt.', 'Repository changed.'));
    return result;
  };
  const request = <K extends RemoteTransferOperation>(operation: K, input: RemoteTransferOperations[K]['input']) =>
    scoped(() => transferClient.request(operation, input));
  const reload = async () => {
    const [next, prefs] = await Promise.all([request('getRemotes', { repoPath }), request('getPreferences', { repoPath })]);
    setSnapshot(next);
    setPreferences(prefs);
    const activeProfile = prefs.profiles?.find((profile) => profile.id === prefs.activeProfileId);
    setTargetBranches((previous) => (Object.keys(previous).length ? previous : (activeProfile?.targetBranches ?? {})));
    setSelectedTags((previous) => (previous.length ? previous : (activeProfile?.tagNames ?? [])));
    setSelected((previous) =>
      previous.length
        ? previous.filter((name) => next.remotes.some((r) => r.name === name))
        : prefs.pushRemotes?.length
          ? prefs.pushRemotes
          : next.defaultPushRemote
            ? [next.defaultPushRemote]
            : next.remotes.length === 1
              ? [next.remotes[0].name]
              : [],
    );
    setRemote((previous) => previous || prefs.fetchRemote || next.upstream?.remote || (next.remotes.length === 1 ? next.remotes[0].name : ''));
    setBranch((previous) => previous || next.upstream?.branch || next.branch);
    setDestinationBranch((previous) => previous || activeProfile?.destinationBranch || next.branch);
    triggerRefresh();
  };
  // Reload once per repository; selection changes must not start a new transfer.
  useEffect(() => {
    void task.run(reload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath]);
  const savePreferences = async (next: RemotePreferences) => {
    setPreferences(await request('setPreferences', { repoPath, preferences: next }));
    setPlan(null);
    refreshHosting();
  };
  const edit = (action: 'remove' | 'rename' | 'set-url', name: string, value?: string) =>
    void task.run(async () => {
      if (action === 'remove' && !window.confirm(tr(`Remote „${name}“ entfernen?`, `Remove remote "${name}"?`))) return;
      await request('editRemote', { repoPath, mutation: { action, name, ...(action === 'rename' ? { newName: value } : { url: value }) } });
      setPlan(null);
      await reload();
    });
  const preparePush = () =>
    void task.run(async () => {
      setBatch(null);
      setScan(null);
      setPlan(null);
      setReviewingRetry(false);
      const next = await request('planPush', {
        repoPath,
        remoteNames: selected,
        destinationBranch,
        targetBranches: Object.fromEntries(Object.entries(targetBranches).filter(([name, branch]) => selected.includes(name) && branch)),
        tagNames: selectedTags,
        force,
      });
      if (settings.secretScanBeforePushEnabled) {
        const result = await scoped(() => gitClient.scanPushSecrets({ repoPath, pushArgs: next.secretScanArgs }));
        if (!result.success) throw new Error(result.error);
        setScan(result.data);
      }
      setPlan(next);
    });
  const executePush = (approve = false) =>
    void task.run(async () => {
      if (!plan) return;
      if (approve) {
        const approval = await scoped(() => gitClient.approveSecretScanPush(plan.secretScanArgs, repoPath));
        if (!approval.success) throw new Error(tr('Freigabe abgelaufen. Erneut prüfen.', 'Approval expired. Check again.'));
      }
      const next =
        reviewingRetry && batch
          ? await request('retryPush', {
              repoPath,
              batchId: batch.id,
              targetIds: batch.targets.filter((target) => !target.grouped && !['success', 'up-to-date'].includes(target.status)).map((target) => target.id),
            })
          : await request('executePush', { repoPath, planId: plan.id });
      setBatch(next);
      setBatchPlan(plan);
      setPlan(null);
      await reload();
    });
  const reviewRetry = () =>
    void task.run(async () => {
      if (!batchPlan || !batch) return;
      setScan(null);
      setPlan(null);
      if (settings.secretScanBeforePushEnabled) {
        const result = await scoped(() => gitClient.scanPushSecrets({ repoPath, pushArgs: batchPlan.secretScanArgs }));
        if (!result.success) throw new Error(result.error);
        setScan(result.data);
      }
      setReviewingRetry(true);
      setPlan(batchPlan);
    });
  const runPull = (input: RemoteTransferOperations['pull']['input']) =>
    void task.run(async () => {
      setFailedPull(null);
      const started = scope.current;
      try {
        await request('pull', input);
        setStatusMessage(tr(`Pull von ${input.remote}/${input.branch} abgeschlossen.`, `Pull from ${input.remote}/${input.branch} completed.`));
        await reload();
      } catch (error) {
        if (started === scope.current) {
          setFailedPull(input);
          triggerRefresh();
        }
        throw error;
      }
    });
  const bind = (name: string, endpointUrl: string, resolutionUrl = endpointUrl) =>
    void task.run(async () => {
      if (!bindingConnection) throw new Error(tr('Ein Konto auswählen.', 'Select an account.'));
      const repository = await scoped(() => hostingClient.request('resolveRepository', { connectionId: bindingConnection, url: resolutionUrl }));
      if (!repository)
        throw new Error(
          tr(
            'URL gehört nicht zu dieser Verbindung. SSH-Alias durch die Repository-Web-URL ersetzen.',
            'URL does not match this connection. Use the repository web URL for an SSH alias.',
          ),
        );
      await savePreferences({
        ...preferences,
        hostingRemote: name,
        hostingRepository: repository.ref,
        bindings: [
          ...(preferences.bindings ?? []).filter((binding) => binding.remoteName !== name || binding.url !== endpointUrl),
          {
            remoteName: name,
            url: endpointUrl,
            repository: repository.ref,
            credentialMode: preferences.bindings?.find((binding) => binding.remoteName === name && binding.url === endpointUrl)?.credentialMode ?? 'hosting',
          },
        ],
      });
    });
  const setCredentialMode = (name: string, endpointUrl: string, credentialMode: 'hosting' | 'system') =>
    void task.run(() =>
      savePreferences({
        ...preferences,
        bindings: preferences.bindings?.map((binding) =>
          binding.remoteName === name && binding.url === endpointUrl ? { ...binding, credentialMode } : binding,
        ),
      }),
    );
  return (
    <section className="hosting-transfers">
      <RemoteTransferHeading repoPath={repoPath} mode={mode} onClose={onClose} />
      {snapshot && (
        <>
          <p>
            {tr('Aktueller Branch:', 'Current branch:')} <strong>{snapshot.branch || 'HEAD'}</strong> · Upstream:{' '}
            {snapshot.upstream ? `${snapshot.upstream.remote}/${snapshot.upstream.branch}` : '—'}
          </p>
          {(mode === 'remotes' || mode === 'pull' || mode === 'fetch') && (
            <div className="hosting-form">
              <label>
                {tr('Fetch-/Pull-Remote', 'Fetch/pull remote')}
                <select value={remote} onChange={(event) => setRemote(event.target.value)}>
                  <option value="">{tr('Ziel auswählen', 'Select target')}</option>
                  {snapshot.remotes.map((r) => (
                    <option key={r.name}>{r.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {tr('Remote-Branch', 'Remote branch')}
                <input value={branch} onChange={(event) => setBranch(event.target.value)} />
              </label>
              <label>
                {tr('Pull-Modus', 'Pull mode')}
                <select value={pullMode} onChange={(event) => setPullMode(event.target.value as typeof pullMode)}>
                  <option value="default">Merge</option>
                  <option value="rebase">Rebase</option>
                  <option value="no-ff">No fast-forward</option>
                  <option value="ff-only">Fast-forward only</option>
                </select>
              </label>
              <div className="hosting-actions">
                <button
                  disabled={task.busy || !remote}
                  onClick={() =>
                    void task.run(async () => {
                      await request('fetch', { repoPath, remote });
                      await syncRemoteTags(repoPath, remote, scoped);
                      setStatusMessage(tr(`Fetch von ${remote} abgeschlossen.`, `Fetch from ${remote} completed.`));
                      await reload();
                    })
                  }
                >
                  Fetch
                </button>
                <button disabled={task.busy || !remote || !branch} onClick={() => runPull({ repoPath, remote, branch, mode: pullMode })}>
                  Pull
                </button>
                <button
                  disabled={task.busy || !remote || !branch}
                  onClick={() =>
                    void task.run(async () => {
                      await request('setUpstream', { repoPath, remote, branch });
                      await reload();
                    })
                  }
                >
                  {tr('Als Upstream setzen', 'Set as upstream')}
                </button>
                <button disabled={task.busy || !remote} onClick={() => void task.run(() => savePreferences({ ...preferences, fetchRemote: remote }))}>
                  {tr('Quelle merken', 'Remember source')}
                </button>
              </div>
            </div>
          )}
          {(mode === 'remotes' || mode === 'push') && (
            <div className="hosting-form">
              <h3>{tr('Push-Ziele', 'Push targets')}</h3>
              {snapshot.remotes.map((r) => (
                <label className="hosting-checkbox" key={r.name}>
                  <input
                    type="checkbox"
                    checked={selected.includes(r.name)}
                    onChange={(event) => {
                      setSelected(event.target.checked ? [...selected, r.name] : selected.filter((name) => name !== r.name));
                      setPlan(null);
                    }}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    {r.pushUrls.map((url) => (
                      <small key={url}>{url}</small>
                    ))}
                  </span>
                </label>
              ))}
              <PushDestinationFields
                selected={selected}
                destinationBranch={destinationBranch}
                setDestinationBranch={setDestinationBranch}
                targetBranches={targetBranches}
                setTargetBranches={setTargetBranches}
                force={force}
                setForce={setForce}
                invalidatePlan={() => setPlan(null)}
              />
              <details>
                <summary>{tr('Tags ausdrücklich auswählen', 'Explicitly select tags')}</summary>
                {tags.map((tagName) => (
                  <label className="hosting-checkbox" key={tagName}>
                    <input
                      type="checkbox"
                      checked={selectedTags.includes(tagName)}
                      onChange={(event) => {
                        setSelectedTags(event.target.checked ? [...selectedTags, tagName] : selectedTags.filter((name) => name !== tagName));
                        setPlan(null);
                      }}
                    />
                    {tagName}
                  </label>
                ))}
              </details>
              <label>
                {tr('Push-Profil', 'Push profile')}
                <select
                  value={preferences.activeProfileId ?? ''}
                  onChange={(event) => {
                    const profile = preferences.profiles?.find((p) => p.id === event.target.value);
                    if (profile) {
                      setSelected(profile.remoteNames);
                      setDestinationBranch(profile.destinationBranch || snapshot.branch);
                      setTargetBranches(profile.targetBranches ?? {});
                      setSelectedTags(profile.tagNames ?? []);
                      setPlan(null);
                      void task.run(() => savePreferences({ ...preferences, activeProfileId: profile.id, pushRemotes: profile.remoteNames }));
                    }
                  }}
                >
                  <option value="">{tr('Einmalige Auswahl', 'One-time selection')}</option>
                  {preferences.profiles?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="hosting-actions">
                <input
                  aria-label={tr('Profilname', 'Profile name')}
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  placeholder={tr('Profilname', 'Profile name')}
                />
                <button
                  disabled={task.busy || !profileName || !selected.length}
                  onClick={() =>
                    void task.run(async () => {
                      const id = crypto.randomUUID();
                      await savePreferences({
                        ...preferences,
                        pushRemotes: selected,
                        activeProfileId: id,
                        profiles: [
                          ...(preferences.profiles ?? []),
                          {
                            id,
                            name: profileName,
                            remoteNames: selected,
                            destinationBranch,
                            targetBranches: Object.fromEntries(Object.entries(targetBranches).filter(([name, branch]) => selected.includes(name) && branch)),
                            tagNames: selectedTags,
                          },
                        ],
                      });
                      setProfileName('');
                    })
                  }
                >
                  {tr('Profil speichern', 'Save profile')}
                </button>
              </div>
              <button disabled={task.busy || !selected.length || !destinationBranch} onClick={preparePush}>
                {tr('Push prüfen', 'Review push')}
              </button>
              {plan && (
                <PushTransferReview
                  plan={plan}
                  batch={batch}
                  scan={scan}
                  reviewingRetry={reviewingRetry}
                  force={force}
                  busy={task.busy}
                  executePush={executePush}
                />
              )}
            </div>
          )}
          {batch && <PushTransferResults batch={batch} busy={task.busy} canRetry={Boolean(batchPlan)} reviewRetry={reviewRetry} />}
          {failedPull && (
            <PullTransferRecovery
              failedPull={failedPull}
              busy={task.busy}
              retry={runPull}
              openWorkspace={() => {
                setActiveTab('repo');
                onClose?.();
              }}
            />
          )}
          {mode === 'remotes' && (
            <RemoteEndpointEditor
              key={repoPath}
              repoPath={repoPath}
              snapshot={snapshot}
              preferences={preferences}
              connections={connections}
              bindingConnection={bindingConnection}
              setBindingConnection={setBindingConnection}
              bind={bind}
              setCredentialMode={setCredentialMode}
              edit={edit}
              request={request}
              task={task}
              reload={reload}
              invalidatePlan={() => setPlan(null)}
            />
          )}
        </>
      )}
      {statusMessage && <p role="status">{statusMessage}</p>}
      {task.busy && (
        <div role="status">
          <RemoteTransferProgress repoPath={repoPath} />
          {tr('Operation läuft …', 'Operation running …')}
          <button
            onClick={() => {
              void transferClient.request('cancel', { repoPath });
              void gitClient.cancelSecretScan(repoPath);
            }}
          >
            {tr('Abbrechen', 'Cancel')}
          </button>
        </div>
      )}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
