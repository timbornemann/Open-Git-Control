import { getElectronApi } from '@/services/electronApi';
import { branchChangeTargetFromArgs, requestBranchChange } from '@/components/branch-change/branchChangeDialogState';
import type { BranchChangeTarget } from '@/shared/ipc/branchChange';

export const guidedBranchTarget = (args: string[]) => (getElectronApi()?.git?.inspectBranchChange ? branchChangeTargetFromArgs(args) : null);
export async function executeGuidedBranchChange(params: {
  repo: string;
  target: BranchChangeTarget;
  signal: AbortSignal;
  current(): boolean;
  refresh(): void;
  conflict(path: string): void;
  toast(value: { msg: string; isError: boolean }): void;
  success: string;
}) {
  const result = await requestBranchChange(params.repo, params.target, params.signal);
  if (!params.current() || !result) return false;
  params.refresh();
  if (result.conflicts.length) params.conflict(result.conflicts[0]);
  params.toast({ msg: result.error || params.success, isError: Boolean(result.error && !result.restored) });
  return result.switched && (!result.error || result.restored);
}
