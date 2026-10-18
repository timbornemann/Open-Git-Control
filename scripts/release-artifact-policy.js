const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const source = require('../src/shared/updateSource.json');

const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const artifactName = (version, suffix) => `${source.productName}-${version}-${suffix}`;

function assertVersion(version) {
  if (typeof version !== 'string' || version.length > 64 || !versionPattern.test(version)) throw new Error('Expected a stable release version x.y.z.');
}

function platformArtifacts(version, platform) {
  assertVersion(version);
  const policy = source.platforms[platform];
  if (!policy) throw new Error(`Unknown release platform: ${platform}`);
  return {
    feed: policy.feed,
    artifacts: policy.artifacts.map((suffix) => artifactName(version, suffix)),
    blockmaps: policy.blockmaps.map((suffix) => `${artifactName(version, suffix)}.blockmap`),
    recovery: `${source.productName}-Recovery-${version}-${source.recovery[platform]}`,
  };
}

function releaseAssetNames(version) {
  return [
    ...new Set(
      Object.keys(source.platforms).flatMap((platform) => {
        const policy = platformArtifacts(version, platform);
        return [policy.feed, ...policy.artifacts, ...policy.blockmaps, policy.recovery];
      }),
    ),
    'SHA256SUMS.txt',
  ];
}

function regularFile(directory, name, maxSize = Infinity) {
  if (path.basename(name) !== name || name.includes('\\')) throw new Error('Unsafe release filename.');
  const file = path.join(directory, name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxSize)
    throw new Error(`Release artifact must be a non-empty regular file within the size limit: ${name}`);
  return { file, size: stat.size };
}

async function hashFile(file, algorithm = 'sha512', encoding = 'base64') {
  const hash = crypto.createHash(algorithm);
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}

function isSha512(value) {
  return typeof value === 'string' && /^[A-Za-z0-9+/]{86}==$/.test(value) && Buffer.from(value, 'base64').toString('base64') === value;
}

function officialAssetUrl(version, name) {
  if (!releaseAssetNames(version).includes(name)) throw new Error('Unapproved release artifact.');
  return `https://github.com/${source.owner}/${source.repo}/releases/download/v${version}/${name}`;
}

function isAllowedAssetRedirect(value, initialUrl) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
  if (url.href === initialUrl) return true;
  const hosts = ['release-assets.githubusercontent.com', 'objects.githubusercontent.com', 'github-releases.githubusercontent.com'];
  const cdnPath = new RegExp(
    `^/github-production-release-asset(?:-2e65be)?/${source.repositoryId}/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`,
    'i',
  );
  return hosts.includes(url.hostname) && cdnPath.test(url.pathname);
}

module.exports = { source, assertVersion, platformArtifacts, releaseAssetNames, regularFile, hashFile, isSha512, officialAssetUrl, isAllowedAssetRedirect };
