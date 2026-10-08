import type { HostingProvider } from '@/types/hostingDtos';

export type BrowserRequirement = { reason: string; field: 'clientId' | 'server' | 'callback' | 'loopback' };
export function browserSignInRequirement(
  values: { provider: HostingProvider; clientId: string; serverUrl: string; redirectUri: string; allowHttpLoopback: boolean },
  tr: (de: string, en: string) => string,
): BrowserRequirement | null {
  if (!values.clientId.trim())
    return {
      reason: tr('Für die Browser-Anmeldung fehlt die OAuth-Client-ID / der Consumer Key.', 'Browser sign-in requires an OAuth client ID / consumer key.'),
      field: 'clientId',
    };
  if (!values.serverUrl.trim()) return { reason: tr('Für die Anmeldung fehlt die Server-URL.', 'Sign-in requires a server URL.'), field: 'server' };
  if (values.provider !== 'github' && !values.redirectUri.trim())
    return {
      reason: tr('Für die Browser-Anmeldung fehlt die registrierte Callback-URL.', 'Browser sign-in requires the registered callback URL.'),
      field: 'callback',
    };
  if (values.provider === 'bitbucket-data-center' && !values.allowHttpLoopback)
    return {
      reason: tr('Der Administrator muss den HTTP-Loopback-Callback freigeben.', 'The administrator must permit the HTTP loopback callback.'),
      field: 'loopback',
    };
  return null;
}
