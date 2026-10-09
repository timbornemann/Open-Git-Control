import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hostingClient, transferClient } from '@/services/hostingClient';
import { useI18n } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import type {
  GitPullConfigurationDto,
  GitRemoteSnapshotDto,
  RemotePreferences,
  RemoteTransferOperation,
  RemoteTransferOperations,
} from '@/types/remoteTransfers';
import { useHostingTask } from './useHostingTask';
import { useOptionalNotifications } from '@/contexts/NotificationContext';
import {
  clearRemoteConfigurationDraft,
  readRemoteConfigurationDraft,
  rebaseRemoteConfigurationDraft,
  stampRemoteConfiguration,
  writeRemoteConfigurationDraft,
} from './remoteConfigurationDraft';

export function useRemoteConfiguration(repoPath: string | null) {
  const { tr } = useI18n();
  const notifications = useOptionalNotifications();
  const task = useHostingTask(repoPath ?? '');
  const [snapshot, setSnapshot] = useState<GitRemoteSnapshotDto | null>(null);
  const [pullConfiguration, setPullConfiguration] = useState<GitPullConfigurationDto | null>(null);
  const [preferences, setPreferences] = useState<RemotePreferences>({});
  const [persisted, setPersisted] = useState<RemotePreferences>({});
  const [connections, setConnections] = useState<HostingConnection[]>([]);
  const [message, setMessage] = useState('');
  const lifecycle = useRef(0);
  const currentPreferences = useRef(preferences);
  currentPreferences.current = preferences;
  useLayoutEffect(() => {
    const activeLifecycle = lifecycle;
    lifecycle.current++;
    setSnapshot(null);
    setPullConfiguration(null);
    setPreferences({});
    setPersisted({});
    setMessage('');
    return () => {
      activeLifecycle.current++;
    };
  }, [repoPath]);
  const scoped = async <T>(operation: () => Promise<T>) => {
    const generation = lifecycle.current;
    const result = await operation();
    if (generation !== lifecycle.current) throw new Error(tr('Repository wurde gewechselt.', 'Repository changed.'));
    return result;
  };
  const request = <K extends RemoteTransferOperation>(operation: K, input: RemoteTransferOperations[K]['input']) =>
    scoped(() => transferClient.request(operation, input));
  const readPullConfiguration = async (repoPath: string) => {
    const generation = lifecycle.current;
    try {
      return await request('getPullConfiguration', { repoPath });
    } catch (error) {
      if (generation === lifecycle.current)
        notifications?.publish({
          msg: tr('Die Git-Pull-Konfiguration konnte nicht gelesen werden.', 'Could not read the Git pull configuration.'),
          isError: true,
          technicalDetails: error instanceof Error ? error.message : String(error),
          gitContext: { repoPath },
        });
      return null;
    }
  };
  useEffect(() => {
    if (!repoPath) return;
    void task.run(
      async () => {
        const [nextSnapshot, nextPreferences, accounts, pullConfiguration] = await Promise.all([
          request('getRemotes', { repoPath }),
          request('getPreferences', { repoPath }),
          scoped(() => hostingClient.request('connections', undefined)),
          readPullConfiguration(repoPath),
        ]);
        return { nextSnapshot, nextPreferences, accounts, pullConfiguration };
      },
      ({ nextSnapshot, nextPreferences, accounts, pullConfiguration }) => {
        setSnapshot(nextSnapshot);
        setPullConfiguration(pullConfiguration);
        setPersisted(nextPreferences);
        setPreferences(readRemoteConfigurationDraft(nextSnapshot, nextPreferences) ?? nextPreferences);
        setConnections(accounts);
      },
    );
    // Requests are pinned to repoPath by scoped; field edits do not reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath]);
  const update = (next: RemotePreferences) => {
    if (!snapshot || task.busy) return;
    setPreferences(next);
    setMessage('');
    writeRemoteConfigurationDraft(snapshot, next, persisted);
  };
  const reload = async () => {
    if (!repoPath) return;
    const [nextSnapshot, nextPreferences, pullConfiguration] = await Promise.all([
      request('getRemotes', { repoPath }),
      request('getPreferences', { repoPath }),
      readPullConfiguration(repoPath),
    ]);
    const rebased = snapshot ? rebaseRemoteConfigurationDraft(snapshot, nextSnapshot, currentPreferences.current) : nextPreferences;
    setSnapshot(nextSnapshot);
    setPullConfiguration(pullConfiguration);
    setPersisted(nextPreferences);
    setPreferences(rebased);
    writeRemoteConfigurationDraft(nextSnapshot, rebased, nextPreferences);
    setMessage(
      tr('Remote geändert. Der Entwurf wurde an die gültigen Endpunkte angepasst.', 'Remote changed. The draft has been adjusted to the valid endpoints.'),
    );
  };
  const edit = (action: 'remove' | 'rename' | 'set-url', name: string, value?: string) =>
    void task.run(async () => {
      if (!repoPath) return;
      await request('editRemote', { repoPath, mutation: { action, name, ...(action === 'rename' ? { newName: value } : { url: value }) } });
      await reload();
    });
  const bind = (name: string, endpointUrl: string, connectionId: string, resolutionUrl = endpointUrl) =>
    void task.run(
      async () => {
        if (!connectionId) throw new Error(tr('Ein Konto auswählen.', 'Select an account.'));
        const repository = await scoped(() => hostingClient.request('resolveRepository', { connectionId, url: resolutionUrl }));
        if (!repository) throw new Error(tr('Die URL gehört nicht zu diesem Konto und Server.', 'The URL does not belong to this account and server.'));
        return {
          ...currentPreferences.current,
          bindings: [
            ...(currentPreferences.current.bindings ?? []).filter((binding) => binding.remoteName !== name || binding.url !== endpointUrl),
            { remoteName: name, url: endpointUrl, repository: repository.ref, credentialMode: 'hosting' as const },
          ],
        };
      },
      (next) => {
        setPreferences(next);
        if (snapshot) writeRemoteConfigurationDraft(snapshot, next, persisted);
      },
    );
  const setCredentialMode = (name: string, url: string, credentialMode: 'hosting' | 'system') =>
    update({
      ...preferences,
      bindings: preferences.bindings?.map((binding) => (binding.remoteName === name && binding.url === url ? { ...binding, credentialMode } : binding)),
    });
  const save = () =>
    void task.run(
      async () => {
        if (!snapshot || !repoPath) return null;
        const [current, pullConfiguration] = await Promise.all([request('getRemotes', { repoPath }), readPullConfiguration(repoPath)]);
        if (current.branch !== snapshot.branch)
          throw new Error(tr('Der aktuelle Branch wurde geändert. Seite neu öffnen.', 'The current branch changed. Reopen this page.'));
        if (JSON.stringify(current.remotes) !== JSON.stringify(snapshot.remotes))
          throw new Error(tr('Remotes wurden außerhalb der Anwendung geändert. Seite neu öffnen.', 'Remotes changed outside the app. Reopen this page.'));
        const saved = await request('setPreferences', { repoPath, preferences: stampRemoteConfiguration(current, currentPreferences.current) });
        return { saved, pullConfiguration };
      },
      (result) => {
        if (!result || !repoPath) return;
        const { saved, pullConfiguration } = result;
        setPullConfiguration(pullConfiguration);
        setPreferences(saved);
        setPersisted(saved);
        clearRemoteConfigurationDraft(repoPath);
        setMessage(tr('Remote-Konfiguration gespeichert.', 'Remote configuration saved.'));
      },
    );
  const reset = () => {
    setPreferences(persisted);
    if (repoPath) clearRemoteConfigurationDraft(repoPath);
    setMessage('');
  };
  const setUpstream = (remote: string, branch: string) =>
    void task.run(
      async () => {
        if (!repoPath || !snapshot) return null;
        const current = await request('getRemotes', { repoPath });
        if (current.branch !== snapshot.branch)
          throw new Error(tr('Der aktuelle Branch wurde geändert. Seite neu öffnen.', 'The current branch changed. Reopen this page.'));
        await request('setUpstream', { repoPath, remote, branch });
        return request('getRemotes', { repoPath });
      },
      (next) => {
        if (next) {
          setSnapshot(next);
          setMessage(tr('Upstream für den aktuellen Branch gesetzt.', 'Upstream set for the current branch.'));
        }
      },
    );
  return {
    snapshot,
    pullConfiguration,
    preferences,
    connections,
    task,
    request,
    reload,
    edit,
    bind,
    setCredentialMode,
    update,
    save,
    reset,
    message,
    dirty: JSON.stringify(preferences) !== JSON.stringify(persisted),
    setUpstream,
  };
}
