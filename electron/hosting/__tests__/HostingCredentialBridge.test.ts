import { describe, expect, it, vi } from 'vitest';
import { HostingCredentialBridge } from '../HostingCredentialBridge';
import { redactHostingSecrets, registerHostingSecrets } from '../hostingRedaction';
import { normalizeConnectionUrls } from '../hostingUrls';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'node:module';
import * as privateTempFiles from '../../git/PrivateTempFiles';

function brokerDetails(env: NodeJS.ProcessEnv): { port: number; key: string; file: string } {
  const index = Object.keys(env).find((key) => key.startsWith('GIT_CONFIG_KEY_') && env[key] === 'credential.helper' && env[key.replace('_KEY_', '_VALUE_')]);
  const command = env[index!.replace('_KEY_', '_VALUE_')]!;
  const helperPath = / '((?:[^']|'\\'')*)'$/.exec(command)![1].replace(/'\\''/g, "'");
  const file = path.join(path.dirname(helperPath), 'broker.json');
  return { ...JSON.parse(fs.readFileSync(file, 'utf8')), file };
}

const fillCredential = (env: NodeJS.ProcessEnv, host: string, repoPath: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['credential', 'fill'], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve(output) : reject(new Error('Credential request rejected.'))));
    child.stdin.end(`protocol=https\nhost=${host}\npath=${repoPath}\n\n`);
  });

const matchedHttpHeaders = (env: NodeJS.ProcessEnv, url: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn('git', ['config', '--get-urlmatch', 'http.extraHeader', url], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk.toString()));
    child.once('error', reject);
    child.once('close', (code) => (code === 0 ? resolve(output) : reject(new Error('Git configuration lookup failed.'))));
  });

