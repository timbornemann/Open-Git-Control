import { useI18n } from '@/i18n';
import type { RemoteSelectionMode } from '@/types/remoteTransfers';
import type { RemoteTransferSelection, RemoteTransferState } from './remoteTransferState';
import { RemoteTransferSelectionForm } from './RemoteTransferSelectionForm';
import { PushTransferReview } from './PushTransferReview';
import { PushTransferResults } from './PushTransferResults';
import { PullTransferRecovery } from './PullTransferRecovery';

export type TransferMode = 'remotes' | 'push' | 'pull' | 'fetch';
export function RemoteTransferPanel({
  state,
  tags,
  choose,
  approve,
  retryScan,
  retryPush,
  retryPull,
  openWorkspace,
  openConfiguration,
}: {
  state: RemoteTransferState;
  tags: string[];
  choose: (selection: RemoteTransferSelection, mode: RemoteSelectionMode) => void;
  approve: () => void;
  retryScan: () => void;
  retryPush: () => void;
  retryPull: () => void;
  openWorkspace: () => void;
  openConfiguration: () => void;
}) {
  const { tr } = useI18n();
  return (
    <section className="hosting-transfers">
      <small>{state.intent?.repoPath}</small>
      {state.phase === 'selection' && <RemoteTransferSelectionForm state={state} tags={tags} choose={choose} />}
      {state.phase === 'selection' && state.reason === 'no-branch' && <button onClick={openWorkspace}>{tr('Arbeitsbereich öffnen', 'Open workspace')}</button>}
      {state.phase === 'review' && state.plan && (
        <PushTransferReview
          plan={state.plan}
          batch={state.batch}
          scan={state.scan}
          reviewingRetry={state.retrying}
          force={Boolean(state.intent?.force)}
          busy={state.busy}
          executePush={approve}
          retryScan={retryScan}
        />
      )}
      {state.phase === 'result' && state.batch && (
        <PushTransferResults batch={state.batch} busy={state.busy} canRetry={Boolean(state.plan)} reviewRetry={retryPush} scan={state.scan} />
      )}
      {state.phase === 'result' && state.failedPull && (
        <PullTransferRecovery failedPull={state.failedPull} busy={state.busy} retry={retryPull} openWorkspace={openWorkspace} />
      )}
      {state.error && (
        <p className="hosting-error" role="alert">
          {state.error}
        </p>
      )}
      <button onClick={openConfiguration}>{tr('Remote-Konfiguration öffnen', 'Open remote configuration')}</button>
    </section>
  );
}
