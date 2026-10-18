#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { parseDocument } = require('yaml');
const { source, assertVersion, platformArtifacts, releaseAssetNames, regularFile, hashFile, isSha512 } = require('./release-artifact-policy');
const { validateArtifactFormat, validateBlockmap, validateEmbeddedBlockmap } = require('./release-artifact-formats');

async function validateReleaseAssets(version, platform, rootDirectory = process.cwd()) {
  assertVersion(version);
  const required = platformArtifacts(version, platform);
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8'));
  const publish = manifest.build?.publish;
  if (
    manifest.version !== version ||
    !Array.isArray(publish) ||
    publish.length !== 1 ||
    publish[0]?.provider !== 'github' ||
    publish[0].owner !== source.owner ||
    publish[0].repo !== source.repo ||
    publish[0].releaseType !== 'release' ||
    Object.keys(publish[0]).some((key) => !['provider', 'owner', 'repo', 'releaseType'].includes(key))
  )
    throw new Error('Build configuration does not target the official release source and version.');
  const releaseDir = path.join(rootDirectory, 'release');
  if (!fs.lstatSync(releaseDir).isDirectory() || fs.lstatSync(releaseDir).isSymbolicLink()) throw new Error('Release directory must be a regular directory.');
  for (const name of ['LICENSE.txt', 'THIRD_PARTY_NOTICES.txt']) regularFile(path.join(rootDirectory, 'build'), name);

  const allowed = new Set(releaseAssetNames(version));
  const names = fs.readdirSync(releaseDir);
  for (const name of names) {
    if ((/^latest.*\.ya?ml$/i.test(name) || /\.(exe|appimage|deb|dmg|zip|tar\.gz|blockmap)$/i.test(name)) && !allowed.has(name))
      throw new Error(`Unapproved release artifact: ${name}`);
  }
  for (const name of [required.feed, ...required.artifacts, ...required.blockmaps, required.recovery]) regularFile(releaseDir, name);

  const digests = new Map();
  const digest = async (name) => {
    if (!digests.has(name)) digests.set(name, await hashFile(regularFile(releaseDir, name).file));
    return digests.get(name);
  };
  const installerNames = [];
  for (const label of Object.keys(source.platforms)) {
    const policy = platformArtifacts(version, label);
    if (!names.includes(policy.feed)) continue;
    const metadataFile = regularFile(releaseDir, policy.feed, 1024 * 1024);
    const document = parseDocument(fs.readFileSync(metadataFile.file, 'utf8'), { uniqueKeys: true });
    if (document.errors.length) throw new Error(`Invalid YAML in ${policy.feed}`);
    const info = document.toJS({ maxAliasCount: 0 });
    if (
      !info ||
      typeof info !== 'object' ||
      Array.isArray(info) ||
      info.version !== version ||
      Object.prototype.hasOwnProperty.call(info, 'tag') ||
      info.packages != null
    )
      throw new Error(`Invalid release metadata in ${policy.feed}`);
    if (!Array.isArray(info.files) || info.files.length !== policy.artifacts.length) throw new Error(`Invalid file list in ${policy.feed}`);
    const seen = new Set();
    for (const file of info.files) {
      if (!file || typeof file !== 'object' || !policy.artifacts.includes(file.url) || seen.has(file.url))
        throw new Error(`Unapproved download reference in ${policy.feed}`);
      seen.add(file.url);
      const artifact = regularFile(releaseDir, file.url);
      validateArtifactFormat(artifact.file, artifact.size);
      if (!Number.isSafeInteger(file.size) || file.size !== artifact.size) throw new Error(`Artifact size mismatch: ${file.url}`);
      if (!isSha512(file.sha512) || file.sha512 !== (await digest(file.url))) throw new Error(`SHA-512 mismatch: ${file.url}`);
      if (file.blockMapSize !== undefined) {
        if (!file.url.endsWith('.AppImage')) throw new Error(`Unexpected embedded blockmap: ${file.url}`);
        validateEmbeddedBlockmap(artifact.file, artifact.size, file.blockMapSize);
      }
    }
    if (!seen.has(info.path) || !isSha512(info.sha512) || info.sha512 !== (await digest(info.path)))
      throw new Error(`Invalid legacy download reference in ${policy.feed}`);
    for (const name of policy.blockmaps) {
      const map = regularFile(releaseDir, name, 4 * 1024 * 1024);
      validateBlockmap(fs.readFileSync(map.file), regularFile(releaseDir, name.slice(0, -'.blockmap'.length)).size);
    }
    installerNames.push(...policy.artifacts);
    const recovery = regularFile(releaseDir, policy.recovery);
    validateArtifactFormat(recovery.file, recovery.size);
    installerNames.push(policy.recovery);
  }
  if (names.includes('SHA256SUMS.txt')) {
    const checksumFile = regularFile(releaseDir, 'SHA256SUMS.txt', 64 * 1024);
    const lines = fs.readFileSync(checksumFile.file, 'utf8').trim().split(/\r?\n/);
    const seen = new Set();
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
      if (!match || !installerNames.includes(match[2]) || seen.has(match[2])) throw new Error('Invalid SHA256SUMS.txt entry.');
      seen.add(match[2]);
      if (match[1] !== (await hashFile(regularFile(releaseDir, match[2]).file, 'sha256', 'hex'))) throw new Error(`SHA-256 mismatch: ${match[2]}`);
    }
    if (seen.size !== installerNames.length) throw new Error('SHA256SUMS.txt does not cover every installer and archive.');
  }
  return [required.feed, ...required.artifacts, ...required.blockmaps, required.recovery];
}

if (require.main === module) {
  validateReleaseAssets((process.argv[2] || '').trim(), (process.argv[3] || '').trim().toLowerCase())
    .then(() => console.log(`Validated release artifacts for ${process.argv[3]} with version ${process.argv[2]}.`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { validateReleaseAssets };
