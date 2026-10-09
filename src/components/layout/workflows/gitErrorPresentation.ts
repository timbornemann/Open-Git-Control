import { openSystemTools } from '@/app/state/systemToolsStore';
import { ensureCommitIdentity } from '@/app/state/gitIdentityStore';
import { useHostingState } from '@/components/hosting/hostingState';
import { hideRemoteTransferResult } from '@/components/hosting/remoteTransferState';
import { gitClient } from '@/services/gitClient';
import { hostingClient, transferClient } from '@/services/hostingClient';
import type { GitErrorContext, NotificationMessage } from '@/types/notifications';
import { describeGitFailure, explainGitNotification } from '@/utils/gitFailure';
import { parseFirstConflictPathFromPorcelain } from '@/utils/gitParsing/conflicts';
import { normalizeRepoPathKey } from '@/utils/repoPath';

export type GitErrorEnvironment = {
  repoPath: string | null;
  tr: (de: string, en: string) => string;
  notify: (message: NotificationMessage) => unknown;
  openWorkspace: () => void;
  openRepositories: () => void;
  openAccounts: (connectionId?: string) => void;
  openRemoteConfiguration: () => void;
  openConflict: (path: string) => void;
};
type EnvironmentReader = () => GitErrorEnvironment | null;
const notificationContext = (message: NotificationMessage, repoPath: string | null): GitErrorContext | undefined =>
  message.gitContext ?? (repoPath ? { repoPath } : undefined);

