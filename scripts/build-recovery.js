#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const { build } = require('../package.json');
// Match electron-builder's UUID v5 without requiring npm dependencies in the
// native-only CI job.
const namespace = Buffer.from('50e065bc313411e69bab38c9862bdaf3', 'hex');
const guidBytes = require('node:crypto').createHash('sha1').update(namespace).update(build.appId).digest().subarray(0, 16);
guidBytes[6] = (guidBytes[6] & 15) | 80;
guidBytes[8] = (guidBytes[8] & 63) | 128;
const guidHex = guidBytes.toString('hex');
const derivedGuid = `${guidHex.slice(0, 8)}-${guidHex.slice(8, 12)}-${guidHex.slice(12, 16)}-${guidHex.slice(16, 20)}-${guidHex.slice(20)}`;
const nativeVersion = /^version\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(root, 'recovery/Cargo.toml'), 'utf8'))?.[1];
if (nativeVersion !== require('../package.json').version)
  throw new Error('Prepare the release version before building recovery; Cargo and package.json versions differ.');
if ((build.nsis?.guid || derivedGuid) !== require('../src/shared/updateSource.json').windowsInstallerGuid)
  throw new Error('Recovery and NSIS installation identities differ.');
const target = { win32: 'x86_64-pc-windows-msvc', darwin: 'x86_64-apple-darwin', linux: 'x86_64-unknown-linux-gnu' }[process.platform];
if (!target) throw new Error('Unsupported recovery build platform.');
const cargo = (args) => execFileSync('cargo', args, { cwd: root, stdio: 'inherit', windowsHide: true });
const manifest = ['--manifest-path', 'recovery/Cargo.toml'];
// Cargo.lock is committed; --locked prevents silently resolving newer dependencies.
cargo(['fetch', ...manifest, '--locked', '--target', target]);
require('./recovery-legal').prepare(root);
cargo(['build', ...manifest, '--release', '--locked', '--target', target]);
const directory = path.join(root, 'build/recovery');
fs.mkdirSync(directory, { recursive: true });
const executable = process.platform === 'win32' ? 'Open-Git-Control-Recovery.exe' : 'open-git-control-recovery';
const destination = path.join(directory, executable);
const temporary = `${destination}.${require('node:crypto').randomUUID()}.tmp`;
fs.copyFileSync(path.join(root, 'recovery/target', target, 'release', process.platform === 'win32' ? 'ogc-recovery.exe' : 'ogc-recovery'), temporary);
try {
  try {
    fs.renameSync(temporary, destination);
  } catch (error) {
    if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || !fs.existsSync(destination)) throw error;
    // A native preview may still have the preceding build mapped on Windows.
    // Keep it running; move that generated file out of the packaged resources.
    const previous = path.join(root, 'build/recovery-previous', `${require('node:crypto').randomUUID()}.exe`);
    const managed = path.resolve(root, 'build') + path.sep;
    if (!path.resolve(previous).startsWith(managed) || !path.resolve(destination).startsWith(managed)) throw new Error('Unsafe recovery build output path.');
    fs.mkdirSync(path.dirname(previous), { recursive: true });
    fs.renameSync(destination, previous);
    try {
      fs.renameSync(temporary, destination);
    } catch (failure) {
      fs.renameSync(previous, destination);
      throw failure;
    }
  }
} finally {
  fs.rmSync(temporary, { force: true });
}
fs.chmodSync(path.join(directory, executable), 0o755);
if (process.platform === 'win32') require('./verify-recovery-runtime').verifyWindowsRuntime(path.join(directory, executable));
fs.copyFileSync(path.join(root, 'recovery/THIRD_PARTY_NOTICES.txt'), path.join(directory, 'THIRD_PARTY_NOTICES.txt'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(directory, 'LICENSE'));
console.log(`Built independent recovery helper for ${target}.`);
