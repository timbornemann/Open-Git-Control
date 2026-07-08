#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPOSITORY = 'timbornemann/Open-Git-Control';
const PRODUCT_NAME = 'Open-Git-Control';
const GITHUB_RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const GITHUB_LATEST_RELEASE_URL = `${GITHUB_RELEASES_URL}/latest`;

const getLatestReleaseApiUrl = () => process.env.OPEN_GIT_CONTROL_LATEST_RELEASE_API || `https://api.github.com/repos/${REPOSITORY}/releases/latest`;

const formatDate = (value) => {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
};

const fetchLatestRelease = async () => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Open-Git-Control README release link updater',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(getLatestReleaseApiUrl(), { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch latest release (${response.status} ${response.statusText}).`);
  }
  return response.json();
};

const getReleaseVersion = (tagName) => {
  const match = String(tagName || '').match(/^v?(\d+\.\d+\.\d+)$/);
  if (!match) {
    throw new Error(`Latest release tag "${tagName}" is not a supported SemVer tag.`);
  }
  return match[1];
};

const getAssetMap = (release) => {
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return new Map(assets.map((asset) => [asset.name, asset.browser_download_url]));
};

const requireAsset = (assetsByName, assetName) => {
  const url = assetsByName.get(assetName);
  if (!url) {
    throw new Error(`Latest release is missing required asset: ${assetName}`);
  }
  return { name: assetName, url };
};

const getDownloadRows = (release) => {
  const version = getReleaseVersion(release.tag_name);
  const assetsByName = getAssetMap(release);

  return [
    {
      platformEn: 'Windows x64',
      platformDe: 'Windows x64',
      packageEn: 'NSIS installer `.exe`',
      packageDe: 'NSIS Installer `.exe`',
      asset: requireAsset(assetsByName, `${PRODUCT_NAME}-${version}-win-x64.exe`),
    },
    {
      platformEn: 'Linux x64',
      platformDe: 'Linux x64',
      packageEn: 'AppImage',
      packageDe: 'AppImage',
      asset: requireAsset(assetsByName, `${PRODUCT_NAME}-${version}-linux-x86_64.AppImage`),
    },
    {
      platformEn: 'Linux amd64',
      platformDe: 'Linux amd64',
      packageEn: 'Debian package `.deb`',
      packageDe: 'Debian-Paket `.deb`',
      asset: requireAsset(assetsByName, `${PRODUCT_NAME}-${version}-linux-amd64.deb`),
    },
    {
      platformEn: 'macOS x64',
      platformDe: 'macOS x64',
      packageEn: 'Disk image `.dmg`',
      packageDe: 'Disk Image `.dmg`',
      asset: requireAsset(assetsByName, `${PRODUCT_NAME}-${version}-mac-x64.dmg`),
    },
    {
      platformEn: 'macOS x64',
      platformDe: 'macOS x64',
      packageEn: 'Zip archive',
      packageDe: 'Zip-Archiv',
      asset: requireAsset(assetsByName, `${PRODUCT_NAME}-${version}-mac-x64.zip`),
    },
  ];
};

const buildEnglishDownloadsSection = (release, rows) => {
  const published = formatDate(release.published_at);
  const releaseLine = `Current latest release: [${release.tag_name}](${release.html_url})${published ? `, published ${published}` : ''}.`;
  const tableRows = rows.map((row) => `| ${row.platformEn} | ${row.packageEn} | [${row.asset.name}](${row.asset.url}) |`).join('\n');

  return `## Downloads

Always-current release page:

[github.com/timbornemann/Open-Git-Control/releases/latest](${GITHUB_LATEST_RELEASE_URL})

${releaseLine}

The badge and latest release page stay current automatically. The direct binary links below are versioned by GitHub asset name and are refreshed by the release workflow after a new stable release is published.

| Platform | Package | Direct GitHub download |
| --- | --- | --- |
${tableRows}

The \`latest*.yml\` and \`.blockmap\` files in GitHub Releases are update metadata for the auto-updater. Most users should download one of the installers above.
`;
};

const buildGermanDownloadsSection = (release, rows) => {
  const published = formatDate(release.published_at);
  const releaseLine = `Aktuell neuestes Release: [${release.tag_name}](${release.html_url})${published ? `, veroeffentlicht am ${published}` : ''}.`;
  const tableRows = rows.map((row) => `| ${row.platformDe} | ${row.packageDe} | [${row.asset.name}](${row.asset.url}) |`).join('\n');

  return `## Downloads

Immer aktuelle Release-Seite:

[github.com/timbornemann/Open-Git-Control/releases/latest](${GITHUB_LATEST_RELEASE_URL})

${releaseLine}

Badge und Latest-Release-Seite bleiben automatisch aktuell. Die direkten Binary-Links unten sind durch die GitHub-Asset-Namen versioniert und werden vom Release-Workflow nach einem neuen stabilen Release aktualisiert.

| Plattform | Paket | Direkter GitHub-Download |
| --- | --- | --- |
${tableRows}

Die Dateien \`latest*.yml\` und \`.blockmap\` in GitHub Releases sind Update-Metadaten fuer den Auto-Updater. Normale Nutzer sollten einen der Installer oben herunterladen.
`;
};

const replaceSection = (content, startHeading, endHeading, replacement) => {
  const startIndex = content.indexOf(startHeading);
  if (startIndex < 0) {
    throw new Error(`Could not find section start "${startHeading}".`);
  }
  const endIndex = content.indexOf(endHeading, startIndex + startHeading.length);
  if (endIndex < 0) {
    throw new Error(`Could not find section end "${endHeading}".`);
  }
  return `${content.slice(0, startIndex)}${replacement}\n${content.slice(endIndex)}`;
};

const updateFile = (filePath, startHeading, endHeading, replacement) => {
  const original = fs.readFileSync(filePath, 'utf8');
  const updated = replaceSection(original, startHeading, endHeading, replacement);
  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    return true;
  }
  return false;
};

const main = async () => {
  const release = await fetchLatestRelease();
  const rows = getDownloadRows(release);
  const rootDir = path.resolve(__dirname, '..');

  const changed = [
    updateFile(path.join(rootDir, 'README.md'), '## Downloads', '## Requirements', buildEnglishDownloadsSection(release, rows)),
    updateFile(path.join(rootDir, 'README.de.md'), '## Downloads', '## Voraussetzungen', buildGermanDownloadsSection(release, rows)),
  ].some(Boolean);

  console.log(`${changed ? 'Updated' : 'No changes for'} README release links to ${release.tag_name}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
