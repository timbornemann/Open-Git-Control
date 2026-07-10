#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, 'build');
const projectLicensePath = path.join(rootDir, 'LICENSE');
const installerLicensePath = path.join(buildDir, 'LICENSE.txt');
const noticesPath = path.join(buildDir, 'THIRD_PARTY_NOTICES.txt');
const checkOnly = process.argv.includes('--check');

const textFileCandidates = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^(license|licence|copying|notice)(\.|$)/i.test(entry.name))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
};

const readFirstLicenseText = (directory) => {
  const licensePath = textFileCandidates(directory)[0];
  if (!licensePath) return null;
  const content = fs.readFileSync(licensePath, 'utf8').trim();
  return content || null;
};

const formatLicense = (license) => {
  if (typeof license === 'string') return license.trim() || 'Not declared';
  if (license && typeof license === 'object') return JSON.stringify(license);
  return 'Not declared';
};

const buildThirdPartyNotices = () => {
  const lockfilePath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) throw new Error('package-lock.json is required to generate third-party notices.');

  const lockfile = JSON.parse(fs.readFileSync(lockfilePath, 'utf8'));
  const packagePaths = Object.keys(lockfile.packages || {})
    .filter((relativePath) => relativePath.startsWith('node_modules/') && (!lockfile.packages[relativePath]?.dev || relativePath === 'node_modules/electron'))
    .sort((left, right) => left.localeCompare(right));

  const sections = [
    'Open-Git-Control – Third-Party Notices',
    '',
    'This file is generated from package-lock.json and the installed production dependencies.',
    'It is included with distributed application packages together with the project GPL-3.0 license.',
  ];

  for (const relativePath of packagePaths) {
    const packageDirectory = path.join(rootDir, relativePath);
    const manifestPath = path.join(packageDirectory, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Installed dependency is missing its package.json: ${relativePath}`);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const name = String(manifest.name || relativePath.replace(/^node_modules\//, ''));
    const version = String(manifest.version || lockfile.packages[relativePath]?.version || 'unknown');
    const licenseText = readFirstLicenseText(packageDirectory);

    sections.push('', '='.repeat(80), `${name}@${version}`, `Declared license: ${formatLicense(manifest.license)}`, '='.repeat(80));
    sections.push(licenseText || 'No license text file was found in this installed dependency. Refer to its declared license above.');
  }

  return `${sections.join('\n').trimEnd()}\n`;
};

const ensureExpectedFile = (filePath, expectedContent) => {
  const currentContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (checkOnly) {
    if (currentContent !== expectedContent) throw new Error(`${path.relative(rootDir, filePath)} is missing or outdated. Run npm run legal:prepare.`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, expectedContent, 'utf8');
};

try {
  if (!fs.existsSync(projectLicensePath)) throw new Error('LICENSE is required for distribution.');
  const projectLicense = fs.readFileSync(projectLicensePath, 'utf8');
  ensureExpectedFile(installerLicensePath, projectLicense);
  ensureExpectedFile(noticesPath, buildThirdPartyNotices());
  console.log(`${checkOnly ? 'Verified' : 'Prepared'} distribution license and third-party notices.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