describe('destination-bound credential broker', () => {
  it('supplies credentials only for the exact configured repository and active account', async () => {
    let active = true;
    const bridge = new HostingCredentialBridge(async () => ({ username: 'selected-user', password: 'opaque-secret', isCurrent: () => active }));
    const operation = await bridge.createGitCredentialEnvironment({
      connectionId: 'one',
      urls: ['https://forge.example.test/project/repo.git'],
      envOverrides: { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'push.followTags', GIT_CONFIG_VALUE_0: 'false' },
    });
    const broker = brokerDetails(operation.envOverrides);
    const credential = async (host: string, repoPath: string) =>
      fetch(`http://127.0.0.1:${broker.port}/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${broker.key}` },
        body: JSON.stringify({ protocol: 'https', host, path: repoPath }),
      });
    try {
      expect(operation.envOverrides.GIT_CONFIG_COUNT).toBe('8');
      expect(operation.envOverrides.GIT_CONFIG_KEY_0).toBe('push.followTags');
      expect(operation.envOverrides.OGC_GIT_BROKER_KEY).toBeUndefined();
      expect(operation.envOverrides.OGC_GIT_BROKER_PORT).toBeUndefined();
      expect(operation.envOverrides.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(Object.values(operation.envOverrides).join('\n')).not.toContain(broker.key);
      expect(fs.readFileSync(broker.file, 'utf8')).not.toContain('opaque-secret');
      if (process.platform !== 'win32') expect(fs.statSync(broker.file).mode & 0o077).toBe(0);
      expect(await (await credential('forge.example.test', 'project/repo.git')).text()).toBe('username=selected-user\npassword=opaque-secret\n\n');
      expect((await credential('forge.example.test', 'project/repo.git/info/lfs')).status).toBe(200);
      expect((await credential('forge.example.test', 'project/other.git/info/lfs')).status).toBe(403);
      expect((await credential('forge.example.test', 'project/repo.git/info/lfs/objects/batch')).status).toBe(403);
      expect((await credential('forge.example.test', 'project/other.git')).status).toBe(403);
      expect((await credential('attacker.example.test', 'project/repo.git')).status).toBe(403);
      const filled = await fillCredential(operation.envOverrides, 'forge.example.test', 'project/repo.git');
      expect(filled).toContain('username=selected-user');
      expect(filled).toContain('password=opaque-secret');
      expect(await fillCredential(operation.envOverrides, 'forge.example.test', 'project/repo.git/info/lfs')).toContain('password=opaque-secret');
      await expect(fillCredential(operation.envOverrides, 'forge.example.test', 'project/other.git')).rejects.toThrow('rejected');
      active = false;
      expect((await credential('forge.example.test', 'project/repo.git')).status).toBe(403);
    } finally {
      operation.dispose();
    }
    expect(fs.existsSync(broker.file)).toBe(false);
  });

  it('rejects unrelated LFS servers and repository paths instead of sharing the selected account', async () => {
    const bridge = new HostingCredentialBridge(async () => ({ username: 'user', password: 'password', isCurrent: () => true }));
    for (const endpoint of ['https://lfs.other.test/store', 'https://forge.test/other.git/info/lfs', 'https://forge.test/repo.git/info/lfs?token=private'])
      await expect(bridge.createGitCredentialEnvironment({ connectionId: 'one', urls: ['https://forge.test/repo.git'], lfsUrls: [endpoint] })).rejects.toThrow(
        /system credentials|exact HTTPS/,
      );
  });

  it('rejects plaintext HTTP and clears helper resources on cancellation', async () => {
    const controller = new AbortController();
    const bridge = new HostingCredentialBridge(async () => ({ username: 'user', password: 'password', isCurrent: () => true }));
    await expect(bridge.createGitCredentialEnvironment({ connectionId: 'one', urls: ['http://forge.test/repo.git'] })).rejects.toThrow('HTTPS');
    const operation = await bridge.createGitCredentialEnvironment({ connectionId: 'one', urls: ['https://forge.test/repo.git'], signal: controller.signal });
    const broker = brokerDetails(operation.envOverrides);
    controller.abort();
    await expect(fetch(`http://127.0.0.1:${broker.port}/`)).rejects.toThrow();
    expect(fs.existsSync(broker.file)).toBe(false);
    operation.dispose();
  });

  it('clears inherited helper variables without changing the parent environment or unrelated overrides', async () => {
    vi.stubEnv('ELECTRON_RUN_AS_NODE', 'parent-value');
    vi.stubEnv('OGC_GIT_BROKER_KEY', 'parent-key');
    vi.stubEnv('OGC_GIT_BROKER_PORT', 'parent-port');
    const bridge = new HostingCredentialBridge(async () => ({ username: 'user', password: 'token', isCurrent: () => true }));
    let operation: Awaited<ReturnType<HostingCredentialBridge['createGitCredentialEnvironment']>> | undefined;
    try {
      operation = await bridge.createGitCredentialEnvironment({
        connectionId: 'one',
        urls: ['https://forge.test/repo.git'],
        envOverrides: {
          OGC_GIT_BROKER_KEY: 'old-key',
          electron_run_as_node: 'old-mode',
          ogc_git_broker_key: 'old-key',
          ogc_git_broker_port: 'old-port',
          CUSTOM_GIT_SETTING: 'preserved',
        },
      });
      for (const [name, value] of Object.entries(operation.envOverrides)) {
        if (['ELECTRON_RUN_AS_NODE', 'OGC_GIT_BROKER_KEY', 'OGC_GIT_BROKER_PORT'].includes(name.toUpperCase())) expect(value).toBeUndefined();
      }
      expect(operation.envOverrides.CUSTOM_GIT_SETTING).toBe('preserved');
      expect(process.env.ELECTRON_RUN_AS_NODE).toBe('parent-value');
      expect(process.env.OGC_GIT_BROKER_KEY).toBe('parent-key');
      expect(await fillCredential(operation.envOverrides, 'forge.test', 'repo.git')).toContain('password=token');
    } finally {
      operation?.dispose();
      vi.unstubAllEnvs();
    }
  });

  it('removes the private capability when the broker expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const bridge = new HostingCredentialBridge(async () => ({ username: 'user', password: 'token', isCurrent: () => true }));
    let operation: Awaited<ReturnType<HostingCredentialBridge['createGitCredentialEnvironment']>> | undefined;
    try {
      operation = await bridge.createGitCredentialEnvironment({ connectionId: 'one', urls: ['https://forge.test/repo.git'] });
      const broker = brokerDetails(operation.envOverrides);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(fs.existsSync(path.dirname(broker.file))).toBe(false);
    } finally {
      operation?.dispose();
      vi.useRealTimers();
    }
  });

  it('cleans up the broker and private capability when configuration preparation fails', async () => {
    const create = vi.spyOn(privateTempFiles, 'createPrivateTempDir');
    try {
      const bridge = new HostingCredentialBridge(async () => ({ username: 'user', password: 'token', isCurrent: () => true }));
      await expect(
        bridge.createGitCredentialEnvironment({
          connectionId: 'one',
          urls: ['https://forge.test/repo.git'],
          envOverrides: { GIT_CONFIG_COUNT: 'invalid' },
        }),
      ).rejects.toThrow('Invalid inherited Git configuration');
      const directory = create.mock.results.at(-1)?.value as string | undefined;
      expect(directory).toBeDefined();
      expect(fs.existsSync(directory!)).toBe(false);
    } finally {
      create.mockRestore();
    }
  });

  it.each(['', 'other-account@'])('resets inherited authentication headers for the exact selected endpoint with username %s', async (username) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-git-header-test-'));
    const configFile = path.join(directory, 'global.gitconfig');
    const endpoint = `https://${username}forge.example.test/project/repo.git`;
    const unrelatedEndpoint = 'https://forge.example.test/project/other.git';
    fs.writeFileSync(
      configFile,
      '[http]\n\textraHeader = Authorization: Basic inherited-global\n' +
        '[http "https://forge.example.test/"]\n\textraHeader = Authorization: Basic inherited-host\n' +
        `[http "${endpoint}"]\n\textraHeader = Authorization: Basic inherited-repository\n` +
        `[http "${unrelatedEndpoint}"]\n\textraHeader = Authorization: Basic unrelated-repository\n`,
    );
    const environment = { GIT_CONFIG_GLOBAL: configFile, GIT_CONFIG_NOSYSTEM: '1' };
    const bridge = new HostingCredentialBridge(async () => ({ username: 'selected-user', password: 'selected-token', isCurrent: () => true }));
    let operation: Awaited<ReturnType<HostingCredentialBridge['createGitCredentialEnvironment']>> | undefined;
    try {
      expect(await matchedHttpHeaders(environment, endpoint)).toContain('inherited-repository');
      operation = await bridge.createGitCredentialEnvironment({ connectionId: 'one', urls: [endpoint], envOverrides: environment });
      expect((await matchedHttpHeaders(operation.envOverrides, endpoint)).trim()).toBe('');
      expect(await matchedHttpHeaders(operation.envOverrides, unrelatedEndpoint)).toContain('unrelated-repository');
    } finally {
      operation?.dispose();
      fs.rmSync(configFile, { force: true });
      fs.rmdirSync(directory);
    }
  });

  it.runIf(process.platform === 'win32')(
    'runs the Git credential helper with the actual Electron executable',
    async () => {
      const electronExecutable = createRequire(path.resolve('package.json'))('electron') as string;
      expect(fs.existsSync(electronExecutable)).toBe(true);
      const execPathDescriptor = Object.getOwnPropertyDescriptor(process, 'execPath')!;
      const bridge = new HostingCredentialBridge(async () => ({ username: 'electron-user', password: 'electron-runtime-secret', isCurrent: () => true }));
      let operation: Awaited<ReturnType<HostingCredentialBridge['createGitCredentialEnvironment']>> | undefined;
      try {
        Object.defineProperty(process, 'execPath', { ...execPathDescriptor, value: electronExecutable });
        operation = await bridge.createGitCredentialEnvironment({ connectionId: 'electron', urls: ['https://forge.example.test/project/repo.git'] });
        expect(operation.envOverrides.ELECTRON_RUN_AS_NODE).toBeUndefined();
        expect(operation.envOverrides.GIT_CONFIG_VALUE_1).toContain('!ELECTRON_RUN_AS_NODE=1 ');
        expect(operation.envOverrides.GIT_CONFIG_VALUE_1).toContain(electronExecutable.replace(/\\/g, '/'));
        const filled = await fillCredential(operation.envOverrides, 'forge.example.test', 'project/repo.git');
        expect(filled).toContain('username=electron-user');
        expect(filled).toContain('password=electron-runtime-secret');
        await expect(fillCredential(operation.envOverrides, 'forge.example.test', 'project/other.git')).rejects.toThrow('rejected');
      } finally {
        operation?.dispose();
        Object.defineProperty(process, 'execPath', execPathDescriptor);
      }
      expect(process.execPath).toBe(execPathDescriptor.value);
    },
    20_000,
  );
});

describe('hosting URL and secret boundaries', () => {
  it('preserves nested self-hosted base paths and rejects unrelated API hosts', () => {
    expect(normalizeConnectionUrls({ provider: 'gitlab', label: 'GitLab', baseUrl: 'https://git.example.test/gitlab/' }).apiBaseUrl).toBe(
      'https://git.example.test/gitlab/api/v4',
    );
    expect(() =>
      normalizeConnectionUrls({ provider: 'forgejo', label: 'Forgejo', baseUrl: 'https://git.example.test', apiBaseUrl: 'https://attacker.test/api/v1' }),
    ).toThrow('server');
  });

  it('redacts opaque tokens without requiring provider-specific prefixes', () => {
    const release = registerHostingSecrets(['a-random-forge-token']);
    expect(redactHostingSecrets('remote: rejected a-random-forge-token')).toBe('remote: rejected [REDACTED]');
    release();
    expect(redactHostingSecrets('late error a-random-forge-token')).toBe('late error [REDACTED]');
  });
});
