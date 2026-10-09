import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { ActionRequirement } from '@/components/ui/ActionRequirement';
import { useOptionalUIContext } from '@/contexts/AppStateContext';
import { useI18n } from '@/i18n';
import type { HostingConnection } from '@/types/hostingDtos';
import type { GitRemoteDto, RemotePreferences } from '@/types/remoteTransfers';
import { useHostingState } from './hostingState';

type Props = {
  remote: GitRemoteDto;
  preferences: RemotePreferences;
  connections: HostingConnection[];
  disabled: boolean;
  bind: (name: string, url: string, connectionId: string, resolutionUrl?: string) => void;
  setCredentialMode: (name: string, url: string, mode: 'hosting' | 'system') => void;
  unbind?: (name: string, url: string) => void;
};

export function RemoteEndpointAuthentication(props: Props) {
  const { tr } = useI18n();
  const { remote, connections, disabled } = props;
  const [connectionId, setConnectionId] = useState('');
  const accounts = connections.filter((connection) => connection.authenticated || connection.hasCredentials);
  const ui = useOptionalUIContext();
  return (
    <details className="remote-configuration__advanced">
      <summary>{tr('Anmeldung und Hosting-Konto (optional)', 'Authentication and hosting account (optional)')}</summary>
      <p>
        {tr(
          'SSH und gespeicherte Git-Zugangsdaten funktionieren auch ohne App-Konto. Ordne ein Hosting-Konto zu, um seine HTTPS-Anmeldung sowie PRs, CI und Releases in der App zu nutzen.',
          'SSH and saved Git credentials work without an app account. Bind a hosting account to use its HTTPS authentication and PRs, CI and releases in the app.',
        )}
      </p>
      <label>
        {tr('Hosting-Konto zuordnen', 'Bind hosting account')}
        <select
          aria-label={tr(`Konto für ${remote.name}`, `Account for ${remote.name}`)}
          value={connectionId}
          disabled={disabled || !accounts.length}
          onChange={(event) => setConnectionId(event.target.value)}
        >
          <option value="">{tr('Konto auswählen', 'Select account')}</option>
          {accounts.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.label} · {connection.username} · {connection.baseUrl}
            </option>
          ))}
        </select>
        {!accounts.length && (
          <small>
            {tr(
              'Füge zuerst unter Hosting → Konten & Server ein Konto hinzu und melde dich an.',
              'First add an account and sign in under Hosting → Accounts & servers.',
            )}
          </small>
        )}
      </label>
      {ui && (
        <Button
          disabled={disabled}
          onClick={() => {
            useHostingState.getState().navigate('connections');
            ui.setActiveTab('hosting');
          }}
        >
          {tr('Konten & Server verwalten', 'Manage accounts & servers')}
        </Button>
      )}
      {[...new Set([...remote.fetchUrls, ...remote.pushUrls])].map((url) => (
        <EndpointAccount key={url} {...props} url={url} connectionId={connectionId} />
      ))}
    </details>
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
}: Props & { url: string; connectionId: string }) {
  const { tr } = useI18n();
  const [resolutionUrl, setResolutionUrl] = useState(url);
  const binding = preferences.bindings?.find((candidate) => candidate.remoteName === remote.name && candidate.url === url);
  const account = connections.find((connection) => connection.id === binding?.repository?.connectionId);
  return (
    <div className="remote-configuration__endpoint-account">
      <strong className="remote-configuration__endpoint-url">{url}</strong>
      <small>
        {binding?.repository
          ? `${account?.label ?? binding.repository.connectionId} · ${binding.repository.fullPath}`
          : tr('Keine Kontozuordnung; Git verwendet seine vorhandene Anmeldung.', 'No account binding; Git uses its existing authentication.')}
      </small>
      <div className="remote-configuration__fields">
        <label>
          {tr('Git-Anmeldung für diesen Endpunkt', 'Git authentication for this endpoint')}
          <select
            value={binding?.credentialMode ?? (binding?.repository ? 'hosting' : 'system')}
            disabled={disabled || !binding?.repository}
            onChange={(event) => setCredentialMode(remote.name, url, event.target.value as 'hosting' | 'system')}
          >
            <option value="hosting">{tr('Zugeordnetes Hosting-Konto', 'Bound hosting account')}</option>
            <option value="system">{tr('SSH / gespeicherte Git-Anmeldung', 'SSH / saved Git credentials')}</option>
          </select>
          {!binding?.repository && (
            <small>
              {tr(
                'Ordne diesem Endpunkt zuerst ein Konto zu, um die App-Anmeldung zu verwenden.',
                'Bind an account to this endpoint first to use app authentication.',
              )}
            </small>
          )}
        </label>
        <label>
          {tr('Repository-URL für die Kontozuordnung', 'Repository URL for account binding')}
          <TextField value={resolutionUrl} disabled={disabled} onChange={(event) => setResolutionUrl(event.target.value)} />
          <small>
            {tr(
              'Bei einem SSH-Alias hier die tatsächliche Webadresse des Repositorys eingeben.',
              'For an SSH alias, enter the actual repository web address here.',
            )}
          </small>
        </label>
      </div>
      <div className="hosting-actions">
        <ActionRequirement
          reason={
            disabled
              ? null
              : !connectionId
                ? tr('Wähle oben ein Hosting-Konto.', 'Choose a hosting account above.')
                : !resolutionUrl.trim()
                  ? tr('Gib die Repository-URL ein.', 'Enter the repository URL.')
                  : null
          }
        >
          <Button disabled={disabled} onClick={() => bind(remote.name, url, connectionId, resolutionUrl.trim())}>
            {tr('Konto diesem Endpunkt zuordnen', 'Bind account to this endpoint')}
          </Button>
        </ActionRequirement>
        {binding && unbind && (
          <Button disabled={disabled} onClick={() => unbind(remote.name, url)}>
            {tr('Kontobindung entfernen', 'Remove account binding')}
          </Button>
        )}
      </div>
      <small>{tr('Die Kontozuordnung wird mit „Speichern“ übernommen.', 'The account binding is applied when you choose Save.')}</small>
    </div>
  );
}
