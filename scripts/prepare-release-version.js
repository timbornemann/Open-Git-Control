#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rawVersion = process.argv[2];

if (!rawVersion || typeof rawVersion !== 'string') {
  console.error('Usage: node scripts/prepare-release-version.js <version>');
  process.exit(1);
}

const normalizedVersion = rawVersion.trim();
const semverPattern = /^\d+\.\d+\.\d+$/;

if (!semverPattern.test(normalizedVersion)) {
  console.error(`Invalid release version "${normalizedVersion}". Expected SemVer "x.y.z".`);
  process.exit(1);
}

const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.version = normalizedVersion;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log(`Prepared release version: ${normalizedVersion}`);
