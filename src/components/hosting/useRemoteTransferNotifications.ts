import { useCallback, useLayoutEffect, useRef } from 'react';
import { useWorkflowStore } from '@/contexts/AppStateContext';
import { useNotifications } from '@/contexts/NotificationContext';
import type { NotificationMessage } from '@/types/notifications';
import { useRemoteTransferState, type RemoteTransferState } from './remoteTransferState';
import type { RemoteTransferCoordinator } from './remoteTransferCoordinator';

const pushOperations = new Set(['git:executePush', 'git:retryPush', 'git:planPush', 'security:secret-scan']);
const notificationTitle = (current: RemoteTransferState) =>
  `${current.intent?.mode === 'pull' ? 'Pull' : current.intent?.mode === 'fetch' ? 'Fetch' : 'Push'} · ${current.intent?.repoPath.split(/[\\/]/).filter(Boolean).pop() ?? ''}`;

/** Progress and completion share one entry in the app's central queue. */
export function useRemoteTransferNotifications(coordinator: RemoteTransferCoordinator, contextKey: string, tr: (de: string, en: string) => string) {
  const notifications = useNotifications();
  const state = useRemoteTransferState();
  const jobs = useWorkflowStore((s) => s.jobs);
  const translate = useRef(tr);
  translate.current = tr;
  const entry = useRef<{ id: number; intent: RemoteTransferState['intent']; progress: boolean; startedAt: number } | null>(null);
  const owned = useRef(new Set<number>());
  const latest = jobs.find(
    (job) =>
      (state.intent?.mode === 'push' ? pushOperations.has(job.operation) : job.operation === `git:${state.intent?.mode}`) &&
      job.details?.repoPath === state.intent?.repoPath &&
      job.timestamp >= (entry.current?.progress && entry.current.intent === state.intent ? entry.current.startedAt : Date.now()),
  );
  const progress = latest?.message?.trim() ?? '';

  const notify = useCallback(
    (message: string, isError: boolean) => {
      const current = useRemoteTransferState.getState();
      const { batch } = current;
      const cancelled = batch?.state === 'cancelled' || (!isError && Boolean(current.error));
      const completed = batch?.targets.filter((target) => ['success', 'up-to-date'].includes(target.status)).length ?? 0;
      const canOpen = Boolean(batch || current.failedPull);
      const notification: NotificationMessage = {
        title: notificationTitle(current),
        msg: message,
        isError,
        kind: cancelled ? (completed ? 'warning' : 'info') : batch?.state === 'partial' ? 'warning' : isError ? 'error' : 'success',
        detail:
          batch && batch.targets.length
            ? translate.current(`${completed} von ${batch.targets.length} Zielen abgeschlossen.`, `${completed} of ${batch.targets.length} targets completed.`)
            : undefined,
        // Cancelled operations expire just like ordinary informational messages.
        autoHideMs: cancelled ? (canOpen ? 6000 : 3000) : undefined,
        actions: canOpen
          ? [
              {
                label: current.failedPull
                  ? translate.current('Pull wiederaufnehmen', 'Resume pull')
                  : translate.current('Übertragungsergebnis öffnen', 'Open transfer result'),
                onClick: () => {
                  if (useRemoteTransferState.getState().intent === current.intent) coordinator.showResult();
                },
              },
            ]
          : undefined,
      };
      const previous = entry.current;
      const id = previous?.intent === current.intent && notifications.update(previous.id, notification) ? previous.id : notifications.publish(notification);
      owned.current.add(id);
      entry.current = { id, intent: current.intent, progress: false, startedAt: previous?.startedAt ?? Date.now() };
    },
    [coordinator, notifications],
  );

  useLayoutEffect(() => {
    if (!state.busy || !state.intent) {
      if (entry.current?.progress) {
        notifications.dismiss(entry.current.id);
        entry.current = null;
      }
      return;
    }
    const message = state.cancelling
      ? translate.current('Übertragung wird abgebrochen …', 'Cancelling transfer …')
      : progress ||
        (state.intent.mode === 'push' && state.plan && !state.scan
          ? translate.current('Push wird geprüft …', 'Checking push …')
          : translate.current('Übertragung läuft …', 'Transfer running …'));
    const notification: NotificationMessage = {
      title: notificationTitle(state),
      msg: message,
      isError: false,
      kind: 'progress',
      autoHideMs: null,
      dismissible: false,
      actions: [{ label: translate.current('Abbrechen', 'Cancel'), onClick: () => coordinator.cancel(), disabled: state.cancelling }],
    };
    const previous = entry.current;
    const id = previous?.intent === state.intent && notifications.update(previous.id, notification) ? previous.id : notifications.publish(notification);
    owned.current.add(id);
    entry.current = {
      id,
      intent: state.intent,
      progress: true,
      startedAt: previous?.progress && previous.intent === state.intent ? previous.startedAt : Date.now(),
    };
  }, [coordinator, notifications, state, progress]);

  useLayoutEffect(() => {
    const ids = owned.current;
    return () => {
      ids.forEach(notifications.dismiss);
      ids.clear();
      entry.current = null;
    };
  }, [notifications, contextKey]);
  return notify;
}
