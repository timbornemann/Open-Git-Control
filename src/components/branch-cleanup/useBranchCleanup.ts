import { useCallback, useEffect, useRef, useState } from 'react';
import { gitClient } from '@/services/gitClient';
import type { BranchCleanupInspection, BranchCleanupResult } from '@/shared/ipc/branchCleanup';

type Operation = { id: string; kind: 'inspect' | 'execute' };
export function useBranchCleanup(repoPath: string, onChanged: () => void) {
  const [inspection, setInspection] = useState<BranchCleanupInspection | null>(null);
  const [result, setResult] = useState<BranchCleanupResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [patterns, setPatterns] = useState('');
  const [busy, setBusy] = useState<'inspect' | 'execute' | 'preferences' | null>('inspect');
  const [phase, setPhase] = useState('checking');
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const operation = useRef<Operation | null>(null);
  const generation = useRef(0);
  const changed = useRef(onChanged);
  changed.current = onChanged;

  const inspect = useCallback(
    async (targetOverrides: Record<string, string> = {}) => {
      if (operation.current?.kind === 'execute') return;
      if (operation.current) void gitClient.cancelBranchCleanup(operation.current.id).catch(() => {});
      const current = ++generation.current;
      const id = crypto.randomUUID();
      operation.current = { id, kind: 'inspect' };
      setBusy('inspect');
      setPhase('checking');
      setError('');
      setInspection(null);
      setResult(null);
      setSelected(new Set());
      setCancelling(false);
      try {
        const response = await gitClient.inspectBranchCleanup({ repoPath, operationId: id, targetOverrides });
        if (generation.current !== current) return;
        if (!response.success) {
          setError(response.error);
          return;
        }
        setInspection(response.data);
        setPatterns(response.data.protectedPatterns.join('\n'));
        setSelected(
          new Set(response.data.candidates.filter((candidate) => candidate.selectedByDefault && !candidate.blocks.length).map((candidate) => candidate.id)),
        );
      } catch (failure) {
        if (generation.current === current) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (generation.current === current) {
          operation.current = null;
          setBusy(null);
          setCancelling(false);
        }
      }
    },
    [repoPath],
  );

  useEffect(() => {
    const lifetime = generation;
    void inspect();
    return () => {
      lifetime.current++;
      if (operation.current) void gitClient.cancelBranchCleanup(operation.current.id).catch(() => {});
      operation.current = null;
    };
  }, [inspect]);

  useEffect(
    () =>
      gitClient.onJobEvent((event) => {
        if (event.id === operation.current?.id && event.status === 'progress' && event.message) setPhase(event.message);
      }),
    [],
  );

  const overrides = () =>
    Object.fromEntries(inspection?.comparisons.filter((comparison) => comparison.targetId).map((comparison) => [comparison.id, comparison.targetId!]) ?? []);
  const refresh = () => inspect(overrides());
  const setTarget = (comparisonId: string, targetId: string) => inspect({ ...overrides(), [comparisonId]: targetId });
  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectMerged = (kind: 'local' | 'server') =>
    setSelected(
      (previous) =>
        new Set([
          ...previous,
          ...(inspection?.candidates
            .filter((candidate) => candidate.kind === kind && candidate.classification === 'merged' && !candidate.blocks.length)
            .map((candidate) => candidate.id) ?? []),
        ]),
    );
  const savePatterns = async () => {
    if (busy) return;
    const current = generation.current;
    setBusy('preferences');
    setError('');
    try {
      const response = await gitClient.saveBranchCleanupPreferences(repoPath, {
        protectedPatterns: patterns
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
      if (generation.current !== current) return;
      if (!response.success) {
        setError(response.error);
        return;
      }
      await refresh();
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (!operation.current && generation.current === current) setBusy(null);
    }
  };
  const execute = async (confirmedUnmergedIds: string[]) => {
    if (!inspection || operation.current || !selected.size) return;
    if (Date.now() >= inspection.expiresAt) {
      setError('expired');
      return;
    }
    const current = generation.current;
    const id = crypto.randomUUID();
    operation.current = { id, kind: 'execute' };
    setBusy('execute');
    setPhase('checking');
    setError('');
    setCancelling(false);
    try {
      const response = await gitClient.executeBranchCleanup({
        repoPath,
        operationId: id,
        planId: inspection.id,
        selectedIds: [...selected],
        confirmedUnmergedIds,
      });
      if (generation.current !== current) return;
      if (!response.success) {
        setError(response.error);
        return;
      }
      setResult(response.data);
      if (response.data.outcomes.some((outcome) => outcome.status === 'deleted' || outcome.status === 'unknown')) changed.current();
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (generation.current === current) {
        operation.current = null;
        setBusy(null);
        setCancelling(false);
      }
    }
  };
  const cancel = () => {
    if (!operation.current || cancelling) return;
    setCancelling(true);
    void gitClient.cancelBranchCleanup(operation.current.id).catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : String(failure));
      setCancelling(false);
    });
  };

  return {
    inspection,
    result,
    selected,
    patterns,
    setPatterns,
    busy,
    phase,
    error,
    cancelling,
    inspect,
    refresh,
    setTarget,
    toggle,
    selectMerged,
    savePatterns,
    execute,
    cancel,
  };
}
