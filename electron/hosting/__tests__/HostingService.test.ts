import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { HostingAdapter, HostingAdapterFactory, CredentialGetter } from '../HostingAdapter';
import type { HostedRepository } from '../../../src/types/hostingDtos';
import { HostingService } from '../HostingService';
import { HostingCredentialStore } from '../HostingCredentialStore';

const state = vi.hoisted(() => ({ directory: '', encryption: true, legacy: null as { token: string; host: string | null } | null, host: 'github.com' }));
vi.mock('electron', () => ({
  app: { getPath: () => state.directory },
  safeStorage: {
    encryptString: (value: string) => Buffer.from(value.split('').reverse().join('')),
    decryptString: (value: Buffer) => value.toString().split('').reverse().join(''),
    isEncryptionAvailable: () => state.encryption,
  },
}));
vi.mock('../../main-process/secureStore', () => ({ isSecureStorageAvailable: () => state.encryption, readSavedGithubTokenWithHost: () => state.legacy }));
vi.mock('../../main-process/settingsStore', () => ({ readSettingsWithMigration: () => ({ githubHost: state.host, githubOauthClientId: '' }) }));
vi.mock('../../main-process/githubCatalogCache', () => ({ readGithubCatalogCache: () => null }));
vi.mock('../../main-process/githubCliAuth', () => ({
  inspectGithubCliLogin: async (host: string) => ({ username: 'cli-user', host }),
  runGithubCliOneClickLogin: async () => ({ accessToken: 'cli-token' }),
}));

let service: HostingService;
let credentialGetters: Map<string, CredentialGetter>;
let repository: HostedRepository;
let getIdentity: (token: string) => Promise<{ id: string; username: string }>;
let failRepositories: boolean;

beforeEach(() => {
  state.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-hosting-test-'));
  state.encryption = true;
  state.legacy = null;
  state.host = 'github.com';
  credentialGetters = new Map();
  failRepositories = false;
  getIdentity = async (token) => ({ id: token, username: token });
  const factory: HostingAdapterFactory = (connection, getter) => {
    credentialGetters.set(connection.id, getter);
    return {
      authenticate: async () => getIdentity((await getter()).accessToken),
      repositories: async () => {
        await getter();
        if (failRepositories) throw new Error('Offline');
        return { items: [repository], nextCursor: null };
      },
    } as unknown as HostingAdapter;
  };
  service = new HostingService(factory, { migrate: false });
});
afterEach(() => {
  if (path.dirname(path.resolve(state.directory)) !== path.resolve(os.tmpdir()) || !path.basename(state.directory).startsWith('ogc-hosting-test-'))
    throw new Error('Invalid test cleanup path.');
  fs.rmSync(state.directory, { recursive: true, force: true });
});
const add = (baseUrl = 'https://forge.example.test') => service.saveConnection({ provider: 'forgejo', label: 'Test forge', baseUrl });

