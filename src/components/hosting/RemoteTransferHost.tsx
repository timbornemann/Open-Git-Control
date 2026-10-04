import { useEffect, useLayoutEffect, useRef } from 'react';
import { useGitStore, useSettingsStore, useUIStore } from '@/contexts/AppStateContext';
import { DialogFrame } from '@/components/DialogFrame';
import { useI18n } from '@/i18n';
import { useHostingState } from './hostingState';
import { useRemoteTransferDialogState } from './remoteTransferDialogState';
import { useRemoteTransferState } from './remoteTransferState';
import { RemoteTransferCoordinator, type RemoteTransferContext } from './remoteTransferCoordinator';
import { RemoteTransferPanel } from './RemoteTransferPanel';
import { RemoteTransferProgress } from './RemoteTransferProgress';
import './remoteTransferHost.css';

/** Mounted once regardless of the selected repository subpage. */
export function RemoteTransferHost({ onOpenConfiguration }: { onOpenConfiguration: (repoPath: string) => void }) {
  const { tr } = useI18n();
  const repoPath = useGitStore((state) => state.activeRepo);
  const branch = useGitStore((state) => state.currentBranch);
  const tags = useGitStore((state) => state.tags);
  const refresh = useGitStore((state) => state.triggerRefresh);
  const toast = useGitStore((state) => state.onToast);
  const scanEnabled = useSettingsStore((state) => state.settings.secretScanBeforePushEnabled);
  const setActiveTab = useUIStore((state) => state.setActiveTab);
  const connections = useHostingState((state) => state.connections);
  const accounts = JSON.stringify(connections.map(({ id, authenticated, username, userId, apiBaseUrl }) => [id, authenticated, username, userId, apiBaseUrl]));
  const context: RemoteTransferContext = { repoPath, branch, accounts, scanEnabled };
  const environment = useRef({ context, refresh, toast, tr, onOpenConfiguration });
  useLayoutEffect(() => {
    environment.current = { context: { repoPath, branch, accounts, scanEnabled }, refresh, toast, tr, onOpenConfiguration };
  }, [repoPath, branch, accounts, scanEnabled, refresh, toast, tr, onOpenConfiguration]);
  const coordinatorRef = useRef<RemoteTransferCoordinator | null>(null);
  if (!coordinatorRef.current)
    coordinatorRef.current = new RemoteTransferCoordinator({
      getContext: () => environment.current.context,
      refresh: () => environment.current.refresh(),
      toast: (message, error) => environment.current.toast(message, error),
      tr: (de, en) => environment.current.tr(de, en),
      openConfiguration: (path) => environment.current.onOpenConfiguration(path),
    });
  const coordinator = coordinatorRef.current;
  useLayoutEffect(() => {
    coordinator.invalidate();
  }, [coordinator, repoPath, branch, accounts]);
  useEffect(() => () => coordinator.invalidate(), [coordinator]);
  const intent = useRemoteTransferDialogState((state) => state.dialog);
  const closeRequest = useRemoteTransferDialogState((state) => state.close);
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
      {state.busy && state.intent && (
        <aside className="remote-transfer-progress" role="status">
          <strong>
            {title} · {tr('Operation läuft …', 'Operation running …')}
          </strong>
          <RemoteTransferProgress repoPath={state.intent.repoPath} />
          <button onClick={() => coordinator.cancel()}>{tr('Abbrechen', 'Cancel')}</button>
        </aside>
      )}
      {state.phase === 'result' && !state.resultVisible && (
        <aside className="remote-transfer-progress" aria-live="polite">
          <button onClick={() => coordinator.showResult()}>
            {state.failedPull ? tr('Pull wiederaufnehmen', 'Resume pull') : tr('Übertragungsergebnis öffnen', 'Open transfer result')}
          </button>
        </aside>
      )}
      <DialogFrame open={modal} title={title} closeOnBackdrop={false} onClose={() => coordinator.close()} cancelLabel={tr('Schließen', 'Close')}>
        <RemoteTransferPanel
          state={state}
          tags={tags}
          choose={(selection, mode) => void coordinator.choose(selection, mode)}
          approve={() => void coordinator.approve()}
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
