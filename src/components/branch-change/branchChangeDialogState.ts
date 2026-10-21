import { create } from 'zustand';
import type { BranchChangeInspection, BranchChangeResult, BranchChangeTarget, ExecuteBranchChangeRequest, ParkedBranchChange } from '@/shared/ipc/branchChange';
import { branchChangeClient } from '@/services/branchChangeClient';

export type BranchChangeDecision = Omit<ExecuteBranchChangeRequest, 'repoPath'>;
type Answer = BranchChangeResult | BranchChangeDecision | null;
export type BranchChangeDialog = {
  id: string;
  repoPath: string;
  target?: BranchChangeTarget;
  sessionId?: string;
  inspection?: BranchChangeInspection;
  preparation?: 'inspect' | 'execute' | 'failed';
  error?: string;
  cancelling?: boolean;
  refreshNeeded?: boolean;
  prepare: boolean;
  alternatives?: ParkedBranchChange[];
  retry(): void;
  cancel(): void;
  finish(value: Answer): void;
};
export type ReadyBranchChangeDialog = BranchChangeDialog & { inspection: BranchChangeInspection };
export const useBranchChangeDialogState = create<{ pending: BranchChangeDialog | null; set(value: BranchChangeDialog | null): void }>((set) => ({
  pending: null,
  set: (pending) => set({ pending }),
}));
async function openChange(
  repoPath: string,
  target: BranchChangeTarget | undefined,
  prepare: boolean,
  signal?: AbortSignal,
  sessionId?: string,
  alternatives?: ParkedBranchChange[],
): Promise<Answer> {
  if (useBranchChangeDialogState.getState().pending) throw new Error('Finish the current branch change first.');
  if (signal?.aborted) return null;
  return new Promise<Answer>((resolve) => {
    const id = crypto.randomUUID();
    const current = () => useBranchChangeDialogState.getState().pending?.id === id;
    const update = (value: Partial<BranchChangeDialog>) => {
      const pending = useBranchChangeDialogState.getState().pending;
      if (pending?.id === id) useBranchChangeDialogState.getState().set({ ...pending, ...value });
    };
    const stop = () => void branchChangeClient.cancelBranchChange(repoPath).catch(() => undefined);
    const abort = () => {
      stop();
      dialog.finish(null);
    };
    const inspect = async () => {
      update({ preparation: 'inspect', error: undefined, cancelling: false, refreshNeeded: false });
      let executing = false;
      try {
        const response = await branchChangeClient.inspectBranchChange({ repoPath, target, sessionId, progressId: id });
        if (!current()) return;
        if (!response.success) throw new Error(response.error);
        const inspection = response.data;
        if (!prepare && target?.kind === 'existing' && target.branch === inspection.sourceBranch && !inspection.blocks.length) {
          dialog.finish({ switched: true, restored: false, conflicts: [] });
          return;
        }
        if (!inspection.files.length && !inspection.blocks.length && !sessionId) {
          const decision = { planId: inspection.planId, mode: 'carry' as const, name: inspection.suggestedName, progressId: id };
          if (prepare) {
            dialog.finish(decision);
            return;
          }
          executing = true;
          update({ preparation: 'execute', inspection });
          const execution = await branchChangeClient.executeBranchChange({ repoPath, ...decision });
          if (!current()) return;
          if (!execution.success) throw new Error(execution.error);
          dialog.finish(execution.data);
          return;
        }
        update({ inspection, preparation: undefined });
      } catch (error) {
        update({ preparation: 'failed', error: error instanceof Error ? error.message : String(error), cancelling: false, refreshNeeded: executing });
      }
    };
    const dialog: BranchChangeDialog = {
      id,
      repoPath,
      target,
      sessionId,
      preparation: 'inspect',
      prepare,
      alternatives,
      retry: () => {
        if (useBranchChangeDialogState.getState().pending?.preparation === 'failed') void inspect();
      },
      cancel: () => {
        stop();
        if (useBranchChangeDialogState.getState().pending?.preparation === 'execute') update({ cancelling: true });
        else dialog.finish(null);
      },
      finish: (answer) => {
        if (!current()) return;
        signal?.removeEventListener('abort', abort);
        useBranchChangeDialogState.getState().set(null);
        resolve(answer);
      },
    };
    signal?.addEventListener('abort', abort, { once: true });
    useBranchChangeDialogState.getState().set(dialog);
    void inspect();
  });
}
export const requestBranchChange = (repo: string, target: BranchChangeTarget, signal?: AbortSignal) =>
  openChange(repo, target, false, signal) as Promise<BranchChangeResult | null>;
export const prepareBranchChange = (repo: string, target: BranchChangeTarget, signal?: AbortSignal) =>
  openChange(repo, target, true, signal) as Promise<BranchChangeDecision | null>;
export const requestParkedChanges = (repo: string, sessionId: string, signal?: AbortSignal, alternatives?: ParkedBranchChange[]) =>
  openChange(repo, undefined, false, signal, sessionId, alternatives) as Promise<BranchChangeResult | null>;

/** Only HEAD transitions are routed; file checkouts/forced recovery stay with their existing explicit guards. */
export function branchChangeTargetFromArgs(args: string[]): BranchChangeTarget | null {
  if (!['checkout', 'switch'].includes(args[0]) || args.includes('--')) return null;
  if (args.slice(1).some((arg) => ['-f', '--force', '-B', '-C', '--orphan', '--discard-changes', '-m', '--merge'].includes(arg))) return null;
  const tokens = args.slice(1);
  const create = tokens.findIndex((arg) => ['-b', '-c'].includes(arg));
  const tracking = tokens.includes('--track') || tokens.includes('-t');
  const positional = tokens.filter((arg) => !['-b', '-c', '--track', '-t', '--detach'].includes(arg));
  if (tokens.some((arg) => arg.startsWith('-') && !['-b', '-c', '--track', '-t', '--detach'].includes(arg))) return null;
  if (create >= 0 && positional.length <= 2 && positional[0]) return { kind: 'create', branch: positional[0], startPoint: positional[1] || 'HEAD', tracking };
  if (tracking && positional.length === 1)
    return {
      kind: 'create',
      branch: positional[0]
        .replace(/^remotes\//, '')
        .split('/')
        .slice(1)
        .join('/'),
      startPoint: positional[0],
      tracking: true,
    };
  if (positional.length !== 1) return null;
  if (tokens.includes('--detach') || /^[a-f0-9]{7,64}$/i.test(positional[0]) || positional[0].startsWith('refs/tags/'))
    return { kind: 'detached', ref: positional[0] };
  return { kind: 'existing', branch: positional[0] };
}
