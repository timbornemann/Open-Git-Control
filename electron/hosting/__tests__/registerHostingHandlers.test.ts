import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { IpcMainInvokeEvent } from 'electron';
import type { HostingAdapter } from '../HostingAdapter';
import { HostingService } from '../HostingService';
import { registerHostingHandlers } from '../registerHostingHandlers';
import { RemotePreferencesStore } from '../../git/RemotePreferencesStore';
import { releaseRepository, cleanReleaseRepositories } from '../../github/__tests__/releaseTargetFixture';
import { clearSelectedFileGrants, grantSelectedProjectParentDirectory } from '../../main-process/fileAccessGrant';

const state = vi.hoisted(() => ({ directory: '', targetDirectory: '', handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>() }));
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

beforeEach(() => {
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-hosting-ipc-test-'));
  state.targetDirectory = state.directory;
  clearSelectedFileGrants(7);
  state.handlers.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  clearSelectedFileGrants(7);
  await cleanReleaseRepositories();
  if (path.dirname(path.resolve(state.directory)) !== path.resolve(os.tmpdir()) || !path.basename(state.directory).startsWith('ogc-hosting-ipc-test-'))
    throw new Error('Invalid test cleanup directory.');
  await fs.promises.rm(state.directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function fixture(usePathAlias = false, useShortPath = false) {
  if (useShortPath) {
    // A directory junction alone does not exercise Windows 8.3 path expansion.
    // Ask Windows for the actual short name, as used by hosted runners' TEMP.
    state.targetDirectory = execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); (New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:OGC_TEST_DIRECTORY).ShortPath',
      ],
      { env: { ...process.env, OGC_TEST_DIRECTORY: state.directory }, encoding: 'utf8', windowsHide: true },
    ).trim();
  }
  if (usePathAlias) {
    const parent = path.join(state.targetDirectory, 'clone-parent');
    const alias = path.join(state.targetDirectory, 'clone-parent-alias');
    fs.mkdirSync(parent);
    fs.symlinkSync(parent, alias, process.platform === 'win32' ? 'junction' : 'dir');
    state.targetDirectory = alias;
  }
  grantSelectedProjectParentDirectory(7, state.targetDirectory);
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
    state.handlers.get('hosting:request')!(event, 'clone', { repository: ref, targetDir: state.targetDirectory, targetName: 'selected-clone' }) as Promise<{
      success: boolean;
      error?: string;
      data?: { path: string };
    }>;
  return { request, cloneSpy, ref, git, event, hosting };
}

describe('hosting clone authorization and account continuity', { timeout: 30_000 }, () => {
  it('reads release-note subjects and descriptions entirely locally, without a hosting account or network', async () => {
    const f = await fixture();
    const oid = await f.git.commit('feat: offline templates\n\nTwo paragraphs.\n\n- Preserve descriptions.');
    const provider = vi.spyOn(f.hosting, 'request').mockRejectedValue(new Error('Network unavailable'));
    const result = await state.handlers.get('hosting:request')!(f.event, 'releaseNotesCommits', {
      repoPath: f.git.repo,
      toRef: 'main',
      fromRef: f.git.initial,
    });
    expect(result).toMatchObject({
      success: true,
      data: [{ sha: oid, message: 'feat: offline templates', description: 'Two paragraphs.\n\n- Preserve descriptions.' }],
    });
    expect(provider).not.toHaveBeenCalled();
  });
  const pathVariants = [
    { alias: false, short: false },
    { alias: true, short: false },
    ...(process.platform === 'win32'
      ? [
          { alias: false, short: true },
          { alias: true, short: true },
        ]
      : []),
  ];
  it.each(pathVariants)(
    'clones a verified source and persists the selected origin account for later transfers (path alias: $alias, Windows short path: $short)',
    async ({ alias, short }) => {
      const f = await fixture(alias, short);
      const result = await f.request();
      expect(result.success, result.error).toBe(true);
      expect(result.data?.path).toBe(fs.realpathSync.native(path.join(state.targetDirectory, 'selected-clone')));
      expect(new RemotePreferencesStore().read(result.data!.path)).toMatchObject({
        hostingRemote: 'origin',
        hostingRepository: f.ref,
        bindings: [{ remoteName: 'origin', url: 'https://github.com/acme/project.git', repository: f.ref }],
      });
      const options = f.cloneSpy.mock.calls[0][3]!;
      expect(options.envOverrides?.GIT_CONFIG_VALUE_1).toContain('credential-helper.cjs');
      expect(JSON.stringify(options.envOverrides)).not.toContain('private-clone-secret');
    },
  );

  it('rejects a renderer-supplied destination without a folder grant before cloning', async () => {
    const f = await fixture();
    clearSelectedFileGrants(7);
    expect(await f.request()).toMatchObject({ success: false, error: 'Choose the clone destination using the folder picker.' });
    expect(f.cloneSpy).not.toHaveBeenCalled();
  });
});
