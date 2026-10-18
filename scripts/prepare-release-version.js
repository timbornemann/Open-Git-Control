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
const packageLockPath = path.resolve(process.cwd(), 'package-lock.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.version = normalizedVersion;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

if (fs.existsSync(packageLockPath)) {
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  packageLock.version = normalizedVersion;
  if (packageLock.packages?.['']) {
    packageLock.packages[''].version = normalizedVersion;
  }
  fs.writeFileSync(packageLockPath, `${JSON.stringify(packageLock, null, 2)}\n`, 'utf8');
}

console.log(`Prepared release version: ${normalizedVersion}`);
const cargoPath = path.resolve(process.cwd(), 'recovery/Cargo.toml');
if (fs.existsSync(cargoPath)) {
  const cargo = fs.readFileSync(cargoPath, 'utf8');
  fs.writeFileSync(cargoPath, cargo.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${normalizedVersion}"`), 'utf8');
  const lockPath = path.resolve(process.cwd(), 'recovery/Cargo.lock');
  const lock = fs.readFileSync(lockPath, 'utf8');
  fs.writeFileSync(lockPath, lock.replace(/(name = "ogc-recovery"\r?\nversion = )"[^"]+"/, `$1"${normalizedVersion}"`), 'utf8');
}
