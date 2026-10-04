import { useCallback, useEffect, useRef, useState } from 'react';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import type { HostingConnection, HostingProvider } from '@/types/hostingDtos';
import { providerLabels, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';

export function HostingConnections() {
  const { tr } = useI18n();
  const { connections, setConnections, refresh } = useHostingState();
  const [editing, setEditing] = useState<string | undefined>();
  const [provider, setProvider] = useState<HostingProvider>('forgejo');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('http://127.0.0.1:42873/oauth/callback');
  const [allowHttpLoopback, setAllowHttpLoopback] = useState(false);
  const [device, setDevice] = useState<{ connectionId: string; code: string; userCode: string; url: string; interval: number; expires: number } | null>(null);
  const [cliPreview, setCliPreview] = useState<{ connectionId: string; username: string; host: string } | null>(null);
  const task = useHostingTask('connections');
  const auth = useRef({ generation: 0, connectionId: undefined as string | undefined });
  const { run, setError } = task;
  const reload = useCallback(async () => {
    setConnections(await hostingClient.request('connections', undefined));
    refresh();
  }, [setConnections, refresh]);
  useEffect(() => {
    void run(() => hostingClient.request('connections', undefined), setConnections);
  }, [run, setConnections]);
  useEffect(() => {
    if (!device) return;
    let active = true;
    let polling = false;
    const timer = setInterval(
      () => {
        if (polling) return;
        if (Date.now() >= device.expires) {
          setDevice(null);
          return;
        }
        polling = true;
        void hostingClient
          .request('pollDeviceLogin', { connectionId: device.connectionId, deviceCode: device.code })
          .then(async (result) => {
            if (!active) return;
            if (result.status === 'success') {
              setDevice(null);
              await reload();
            } else if (result.status === 'error') {
              setError(result.errorDescription || result.error);
              setDevice(null);
            }
          })
          .catch((error: Error) => {
            if (active) {
              setError(error.message);
              setDevice(null);
            }
          })
          .finally(() => {
            polling = false;
          });
      },
      Math.max(device.interval, 5) * 1000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [device, reload, setError]);
  const edit = (connection: HostingConnection) => {
    setCliPreview(null);
    setEditing(connection.id);
    setProvider(connection.provider);
    setLabel(connection.label);
    setBaseUrl(connection.baseUrl);
    setApiBaseUrl(connection.apiBaseUrl);
    setClientId(connection.oauth?.clientId ?? '');
    setRedirectUri(connection.oauth?.redirectUri ?? 'http://127.0.0.1:42873/oauth/callback');
    setAllowHttpLoopback(connection.oauth?.allowHttpLoopback ?? false);
    setToken('');
    setClientSecret('');
    setUsername(connection.username ?? '');
  };
  const save = () =>
    hostingClient.request('saveConnection', {
      id: editing,
      provider,
      label: label || providerLabels[provider],
      baseUrl:
        baseUrl ||
        (provider === 'github'
          ? 'https://github.com'
          : provider === 'gitlab'
            ? 'https://gitlab.com'
            : provider === 'bitbucket-cloud'
              ? 'https://bitbucket.org'
              : ''),
      ...(apiBaseUrl ? { apiBaseUrl } : {}),
      ...(clientId ? { oauth: { clientId, redirectUri, allowHttpLoopback } } : {}),
      ...(clientSecret ? { clientSecret } : {}),
    });
  const authenticate = (method: 'token' | 'browser' | 'device' | 'cli' | 'save') =>
    void task.run(async () => {
      const generation = ++auth.current.generation;
      setCliPreview(null);
      const connection = await save();
      if (generation !== auth.current.generation) return;
      auth.current.connectionId = connection.id;
      setEditing(connection.id);
      setToken('');
      setClientSecret('');
      if (method === 'token')
        await hostingClient.request('login', { connectionId: connection.id, token, username: username || undefined, email: email || undefined });
      if (method === 'browser') await hostingClient.request('loginBrowser', { connectionId: connection.id });
      if (method === 'cli') {
        const preview = await hostingClient.request('inspectCliLogin', { connectionId: connection.id });
        if (generation === auth.current.generation) setCliPreview({ connectionId: connection.id, ...preview });
      }
      if (method === 'device') {
        const flow = await hostingClient.request('startDeviceLogin', { connectionId: connection.id });
        setDevice({
          connectionId: connection.id,
          code: flow.deviceCode,
          userCode: flow.userCode,
          url: flow.verificationUri,
          interval: flow.interval,
          expires: Date.now() + flow.expiresIn * 1000,
        });
        await appClient.openExternalUrl(flow.verificationUri);
      }
      if (generation === auth.current.generation) await reload();
    });
  return (
    <section className="hosting-connections">
      <h2>{tr('Konten & Server', 'Accounts & servers')}</h2>
      <div className="hosting-card-grid">
        {connections.map((connection) => (
          <article className="hosting-card" key={connection.id}>
            <strong>{connection.label}</strong>
            <span>
              {providerLabels[connection.provider]} · {connection.username ?? tr('Nicht angemeldet', 'Signed out')}
            </span>
            <small>{connection.baseUrl}</small>
            <small>
              {connection.authenticated ? tr('Verbunden', 'Connected') : tr('Anmeldung erforderlich', 'Sign-in required')}
              {connection.tokenPersisted === false ? ` · ${tr('Nur diese Sitzung', 'This session only')}` : ''}
            </small>
            <div className="hosting-actions">
              {connection.hasCredentials && !connection.authenticated && (
                <button
                  disabled={task.busy}
                  onClick={() =>
                    void task.run(async () => {
                      await hostingClient.request('capabilities', { connectionId: connection.id });
                      await reload();
                    })
                  }
                >
                  {tr('Verbindung prüfen', 'Verify connection')}
                </button>
              )}
              <button disabled={task.busy} onClick={() => edit(connection)}>
                {tr('Bearbeiten', 'Edit')}
              </button>
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await hostingClient.request('logout', { connectionId: connection.id });
                    await reload();
                  })
                }
              >
                {tr('Abmelden', 'Sign out')}
              </button>
              <button
                disabled={task.busy}
                onClick={() =>
                  void task.run(async () => {
                    await hostingClient.request('removeConnection', { connectionId: connection.id });
                    if (editing === connection.id) setEditing(undefined);
                    await reload();
                  })
                }
              >
                {tr('Entfernen', 'Remove')}
              </button>
            </div>
          </article>
        ))}
      </div>
      <form
        className="hosting-form"
        onSubmit={(event) => {
          event.preventDefault();
          authenticate(token ? 'token' : 'save');
        }}
      >
        <h3>{editing ? tr('Verbindung bearbeiten', 'Edit connection') : tr('Verbindung hinzufügen', 'Add connection')}</h3>
        <label>
          {tr('Anbieter', 'Provider')}
          <select
            value={provider}
            disabled={Boolean(editing)}
            onChange={(event) => {
              setProvider(event.target.value as HostingProvider);
              setBaseUrl('');
              setApiBaseUrl('');
            }}
          >
            {Object.entries(providerLabels).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr('Name', 'Name')}
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={providerLabels[provider]} />
        </label>
        <label>
          {tr('Server-URL', 'Server URL')}
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={
              provider === 'github'
                ? 'https://github.com'
                : provider === 'gitlab'
                  ? 'https://gitlab.com'
                  : provider === 'bitbucket-cloud'
                    ? 'https://bitbucket.org'
                    : 'https://git.example.com'
            }
          />
        </label>
        <details>
          <summary>{tr('API-Adresse und OAuth-Konfiguration', 'API address and OAuth configuration')}</summary>
          <label>
            API URL
            <input
              value={apiBaseUrl}
              onChange={(event) => setApiBaseUrl(event.target.value)}
              placeholder={tr('Automatisch vom Anbieter', 'Provider default')}
            />
          </label>
          <label>
            OAuth Client ID / Consumer Key
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} />
          </label>
          {(provider === 'bitbucket-cloud' || provider === 'bitbucket-data-center') && (
            <label>
              Client Secret
              <input
                type="password"
                autoComplete="off"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={editing ? tr('Leer lassen zum Beibehalten', 'Leave blank to keep') : ''}
              />
            </label>
          )}
          <label>
            {tr('Registrierte Callback-URL', 'Registered callback URL')}
            <input value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} />
          </label>
          {provider === 'bitbucket-data-center' && (
            <label className="hosting-checkbox">
              <input type="checkbox" checked={allowHttpLoopback} onChange={(event) => setAllowHttpLoopback(event.target.checked)} />
              {tr('Administrator erlaubt diesen HTTP-Loopback-Callback', 'Administrator permits this HTTP loopback callback')}
            </label>
          )}
          <p>
            {tr(
              'OAuth-Anwendung auf diesem Server registrieren. Forgejo und GitLab verwenden PKCE; Bitbucket benötigt eigene Client-Zugangsdaten.',
              'Register an OAuth application on this server. Forgejo and GitLab use PKCE; Bitbucket requires your own client credentials.',
            )}
          </p>
        </details>
        <label>
          {tr('Token', 'Token')}
          <input type="password" value={token} autoComplete="off" onChange={(event) => setToken(event.target.value)} />
        </label>
        <label>
          {tr('Benutzername (optional, für Git/CLI)', 'Username (optional, for Git/CLI)')}
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        {provider === 'bitbucket-cloud' && (
          <label>
            {tr('Atlassian-E-Mail (optional)', 'Atlassian email (optional)')}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
        )}
        <div className="hosting-actions">
          <button type="submit" disabled={task.busy}>
            {token ? tr('Mit Token anmelden', 'Sign in with token') : tr('Speichern', 'Save')}
          </button>
          <button type="button" disabled={task.busy || !clientId} onClick={() => authenticate(provider === 'github' ? 'device' : 'browser')}>
            {tr('Im Browser anmelden', 'Sign in in browser')}
          </button>
          {provider === 'github' && (
            <button type="button" disabled={task.busy} onClick={() => authenticate('cli')}>
              GitHub CLI
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const connectionId = auth.current.connectionId ?? editing;
              auth.current.generation++;
              task.cancel();
              if (connectionId) void hostingClient.request('cancelAuth', { connectionId }).catch(() => {});
              setDevice(null);
              setCliPreview(null);
              setEditing(undefined);
              setToken('');
              setClientSecret('');
              auth.current.connectionId = undefined;
            }}
          >
            {tr('Abbrechen / neues Konto', 'Cancel / new account')}
          </button>
        </div>
      </form>
      {device && (
        <p>
          {tr('Code im Browser eingeben:', 'Enter this code in the browser:')} <strong>{device.userCode}</strong>
        </p>
      )}
      {cliPreview && (
        <div className="hosting-card">
          <p>
            {tr('GitHub-CLI-Konto übernehmen:', 'Use this GitHub CLI account:')} <strong>{cliPreview.username}</strong> · {cliPreview.host}
          </p>
          <button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                const preview = cliPreview;
                const generation = auth.current.generation;
                await hostingClient.request('loginWithCli', { connectionId: preview.connectionId, expectedUsername: preview.username });
                if (generation !== auth.current.generation) return;
                setCliPreview(null);
                await reload();
              })
            }
          >
            {tr('Dieses Konto verbinden', 'Connect this account')}
          </button>
        </div>
      )}
      {task.busy && <p role="status">{tr('Verbindung wird vorbereitet …', 'Preparing connection …')}</p>}
      {task.error && (
        <p className="hosting-error" role="alert">
          {task.error}
        </p>
      )}
    </section>
  );
}
