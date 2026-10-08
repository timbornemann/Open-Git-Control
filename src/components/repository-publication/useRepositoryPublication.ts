import { useLayoutEffect, useRef, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { awaitRemoteTransfer } from '@/components/hosting/awaitRemoteTransfer';
import { useNotifications } from '@/contexts/NotificationContext';
import { useGitStore } from '@/contexts/AppStateContext';
import { useHostingState } from '@/components/hosting/hostingState';
import { useI18n } from '@/i18n';
import type { PublicationSelection, RepositoryPublication } from '@/types/repositoryPublication';

export function useRepositoryPublication(selection: PublicationSelection, refresh: () => Promise<void>, scope: string) {
  const { tr } = useI18n();
  const notifications = useNotifications();
  const triggerRefresh = useGitStore((s) => s.triggerRefresh);
  const [record, setRecord] = useState<RepositoryPublication | null>(null);
  const [busy, setBusy] = useState(false),
    [phase, setPhase] = useState('');
  const locked = useRef(false),
    current = useRef({ selection, scope });
  current.current = { selection, scope };
  const controller = useRef<AbortController | null>(null);
  const cancel = () => {
    controller.current?.abort();
    void hostingClient.request('cancelPublication', { repoPath: selection.repoPath }).catch(() => {});
  };
  useLayoutEffect(
    () => () => {
      controller.current?.abort();
      void hostingClient.request('cancelPublication', { repoPath: selection.repoPath }).catch(() => {});
    },
    [scope, selection.repoPath],
  );

  const run = async (operation: (checked: () => void, progress: (message: string) => void, signal: AbortSignal, pause: () => void) => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    const expected = JSON.stringify(selection),
      expectedScope = scope;
    const checked = () => {
      if (abort.signal.aborted || current.current.scope !== expectedScope || JSON.stringify(current.current.selection) !== expected)
        throw new Error(
          tr(
            'Veröffentlichung abgebrochen oder Kontext geändert. Erledigte Schritte bleiben erhalten.',
            'Publication cancelled or context changed. Completed steps are preserved.',
          ),
        );
    };
    const title = `${tr('Repository veröffentlichen', 'Publish repository')} · ${selection.creation.name}`;
    let id = notifications.publish({
      msg: tr('Auswahl prüfen …', 'Checking selection …'),
      title,
      kind: 'progress',
      isError: false,
      autoHideMs: null,
      progress: { value: null, label: tr('Vorbereitung', 'Preparation') },
      actions: [{ label: tr('Abbrechen', 'Cancel'), onClick: cancel }],
    });
    const progress = (message: string) => {
      checked();
      setPhase(message);
      const entry = {
        title,
        msg: message,
        kind: 'progress' as const,
        isError: false,
        autoHideMs: null,
        progress: { value: null, label: message },
        actions: [{ label: tr('Abbrechen', 'Cancel'), onClick: cancel }],
      };
      if (!notifications.update(id, entry)) id = notifications.publish(entry);
    };
    try {
      await operation(checked, progress, abort.signal, () => notifications.dismiss(id));
      notifications.dismiss(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const entry = {
        title,
        msg: message,
        kind: abort.signal.aborted ? ('info' as const) : ('error' as const),
        isError: !abort.signal.aborted,
        autoHideMs: abort.signal.aborted ? 4000 : null,
      };
      if (!notifications.update(id, entry)) notifications.publish(entry);
    } finally {
      locked.current = false;
      setBusy(false);
      setPhase('');
      controller.current = null;
      await refresh();
      triggerRefresh();
      useHostingState.getState().refresh();
    }
  };
  const review = async () => {
    let result: RepositoryPublication | null = null;
    await run(async (checked) => {
      result = await hostingClient.request('preparePublication', { selection, publicationId: record?.stage === 'complete' ? undefined : record?.id });
      checked();
      setRecord(result);
    });
    return result;
  };
  const publish = (options?: { confirmCandidate?: boolean; retryCreation?: boolean }) =>
    run(async (checked, progress, signal, pause) => {
      if (!record) throw new Error(tr('Zuerst die Auswahl prüfen.', 'Review the selection first.'));
      let next = record;
      progress(tr('Repository erstellen und verbinden …', 'Creating and connecting repository …'));
      next = await hostingClient.request('connectPublication', { repoPath: selection.repoPath, publicationId: next.id, ...options });
      checked();
      setRecord(next);
      if (next.stage === 'uncertain') {
        notifications.publish({
          title: tr('Ausgang der Erstellung prüfen', 'Check creation outcome'),
          msg: next.message || '',
          kind: 'warning',
          isError: false,
        });
        return;
      }
      if (next.branches.length) {
        progress(tr('Stand am neuen Ziel prüfen …', 'Checking the new endpoint …'));
        next = await hostingClient.request('finishPublication', { repoPath: selection.repoPath, publicationId: next.id, inspectOnly: true });
        checked();
        setRecord(next);
        if (!['uploaded', 'setup-pending', 'complete'].includes(next.stage)) {
          // The coordinator owns scan, approval, LFS, per-ref results and targeted retry notifications.
          pause();
          await awaitRemoteTransfer(
            {
              repoPath: selection.repoPath,
              mode: 'push',
              constrainedRemoteNames: [next.selection.remoteName],
              constrainedTargetUrls: { [next.selection.remoteName]: [next.remoteUrl!] },
              destinationBranch: next.branches[0].destinationBranch,
              branchTargets: next.branches,
              tagNames: next.tags.map((t) => t.name),
              expectedTagRefs: next.tags,
            },
            signal,
          );
          checked();
        }
      }
      progress(tr('Hauptbranch und Einrichtung abschließen …', 'Finishing default branch and setup …'));
      next = await hostingClient.request('finishPublication', { repoPath: selection.repoPath, publicationId: next.id });
      checked();
      setRecord(next);
      if (next.repository) useHostingState.getState().select(next.repository);
      notifications.publish({
        title: tr('Repository veröffentlichen', 'Publish repository'),
        msg:
          next.stage === 'complete'
            ? tr('Repository erstellt, verbunden und veröffentlicht.', 'Repository created, connected and published.')
            : tr(
                'Repository erstellt und verbunden. Erstelle den ersten Commit im Staging und setze hier fort.',
                'Repository created and connected. Make the first commit in Staging, then resume here.',
              ),
        kind: 'success',
        isError: false,
        detail: next.repository?.fullName,
      });
    });
  return { record, busy, phase, review, publish, cancel, setRecord };
}
