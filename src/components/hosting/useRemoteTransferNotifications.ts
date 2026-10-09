import { useCallback, useLayoutEffect, useRef } from 'react';
import { useWorkflowStore } from '@/contexts/AppStateContext';
import { useNotifications } from '@/contexts/NotificationContext';
import type { NotificationMessage } from '@/types/notifications';
import { normalizeRepoPathKey } from '@/utils/repoPath';
import { useRemoteTransferState, type RemoteTransferState } from './remoteTransferState';
import type { RemoteTransferCoordinator } from './remoteTransferCoordinator';
import { secretScanNotification, secretScanFallbackDetail } from './secretScanNotification';
import { pushFailureDetails, transferFailureContext } from './transferFailureContext';

const pushOperations = new Set(['git:executePush', 'git:retryPush', 'git:planPush']);
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
  const matchesRepository = (repoPath: unknown) =>
    typeof repoPath === 'string' &&
    [state.intent?.repoPath, state.snapshot?.repoPath].some((path) => path && normalizeRepoPathKey(path) === normalizeRepoPathKey(repoPath));
  const latest = jobs.find(
    (job) =>
      (state.intent?.mode === 'push' ? pushOperations.has(job.operation) : job.operation === `git:${state.intent?.mode}`) &&
      matchesRepository(job.details?.repoPath) &&
      job.timestamp >= (entry.current?.progress && entry.current.intent === state.intent ? entry.current.startedAt : Date.now()),
  );
  const progress = latest?.message?.trim() ?? '';
  const scanProgress =
    state.transferStage === 'scanning' && state.scanProgressId
      ? jobs.find(
          (job) => job.operation === 'security:secret-scan' && matchesRepository(job.details?.repoPath) && job.details?.progressId === state.scanProgressId,
        )?.details?.secretScan
      : undefined;

  const notify = useCallback(
    (message: string, isError: boolean) => {
      const current = useRemoteTransferState.getState();
      const { batch } = current;
      const cancelled = batch?.state === 'cancelled' || (!isError && Boolean(current.error));
      const completed = batch?.targets.filter((target) => ['success', 'up-to-date'].includes(target.status)).length ?? 0;
      const canOpen = Boolean(batch || current.failedPull);
      const failedTargets = current.error ? [] : (batch?.targets.filter((target) => ['failed', 'rejected', 'unknown'].includes(target.status)) ?? []);
      const notification: NotificationMessage = {
        title: notificationTitle(current),
        msg: message,
        isError,
        kind: cancelled ? (completed ? 'warning' : 'info') : batch?.state === 'partial' ? 'warning' : isError ? 'error' : 'success',
        ...(isError && !cancelled
          ? {
              gitContext: transferFailureContext(current, failedTargets.length === 1 ? failedTargets[0] : undefined),
              technicalDetails: failedTargets.length
                ? failedTargets.map((target) => `${target.remoteName} (${target.url})\n${pushFailureDetails(target)}`).join('\n\n')
                : current.error || undefined,
            }
          : {}),
        detail:
          [
            batch && batch.targets.length
              ? translate.current(
                  `${completed} von ${batch.targets.length} Zielen abgeschlossen.`,
                  `${completed} of ${batch.targets.length} targets completed.`,
                )
              : undefined,
            secretScanFallbackDetail(current.scan?.pushScope, translate.current),
          ]
            .filter(Boolean)
            .join('\n') || undefined,
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
        (state.intent.mode === 'push'
          ? state.transferStage === 'transferring'
            ? translate.current('Push läuft …', 'Pushing …')
            : translate.current('Push wird vorbereitet …', 'Preparing push …')
          : translate.current('Übertragung läuft …', 'Transfer running …'));
    const notification: NotificationMessage = {
      title: notificationTitle(state),
      msg: message,
      isError: false,
      kind: 'progress',
      autoHideMs: null,
      dismissible: false,
      ...(state.transferStage === 'scanning' && !state.cancelling ? secretScanNotification(scanProgress, translate.current) : {}),
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
  }, [coordinator, notifications, state, progress, scanProgress]);

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
