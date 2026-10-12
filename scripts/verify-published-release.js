#!/usr/bin/env node

const crypto = require('node:crypto');
const path = require('node:path');
const { source, assertVersion, releaseAssetNames, regularFile, hashFile, officialAssetUrl, isAllowedAssetRedirect } = require('./release-artifact-policy');

async function fetchAsset(url, fetchImpl, signal) {
  const initialUrl = url;
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!isAllowedAssetRedirect(url, initialUrl)) throw new Error('Release download redirected outside the official repository.');
    const response = await fetchImpl(url, { redirect: 'manual', signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Release asset redirect has no destination.');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok || !response.body) throw new Error(`Release asset download failed with HTTP ${response.status}.`);
    return response;
  }
  throw new Error('Too many release asset redirects.');
}

async function verifyPublishedRelease(version, releaseDirectory = path.join(process.cwd(), 'release'), fetchImpl = fetch) {
  assertVersion(version);
  const names = releaseAssetNames(version);
  const local = new Map();
  for (const name of names) {
    const file = regularFile(releaseDirectory, name);
    local.set(name, { size: file.size, digest: await hashFile(file.file, 'sha256', 'hex') });
  }
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': source.productName };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const apiUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/releases/tags/v${version}`;
  const response = await fetchImpl(apiUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Release API returned HTTP ${response.status}.`);
  const release = await response.json();
  if (release?.tag_name !== `v${version}` || release.draft !== false || release.prerelease !== false || !Array.isArray(release.assets))
    throw new Error('Unexpected published release.');
  if (release.assets.length !== names.length) throw new Error('Published release has missing or unapproved assets.');
  const seen = new Set();
  for (const asset of release.assets) {
    const expected = local.get(asset?.name);
    if (
      !expected ||
      seen.has(asset.name) ||
      asset.state !== 'uploaded' ||
      asset.size !== expected.size ||
      asset.browser_download_url !== officialAssetUrl(version, asset.name)
    )
      throw new Error('Published release asset does not match the verified build or official source.');
    seen.add(asset.name);
    if (asset.digest != null && asset.digest !== `sha256:${expected.digest}`) throw new Error(`GitHub artifact digest mismatch: ${asset.name}`);
  }
  for (const asset of release.assets) {
    const expected = local.get(asset.name);
    const response = await fetchAsset(asset.browser_download_url, fetchImpl, AbortSignal.timeout(15 * 60 * 1000));
    const hash = crypto.createHash('sha256');
    const reader = response.body.getReader();
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > expected.size) throw new Error(`Uploaded artifact is larger than the verified build: ${asset.name}`);
        hash.update(chunk.value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (size !== expected.size || hash.digest('hex') !== expected.digest)
      throw new Error(`Uploaded artifact bytes do not match the verified build: ${asset.name}`);
  }
  return names.length;
}

if (require.main === module) {
  verifyPublishedRelease((process.argv[2] || '').trim())
    .then((count) => console.log(`Verified original source, size and SHA-256 of ${count} uploaded release assets.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { verifyPublishedRelease };
