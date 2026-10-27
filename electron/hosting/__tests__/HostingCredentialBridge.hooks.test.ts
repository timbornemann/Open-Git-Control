import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { HostingCredentialBridge } from '../HostingCredentialBridge';

const exec = promisify(execFile);
const removeFixture = (root: string) => {
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-credential-hook-'))
    throw new Error('Unsafe test cleanup.');
  fs.rmSync(root, { recursive: true, force: true });
};

it('does not expose broker keys or Electron Node mode to a real Git pre-push hook', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-credential-hook-'));
  const repo = path.join(root, 'repo');
  const server = path.join(root, 'server.git');
  const hooks = path.join(root, 'hooks');
  const output = path.join(root, 'hook-environment.txt');
  const git = (args: string[], overrides?: NodeJS.ProcessEnv) => exec('git', args, { cwd: repo, env: { ...process.env, ...overrides }, windowsHide: true });
  const bridge = new HostingCredentialBridge(async () => ({ username: 'test-user', password: 'test-token', isCurrent: () => true }));
  let operation: Awaited<ReturnType<HostingCredentialBridge['createGitCredentialEnvironment']>> | undefined;
  fs.mkdirSync(repo);
  fs.mkdirSync(hooks);
  try {
    await git(['init', '-b', 'main']);
    await git(['config', 'user.name', 'Hook Test']);
    await git(['config', 'user.email', 'hook@example.test']);
    await git(['-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'base']);
    await git(['init', '--bare', server]);
    await git(['config', 'core.hooksPath', hooks.replace(/\\/g, '/')]);
    const quote = (value: string) => `'${value.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
    fs.writeFileSync(
      path.join(hooks, 'pre-push'),
      [
        '#!/bin/sh',
        `printf '%s\\n' "\${ELECTRON_RUN_AS_NODE-unset}" "\${OGC_GIT_BROKER_KEY-unset}" "\${OGC_GIT_BROKER_PORT-unset}" "\${OGC_TEST_SETTING-unset}" > ${quote(output)}`,
        '',
      ].join('\n'),
      { mode: 0o700 },
    );
    operation = await bridge.createGitCredentialEnvironment({
      connectionId: 'one',
      urls: ['https://forge.example.test/repo.git'],
      envOverrides: { ELECTRON_RUN_AS_NODE: 'old-mode', OGC_GIT_BROKER_KEY: 'old-key', OGC_GIT_BROKER_PORT: 'old-port', OGC_TEST_SETTING: 'preserved' },
    });
    await git(['push', server, 'HEAD:refs/heads/main'], operation.envOverrides);
    expect(fs.readFileSync(output, 'utf8').trim().split(/\r?\n/)).toEqual(['unset', 'unset', 'unset', 'preserved']);
  } finally {
    operation?.dispose();
    removeFixture(root);
  }
}, 30_000);
