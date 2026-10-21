import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import { useI18n } from '@/i18n';
import type { UntrackFilesInspection, UntrackScope } from '@/shared/ipc/untrackFiles';

type Session = { repo: string; path: string; scope: UntrackScope };
type Params = { repoPath: string | null; canExecute: boolean; onChanged: () => Promise<void> };

export function useUntrackFiles({ repoPath, canExecute, onChanged }: Params) {
  const { tr } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [inspection, setInspection] = useState<UntrackFilesInspection | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'inspect' | 'execute' | null>(null);
  const [phase, setPhase] = useState('inspect');
  const [error, setError] = useState('');
  const [result, setResult] = useState<string[] | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const operation = useRef<string | null>(null);
  const executing = useRef(false);
  const epoch = useRef(0);

  const cancel = () => {
    if (operation.current) void gitClient.cancelUntrackFiles(operation.current).catch(() => {});
  };
  useLayoutEffect(() => {
    const invalidate = () => {
      epoch.current++;
      cancel();
    };
    invalidate();
    setSession(null);
    setBusy(null);
    return invalidate;
  }, [repoPath]);
  useEffect(() => {
    if (!session) return;
    return gitClient.onJobEvent((event) => {
      if (event.id === operation.current && event.status === 'progress' && event.message) setPhase(event.message);
    });
  }, [session]);

  useEffect(() => {
    if (!session || session.repo !== repoPath) return;
    let active = true;
    const id = crypto.randomUUID();
    operation.current = id;
    void gitClient
      .inspectUntrackFiles({ repoPath: session.repo, path: session.path, scope: session.scope, operationId: id })
      .then((response) => {
        if (!active) return;
        if (!response.success) throw new Error(response.error);
        setInspection(response.data);
        setSelected(
          new Set(
            response.data.candidates
              .filter((candidate) => !candidate.blocked && (session.scope === 'file' || candidate.ignored))
              .map((candidate) => candidate.id),
          ),
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setBusy(null);
        if (operation.current === id) operation.current = null;
      });
    return () => {
      active = false;
      void gitClient.cancelUntrackFiles(id).catch(() => {});
    };
  }, [session, repoPath]);

  const inspect = (next: Session) => {
    setInspection(null);
    setSelected(new Set());
    setError('');
    setResult(null);
    setPhase('inspect');
    setBusy('inspect');
    setCancelling(false);
    setSession(next);
  };
  const close = () => {
    cancel();
    if (executing.current) {
      setCancelling(true);
      return;
    }
    setSession(null);
    setBusy(null);
  };
  const execute = async () => {
    if (!inspection || !session || busy || executing.current || !canExecute || !selected.size) return;
    executing.current = true;
    const generation = epoch.current;
    const id = crypto.randomUUID();
    operation.current = id;
    setBusy('execute');
    setError('');
    setPhase('validate');
    setCancelling(false);
    try {
      const response = await gitClient.executeUntrackFiles({ repoPath: session.repo, operationId: id, planId: inspection.planId, selectedIds: [...selected] });
      if (generation !== epoch.current) return;
      if (!response.success) throw new Error(response.error);
      if (response.data.status === 'stale') {
        setInspection(null);
        setSelected(new Set());
        setError(
          tr(
            'Die Vorschau ist nicht mehr aktuell. Bitte erneut prüfen und auswählen.',
            'The preview is out of date. Inspect again and select the files again.',
          ),
        );
      } else {
        setResult(response.data.paths);
        // Refresh failures must not disguise an already published index change.
        try {
          await onChanged();
        } catch {
          if (generation === epoch.current)
            setError(tr('Dateien entfernt. Die Ansicht konnte nicht aktualisiert werden.', 'Files untracked. The view could not be refreshed.'));
        }
      }
    } catch (reason) {
      if (generation === epoch.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      executing.current = false;
      if (operation.current === id) operation.current = null;
      if (generation === epoch.current) {
        setBusy(null);
        setCancelling(false);
      }
    }
  };
  return {
    open: (path: string) => {
      if (repoPath && !busy && canExecute) inspect({ repo: repoPath, path, scope: 'file' });
    },
    visible: Boolean(session && session.repo === repoPath),
    scope: session?.scope ?? 'file',
    inspection,
    selected,
    busy,
    phase,
    error,
    result,
    cancelling,
    close,
    execute,
    refresh: () => {
      if (session && !busy) inspect({ ...session });
    },
    changeScope: (scope: UntrackScope) => {
      if (session && !busy) inspect({ ...session, scope });
    },
    toggle: (id: string) => {
      if (busy || result || !inspection?.candidates.some((candidate) => candidate.id === id && !candidate.blocked)) return;
      setSelected((old) => {
        const next = new Set(old);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
  };
}
