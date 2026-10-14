import { openSystemTools } from '@/app/state/systemToolsStore';
import { isSystemToolAvailable } from '@/services/systemToolsAvailability';
import { Button } from '@/components/ui/Button';
import { HostingAuthenticationActions } from './HostingAuthenticationActions';
import { HostingBrowserLoginFields } from './HostingBrowserLoginFields';
import { browserSignInRequirement } from './hostingConnectionRequirements';
import { TextField } from '@/components/ui/TextField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HostingDialog } from './HostingDialog';
import { hostingClient } from '@/services/hostingClient';
import { appClient } from '@/services/appClient';
import { useI18n } from '@/i18n';
import type { HostingConnection, HostingProvider } from '@/types/hostingDtos';
import { providerLabels, useHostingState } from './hostingState';
import { useHostingTask } from './useHostingTask';
import { useAppToast } from '@/hooks/useAppToast';

const defaultServerUrls: Record<HostingProvider, string> = {
  github: 'https://github.com',
  forgejo: '',
  gitlab: 'https://gitlab.com',
  'bitbucket-cloud': 'https://bitbucket.org',
  'bitbucket-data-center': '',
};

export function HostingConnectionEditor({ connection, onClose }: { connection: HostingConnection | null; onClose: () => void }) {
  const { tr } = useI18n();
  const { setConnections, refresh } = useHostingState();
  const [editing, setEditing] = useState<string | undefined>(connection?.id);
  const [provider, setProvider] = useState<HostingProvider>(connection?.provider ?? 'github');
  const [label, setLabel] = useState(connection?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '');
  const [apiBaseUrl, setApiBaseUrl] = useState(connection?.apiBaseUrl ?? '');
  const [token, setToken] = useState('');
  const [username, setUsername] = useState(connection?.username ?? '');
  const [email, setEmail] = useState('');
  const [clientId, setClientId] = useState(connection?.oauth?.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(connection?.oauth?.redirectUri ?? 'http://127.0.0.1:42873/oauth/callback');
  const [allowHttpLoopback, setAllowHttpLoopback] = useState(connection?.oauth?.allowHttpLoopback ?? false);
  const [signInMethod, setSignInMethod] = useState<'token' | 'browser'>(connection?.oauth ? 'browser' : 'token');
  const savedOAuth = useRef(connection?.oauth);
  const clientIdField = useRef<HTMLInputElement>(null);
  const serverField = useRef<HTMLInputElement>(null);
  const callbackField = useRef<HTMLInputElement>(null);
  const loopbackField = useRef<HTMLInputElement>(null);
  const browserRequirement = browserSignInRequirement(
    { provider, clientId, serverUrl: baseUrl || defaultServerUrls[provider], redirectUri, allowHttpLoopback },
    tr,
  );
  const configureBrowser = () => {
    if (!browserRequirement) return;
    const field = { clientId: clientIdField, server: serverField, callback: callbackField, loopback: loopbackField }[browserRequirement.field];
    field.current?.focus();
    field.current?.scrollIntoView?.({ block: 'nearest' });
  };
  const [device, setDevice] = useState<{ connectionId: string; code: string; userCode: string; url: string; interval: number; expires: number } | null>(null);
  const [cliPreview, setCliPreview] = useState<{ connectionId: string; username: string; host: string } | null>(null);
  const showToast = useAppToast();
  const reportError = useCallback(
    (message: string) => showToast(`${tr('Hosting-Anmeldung fehlgeschlagen', 'Hosting sign-in failed')}: ${message}`, true),
    [showToast, tr],
  );
  const task = useHostingTask('connections', reportError);
  const auth = useRef({ generation: 0, connectionId: undefined as string | undefined });
  const { setError } = task;
  const cancelAuth = useCallback(() => {
    const connectionId = auth.current.connectionId;
    auth.current.generation++;
    auth.current.connectionId = undefined;
    if (connectionId) void hostingClient.request('cancelAuth', { connectionId }).catch(() => {});
  }, []);
  useEffect(() => cancelAuth, [cancelAuth]);
  const close = () => {
    cancelAuth();
    task.cancel();
    onClose();
  };
  const finish = useCallback(() => {
    auth.current.connectionId = undefined;
    onClose();
  }, [onClose]);
  const reload = useCallback(
    async (generation = auth.current.generation) => {
      const updated = await hostingClient.request('connections', undefined);
      if (generation === auth.current.generation) {
        setConnections(updated);
        refresh();
      }
    },
    [setConnections, refresh],
  );
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
              const generation = auth.current.generation;
              setDevice(null);
              await reload(generation);
              if (generation === auth.current.generation) finish();
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
  }, [device, reload, setError, finish]);
  const save = async (withOAuth: boolean) => {
    const oauth = withOAuth ? (clientId ? { clientId, redirectUri, allowHttpLoopback } : undefined) : savedOAuth.current;
    const saved = await hostingClient.request('saveConnection', {
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
      ...(oauth ? { oauth } : {}),
      ...(withOAuth && clientSecret ? { clientSecret } : {}),
    });
    savedOAuth.current = saved.oauth;
    return saved;
  };
  const authenticate = (method: 'token' | 'browser' | 'device' | 'cli' | 'save') =>
    void task.run(async () => {
      if (method === 'cli' && !isSystemToolAvailable('github-cli')) {
        openSystemTools('github-cli');
        return;
      }
      const generation = ++auth.current.generation;
      setCliPreview(null);
      setDevice(null);
      const connection = await save(method === 'browser' || (method === 'save' && signInMethod === 'browser'));
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
        if (generation !== auth.current.generation) return;
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
      if (generation === auth.current.generation) {
        await reload(generation);
        if (generation === auth.current.generation && method !== 'cli' && method !== 'device') finish();
      }
    });
  return (
    <HostingDialog
      open
      title={editing ? tr('Verbindung bearbeiten', 'Edit connection') : tr('Verbindung hinzufügen', 'Add connection')}
      onClose={close}
      cancelLabel={tr('Abbrechen', 'Cancel')}
    >
      <form
        className="hosting-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (task.busy) return;
          if (signInMethod === 'browser' && browserRequirement) return configureBrowser();
          if (signInMethod === 'token' && !token.trim()) return;
          authenticate(signInMethod === 'browser' ? (provider === 'github' ? 'device' : 'browser') : 'token');
        }}
      >
        <div className="hosting-form hosting-connection-fields">
          <p className="hosting-help">
            {tr(
              'Wähle Anbieter und Server. Melde dich mit einem Token oder über den Browser an.',
              'Choose a provider and server. Sign in with a token or through your browser.',
            )}
          </p>
          <div className="hosting-form-grid">
            <label>
              {tr('Anbieter', 'Provider')}
              <select
                value={provider}
                disabled={Boolean(editing)}
                onChange={(event) => {
                  setProvider(event.target.value as HostingProvider);
                  setBaseUrl('');
                  setApiBaseUrl('');
                  setClientId('');
                  setClientSecret('');
                  setToken('');
                  setUsername('');
                  setEmail('');
                  setAllowHttpLoopback(false);
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
              <TextField value={label} onChange={(event) => setLabel(event.target.value)} placeholder={providerLabels[provider]} />
            </label>
          </div>
          <label>
            {tr('Server-URL', 'Server URL')}
            <TextField
              ref={serverField}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder={defaultServerUrls[provider] || 'https://git.example.com'}
            />
          </label>
          <details>
            <summary>{tr('Erweiterte Servereinstellungen', 'Advanced server settings')}</summary>
            <div className="hosting-form hosting-form--nested">
              <label>
                API URL
                <TextField
                  value={apiBaseUrl}
                  onChange={(event) => setApiBaseUrl(event.target.value)}
                  placeholder={tr('Automatisch vom Anbieter', 'Provider default')}
                />
              </label>
            </div>
          </details>
          <SegmentedControl
            ariaLabel={tr('Anmeldemethode', 'Sign-in method')}
            value={signInMethod}
            disabled={task.busy}
            options={[
              { value: 'token', label: tr('Token', 'Token') },
              { value: 'browser', label: tr('Browser (OAuth)', 'Browser (OAuth)') },
            ]}
            onChange={(next) => {
              if (next === signInMethod) return;
              cancelAuth();
              task.cancel();
              setDevice(null);
              setCliPreview(null);
              setSignInMethod(next);
            }}
          />
          <section
            className="hosting-form hosting-auth-fields"
            aria-label={signInMethod === 'token' ? tr('Token-Anmeldung', 'Token sign-in') : tr('Browser-Anmeldung', 'Browser sign-in')}
          >
            {signInMethod === 'token' ? (
              <>
                <p className="hosting-help">
                  {tr(
                    'Füge einen persönlichen Zugriffstoken dieses Servers ein. OAuth-Zugangsdaten werden für diesen Weg nicht benötigt.',
                    'Enter a personal access token from this server. OAuth application credentials are not needed for this method.',
                  )}
                </p>
                <label>
                  {tr('Token', 'Token')}
                  <TextField type="password" value={token} autoComplete="off" onChange={(event) => setToken(event.target.value)} />
                </label>
                <label>
                  {tr('Benutzername (optional, für Git/CLI)', 'Username (optional, for Git/CLI)')}
                  <TextField value={username} onChange={(event) => setUsername(event.target.value)} />
                </label>
                {provider === 'bitbucket-cloud' && (
                  <label>
                    {tr('Atlassian-E-Mail (optional)', 'Atlassian email (optional)')}
                    <TextField type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  </label>
                )}
              </>
            ) : (
              <HostingBrowserLoginFields
                provider={provider}
                editing={Boolean(editing)}
                clientId={clientId}
                setClientId={setClientId}
                clientIdRef={clientIdField}
                clientSecret={clientSecret}
                setClientSecret={setClientSecret}
                redirectUri={redirectUri}
                setRedirectUri={setRedirectUri}
                callbackRef={callbackField}
                allowHttpLoopback={allowHttpLoopback}
                setAllowHttpLoopback={setAllowHttpLoopback}
                loopbackRef={loopbackField}
              />
            )}
          </section>
          <HostingAuthenticationActions
            busy={task.busy}
            method={signInMethod}
            token={Boolean(token.trim())}
            requirement={browserRequirement}
            configure={configureBrowser}
            save={() => authenticate('save')}
            signInWithCli={provider === 'github' ? () => authenticate('cli') : undefined}
          />
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
          <Button
            disabled={task.busy}
            onClick={() =>
              void task.run(async () => {
                const preview = cliPreview;
                const generation = auth.current.generation;
                await hostingClient.request('loginWithCli', { connectionId: preview.connectionId, expectedUsername: preview.username });
                if (generation !== auth.current.generation) return;
                setCliPreview(null);
                await reload();
                if (generation === auth.current.generation) finish();
              })
            }
          >
            {tr('Dieses Konto verbinden', 'Connect this account')}
          </Button>
        </div>
      )}
      {task.busy && <p role="status">{tr('Verbindung wird vorbereitet …', 'Preparing connection …')}</p>}
    </HostingDialog>
  );
}
