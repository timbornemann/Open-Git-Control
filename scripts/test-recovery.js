#!/usr/bin/env node
// Runs only isolated probes. It never updates the user's installed application.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const name = process.platform === 'win32' ? 'Open-Git-Control-Recovery.exe' : 'open-git-control-recovery';
const supplied = process.argv[2] && path.resolve(process.argv[2]);
const helper = supplied || path.join(root, 'build/recovery', name);
if (process.platform === 'win32') require('./verify-recovery-runtime').verifyWindowsRuntime(helper);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-recovery-smoke-'));
try {
  const binary = path.join(temporary, name);
  fs.copyFileSync(helper, binary);
  fs.chmodSync(binary, 0o755);
  // Empty application folder: no app.asar, Node, Electron DLLs, main EXE or ICU.
  const app = path.join(temporary, process.platform === 'darwin' ? 'Open-Git-Control.app' : 'app');
  const resources = process.platform === 'darwin' ? path.join(app, 'Contents/Resources') : app;
  fs.mkdirSync(resources, { recursive: true });
  const version = require('../package.json').version;
  fs.writeFileSync(
    path.join(resources, 'recovery-install.json'),
    JSON.stringify({ schema: 1, appId: 'com.opengitcontrol.app', version, kind: { win32: 'windows', darwin: 'macos', linux: 'deb' }[process.platform] }),
  );
  const options = {
    cwd: temporary,
    windowsHide: true,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PATH: process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin', OGC_RECOVERY_SMOKE_HOLD: '' },
  };
  delete options.env.OGC_RECOVERY_SMOKE_HOLD;
  const inspection = JSON.parse(execFileSync(binary, ['--inspect-only', '--installation', app, '--profile', path.join(temporary, 'profile')], options));
  assert.equal(inspection.version, version);
  assert.equal(inspection.appId, 'com.opengitcontrol.app');
  const output = execFileSync(binary, ['--smoke-test'], options);
  assert.match(output, /OGC_RECOVERY_SMOKE_OK/);
  console.log('Independent recovery UI and damaged-installation detection passed without Electron, Node or Git.');
} finally {
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-recovery-smoke-'))
    throw new Error('Unsafe smoke-test cleanup path.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
