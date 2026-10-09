import { useEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import { cancellableRead } from '@/data/ipcRead';
import { useOptionalNotifications } from '@/contexts/NotificationContext';
import { useI18n } from '@/i18n';
import type { AnalyticsFilters, AnalyticsProgress, RepositoryAnalyticsSnapshot } from '@/shared/ipc/repositoryAnalytics';
import type { NotificationMessage } from '@/types/notifications';

export function useRepositoryAnalytics(repoPath: string, filters: AnalyticsFilters, refreshTrigger: number, busy: boolean) {
  const filterKey = JSON.stringify(filters);
  const contextKey = JSON.stringify([repoPath, filterKey]);
  const [report, setReport] = useState<{ contextKey: string; snapshot: RepositoryAnalyticsSnapshot } | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [progress, setProgress] = useState<AnalyticsProgress | null>(null);
  const [error, setError] = useState('');
  const cancelRef = useRef<() => void>(() => {});
  const notifications = useOptionalNotifications();
  const { tr } = useI18n();
  useEffect(() => {
    const controller = new AbortController();
    let active = true,
      live = false,
      completed = false,
      requestId = '';
    let notificationId: number | undefined, retryTimer: ReturnType<typeof setTimeout> | undefined;
    const parsedFilters = JSON.parse(filterKey) as AnalyticsFilters;
    const title = tr('Statistik & Analyse', 'Statistics & analytics');
    const publish = (message: Omit<NotificationMessage, 'isError'> & { isError?: boolean }) => {
      if (notificationId === undefined) notificationId = notifications?.publish({ title, isError: false, ...message });
      else notifications?.update(notificationId, { title, isError: false, ...message });
    };
    const cancel = () => {
      completed = true;
      controller.abort();
      setPaused(true);
      setRunning(false);
      publish({
        kind: 'info',
        msg: tr('Analyse abgebrochen. Gespeicherte Ergebnisse bleiben verfügbar.', 'Analysis cancelled. Saved results remain available.'),
        autoHideMs: 3000,
      });
    };
    cancelRef.current = cancel;
    setError('');
    setProgress(null);
    void gitClient
      .getRepositoryAnalyticsSnapshot({ repoPath, filters: parsedFilters })
      .then((result) => {
        const snapshot = result.success ? result.data : null;
        if (active && !live && snapshot) setReport((previous) => (previous?.contextKey === contextKey ? previous : { contextKey, snapshot }));
      })
      .catch(() => {
        // A cache miss must not clear an already displayed report.
      });
    if (paused || busy) {
      setRunning(false);
      return () => {
        active = false;
        controller.abort();
      };
    }
    setRunning(true);
    publish({
      kind: 'progress',
      msg: tr('Lokale Auswertung wird vorbereitet…', 'Preparing local analysis…'),
      autoHideMs: null,
      actions: [{ label: tr('Abbrechen', 'Cancel'), onClick: cancel }],
    });
    const dispose = gitClient.onRepositoryAnalyticsProgress((event) => {
      if (!active || controller.signal.aborted || event.repoPath !== repoPath || event.requestId !== requestId) return;
      setProgress(event);
      if (event.snapshot) {
        live = true;
        const snapshot = event.snapshot;
        setReport((previous) => {
          // Keep completed sections visible while a refresh calculates its earlier phases.
          if (previous?.contextKey === contextKey && previous.snapshot.sections.some((section) => !snapshot.sections.includes(section))) return previous;
          return { contextKey, snapshot };
        });
      }
      const phase = {
        history: tr('Historie lesen', 'Reading history'),
        project: tr('Projektstand auswerten', 'Analyzing project tree'),
        blame: tr('Zuletzt geänderte Zeilen zuordnen', 'Attributing last changed lines'),
        aggregation: tr('Auswertungen zusammenstellen', 'Aggregating results'),
      }[event.phase];
      publish({
        kind: 'progress',
        msg: phase,
        progress: {
          value: event.total > 0 ? (event.completed / event.total) * 100 : null,
          label: event.total > 0 ? `${event.completed.toLocaleString()} / ${event.total.toLocaleString()}` : tr('Keine neuen Datensätze', 'No new records'),
        },
        autoHideMs: null,
        actions: [{ label: tr('Abbrechen', 'Cancel'), onClick: cancel }],
      });
    });
    const run = async () => {
      try {
        const result = await cancellableRead(controller.signal, 'speculative', (readRequest) => {
          requestId = readRequest?.requestId ?? `analytics-${crypto.randomUUID()}`;
          return gitClient.refreshRepositoryAnalytics({ repoPath, filters: parsedFilters, readRequest: readRequest ?? { requestId, priority: 'speculative' } });
        });
        if (!active || controller.signal.aborted) return;
        if (!result.success || !result.data)
          throw new Error(result.error ?? tr('Die Analyse konnte nicht abgeschlossen werden.', 'The analysis could not be completed.'));
        completed = true;
        live = true;
        setReport({ contextKey, snapshot: result.data });
        setRunning(false);
        publish({ kind: result.data.complete ? 'success' : 'info', msg: tr('Lokale Auswertung aktualisiert.', 'Local analysis updated.'), autoHideMs: 3000 });
      } catch (failure) {
        if (!active || controller.signal.aborted) return;
        const message = failure instanceof Error ? failure.message : String(failure);
        if (/abort/i.test(message)) {
          publish({
            kind: 'progress',
            msg: tr('Analyse wartet auf interaktive Git-Aktionen.', 'Analysis is waiting for interactive Git operations.'),
            autoHideMs: null,
            actions: [{ label: tr('Abbrechen', 'Cancel'), onClick: cancel }],
          });
          retryTimer = setTimeout(() => void run(), 1500);
          return;
        }
        completed = true;
        setError(message);
        setRunning(false);
        publish({
          kind: 'error',
          isError: true,
          msg: tr('Die lokale Auswertung konnte nicht abgeschlossen werden.', 'The local analysis could not be completed.'),
          technicalDetails: message,
          autoHideMs: null,
          actions: [
            {
              label: tr('Erneut versuchen', 'Retry'),
              onClick: () => {
                setPaused(false);
                setRefresh((value) => value + 1);
              },
            },
          ],
        });
      }
    };
    void run();
    return () => {
      active = false;
      controller.abort();
      dispose();
      clearTimeout(retryTimer);
      if (!completed && notificationId !== undefined) notifications?.dismiss(notificationId);
    };
  }, [repoPath, filterKey, contextKey, refreshTrigger, busy, paused, refresh, notifications, tr]);
  return {
    snapshot: report?.contextKey === contextKey ? report.snapshot : null,
    running,
    paused,
    progress,
    error,
    cancel: () => cancelRef.current(),
    reload: () => {
      setPaused(false);
      setRefresh((value) => value + 1);
    },
  };
}
