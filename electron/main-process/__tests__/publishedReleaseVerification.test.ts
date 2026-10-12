import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReleaseFixture, fixtureVersion, removeReleaseFixture } from './releaseArtifactFixtures';

const { verifyPublishedRelease } = require('../../../scripts/verify-published-release');
const directories: string[] = [];
const releaseRoot = `https://github.com/timbornemann/Open-Git-Control/releases/download/v${fixtureVersion}`;
const cdn = 'https://release-assets.githubusercontent.com/github-production-release-asset/1176739168/01234567-89ab-cdef-0123-456789abcdef';

const fixture = () => {
  const directory = createReleaseFixture(['windows', 'linux', 'macos'], true);
  directories.push(directory);
  const releaseDirectory = path.join(directory, 'release');
  const names = fs.readdirSync(releaseDirectory);
  const bytes = new Map(names.map((name) => [name, fs.readFileSync(path.join(releaseDirectory, name))]));
  const release = {
    tag_name: `v${fixtureVersion}`,
    draft: false,
    prerelease: false,
    assets: names.map((name) => ({
      name,
      state: 'uploaded',
      size: bytes.get(name)!.length,
      browser_download_url: `${releaseRoot}/${name}`,
      digest: `sha256:${crypto.createHash('sha256').update(bytes.get(name)!).digest('hex')}`,
    })),
  };
  const fetchImpl = vi.fn(async (value: string, options: RequestInit) => {
    if (value.startsWith('https://api.github.com/')) {
      expect(options.redirect).toBe('error');
      expect(value).toBe(`https://api.github.com/repos/timbornemann/Open-Git-Control/releases/tags/v${fixtureVersion}`);
      return Response.json(release);
    }
    expect(options.redirect).toBe('manual');
    expect(options.headers).toBeUndefined();
    const name = value.slice(releaseRoot.length + 1);
    if (!bytes.has(name)) throw new Error('Unexpected fixture network request.');
    return new Response(new Uint8Array(bytes.get(name)!));
  });
  return { releaseDirectory, release, bytes, fetchImpl };
};

afterEach(() => {
  directories.splice(0).forEach(removeReleaseFixture);
  vi.unstubAllEnvs();
});

describe('published release verification', () => {
  it('compares every uploaded byte stream, including manifests and blockmaps, to the locally verified build', async () => {
    const data = fixture();
    await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, data.fetchImpl)).resolves.toBe(12);
    expect(data.fetchImpl).toHaveBeenCalledTimes(13);
  });

  it.each(['https://evil.example/update.exe', `${releaseRoot.replace('timbornemann', 'attacker')}/latest.yml`, `${releaseRoot}/latest.yml?redirect=evil`])(
    'rejects an unapproved published source %s before downloading',
    async (url) => {
      const data = fixture();
      data.release.assets[0].browser_download_url = url;
      await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, data.fetchImpl)).rejects.toThrow('official source');
      expect(data.fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['name', 'size', 'digest', 'state', 'missing', 'duplicate', 'tag', 'draft'])('rejects altered published %s', async (field) => {
    const data = fixture();
    if (field === 'name') data.release.assets[0].name = 'malware.exe';
    if (field === 'size') data.release.assets[0].size++;
    if (field === 'digest') data.release.assets[0].digest = `sha256:${'0'.repeat(64)}`;
    if (field === 'state') data.release.assets[0].state = 'open';
    if (field === 'missing') data.release.assets.pop();
    if (field === 'duplicate') data.release.assets[1] = { ...data.release.assets[0] };
    if (field === 'tag') data.release.tag_name = 'v1.0.0';
    if (field === 'draft') data.release.draft = true;
    await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, data.fetchImpl)).rejects.toThrow();
    expect(data.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each(['latest.yml', 'Open-Git-Control-2.4.6-win-x64.exe', 'Open-Git-Control-2.4.6-win-x64.exe.blockmap', 'SHA256SUMS.txt'])(
    'rejects changed remote bytes for %s even when API names, sizes and digests look correct',
    async (name) => {
      const data = fixture();
      const bytes = Buffer.from(data.bytes.get(name)!);
      bytes[bytes.length - 1] ^= 1;
      data.bytes.set(name, bytes);
      await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, data.fetchImpl)).rejects.toThrow('bytes do not match');
    },
  );

  it('rejects truncated downloads', async () => {
    const data = fixture();
    const name = data.release.assets[0].name;
    data.bytes.set(name, data.bytes.get(name)!.subarray(0, 1));
    await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, data.fetchImpl)).rejects.toThrow('bytes do not match');
  });

  it.each(['https://evil.example/update.exe', 'http://github.com/update.exe', cdn.replace('1176739168', '999999')])(
    'rejects hostile redirect %s without contacting it',
    async (url) => {
      const data = fixture();
      const fakeFetch = vi.fn(async (value: string, options: RequestInit) =>
        value.startsWith('https://api.github.com/') ? data.fetchImpl(value, options) : new Response(null, { status: 302, headers: { location: url } }),
      );
      await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, fakeFetch)).rejects.toThrow('outside the official repository');
      expect(fakeFetch).toHaveBeenCalledTimes(2);
      expect(fakeFetch.mock.calls.some(([value]) => value === url)).toBe(false);
    },
  );

  it('accepts GitHub CDN redirects for this repository and keeps credentials off asset requests', async () => {
    vi.stubEnv('GH_TOKEN', 'fixture-token');
    const data = fixture();
    let redirectName = '';
    const fakeFetch = vi.fn(async (value: string, options: RequestInit) => {
      if (value.startsWith('https://api.github.com/')) {
        expect(options.headers).toMatchObject({ Authorization: 'Bearer fixture-token' });
        return data.fetchImpl(value, options);
      }
      expect(options.headers).toBeUndefined();
      if (value.startsWith(releaseRoot)) {
        redirectName = value.slice(releaseRoot.length + 1);
        return new Response(null, { status: 302, headers: { location: `${cdn}?signed=github` } });
      }
      expect(value).toBe(`${cdn}?signed=github`);
      return new Response(new Uint8Array(data.bytes.get(redirectName)!));
    });
    await expect(verifyPublishedRelease(fixtureVersion, data.releaseDirectory, fakeFetch)).resolves.toBe(12);
  });
});
