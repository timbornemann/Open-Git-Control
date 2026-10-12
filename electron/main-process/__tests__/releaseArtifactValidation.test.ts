import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import source from '../../../src/shared/updateSource.json';
import { blockmapPayload, createReleaseFixture, fixtureManifest, fixtureVersion, removeReleaseFixture, writeFixtureManifest } from './releaseArtifactFixtures';
import type { ReleasePlatform } from './releaseArtifactFixtures';

const { validateReleaseAssets } = require('../../../scripts/validate-release-assets');
const directories: string[] = [];
const fixture = (platforms: ReleasePlatform[] = ['windows'], checksums = false): string => {
  const directory = createReleaseFixture(platforms, checksums);
  directories.push(directory);
  return directory;
};
afterEach(() => directories.splice(0).forEach(removeReleaseFixture));

describe('release artifact validation', () => {
  it.each(['windows', 'linux', 'macos'] as const)('accepts consistent %s artifacts and metadata', async (platform) => {
    await expect(validateReleaseAssets(fixtureVersion, platform, fixture([platform]))).resolves.toContain(source.platforms[platform].feed);
  });

  it('accepts a complete release with matching SHA256SUMS.txt', async () => {
    const directory = fixture(['windows', 'linux', 'macos'], true);
    for (const platform of ['windows', 'linux', 'macos']) await expect(validateReleaseAssets(fixtureVersion, platform, directory)).resolves.toBeDefined();
  });

  it('accepts the x86 NSIS bootstrap used by official x64 Windows installers', async () => {
    const directory = fixture();
    const info = fixtureManifest('windows');
    const file = path.join(directory, 'release', info.path);
    const bytes = fs.readFileSync(file);
    bytes.writeUInt16LE(0x014c, bytes.readUInt32LE(60) + 4);
    fs.writeFileSync(file, bytes);
    info.sha512 = info.files[0].sha512 = crypto.createHash('sha512').update(bytes).digest('base64');
    writeFixtureManifest(directory, 'windows', info);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).resolves.toBeDefined();
  });

  it.each(['version', 'provider', 'owner', 'repo', 'host', 'duplicate'])('rejects a changed build source or version: %s', async (field) => {
    const directory = fixture();
    const file = path.join(directory, 'package.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (field === 'version') manifest.version = '1.0.0';
    if (field === 'provider') manifest.build.publish[0].provider = 'generic';
    if (field === 'owner') manifest.build.publish[0].owner = 'attacker';
    if (field === 'repo') manifest.build.publish[0].repo = 'Other-Repository';
    if (field === 'host') manifest.build.publish[0].host = 'evil.example';
    if (field === 'duplicate') manifest.build.publish.push({ ...manifest.build.publish[0] });
    fs.writeFileSync(file, JSON.stringify(manifest));
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('official release source and version');
  });

  it('rejects installer directories even when they have approved names', async () => {
    const directory = fixture();
    const file = path.join(directory, 'release', fixtureManifest('windows').path);
    fs.unlinkSync(file);
    fs.mkdirSync(file);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('non-empty regular file');
  });

  it.each([
    'https://evil.example/update.exe',
    'https://github.com/attacker/Open-Git-Control/releases/download/v2.4.6/Open-Git-Control-2.4.6-win-x64.exe',
    'https://github.com/timbornemann/Open-Git-Control/releases/download/v2.4.6/Open-Git-Control-2.4.6-win-x64.exe',
    '//evil.example/update.exe',
    '../Open-Git-Control-2.4.6-win-x64.exe',
    'Open-Git-Control-2.4.5-win-x64.exe',
    'Open-Git-Control-2.4.6-win-x64.exe?redirect=evil',
    'Open-Git-Control-2.4.6-win-x64%2eexe',
  ])('rejects unapproved download reference %s', async (url) => {
    const directory = fixture();
    const info = fixtureManifest('windows');
    info.files[0].url = url;
    writeFixtureManifest(directory, 'windows', info);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('Unapproved download reference');
  });

  it.each(['invalid', Buffer.alloc(64).toString('base64')])('rejects invalid or mismatching SHA-512 values', async (sha512) => {
    const directory = fixture();
    const info = fixtureManifest('windows');
    info.files[0].sha512 = sha512;
    writeFixtureManifest(directory, 'windows', info);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('SHA-512 mismatch');
  });

  it.each([0, -1, 1.5, 257])('rejects incorrect declared file size %s', async (size) => {
    const directory = fixture();
    const info = fixtureManifest('windows');
    info.files[0].size = size;
    writeFixtureManifest(directory, 'windows', info);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('Artifact size mismatch');
  });

  it('rejects a modified binary even when its name and size match', async () => {
    const directory = fixture();
    const file = path.join(directory, 'release', fixtureManifest('windows').path);
    const bytes = fs.readFileSync(file);
    bytes[bytes.length - 1] = 1;
    fs.writeFileSync(file, bytes);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('SHA-512 mismatch');
  });

  it('rejects empty binaries at the CLI boundary', () => {
    const directory = fixture();
    fs.writeFileSync(path.join(directory, 'release', fixtureManifest('windows').path), '');
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../../scripts/validate-release-assets.js'), fixtureVersion, 'windows'], {
      cwd: directory,
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('non-empty regular file');
  });

  it('rejects junk installer headers', async () => {
    const directory = fixture();
    fs.writeFileSync(path.join(directory, 'release', fixtureManifest('windows').path), Buffer.alloc(256));
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('Invalid installer or archive format');
  });

  it.each(['path', 'sha512', 'tag', 'packages', 'files'])('rejects inconsistent or unsafe %s metadata', async (key) => {
    const directory = fixture();
    const info = fixtureManifest('windows');
    if (key === 'path') info.path = '../installer.exe';
    if (key === 'sha512') info.sha512 = Buffer.alloc(64).toString('base64');
    if (key === 'tag') info.tag = 'v2.4.5';
    if (key === 'packages') info.packages = { x64: { path: 'https://evil.example/payload.7z' } };
    if (key === 'files') info.files = [];
    writeFixtureManifest(directory, 'windows', info);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow();
  });

  it('rejects duplicated file references instead of silently omitting a target', async () => {
    const directory = fixture(['linux']);
    const info = fixtureManifest('linux');
    info.files[1] = { ...info.files[0] };
    writeFixtureManifest(directory, 'linux', info);
    await expect(validateReleaseAssets(fixtureVersion, 'linux', directory)).rejects.toThrow('Unapproved download reference');
  });

  it('rejects duplicate YAML keys', async () => {
    const directory = fixture();
    fs.appendFileSync(path.join(directory, 'release', 'latest.yml'), `version: ${fixtureVersion}\n`);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('Invalid YAML');
  });

  it('rejects YAML aliases in download metadata', async () => {
    const directory = fixture();
    const file = path.join(directory, 'release', 'latest.yml');
    const yaml = fs.readFileSync(file, 'utf8').replace(`version: ${fixtureVersion}`, `version: &releaseVersion ${fixtureVersion}`);
    fs.writeFileSync(file, `${yaml}releaseName: *releaseVersion\n`);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow();
  });

  it('rejects extra installers and update feeds', async () => {
    const directory = fixture();
    fs.writeFileSync(path.join(directory, 'release', 'latest-attacker.yml'), `version: ${fixtureVersion}`);
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('Unapproved release artifact');
  });

  it('rejects broken and mismatched external blockmaps', async () => {
    const directory = fixture();
    const mapFile = path.join(directory, 'release', `${fixtureManifest('windows').path}.blockmap`);
    fs.writeFileSync(mapFile, 'not a blockmap');
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('Invalid compressed release blockmap');
    fs.writeFileSync(mapFile, blockmapPayload(1));
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('does not match artifact size');
  });

  it('rejects an incorrect embedded AppImage blockmap size', async () => {
    const directory = fixture(['linux']);
    const info = fixtureManifest('linux');
    info.files[0].blockMapSize = 1;
    writeFixtureManifest(directory, 'linux', info);
    await expect(validateReleaseAssets(fixtureVersion, 'linux', directory)).rejects.toThrow('Invalid embedded blockmap size');
  });

  it('rejects incorrect manual-download checksums', async () => {
    const directory = fixture(['windows'], true);
    const file = path.join(directory, 'release', 'SHA256SUMS.txt');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/^[a-f0-9]{64}/, '0'.repeat(64)));
    await expect(validateReleaseAssets(fixtureVersion, 'windows', directory)).rejects.toThrow('SHA-256 mismatch');
  });
});
