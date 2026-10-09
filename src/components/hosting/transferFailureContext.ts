import type { GitErrorContext } from '@/types/notifications';
import type { GitPushTargetResultDto } from '@/types/remoteTransfers';
import type { RemoteTransferState } from './remoteTransferState';

export function transferFailureContext(state: RemoteTransferState, target?: GitPushTargetResultDto): GitErrorContext | undefined {
  const repoPath = target ? state.batch?.repoPath : state.intent?.repoPath;
  if (!repoPath) return undefined;
  const remote =
    target?.remoteName ?? state.failedPull?.remote ?? (state.selection.selectedRemoteNames.length === 1 ? state.selection.selectedRemoteNames[0] : undefined);
  const url = target?.url ?? (remote && state.intent?.mode !== 'push' ? state.snapshot?.remotes.find((item) => item.name === remote)?.fetchUrls[0] : undefined);
  const binding = state.preferences.bindings?.find((item) => item.remoteName === remote && item.url === url);
  return {
    repoPath,
    remote,
    url,
    ...(url ? { connectionId: binding?.credentialMode === 'system' ? null : (binding?.repository?.connectionId ?? null) } : {}),
  };
}

export function pushFailureDetails(target: GitPushTargetResultDto): string {
  return [
    ...new Set(
      [
        target.message,
        ...(target.refResults?.filter((ref) => !['success', 'up-to-date'].includes(ref.status)).map((ref) => `${ref.destinationRef}: ${ref.message}`) ?? []),
      ].filter(Boolean),
    ),
  ].join('\n');
}