/** Every remedy retains the repository/account of the failed operation. */
export function prepareGitErrorNotification(message: NotificationMessage, read: EnvironmentReader): NotificationMessage {
  const environment = read();
  if (!environment || message.errorExplained) return message;
  const prepared = explainGitNotification(message, environment.tr);
  if (!prepared.errorExplained) return message;
  const failure = describeGitFailure(message.technicalDetails || message.msg, environment.tr, Boolean(message.gitContext))!;
  if (failure.kind === 'cancelled') return prepared;
  const context = notificationContext(message, environment.repoPath);
  const connectionId = context?.connectionId;
  const account = () => {
    const connections = useHostingState.getState().connections;
    return JSON.stringify(connectionId ? connections.find((connection) => connection.id === connectionId) : connections);
  };
  const accountSnapshot = account();
  const session = hostingClient.sessionVersion(connectionId ?? undefined);
  const current = () => {
    const next = read();
    return Boolean(
      next &&
      (!context || (next.repoPath && normalizeRepoPathKey(next.repoPath) === normalizeRepoPathKey(context.repoPath))) &&
      account() === accountSnapshot &&
      hostingClient.sessionVersion(connectionId ?? undefined) === session,
    );
  };
  const run =
    (work: () => void | Promise<unknown>, needsContext = true, verifyEndpoint = false) =>
    () => {
      if (needsContext && !current()) {
        read()?.notify({
          msg: environment.tr(
            'Repository oder Konto wurde gewechselt. Starte die Aktion im aktuellen Kontext erneut.',
            'The repository or account changed. Start the action again in the current context.',
          ),
          isError: false,
          kind: 'info',
        });
        return;
      }
      void Promise.resolve()
        .then(async () => {
          if (needsContext && !current()) return;
          if (verifyEndpoint && context?.remote && context.url) {
            const [snapshot, preferences] = await Promise.all([
              transferClient.request('getRemotes', { repoPath: context.repoPath }),
              transferClient.request('getPreferences', { repoPath: context.repoPath }),
            ]);
            if (!current()) return;
            const remote = snapshot.remotes.find((item) => item.name === context.remote);
            const binding = preferences.bindings?.find((item) => item.remoteName === context.remote && item.url === context.url);
            const boundAccount = binding?.credentialMode === 'system' ? null : (binding?.repository?.connectionId ?? null);
            if (
              !remote ||
              ![...remote.fetchUrls, ...remote.pushUrls].includes(context.url) ||
              (context.connectionId !== undefined && context.connectionId !== boundAccount)
            )
              throw new Error('Remote endpoint or account binding changed. Review the remote configuration.');
          }
          if (!needsContext || current()) return work();
        })
        .catch((error: unknown) => {
          if (current()) read()?.notify({ msg: error instanceof Error ? error.message : String(error), isError: true, gitContext: context });
        });
    };
  let action: NonNullable<NotificationMessage['actions']>[number] | undefined;
  const { tr } = environment;
  switch (failure.kind) {
    case 'git-missing':
    case 'lfs-missing':
      action = {
        label: failure.kind === 'git-missing' ? tr('Git installieren', 'Install Git') : tr('Git LFS installieren', 'Install Git LFS'),
        onClick: run(() => {
          hideRemoteTransferResult();
          openSystemTools(failure.kind === 'git-missing' ? 'git' : 'git-lfs');
        }, false),
      };
      break;
    case 'authentication':
      action =
        context?.connectionId === null || (context?.url && !/^https?:\/\//i.test(context.url))
          ? { label: tr('Zugangsdaten prüfen', 'Check credentials'), onClick: run(environment.openRemoteConfiguration, true, true) }
          : { label: tr('Anmelden', 'Sign in'), onClick: run(() => environment.openAccounts(connectionId ?? undefined), true, true) };
      break;
    case 'connection':
      action =
        context?.remote && context.url
          ? {
              label: tr('Verbindung erneut prüfen', 'Verify connection again'),
              onClick: run(async () => {
                environment.notify({ msg: tr('Verbindung wird geprüft …', 'Verifying connection …'), isError: false, kind: 'info' });
                await transferClient.request('checkConnection', {
                  repoPath: context.repoPath,
                  remote: context.remote!,
                  url: context.url!,
                  connectionId: context.connectionId,
                });
                if (current())
                  read()?.notify({
                    msg: tr(
                      'Der Git-Endpunkt ist erreichbar. Du kannst die Übertragung erneut starten; Schreibrechte werden erst beim Push geprüft.',
                      'The Git endpoint is reachable. You can retry the transfer; write permissions are checked during push.',
                    ),
                    isError: false,
                    kind: 'success',
                  });
              }),
            }
          : { label: tr('Remote-Konfiguration öffnen', 'Open remote configuration'), onClick: run(environment.openRemoteConfiguration) };
      break;
    case 'conflict':
      if (context)
        action = {
          label: tr('Konflikt öffnen', 'Open conflict'),
          onClick: run(async () => {
            const status = await gitClient.runGitCommandForRepo(context.repoPath, 'statusPorcelain');
            if (!current()) return;
            if (!status.success) throw new Error(status.error);
            const path = parseFirstConflictPathFromPorcelain(String(status.data ?? ''));
            if (path) environment.openConflict(path);
            else
              read()?.notify({
                msg: tr('Es sind keine ungelösten Dateikonflikte mehr vorhanden.', 'There are no unresolved file conflicts left.'),
                isError: false,
                kind: 'info',
              });
          }),
        };
      break;
    case 'identity':
      if (context) action = { label: tr('Commit-Identität einrichten', 'Set up commit identity'), onClick: run(() => ensureCommitIdentity(context.repoPath)) };
      break;
    case 'configuration':
      action = { label: tr('Remote-Konfiguration öffnen', 'Open remote configuration'), onClick: run(environment.openRemoteConfiguration) };
      break;
    case 'repository':
      action = { label: tr('Repository-Liste öffnen', 'Open repository list'), onClick: run(environment.openRepositories, false) };
      break;
    case 'local-changes':
    case 'diverged':
    case 'locked':
    case 'unknown':
      if (context) action = { label: tr('Arbeitsbereich öffnen', 'Open workspace'), onClick: run(environment.openWorkspace) };
      break;
  }
  return { ...prepared, gitContext: context, actions: [...(action ? [action] : []), ...(message.actions ?? [])] };
}
