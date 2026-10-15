import { useId, useState } from 'react';
import { KeyRound, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { useI18n } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import type { GitRemoteDto, RemotePreferences } from '@/types/remoteTransfers';
import './remote-endpoint-authentication.css';

type Props = {
  remote: GitRemoteDto;
  preferences: RemotePreferences;
  connections: HostingConnection[];
  disabled: boolean;
  bind: (name: string, url: string, connectionId: string, resolutionUrl?: string) => void;
  setCredentialMode: (name: string, url: string, mode: 'hosting' | 'system') => void;
  unbind?: (name: string, url: string) => void;
};

const accountName = (account: HostingConnection) => [account.label, account.username].filter(Boolean).join(' · ');

export function RemoteEndpointAuthentication(props: Props) {
  const { tr } = useI18n();
  const { remote, connections, disabled } = props;
  const editorId = useId();
  const [editing, setEditing] = useState(false);
  const accounts = connections.filter((connection) => connection.authenticated || connection.hasCredentials);
  const signedIn = accounts.filter((connection) => connection.authenticated);
  const [connectionId, setConnectionId] = useState(() => {
    const boundId = props.preferences.bindings?.find((binding) => binding.remoteName === remote.name && binding.repository)?.repository?.connectionId;
    return accounts.find((account) => account.id === boundId)?.id ?? (accounts.length === 1 ? accounts[0].id : '');
  });
  return (
    <section className="remote-configuration__authentication">
      <div className="remote-access__heading">
        <h4>{tr('Zugang für dieses Remote', 'Access for this remote')}</h4>
        <Button size="xs" aria-expanded={editing} aria-controls={editorId} disabled={disabled} onClick={() => setEditing(!editing)}>
          {editing ? tr('Fertig', 'Done') : tr('Zugang ändern', 'Change access')}
        </Button>
      </div>
      {signedIn.length > 0 && (
        <p className="remote-access__session">
          <UserRound size={14} aria-hidden="true" />
          <span>
            {tr('In der App angemeldet:', 'Signed in to the app:')} {signedIn.map(accountName).join(', ')}
          </span>
        </p>
      )}
      <div id={editorId}>
        {editing && accounts.length > 0 && (
          <label className="remote-access__account-choice">
            {tr('App-Konto für eine optionale Zuordnung', 'App account for optional assignment')}
            <select
              aria-label={tr(`Konto für ${remote.name}`, `Account for ${remote.name}`)}
              value={connectionId}
              disabled={disabled}
              onChange={(event) => setConnectionId(event.target.value)}
            >
              <option value="">{tr('Konto auswählen', 'Select account')}</option>
              {accounts.map((connection) => (
                <option key={connection.id} value={connection.id}>
                  {accountName(connection)} · {connection.baseUrl}
                </option>
              ))}
            </select>
          </label>
        )}
        {editing && !accounts.length && (
          <p>
            {tr(
              'App-Konten meldest du in den Einstellungen unter „Konten & Server“ an. Für einen funktionierenden Git-/SSH-Zugang ist das nicht erforderlich.',
              'Sign in to app accounts under Accounts & servers in Settings. This is not required when Git/SSH access already works.',
            )}
          </p>
        )}
        {[...new Set([...remote.fetchUrls, ...remote.pushUrls])].map((url) => (
          <EndpointAccount key={url} {...props} url={url} connectionId={connectionId} editing={editing} hasAccounts={accounts.length > 0} />
        ))}
      </div>
      {editing && <small>{tr('Änderungen am Zugang werden mit „Speichern“ übernommen.', 'Access changes are applied when you choose Save.')}</small>}
    </section>
  );
}

function EndpointAccount({
  remote,
  preferences,
  connections,
  disabled,
  bind,
  setCredentialMode,
  unbind,
  url,
  connectionId,
  editing,
  hasAccounts,
}: Props & { url: string; connectionId: string; editing: boolean; hasAccounts: boolean }) {
  const { tr } = useI18n();
  const [resolutionUrl, setResolutionUrl] = useState(url);
  const binding = preferences.bindings?.find((candidate) => candidate.remoteName === remote.name && candidate.url === url);
  const account = connections.find((connection) => connection.id === binding?.repository?.connectionId);
  const usesAppAccount = Boolean(binding?.repository && binding.credentialMode !== 'system' && url.startsWith('https://'));
  const ssh = /^(ssh:\/\/|[^/\s]+@[^:]+:)/i.test(url);
  return (
    <div className="remote-configuration__endpoint-account">
      <small className="remote-configuration__endpoint-url">{url}</small>
      <div className="remote-access__current">
        {usesAppAccount ? <UserRound size={16} aria-hidden="true" /> : <KeyRound size={16} aria-hidden="true" />}
        <div>
          <strong>
            {usesAppAccount
              ? tr('Git-Zugang über das App-Konto', 'Git access through app account')
              : ssh
                ? tr('Zugang über SSH', 'SSH access')
                : tr('Vorhandener Git-Zugang', 'Existing Git access')}
          </strong>
          {usesAppAccount && (
            <small>
              {account ? accountName(account) : binding!.repository!.connectionId} · {binding!.repository!.fullPath}
            </small>
          )}
          <p>
            {usesAppAccount
              ? account?.authenticated || account?.hasCredentials
                ? tr(
                    'Fetch, Pull und Push verwenden die gespeicherte App-Anmeldung. Hier sind keine weiteren Angaben nötig.',
                    'Fetch, pull and push use the saved app sign-in. No further details are needed here.',
                  )
                : tr(
                    'Dieses App-Konto ist abgemeldet oder nicht mehr vorhanden. Melde es in den App-Einstellungen an oder wähle einen anderen Git-Zugang.',
                    'This app account is signed out or no longer available. Sign in in app settings or choose another Git access method.',
                  )
              : tr(
                  'Git verwendet seine vorhandene Anmeldung oder öffentlichen Zugriff. Wenn Fetch, Pull und Push funktionieren, musst du hier nichts einrichten.',
                  'Git uses its existing credentials or public access. If fetch, pull and push work, there is nothing to set up here.',
                )}
          </p>
          {!usesAppAccount && (
            <small>
              {ssh
                ? tr(
                    'Für diese SSH-Adresse wird dein SSH-Schlüssel oder SSH-Agent verwendet. Die Browser-Anmeldung der App ist davon unabhängig.',
                    'This SSH address uses your SSH key or agent. The app browser sign-in is separate.',
                  )
                : tr(
                    'Die Browser-Anmeldung gilt zunächst für die App. Ihre zusätzliche Zuordnung für Git-Übertragungen ist optional.',
                    'Browser sign-in is for the app. Assigning it for Git transfers is optional.',
                  )}
            </small>
          )}
        </div>
      </div>
      {editing && (
        <div className="remote-access__editor">
          {binding?.repository && (
            <label>
              {tr('Anmeldung für Git-Übertragungen', 'Authentication for Git transfers')}
              <select
                value={binding.credentialMode ?? 'hosting'}
                disabled={disabled}
                onChange={(event) => setCredentialMode(remote.name, url, event.target.value as 'hosting' | 'system')}
              >
                <option value="hosting">{tr('Zugeordnetes App-Konto (HTTPS)', 'Assigned app account (HTTPS)')}</option>
                <option value="system">{tr('Vorhandener Git-/SSH-Zugang', 'Existing Git / SSH access')}</option>
              </select>
            </label>
          )}
          {hasAccounts && (
            <>
              {!/^https?:\/\//i.test(url) && (
                <label>
                  {tr('Repository-Webadresse', 'Repository web address')}
                  <TextField value={resolutionUrl} disabled={disabled} onChange={(event) => setResolutionUrl(event.target.value)} />
                  <small>
                    {tr(
                      'Bei einem SSH-Alias die tatsächliche Webadresse des Repositorys eintragen.',
                      'For an SSH alias, enter the actual repository web address.',
                    )}
                  </small>
                </label>
              )}
              <div className="hosting-actions">
                <ActionRequirement
                  reason={
                    disabled
                      ? null
                      : !connectionId
                        ? tr('Wähle ein App-Konto.', 'Choose an app account.')
                        : !resolutionUrl.trim()
                          ? tr('Gib die Repository-Webadresse ein.', 'Enter the repository web address.')
                          : null
                  }
                >
                  <Button disabled={disabled} onClick={() => bind(remote.name, url, connectionId, resolutionUrl.trim())}>
                    {tr('App-Konto zuordnen', 'Assign app account')}
                  </Button>
                </ActionRequirement>
              </div>
            </>
          )}
          {binding && unbind && (
            <Button disabled={disabled} onClick={() => unbind(remote.name, url)}>
              {tr('Kontozuordnung entfernen', 'Remove account assignment')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
