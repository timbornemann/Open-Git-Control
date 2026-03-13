#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || '').trim();
const platformLabel = (process.argv[3] || '').trim().toLowerCase();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Invalid version "${version}". Expected SemVer "x.y.z".`);
  process.exit(1);
}

if (!platformLabel) {
  console.error('Usage: node scripts/validate-release-assets.js <version> <platformLabel>');
  process.exit(1);
}

const releaseDir = path.resolve(process.cwd(), 'release');
if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory not found: ${releaseDir}`);
  process.exit(1);
}

const productName = 'Open-Git-Control';
const releaseFiles = fs.readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const requiredFilesByPlatform = {
  windows: [
    'latest.yml',
    `${productName}-${version}-win-x64.exe`,
    `${productName}-${version}-win-x64.exe.blockmap`,
  ],
  linux: [
    'latest-linux.yml',
    `${productName}-${version}-linux-x86_64.AppImage`,
    `${productName}-${version}-linux-amd64.deb`,
  ],
  'macos': [
    'latest-mac.yml',
    `${productName}-${version}-mac-x64.zip`,
    `${productName}-${version}-mac-x64.zip.blockmap`,
    `${productName}-${version}-mac-x64.dmg`,
  ],
};

const requiredFiles = requiredFilesByPlatform[platformLabel];
if (!requiredFiles) {
  console.error(`Unknown platform label "${platformLabel}". Expected one of: ${Object.keys(requiredFilesByPlatform).join(', ')}`);
  process.exit(1);
}

for (const requiredFile of requiredFiles) {
  if (!releaseFiles.includes(requiredFile)) {
    console.error(`Missing required release artifact: ${requiredFile}`);
    process.exit(1);
  }
}

const feedFiles = releaseFiles.filter((fileName) => /^latest.*\.yml$/i.test(fileName));
if (feedFiles.length === 0) {
  console.error('No update feed files found (latest*.yml).');
  process.exit(1);
}

for (const feedFile of feedFiles) {
  const content = fs.readFileSync(path.join(releaseDir, feedFile), 'utf8');
  const match = content.match(/^version:\s*(.+)$/m);
  if (!match) {
    console.error(`Missing version line in ${feedFile}`);
    process.exit(1);
  }

  const declaredVersion = match[1].trim();
  if (declaredVersion !== version) {
    console.error(`Version mismatch in ${feedFile}: expected ${version}, found ${declaredVersion}`);
    process.exit(1);
  }
}

console.log(`Validated release artifacts for ${platformLabel} with version ${version}.`);
