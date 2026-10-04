import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import type { HostingAdapter } from '../HostingAdapter';
import { HostingService } from '../HostingService';
import { registerHostingHandlers } from '../registerHostingHandlers';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';
import { releaseRepository, cleanReleaseRepositories } from '../../github/__tests__/releaseTargetFixture';

const state = vi.hoisted(() => ({ directory: '', allowed: true, handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>() }));
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  ipcMain: { handle: (name: string, handler: (...args: unknown[]) => Promise<unknown>) => state.handlers.set(name, handler) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showSaveDialog: vi.fn() },
  safeStorage: {
    encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
    decryptString: (value: Buffer) => value.toString().split('').reverse().join(''),
    isEncryptionAvailable: () => true,
  },
}));
vi.mock('../../main-process/secureStore', () => ({ isSecureStorageAvailable: () => true, readSavedGithubTokenWithHost: () => null }));
vi.mock('../../main-process/fileAccessGrant', () => ({
  getAuthorizedSelectedFile: () => null,
  getAuthorizedProjectParentDirectory: () => (state.allowed ? state.directory : null),
}));

beforeEach(() => {
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-hosting-ipc-test-'));
  state.allowed = true;
  state.handlers.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanReleaseRepositories();
  if (path.dirname(path.resolve(state.directory)) !== path.resolve(os.tmpdir()) || !path.basename(state.directory).startsWith('ogc-hosting-ipc-test-'))
    throw new Error('Invalid test cleanup directory.');
  await fs.promises.rm(state.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function fixture() {
  const git = await releaseRepository();
  let ref = { connectionId: '', repositoryId: 'private-project', fullPath: 'acme/project' };
  const hosting = new HostingService(
    (connection, credential) =>
      ({
        authenticate: async () => {
          await credential();
          return { id: 'user-id', username: 'selected-user' };
        },
        repository: async () => ({
          ref,
          name: 'project',
          fullName: 'acme/project',
          private: true,
          cloneUrl: 'https://legacy-user@github.com/acme/project.git',
          htmlUrl: 'https://github.com/acme/project',
          description: null,
          defaultBranch: 'main',
          fork: false,
        }),
        resolveRepository: async (url: string) => (url === 'https://github.com/acme/project.git' ? { ref } : null),
      }) as unknown as HostingAdapter,
    { migrate: false },
  );
  const connection = hosting.saveConnection({ provider: 'github', label: 'Selected GitHub', baseUrl: 'https://github.com' });
  ref = { ...ref, connectionId: connection.id };
  await hosting.request('login', { connectionId: connection.id, token: 'private-clone-secret' });
  const cloneWithProgress = git.gitService.runner.cloneWithProgress.bind(git.gitService.runner);
  const cloneSpy = vi.spyOn(git.gitService.runner, 'cloneWithProgress').mockImplementation(async (url, target, progress, options) => {
    expect(url).toBe('https://github.com/acme/project.git');
    const result = await cloneWithProgress(git.remote, target, progress, options);
    if (result.success) await git.run(['remote', 'set-url', 'origin', url], target);
    return result;
  });
  registerHostingHandlers({ gitService: git.gitService, hostingService: hosting });
  const event = { sender: { id: 7, once: vi.fn(), removeListener: vi.fn(), isDestroyed: () => false, send: vi.fn() } } as unknown as IpcMainInvokeEvent;
  const request = () =>
    state.handlers.get('hosting:request')!(event, 'clone', { repository: ref, targetDir: state.directory, targetName: 'selected-clone' }) as Promise<{
      success: boolean;
      error?: string;
      data?: { path: string };
    }>;
  return { request, cloneSpy, ref };
}

describe('hosting clone authorization and account continuity', { timeout: 30_000 }, () => {
  it('clones a verified source and persists the selected origin account for later transfers', async () => {
    const f = await fixture();
    const result = await f.request();
    expect(result.success).toBe(true);
    expect(result.data?.path).toBe(fs.realpathSync(path.join(state.directory, 'selected-clone')));
    expect(new RemotePreferencesStore().read(result.data!.path)).toMatchObject({
      hostingRemote: 'origin',
      hostingRepository: f.ref,
      bindings: [{ remoteName: 'origin', url: 'https://github.com/acme/project.git', repository: f.ref }],
    });
    const options = f.cloneSpy.mock.calls[0][3]!;
    expect(options.envOverrides?.GIT_CONFIG_VALUE_1).toContain('credential-helper.cjs');
    expect(JSON.stringify(options.envOverrides)).not.toContain('private-clone-secret');
  });

  it('rejects a renderer-supplied destination without a folder grant before cloning', async () => {
    const f = await fixture();
    state.allowed = false;
    expect(await f.request()).toMatchObject({ success: false, error: 'Choose the clone destination using the folder picker.' });
    expect(f.cloneSpy).not.toHaveBeenCalled();
  });
});
