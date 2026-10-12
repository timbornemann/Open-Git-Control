import type { AppUpdater } from 'electron-updater';
import source from '../../src/shared/updateSource.json';

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASES_PATH = `/${source.owner}/${source.repo}/releases`;
const CDN_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com']);
const CDN_PATH = new RegExp(
  `^/github-production-release-asset(?:-2e65be)?/${source.repositoryId}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`,
  'i',
);
const platformNames = { win32: 'windows', linux: 'linux', darwin: 'macos' } as const;

const artifactName = (version: string, suffix: string): string => `${source.productName}-${version}-${suffix}`;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPositiveSize = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isSha512 = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value) && Buffer.from(value, 'base64').toString('base64') === value;

export function assertOfficialUpdateInfo(info: unknown, platform: NodeJS.Platform = process.platform): void {
  const reject: () => never = () => {
    throw new Error('Das Update wurde wegen ungueltiger Release-Metadaten blockiert.');
  };
  if (!isRecord(info) || typeof info.version !== 'string' || info.version.length > 64 || !VERSION_PATTERN.test(info.version)) reject();
  const platformName = platformNames[platform as keyof typeof platformNames];
  if (!platformName) reject();
  const policy = source.platforms[platformName];
  const expected = new Set(policy.artifacts.map((suffix) => artifactName(info.version as string, suffix)));
  // GitHubProvider injects the release tag; a manifest must not override it.
  if (info.tag !== `v${info.version}` || info.packages != null || !Array.isArray(info.files) || info.files.length !== expected.size) reject();
  const files = new Map<string, Record<string, unknown>>();
  for (const file of info.files as unknown[]) {
    if (!isRecord(file) || typeof file.url !== 'string' || !expected.has(file.url) || files.has(file.url)) reject();
    if (!isSha512(file.sha512) || !isPositiveSize(file.size)) reject();
    if (
      file.blockMapSize !== undefined &&
      (!file.url.endsWith('.AppImage') ||
        !isPositiveSize(file.blockMapSize) ||
        file.blockMapSize > 4 * 1024 * 1024 ||
        file.blockMapSize >= (file.size as number) - 4)
    )
      reject();
    files.set(file.url as string, file);
  }
  if (typeof info.path !== 'string' || !files.has(info.path) || !isSha512(info.sha512) || files.get(info.path)?.sha512 !== info.sha512) reject();
}

export function isAllowedUpdaterRequest(value: string, method = 'GET'): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
  if (CDN_HOSTS.has(url.hostname)) return CDN_PATH.test(url.pathname);
  if (url.hostname !== 'github.com' || url.search) return false;
  if (url.pathname === `${RELEASES_PATH}.atom` || url.pathname === `${RELEASES_PATH}/latest`) return true;
  const tag = url.pathname.slice(`${RELEASES_PATH}/tag/v`.length);
  if (url.pathname.startsWith(`${RELEASES_PATH}/tag/v`) && tag.length <= 64 && VERSION_PATTERN.test(tag)) return true;
  if (!url.pathname.startsWith(`${RELEASES_PATH}/download/v`)) return false;
  const [version, name, ...extra] = url.pathname.slice(`${RELEASES_PATH}/download/v`.length).split('/');
  if (extra.length || version.length > 64 || !VERSION_PATTERN.test(version)) return false;
  const names = Object.values(source.platforms).flatMap((policy) => [
    policy.feed,
    ...policy.artifacts.map((suffix) => artifactName(version, suffix)),
    ...policy.blockmaps.map((suffix) => `${artifactName(version, suffix)}.blockmap`),
  ]);
  return names.includes(name);
}

export function configureOfficialUpdaterSource(updater: AppUpdater): void {
  updater.setFeedURL({ provider: 'github', owner: source.owner, repo: source.repo, private: false });
  updater.allowDowngrade = false;
  updater.allowPrerelease = false;
  updater.disableWebInstaller = true;
  // The updater owns this partition. Check every request, including the new
  // requests its HTTP executor creates when following server redirects.
  updater.netSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback({ cancel: !isAllowedUpdaterRequest(details.url, details.method) });
  });
}
