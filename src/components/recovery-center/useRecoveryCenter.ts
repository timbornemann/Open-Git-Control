import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { peekResource } from '@/data/clientCache';
import type { IpcResult } from '@/types/ipc';
import type { GitReflogEntryDto } from '@/types/git';
import type { GitCommandNameDto } from '@/types/gitDtos';
import { useAppToastSetter } from '@/hooks/useAppToast';
import { useI18n } from '@/i18n';
import { gitClient } from '@/services/gitClient';
import { parseGitReflog } from '@/utils/gitParsing';
import { validateBranchName } from '@/utils/gitRefValidation';
import { confirmWorkingDirectoryNavigation } from '@/components/working-directory/workingDirectoryNavigationGuard';
import {
  filterRecoveryEntries,
  getRecoveryEntryKey,
  selectLoadedRecoveryKey,
  sortRecoveryEntries,
  type RecoveryActionId,
  type RecoveryCenterProps,
  type RecoveryDangerAction,
  type RecoveryEntryFilter,
  type RecoveryIssue,
} from './recoveryCenterUtils';
import { loadRecoveryPoints } from './loadRecoveryPoints';

export function useRecoveryCenter({ repoPath, refreshTrigger, onRepoChanged, settings }: RecoveryCenterProps) {
  const { tr } = useI18n();
  const setToast = useAppToastSetter();
  const loadSequence = useRef(0);
  const context = useRef({ repoPath, mounted: true });
  const activeAction = useRef<object | null>(null);
  const [loaded, setLoaded] = useState<{ repoPath: string | null; entries: GitReflogEntryDto[] }>(() => {
    const cached = peekResource<IpcResult<string>>('git', 'runGitCommandForRepo', [repoPath, 'reflog', '300']);
    return { repoPath, entries: cached?.success ? parseGitReflog(cached.data) : [] };
  });
  const loadedRef = useRef(loaded);
  useLayoutEffect(() => {
    loadedRef.current = loaded;
  }, [loaded]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [source, setSource] = useState<RecoveryEntryFilter>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [loadIssue, setLoadIssue] = useState<RecoveryIssue | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchNameTouched, setBranchNameTouched] = useState(false);
  const [pendingAction, setPendingAction] = useState<RecoveryActionId | null>(null);
  const [dangerAction, setDangerAction] = useState<RecoveryDangerAction>(null);
  const [actionIssue, setActionIssue] = useState<RecoveryIssue | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const entries = useMemo(() => (loaded.repoPath === repoPath ? loaded.entries : []), [loaded, repoPath]);
  const isAvailable = gitClient.isAvailable();

  useLayoutEffect(() => {
    const currentContext = context.current;
    currentContext.mounted = true;
    if (currentContext.repoPath !== repoPath) {
      currentContext.repoPath = repoPath;
      activeAction.current = null;
      setSelectedKey(null);
      setFilter('');
      setSource('all');
      setDangerAction(null);
      setPendingAction(null);
      setActionIssue(null);
      setSuccessMessage(null);
    }
    return () => {
      currentContext.mounted = false;
    };
  }, [repoPath]);

  const loadReflog = useCallback(async () => {
    const requestId = ++loadSequence.current;
    if (!repoPath || !gitClient.isAvailable()) {
      setLoaded({ repoPath, entries: [] });
      setLoadIssue(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await loadRecoveryPoints(repoPath, tr);
      if (requestId !== loadSequence.current || !context.current.mounted || context.current.repoPath !== repoPath) return;
      setLoadIssue(result.issue);
      if (result.historyAvailable || result.backupsAvailable) {
        const previousEntries = loadedRef.current.repoPath === repoPath ? loadedRef.current.entries : [];
        const retained = previousEntries.filter((entry) =>
          entry.selector.startsWith('refs/ogc/commit-reword/') ? !result.backupsAvailable : !result.historyAvailable,
        );
        const nextEntries = sortRecoveryEntries([...result.entries, ...retained]);
        setLoaded({ repoPath, entries: nextEntries });
        setSelectedKey((current) => selectLoadedRecoveryKey(current, nextEntries, previousEntries));
      }
    } catch (error: unknown) {
      if (requestId !== loadSequence.current || !context.current.mounted || context.current.repoPath !== repoPath) return;
      setLoadIssue({
        message: tr('Wiederherstellungspunkte konnten nicht geladen werden.', 'Recovery points could not be loaded.'),
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (requestId === loadSequence.current && context.current.mounted) setIsLoading(false);
    }
  }, [repoPath, tr]);

  useEffect(() => {
    void loadReflog();
    return () => {
      loadSequence.current += 1;
    };
  }, [loadReflog, refreshTrigger]);

  const filtered = useMemo(() => filterRecoveryEntries(entries, filter, source), [entries, filter, source]);
  const selected = filtered.find((entry) => getRecoveryEntryKey(entry) === selectedKey) ?? filtered[0] ?? null;
  const entryKey = selected ? getRecoveryEntryKey(selected) : null;
  const draftKey = selected ? `${selected.hash}\u0000${selected.date}\u0000${selected.subject}` : null;
  const abbrevHash = selected?.abbrevHash ?? '';
  useEffect(() => {
    setBranchName(abbrevHash ? `recovery-${abbrevHash}` : '');
    setBranchNameTouched(false);
    setActionIssue(null);
    setSuccessMessage(null);
  }, [abbrevHash, draftKey, repoPath]);

  const runAction = useCallback(
    async (actionId: RecoveryActionId, args: string[], message: string) => {
      if (!repoPath || !gitClient.isAvailable() || activeAction.current || context.current.repoPath !== repoPath || !context.current.mounted) return;
      const action = {};
      activeAction.current = action;
      setPendingAction(actionId);
      setActionIssue(null);
      setSuccessMessage(null);
      const isCurrent = () => context.current.mounted && context.current.repoPath === repoPath && activeAction.current === action;
      try {
        if (!(await confirmWorkingDirectoryNavigation({ kind: 'view', label: tr('Wiederherstellung', 'Recovery') })) || !isCurrent()) return;
        const result = await gitClient.runGitCommandForRepo(repoPath, args[0] as GitCommandNameDto, ...args.slice(1));
        if (!isCurrent()) return;
        if (!result.success) throw new Error(result.error || tr('Git konnte die Aktion nicht abschließen.', 'Git could not complete the action.'));
        setSuccessMessage(message);
        setToast({ msg: message, isError: false });
        onRepoChanged();
        await loadReflog();
        if (isCurrent()) setSuccessMessage(message);
      } catch (error: unknown) {
        if (!isCurrent()) return;
        const details = error instanceof Error ? error.message : String(error);
        const message = tr(
          'Wiederherstellung nicht abgeschlossen. Prüfe die Git-Meldung, bevor du es erneut versuchst.',
          'Recovery did not complete. Check the Git message before trying again.',
        );
        setActionIssue({ message, details });
        setToast({ msg: details, isError: true });
      } finally {
        if (isCurrent()) {
          activeAction.current = null;
          setPendingAction(null);
        }
      }
    },
    [loadReflog, onRepoChanged, repoPath, setToast, tr],
  );

  const runDangerAware = (payload: Exclude<RecoveryDangerAction, null>) => {
    if (activeAction.current) return;
    if (settings.confirmDangerousOps) setDangerAction(payload);
    else void payload.run();
  };
  const branchNameError = validateBranchName(branchName);
  const createRecoveryBranch = (event: FormEvent) => {
    event.preventDefault();
    setBranchNameTouched(true);
    if (!selected || branchNameError) return;
    const name = branchName.trim();
    void runAction(
      'branch',
      ['checkout', '-b', name, selected.hash],
      tr(`Recovery-Branch "${name}" wurde erstellt.`, `Recovery branch "${name}" was created.`),
    );
  };

  return {
    entries,
    filtered,
    selected,
    selectedKey: entryKey,
    setSelectedKey,
    filter,
    setFilter,
    source,
    setSource,
    isAvailable,
    isLoading,
    loadIssue,
    loadReflog,
    branchName,
    setBranchName,
    branchNameTouched,
    setBranchNameTouched,
    branchNameError,
    pendingAction,
    isBusy: pendingAction !== null,
    dangerAction,
    setDangerAction,
    runAction,
    runDangerAware,
    createRecoveryBranch,
    actionIssue,
    successMessage,
  };
}

export type RecoveryCenterState = ReturnType<typeof useRecoveryCenter>;
