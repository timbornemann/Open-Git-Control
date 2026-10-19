#!/usr/bin/env node
// Never run real installers against the developer's active installation.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Actual installation tests require a disposable CI runner.');
assert.equal(process.env.CI, 'true');
const output = execFileSync(
  'cargo',
  ['test', '--manifest-path', 'recovery/Cargo.toml', '--locked', '--test', 'installation', '--no-run', '--message-format=json'],
  { windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
const artifact = output
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line))
  .find((message) => message.reason === 'compiler-artifact' && message.target.name === 'installation' && message.executable);
assert.ok(artifact?.executable, 'Cargo did not build the isolated installation test binary.');
const env = { ...process.env, OGC_RECOVERY_E2E: '1' };
if (process.platform === 'linux')
  execFileSync(
    'sudo',
    ['-n', '--preserve-env=OGC_RECOVERY_E2E,OGC_RECOVERY_GITHUB_TOKEN,CI,GITHUB_ACTIONS', artifact.executable, '--ignored', '--nocapture', '--test-threads=1'],
    {
      env,
      windowsHide: true,
      stdio: 'inherit',
      timeout: 30 * 60 * 1000,
    },
  );
else execFileSync(artifact.executable, ['--ignored', '--nocapture', '--test-threads=1'], { env, windowsHide: true, stdio: 'inherit', timeout: 30 * 60 * 1000 });
