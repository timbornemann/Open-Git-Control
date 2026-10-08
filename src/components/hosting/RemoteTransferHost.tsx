import { requestSecretScanAllowlistEditor } from '@/components/repository-security/secretScanAllowlistNavigation';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useGitStore, useSettingsStore, useUIStore } from '@/contexts/AppStateContext';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import { useHostingState } from './hostingState';
import { useRemoteTransferDialogState } from './remoteTransferDialogState';
import { useRemoteTransferState } from './remoteTransferState';
import { RemoteTransferCoordinator, type RemoteTransferContext } from './remoteTransferCoordinator';
import { RemoteTransferPanel } from './RemoteTransferPanel';
import { useRemoteTransferNotifications } from './useRemoteTransferNotifications';
import './hosting.css';

/** Mounted once regardless of the selected repository subpage. */
export function RemoteTransferHost({ onOpenConfiguration }: { onOpenConfiguration: (repoPath: string) => void }) {
  const { tr } = useI18n();
  const repoPath = useGitStore((state) => state.activeRepo);
  const branch = useGitStore((state) => state.currentBranch);
  const tags = useGitStore((state) => state.tags);
  const refresh = useGitStore((state) => state.triggerRefresh);
  const scanEnabled = useSettingsStore((state) => state.settings.secretScanBeforePushEnabled);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const connections = useHostingState((state) => state.connections);
  const accounts = JSON.stringify(connections.map(({ id, authenticated, username, userId, apiBaseUrl }) => [id, authenticated, username, userId, apiBaseUrl]));
  const context: RemoteTransferContext = { repoPath, branch, accounts, scanEnabled };
  const complete = useRef<(message: string, error: boolean) => void>(() => {});
  const environment = useRef({ context, refresh, tr, onOpenConfiguration });
  useLayoutEffect(() => {
    environment.current = { context: { repoPath, branch, accounts, scanEnabled }, refresh, tr, onOpenConfiguration };
  }, [repoPath, branch, accounts, scanEnabled, refresh, tr, onOpenConfiguration]);
  const coordinatorRef = useRef<RemoteTransferCoordinator | null>(null);
  if (!coordinatorRef.current)
    coordinatorRef.current = new RemoteTransferCoordinator({
      getContext: () => environment.current.context,
      refresh: () => environment.current.refresh(),
      toast: (message, error) => complete.current(message, error),
      tr: (de, en) => environment.current.tr(de, en),
      openConfiguration: (path) => environment.current.onOpenConfiguration(path),
    });
  const coordinator = coordinatorRef.current;
  complete.current = useRemoteTransferNotifications(coordinator, JSON.stringify([repoPath, branch, accounts]), tr);
  useLayoutEffect(() => {
    coordinator.invalidate();
  }, [coordinator, repoPath, branch, accounts]);
  useEffect(() => () => coordinator.invalidate(), [coordinator]);
  const intent = useRemoteTransferDialogState((state) => state.dialog);
  const closeRequest = useRemoteTransferDialogState((state) => state.close);
  const cancelledRequest = useRemoteTransferDialogState((state) => state.cancelledRequest);
  useEffect(() => {
    if (!cancelledRequest) return;
    if (useRemoteTransferState.getState().intent?.requestId === cancelledRequest) coordinator.cancel();
    useRemoteTransferDialogState.getState().cancelRequest(null);
  }, [cancelledRequest, coordinator]);
  useEffect(() => {
    if (intent) {
      closeRequest();
      void coordinator.start(intent);
    }
  }, [intent, closeRequest, coordinator]);
  const state = useRemoteTransferState();
  const title =
    state.intent?.mode === 'push'
      ? tr('Push-Ziele', 'Push targets')
      : state.intent?.mode === 'pull'
        ? tr('Pull-Quelle', 'Pull source')
        : tr('Fetch-Quelle', 'Fetch source');
  const modal = ['selection', 'review'].includes(state.phase) || (state.phase === 'result' && state.resultVisible);
  return (
    <>
      <DialogFrame open={modal} title={title} closeOnBackdrop={false} onClose={() => coordinator.close()} cancelLabel={tr('Schließen', 'Close')}>
        <RemoteTransferPanel
          state={state}
          tags={tags}
          choose={(selection, mode) => void coordinator.choose(selection, mode)}
          approve={() => void coordinator.approve()}
          retryScan={() => void coordinator.retryScan()}
          allowlistAndRescan={() => void coordinator.allowlistAndRescan()}
          openAllowlist={() => {
            const path = state.intent?.repoPath;
            coordinator.close();
            if (path) requestSecretScanAllowlistEditor(path);
          }}
          retryPush={() => void coordinator.retryPush()}
          retryPull={() => void coordinator.retryPull()}
          openWorkspace={() => {
            coordinator.close();
            setActiveTab('repo');
          }}
          openConfiguration={() => {
            const path = state.intent?.repoPath;
            coordinator.close();
            if (path) onOpenConfiguration(path);
          }}
        />
      </DialogFrame>
    </>
  );
}
