import { describe, expect, it } from 'vitest';
import { assertOfficialUpdateInfo, isAllowedUpdaterRequest } from '../updaterSourcePolicy';
import { fixtureManifest, fixtureVersion, type FixtureManifest } from './releaseArtifactFixtures';

const releaseRoot = `https://github.com/timbornemann/Open-Git-Control/releases/download/v${fixtureVersion}`;
const cdn = 'https://release-assets.githubusercontent.com/github-production-release-asset/1176739168/01234567-89ab-cdef-0123-456789abcdef';

describe('updater original-source policy', () => {
  it.each(['win32', 'linux', 'darwin'] as const)('accepts complete official %s metadata', (platform) => {
    const name = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
    expect(() => assertOfficialUpdateInfo({ ...fixtureManifest(name), tag: `v${fixtureVersion}` }, platform)).not.toThrow();
  });

  it.each([
    `${releaseRoot}/Open-Git-Control-${fixtureVersion}-win-x64.exe`,
    `${releaseRoot}/Open-Git-Control-${fixtureVersion}-win-x64.exe.blockmap`,
    `${releaseRoot}/Open-Git-Control-${fixtureVersion}-mac-x64.zip`,
    `${releaseRoot}/latest.yml`,
    'https://github.com/timbornemann/Open-Git-Control/releases.atom',
    'https://github.com/timbornemann/Open-Git-Control/releases/latest',
    `https://github.com/timbornemann/Open-Git-Control/releases/tag/v${fixtureVersion}`,
    `${cdn}?signed=github-token`,
    cdn.replace('release-assets', 'objects').replace('release-asset/', 'release-asset-2e65be/'),
  ])('allows official update request %s', (url) => {
    expect(isAllowedUpdaterRequest(url)).toBe(true);
    expect(isAllowedUpdaterRequest(url, 'HEAD')).toBe(true);
  });

  it.each([
    'https://evil.example/update.exe',
    'http://github.com/timbornemann/Open-Git-Control/releases/latest',
    'https://github.com.evil.example/timbornemann/Open-Git-Control/releases/latest',
    'https://github.com@evil.example/timbornemann/Open-Git-Control/releases/latest',
    'https://user:password@github.com/timbornemann/Open-Git-Control/releases/latest',
    'https://github.com:8443/timbornemann/Open-Git-Control/releases/latest',
    'https://github.com/attacker/Open-Git-Control/releases/latest',
    `${releaseRoot}/../../../../attacker/repo/releases/latest`,
    `${releaseRoot}/Open-Git-Control-1.0.0-win-x64.exe`,
    `${releaseRoot}/Open-Git-Control-${fixtureVersion}-win-x64.exe?redirect=evil`,
    `${releaseRoot}/Open-Git-Control-${fixtureVersion}-win-x64.exe#fragment`,
    'https://raw.githubusercontent.com/timbornemann/Open-Git-Control/main/update.exe',
    cdn.replace('1176739168', '123456789'),
    cdn.replace('01234567-89ab-cdef-0123-456789abcdef', '-'.repeat(36)),
    cdn.replace('release-assets.githubusercontent.com', 'release-assets.githubusercontent.com.evil.example'),
    'file:///tmp/update.exe',
    'https://127.0.0.1/update.exe',
  ])('blocks foreign sources and unsafe redirects %s', (url) => {
    expect(isAllowedUpdaterRequest(url)).toBe(false);
  });

  it('blocks non-download HTTP methods', () => expect(isAllowedUpdaterRequest(cdn, 'POST')).toBe(false));

  it('rejects embedded blockmap fields on Windows installers', () => {
    const info = { ...fixtureManifest('windows'), tag: `v${fixtureVersion}` };
    info.files[0].blockMapSize = 1;
    expect(() => assertOfficialUpdateInfo(info, 'win32')).toThrow('Release-Metadaten');
  });

  it.each(['url', 'tag', 'sha512', 'size', 'path', 'packages', 'version', 'files'])('rejects unsafe %s in metadata before downloading', (key) => {
    const info: FixtureManifest & { tag: string } = { ...fixtureManifest('windows'), tag: `v${fixtureVersion}` };
    if (key === 'url') info.files[0].url = 'https://evil.example/update.exe';
    if (key === 'tag') info.tag = 'v1.0.0';
    if (key === 'sha512') info.files[0].sha512 = 'invalid';
    if (key === 'size') info.files[0].size = -1;
    if (key === 'path') info.path = '../update.exe';
    if (key === 'packages') info.packages = { x64: { path: 'https://evil.example/payload.7z' } };
    if (key === 'version') info.version = '2.4.6-beta.1';
    if (key === 'files') info.files = [];
    expect(() => assertOfficialUpdateInfo(info, 'win32')).toThrow('Release-Metadaten');
  });
});