describe('independent hosting accounts', () => {
  it('reads the saved private catalog and resolves its local URL without waiting for startup authentication', async () => {
    const first = add();
    await service.request('login', { connectionId: first.id, token: 'saved-account' });
    const saved: HostedRepository = {
      ref: { connectionId: first.id, repositoryId: '12', fullPath: 'team/project' },
      name: 'project',
      fullName: 'team/project',
      description: 'Saved private description',
      private: true,
      cloneUrl: `${first.baseUrl}/team/project.git`,
      htmlUrl: `${first.baseUrl}/team/project`,
      defaultBranch: 'main',
      fork: false,
    };
    service.catalogStore.write(service.connection(first.id), [saved]);
    let finish!: (value: { id: string; username: string }) => void;
    const authenticate = vi.fn(
      () =>
        new Promise<{ id: string; username: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const restarted = new HostingService(
      () =>
        ({
          authenticate,
          resolveCachedRepository: (url: string, items: HostedRepository[]) => items.find((repo) => repo.cloneUrl === url) ?? null,
          repositories: async () => ({ items: [saved], nextCursor: null }),
        }) as unknown as HostingAdapter,
      { migrate: false },
    );
    expect(await restarted.request('cachedRepositories', { connectionId: first.id })).toMatchObject({ items: [saved], stale: true });
    expect(await restarted.request('resolveRepository', { connectionId: first.id, url: saved.cloneUrl, cachedOnly: true })).toEqual(saved);
    expect(authenticate).not.toHaveBeenCalled();
    expect(restarted.connection(first.id).authenticated).toBe(false);
    const refreshing = restarted.request('repositories', { connectionId: first.id });
    await vi.waitFor(() => expect(authenticate).toHaveBeenCalledOnce());
    expect(await restarted.request('cachedRepositories', { connectionId: first.id })).toMatchObject({ items: [saved] });
    finish({ id: 'saved-account', username: 'saved-account' });
    await refreshing;
    await restarted.request('logout', { connectionId: first.id });
    expect(await restarted.request('cachedRepositories', { connectionId: first.id })).toMatchObject({ items: [] });
  });

  it('persists a first paginated page immediately and replaces obsolete cached entries only after the final page', async () => {
    const first = add();
    await service.request('login', { connectionId: first.id, token: 'saved-account' });
    const repository = (id: string): HostedRepository => ({
      ref: { connectionId: first.id, repositoryId: id, fullPath: `team/${id}` },
      name: id,
      fullName: `team/${id}`,
      description: `${id} description`,
      private: true,
      cloneUrl: `${first.baseUrl}/team/${id}.git`,
      htmlUrl: `${first.baseUrl}/team/${id}`,
      defaultBranch: 'main',
      fork: false,
    });
    const obsolete = repository('obsolete');
    const current = repository('current');
    const later = repository('later');
    service.catalogStore.write(service.connection(first.id), [obsolete]);
    const restarted = new HostingService(
      () =>
        ({
          authenticate: async () => ({ id: 'saved-account', username: 'saved-account' }),
          repositories: async (input: { cursor?: string }) => ({ items: [input.cursor ? later : current], nextCursor: input.cursor ? null : 'page-2' }),
        }) as unknown as HostingAdapter,
      { migrate: false },
    );
    await restarted.request('repositories', { connectionId: first.id });
    const preview = new HostingService(() => ({}) as HostingAdapter, { migrate: false });
    expect((await preview.request('cachedRepositories', { connectionId: first.id })).items).toEqual([obsolete, current]);
    await restarted.request('repositories', { connectionId: first.id, cursor: 'page-2' });
    expect((await restarted.request('cachedRepositories', { connectionId: first.id })).items).toEqual([current, later]);
  });

  it('retains another instance when signing out and rejects stale credential getters', async () => {
    const first = add();
    const second = add('https://other.example.test');
    await service.request('login', { connectionId: first.id, token: 'first-secret' });
    await service.request('login', { connectionId: second.id, token: 'second-secret' });
    await service.authenticatedAdapter(first.id);
    const stale = credentialGetters.get(first.id)!;
    await service.request('logout', { connectionId: first.id });
    await expect(stale()).rejects.toThrow('changed');
    expect(service.connection(second.id).authenticated).toBe(true);
    expect((await service.auth.credentials(second.id, service.generation(second.id))).accessToken).toBe('second-secret');
  });

  it('rejects a slow login after cancellation without storing its token', async () => {
    const first = add();
    let finish!: (identity: { id: string; username: string }) => void;
    getIdentity = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const pending = service.request('login', { connectionId: first.id, token: 'cancelled-secret' });
    await Promise.resolve();
    await service.request('cancelAuth', { connectionId: first.id });
    finish({ id: 'account', username: 'account' });
    await expect(pending).rejects.toThrow('changed');
    expect(service.credentialStore.get(first.id)).toBeNull();
    expect(service.connection(first.id).authenticated).toBe(false);
  });

  it('refuses to replace a connection with a different account on the same host', async () => {
    const first = add();
    await service.request('login', { connectionId: first.id, token: 'original-account' });
    await expect(service.request('login', { connectionId: first.id, token: 'another-account' })).rejects.toThrow('different account');
    expect(service.credentialStore.get(first.id)?.accessToken).toBe('original-account');
  });

  it('restores only the requested saved account and preserves a private offline catalog', async () => {
    const first = add();
    getIdentity = async () => ({ id: 'private-user-id', username: 'private-user' });
    await service.request('login', { connectionId: first.id, token: 'private-account' });
    repository = {
      ref: { connectionId: first.id, repositoryId: 'opaque-uuid', fullPath: 'group/nested/repo' },
      name: 'repo',
      fullName: 'group/nested/repo',
      private: true,
      cloneUrl: 'https://forge.example.test/group/nested/repo.git',
      htmlUrl: 'https://forge.example.test/group/nested/repo',
      description: 'private metadata',
      defaultBranch: 'main',
      fork: false,
    };
    await service.request('repositories', { connectionId: first.id });
    const serialized = fs.readFileSync(path.join(state.directory, 'hosting-credentials.json'), 'utf8');
    expect(serialized).not.toContain('private-account');
    expect(fs.readFileSync(path.join(state.directory, 'hosting-connections.json'), 'utf8')).not.toContain('private-account');
    failRepositories = true;
    expect(await service.request('repositories', { connectionId: first.id })).toMatchObject({ items: [repository], stale: true });
    const persistedCatalog = fs.readFileSync(
      path.join(state.directory, 'hosting-catalogs', fs.readdirSync(path.join(state.directory, 'hosting-catalogs'))[0]),
      'utf8',
    );
    expect(persistedCatalog).not.toContain('private metadata');
  });

  it('keeps connections separated even for multiple accounts at one server', async () => {
    const first = add();
    const second = add();
    await service.request('login', { connectionId: first.id, token: 'account-one' });
    await service.request('login', { connectionId: second.id, token: 'account-two' });
    expect(service.listConnections().map((entry) => entry.username)).toEqual(['account-one', 'account-two']);
  });

  it('adopts a CLI account only after a fresh identity preview and matching confirmation', async () => {
    const connection = service.saveConnection({ provider: 'github', label: 'GitHub CLI', baseUrl: 'https://github.com' });
    getIdentity = async () => ({ id: 'verified-cli-user', username: 'cli-user' });
    await expect(service.request('loginWithCli', { connectionId: connection.id, expectedUsername: 'cli-user' })).rejects.toThrow('Review and confirm');
    expect(await service.request('inspectCliLogin', { connectionId: connection.id })).toEqual({ username: 'cli-user', host: 'github.com' });
    expect(service.credentialStore.get(connection.id)).toBeNull();
    await service.request('loginWithCli', { connectionId: connection.id, expectedUsername: 'cli-user' });
    expect(service.connection(connection.id)).toMatchObject({ authenticated: true, username: 'cli-user' });
    expect(service.credentialStore.get(connection.id)?.accessToken).toBe('cli-token');
  });

  it('rejects changed CLI identities and stale previews before storing credentials', async () => {
    const connection = service.saveConnection({ provider: 'github', label: 'GitHub CLI', baseUrl: 'https://github.com' });
    await service.request('inspectCliLogin', { connectionId: connection.id });
    getIdentity = async () => ({ id: 'different-cli-user', username: 'another-user' });
    await expect(service.request('loginWithCli', { connectionId: connection.id, expectedUsername: 'cli-user' })).rejects.toThrow('different account');
    expect(service.credentialStore.get(connection.id)).toBeNull();
    await service.request('inspectCliLogin', { connectionId: connection.id });
    await service.request('cancelAuth', { connectionId: connection.id });
    await expect(service.request('loginWithCli', { connectionId: connection.id, expectedUsername: 'cli-user' })).rejects.toThrow('Review and confirm');
  });

  it('validates saved identity before treating static startup capabilities as authenticated', async () => {
    const connection = add();
    await service.request('login', { connectionId: connection.id, token: 'saved-account' });
    const restored = new HostingService(
      (_account, credential) =>
        ({
          authenticate: async () => getIdentity((await credential()).accessToken),
          capabilities: async () => ({ createRepository: true }),
        }) as unknown as HostingAdapter,
      { migrate: false },
    );
    expect(restored.connection(connection.id).authenticated).toBe(false);
    expect(await restored.request('capabilities', { connectionId: connection.id })).toMatchObject({ createRepository: true });
    expect(restored.connection(connection.id).authenticated).toBe(true);
  });
});

describe('credential storage failures', () => {
  it('keeps a token in memory without writing plaintext when OS encryption is unavailable', () => {
    state.encryption = false;
    const credentials = new HostingCredentialStore();
    expect(credentials.set('connection', { accessToken: 'session-only-secret' })).toBe(false);
    expect(credentials.get('connection')?.accessToken).toBe('session-only-secret');
    expect(fs.existsSync(path.join(state.directory, 'hosting-credentials.json'))).toBe(false);
  });

  it('preserves an unsupported credential file while permitting a new session', () => {
    const file = path.join(state.directory, 'hosting-credentials.json');
    fs.writeFileSync(file, '{"version":99,"encrypted":"previous data"}');
    const credentials = new HostingCredentialStore();
    expect(credentials.set('connection', { accessToken: 'new-session-secret' })).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"version":99,"encrypted":"previous data"}');
  });

  it('never imports an unbound legacy token into an Enterprise host', () => {
    state.host = 'enterprise.example.test';
    state.legacy = { token: 'unbound-token', host: null };
    const migration = new HostingService(() => ({}) as HostingAdapter);
    const connection = migration.listConnections().find((entry) => entry.baseUrl === 'https://github.com')!;
    expect(connection.baseUrl).toBe('https://github.com');
    expect(connection.hasCredentials).toBe(true);
    expect(migration.credentialStore.get(connection.id)?.accessToken).toBe('unbound-token');
    expect(migration.listConnections().some((entry) => entry.baseUrl === 'https://enterprise.example.test' && entry.hasCredentials)).toBe(false);
    expect(migration.listConnections().some((entry) => entry.baseUrl === 'https://enterprise.example.test' && !entry.hasCredentials)).toBe(true);
    expect(new HostingService(() => ({}) as HostingAdapter).listConnections()).toHaveLength(2);
  });

  it.each(['logout', 'removeConnection'] as const)('never reimports a session-only legacy credential after explicit %s and restart', async (operation) => {
    state.legacy = { token: 'retained-recovery-token', host: 'github.com' };
    const file = path.join(state.directory, 'hosting-credentials.json');
    fs.writeFileSync(file, '{"version":99,"encrypted":"keep unreadable storage"}');
    const migration = new HostingService(() => ({}) as HostingAdapter);
    const migrated = migration.listConnections().find((connection) => connection.id.startsWith('legacy-github-'))!;
    expect(migrated.hasCredentials).toBe(true);
    expect(migrated.tokenPersisted).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(state.directory, 'hosting-connections.json'), 'utf8')).legacyGithubMigrated).toBe(false);
    // The unreadable OS credential file is preserved and the operation reports
    // that limitation. The legacy migration tombstone still persists first.
    await expect(migration.request(operation, { connectionId: migrated.id })).rejects.toThrow('unreadable');
    expect(migration.credentialStore.get(migrated.id)).toBeNull();
    expect(JSON.parse(fs.readFileSync(path.join(state.directory, 'hosting-connections.json'), 'utf8')).legacyGithubMigrated).toBe(true);
    const restarted = new HostingService(() => ({}) as HostingAdapter);
    expect(restarted.credentialStore.get(migrated.id)).toBeNull();
    expect(restarted.listConnections().every((connection) => !connection.hasCredentials)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toBe('{"version":99,"encrypted":"keep unreadable storage"}');
    expect(state.legacy?.token).toBe('retained-recovery-token');
  });
});
