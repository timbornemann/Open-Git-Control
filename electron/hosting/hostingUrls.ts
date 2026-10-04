import type { HostingConnectionInput, HostingProvider } from '../../src/types/hostingDtos';

export const HOSTING_PROVIDERS: readonly HostingProvider[] = ['github', 'forgejo', 'gitlab', 'bitbucket-cloud', 'bitbucket-data-center'];
export const hasControlCharacters = (value: string): boolean => [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function normalizeHostingUrl(value: string): string {
  if (typeof value !== 'string' || value.length > 2000 || hasControlCharacters(value)) throw new Error('Invalid hosting URL.');
  const url = new URL(String(value).trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    throw new Error('Hosting URLs must use HTTPS without credentials, query parameters or fragments.');
  return url.href.replace(/\/+$/, '');
}

export function hostingUrl(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

export function normalizeConnectionUrls(input: HostingConnectionInput): { baseUrl: string; apiBaseUrl: string } {
  if (!HOSTING_PROVIDERS.includes(input.provider)) throw new Error('Unknown hosting provider.');
  const baseUrl = normalizeHostingUrl(input.baseUrl);
  const base = new URL(baseUrl);
  if (input.provider === 'bitbucket-cloud' && baseUrl !== 'https://bitbucket.org')
    throw new Error('Bitbucket Cloud uses https://bitbucket.org. Choose Data Center for an own server.');
  const defaults = {
    github: baseUrl === 'https://github.com' ? 'https://api.github.com' : hostingUrl(baseUrl, 'api/v3'),
    forgejo: hostingUrl(baseUrl, 'api/v1'),
    gitlab: hostingUrl(baseUrl, 'api/v4'),
    'bitbucket-cloud': 'https://api.bitbucket.org/2.0',
    'bitbucket-data-center': hostingUrl(baseUrl, 'rest/api/1.0'),
  };
  const apiBaseUrl = normalizeHostingUrl(input.apiBaseUrl || defaults[input.provider]);
  const api = new URL(apiBaseUrl);
  const trustedPublicApi =
    (input.provider === 'github' && baseUrl === 'https://github.com' && api.origin === 'https://api.github.com') ||
    (input.provider === 'bitbucket-cloud' && api.origin === 'https://api.bitbucket.org');
  if (!trustedPublicApi && api.origin !== base.origin) throw new Error('The API URL must belong to this hosting server.');
  return { baseUrl, apiBaseUrl };
}
