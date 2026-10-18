import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import { stringify } from 'yaml';
import source from '../../../src/shared/updateSource.json';

export const fixtureVersion = '2.4.6';
export type ReleasePlatform = keyof typeof source.platforms;
export type FixtureManifest = {
  version: string;
  files: { url: string; size: number; sha512: string; blockMapSize?: number }[];
  path: string;
  sha512: string;
  releaseDate: string;
  [key: string]: unknown;
};

export function blockmapPayload(size: number, embedded = false): Buffer {
  const data = Buffer.from(
    JSON.stringify({ version: '2', files: [{ name: 'file', offset: 0, sizes: [size], checksums: [Buffer.alloc(18).toString('base64')] }] }),
  );
  return embedded ? zlib.deflateRawSync(data) : zlib.gzipSync(data);
}

function artifactPayload(suffix: string): { bytes: Buffer; blockMapSize?: number } {
  let bytes = Buffer.alloc(256);
  if (suffix.endsWith('.exe')) {
    bytes.write('MZ');
    bytes.writeUInt32LE(128, 60);
    Buffer.from([0x50, 0x45, 0, 0, 0x64, 0x86]).copy(bytes, 128);
  } else if (suffix.endsWith('.AppImage')) {
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1]).copy(bytes);
    bytes.writeUInt16LE(62, 18);
    const map = blockmapPayload(bytes.length, true);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(map.length);
    return { bytes: Buffer.concat([bytes, map, size]), blockMapSize: map.length };
  } else if (suffix.endsWith('.deb')) {
    bytes.write('!<arch>\n');
  } else if (suffix.endsWith('.dmg')) {
    bytes = Buffer.alloc(512);
    bytes.write('koly');
  } else if (suffix.endsWith('.zip')) {
    bytes.writeUInt32LE(0x04034b50, 0);
    bytes.writeUInt32LE(0x02014b50, 32);
    bytes.writeUInt32LE(0x06054b50, bytes.length - 22);
    bytes.writeUInt16LE(1, bytes.length - 14);
    bytes.writeUInt16LE(1, bytes.length - 12);
    bytes.writeUInt32LE(46, bytes.length - 10);
    bytes.writeUInt32LE(32, bytes.length - 6);
  } else if (suffix.endsWith('.tar.gz')) {
    bytes = zlib.gzipSync(Buffer.from('recovery archive fixture'));
  }
  return { bytes };
}

export function fixtureManifest(platform: ReleasePlatform, version = fixtureVersion): FixtureManifest {
  const files = source.platforms[platform].artifacts.map((suffix) => {
    const payload = artifactPayload(suffix);
    return {
      url: `${source.productName}-${version}-${suffix}`,
      size: payload.bytes.length,
      sha512: crypto.createHash('sha512').update(payload.bytes).digest('base64'),
      ...(payload.blockMapSize === undefined ? {} : { blockMapSize: payload.blockMapSize }),
    };
  });
  return { version, files, path: files[0].url, sha512: files[0].sha512, releaseDate: '2026-10-12T10:00:00.000Z' };
}

export function createReleaseFixture(platforms: ReleasePlatform[] = ['windows'], withChecksums = false): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-artifact-test-'));
  fs.mkdirSync(path.join(directory, 'release'));
  fs.mkdirSync(path.join(directory, 'build'));
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ version: fixtureVersion, build: { publish: [{ provider: 'github', owner: source.owner, repo: source.repo, releaseType: 'release' }] } }),
  );
  fs.writeFileSync(path.join(directory, 'build', 'LICENSE.txt'), 'Fixture license');
  fs.writeFileSync(path.join(directory, 'build', 'THIRD_PARTY_NOTICES.txt'), 'Fixture notices');
  const checksumLines: string[] = [];
  for (const platform of platforms) {
    const policy = source.platforms[platform];
    const info = fixtureManifest(platform);
    writeFixtureManifest(directory, platform, info);
    for (const suffix of policy.artifacts) {
      const name = `${source.productName}-${fixtureVersion}-${suffix}`;
      const bytes = artifactPayload(suffix).bytes;
      fs.writeFileSync(path.join(directory, 'release', name), bytes);
      checksumLines.push(`${crypto.createHash('sha256').update(bytes).digest('hex')}  ${name}`);
    }
    for (const suffix of policy.blockmaps) {
      const name = `${source.productName}-${fixtureVersion}-${suffix}`;
      fs.writeFileSync(path.join(directory, 'release', `${name}.blockmap`), blockmapPayload(artifactPayload(suffix).bytes.length));
    }
    const recoveryName = `${source.productName}-Recovery-${fixtureVersion}-${source.recovery[platform]}`;
    const recoveryBytes = artifactPayload(source.recovery[platform]).bytes;
    fs.writeFileSync(path.join(directory, 'release', recoveryName), recoveryBytes);
    checksumLines.push(`${crypto.createHash('sha256').update(recoveryBytes).digest('hex')}  ${recoveryName}`);
  }
  if (withChecksums) fs.writeFileSync(path.join(directory, 'release', 'SHA256SUMS.txt'), `${checksumLines.join('\n')}\n`);
  return directory;
}

export function writeFixtureManifest(directory: string, platform: ReleasePlatform, info: FixtureManifest): void {
  fs.writeFileSync(path.join(directory, 'release', source.platforms[platform].feed), stringify(info));
}

export function removeReleaseFixture(directory: string): void {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-artifact-test-'))
    throw new Error('Unexpected fixture cleanup path.');
  fs.rmSync(resolved, { recursive: true, force: true });
}
