#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const releaseDir = path.resolve(process.cwd(), process.argv[2] || 'release');
const outputPath = path.join(releaseDir, 'SHA256SUMS.txt');
const excluded = new Set(['SHA256SUMS.txt']);

if (!fs.existsSync(releaseDir)) {
  console.error(`Release directory not found: ${releaseDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && !excluded.has(entry.name))
  .map((entry) => entry.name)
  .filter((fileName) => /\.(?:exe|appimage|deb|dmg|zip)$/i.test(fileName))
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  console.error('No release artifacts were found for checksum generation.');
  process.exit(1);
}

const checksums = files.map((fileName) => {
  const digest = crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(releaseDir, fileName)))
    .digest('hex');
  return `${digest}  ${fileName}`;
});

fs.writeFileSync(outputPath, `${checksums.join('\n')}\n`, 'utf8');
console.log(`Wrote SHA-256 checksums for ${files.length} release artifact(s).`);
