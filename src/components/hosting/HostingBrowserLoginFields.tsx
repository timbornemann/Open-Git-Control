import type { Ref } from 'react';
import { TextField } from '@/components/ui/TextField';
import { useI18n } from '@/i18n';
import type { HostingProvider } from '@/types/hostingDtos';

export function HostingBrowserLoginFields({
  provider,
  editing,
  clientId,
  setClientId,
  clientIdRef,
  clientSecret,
  setClientSecret,
  redirectUri,
  setRedirectUri,
  callbackRef,
  allowHttpLoopback,
  setAllowHttpLoopback,
  loopbackRef,
}: {
  provider: HostingProvider;
  editing: boolean;
  clientId: string;
  setClientId: (value: string) => void;
  clientIdRef: Ref<HTMLInputElement>;
  clientSecret: string;
  setClientSecret: (value: string) => void;
  redirectUri: string;
  setRedirectUri: (value: string) => void;
  callbackRef: Ref<HTMLInputElement>;
  allowHttpLoopback: boolean;
  setAllowHttpLoopback: (value: boolean) => void;
  loopbackRef: Ref<HTMLInputElement>;
}) {
  const { tr } = useI18n();
  return (
    <>
      <p className="hosting-help">
        {tr(
          'Verwende die Zugangsdaten einer OAuth-Anwendung auf deinem Server. Ein persönlicher Zugriffstoken gehört zur Token-Anmeldung.',
          'Use the credentials of an OAuth application registered on your server. Personal access tokens belong in token sign-in.',
        )}
      </p>
      <label>
        OAuth Client ID / Consumer Key
        <TextField ref={clientIdRef} value={clientId} onChange={(event) => setClientId(event.target.value)} autoComplete="off" />
      </label>
      {provider !== 'github' && (
        <>
          <label>
            {provider === 'forgejo' || provider === 'gitlab'
              ? tr('Client Secret (für vertrauliche Anwendungen)', 'Client Secret (for confidential applications)')
              : 'Client Secret'}
            <TextField
              type="password"
              autoComplete="off"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              placeholder={editing ? tr('Leer lassen zum Beibehalten', 'Leave blank to keep') : ''}
            />
          </label>
          {provider === 'forgejo' && (
            <p className="hosting-help">
              {tr(
                'Ist in Forgejo „Vertraulicher Client“ aktiviert, gib auch das Client Secret dieser Anwendung ein. Bei einem öffentlichen Client bleibt das Feld leer. PKCE ist in beiden Fällen aktiv.',
                'If “Confidential client” is enabled in Forgejo, also enter that application’s Client Secret. Leave it empty for a public client. PKCE is enabled in both cases.',
              )}
            </p>
          )}
          <label>
            {tr('Registrierte Callback-URL', 'Registered callback URL')}
            <TextField ref={callbackRef} value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} />
          </label>
          <p className="hosting-help">
            {tr('Diese Adresse muss genau so in der OAuth-Anwendung registriert sein.', 'Register this exact address in the OAuth application.')}
          </p>
        </>
      )}
      {provider === 'bitbucket-data-center' && (
        <label className="hosting-checkbox">
          <input ref={loopbackRef} type="checkbox" checked={allowHttpLoopback} onChange={(event) => setAllowHttpLoopback(event.target.checked)} />
          {tr('Administrator erlaubt diesen HTTP-Loopback-Callback', 'Administrator permits this HTTP loopback callback')}
        </label>
      )}
    </>
  );
}
