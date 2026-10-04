import { createHash, randomUUID } from 'crypto';
import type { HostingOperation, HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import type { HostedRepository, HostedRepositoryRef, HostingConnection, HostingConnectionInput, HostingPage } from '../../src/types/hostingDtos';
import type { HostingAdapter, HostingAdapterFactory } from './HostingAdapter';
import { createHostingAdapter } from './providers';
import { HostingStore } from './HostingStore';
import { HostingCredentialStore } from './HostingCredentialStore';
import { HostingCatalogStore } from './HostingCatalogStore';
import { HostingAuth } from './HostingAuth';
import { HostingCredentialBridge, type GitCredentialRequest } from './HostingCredentialBridge';
import { HOSTING_PROVIDERS, normalizeConnectionUrls, hasControlCharacters } from './hostingUrls';
import { readSavedGithubTokenWithHost } from '../main-process/secureStore';
import { readGithubCatalogCache } from '../main-process/githubCatalogCache';
import { readSettingsWithMigration } from '../main-process/settingsStore';

const isConnection = (value: unknown): value is HostingConnection => {
  if (!value || typeof value !== 'object') return false;
  const connection = value as HostingConnection;
  if (
    typeof connection.id !== 'string' ||
    !connection.id ||
    connection.id.length > 200 ||
    typeof connection.label !== 'string' ||
    !HOSTING_PROVIDERS.includes(connection.provider) ||
    (connection.userId !== null && typeof connection.userId !== 'string') ||
    (connection.username !== null && typeof connection.username !== 'string')
  )
    return false;
  try {
    normalizeConnectionUrls(connection);
    return true;
  } catch {
    return false;
  }
};
const ADAPTER_OPERATIONS = new Set<HostingOperation>([
  'repository',
  'createRepository',
  'fork',
  'branches',
  'tags',
  'changeRequests',
  'createChangeRequest',
  'merge',
  'runs',
  'jobs',
  'status',
  'logs',
  'artifacts',
  'dispatch',
  'cancelRun',
  'retryRun',
  'releases',
  'releaseAssets',
]);

export class HostingService {
  private loaded = false;
  private legacyGithubMigrated = false;
  private readonly connections = new Map<string, HostingConnection>();
  private readonly adapters = new Map<string, { generation: number; adapter: HostingAdapter }>();
  private readonly restorations = new Map<string, Promise<HostingConnection>>();
  private readonly catalogScans = new Map<string, { generation: number; cursor: string | null; items: HostedRepository[] }>();
  private readonly store: HostingStore<HostingConnection>;
  readonly credentialStore: HostingCredentialStore;
  readonly catalogStore: HostingCatalogStore;
  readonly auth: HostingAuth;
  private readonly credentialBridge: HostingCredentialBridge;

  constructor(
    private readonly factory: HostingAdapterFactory = createHostingAdapter,
    dependencies: { store?: HostingStore<HostingConnection>; credentials?: HostingCredentialStore; catalogs?: HostingCatalogStore; migrate?: boolean } = {},
  ) {
    this.store = dependencies.store || new HostingStore(isConnection);
    this.credentialStore = dependencies.credentials || new HostingCredentialStore();
    this.catalogStore = dependencies.catalogs || new HostingCatalogStore();
    this.auth = new HostingAuth({
      credentials: this.credentialStore,
      getConnection: (id) => this.connection(id),
      updateConnection: (connection) => this.update(connection),
      factory,
    });
    this.credentialBridge = new HostingCredentialBridge((id, urls) => this.gitCredential(id, urls));
    if (dependencies.migrate === false) this.legacyGithubMigrated = true;
  }

  private load(): void {
    if (this.loaded) return;
    const stored = this.store.read();
    for (const connection of stored.connections)
      this.connections.set(connection.id, {
        ...connection,
        authenticated: false,
        hasCredentials: Boolean(this.credentialStore.get(connection.id)?.accessToken),
        tokenPersisted: this.credentialStore.isPersisted(connection.id),
      });
    this.legacyGithubMigrated ||= stored.legacyGithubMigrated;
    this.loaded = true;
    if (!this.legacyGithubMigrated) this.migrateGithub();
  }

  private persist(): void {
    this.store.write({
      version: 1,
      connections: [...this.connections.values()].map((connection) => ({ ...connection, authenticated: false, hasCredentials: false })),
      legacyGithubMigrated: this.legacyGithubMigrated,
    });
  }

  private migrateGithub(): void {
    const settings = readSettingsWithMigration();
    const saved = readSavedGithubTokenWithHost();
    const host = saved ? saved.host || 'github.com' : settings.githubHost || 'github.com';
    // Unbound legacy credentials are never sent to an Enterprise server.
    const tokenHost = saved?.host || 'github.com';
    const id = `legacy-github-${createHash('sha256').update(host.toLowerCase()).digest('hex').slice(0, 16)}`;
    const configuredHost = settings.githubHost || 'github.com';
    if (configuredHost.toLowerCase() !== host.toLowerCase()) {
      const configuredId = `legacy-github-${createHash('sha256').update(configuredHost.toLowerCase()).digest('hex').slice(0, 16)}`;
      if (!this.connections.has(configuredId)) {
        const urls = normalizeConnectionUrls({ provider: 'github', label: `GitHub (${configuredHost})`, baseUrl: `https://${configuredHost}` });
        this.connections.set(configuredId, {
          id: configuredId,
          provider: 'github',
          label: `GitHub (${configuredHost})`,
          ...urls,
          username: null,
          userId: null,
          authenticated: false,
          hasCredentials: false,
        });
      }
    }
    const snapshot = readGithubCatalogCache(host);
    let connection = this.connections.get(id);
    if (!connection) {
      const urls = normalizeConnectionUrls({ provider: 'github', label: `GitHub (${host})`, baseUrl: `https://${host}` });
      connection = {
        id,
        provider: 'github',
        label: `GitHub (${host})`,
        ...urls,
        username: snapshot?.username || null,
        userId: null,
        authenticated: false,
        hasCredentials: false,
        ...(settings.githubOauthClientId && configuredHost.toLowerCase() === host.toLowerCase()
          ? { oauth: { clientId: settings.githubOauthClientId, redirectUri: 'http://127.0.0.1:49187/oauth/callback' } }
          : {}),
      };
      this.connections.set(id, connection);
      this.persist();
    }
    let credentialsMigrated = !saved;
    if (saved && tokenHost === host && !this.credentialStore.get(id)?.accessToken)
      credentialsMigrated = this.credentialStore.set(id, { accessToken: saved.token, authType: 'token' });
    else if (saved && tokenHost === host) credentialsMigrated = this.credentialStore.isPersisted(id);
    connection = { ...connection, hasCredentials: Boolean(this.credentialStore.get(id)?.accessToken), tokenPersisted: this.credentialStore.isPersisted(id) };
    this.connections.set(id, connection);
    if (snapshot && !this.catalogStore.read(connection))
      this.catalogStore.write(
        connection,
        snapshot.repos.map((repo) => ({
          ref: { connectionId: id, repositoryId: String(repo.id), fullPath: repo.fullName },
          name: repo.name,
          fullName: repo.fullName,
          private: repo.private,
          cloneUrl: repo.cloneUrl,
          htmlUrl: repo.htmlUrl,
          description: repo.description || null,
          defaultBranch: 'main',
          fork: false,
          updatedAt: repo.updatedAt,
        })),
      );
    if (credentialsMigrated) {
      this.legacyGithubMigrated = true;
      this.persist();
    }
  }

  connection(id: string): HostingConnection {
    this.load();
    const connection = this.connections.get(id);
    if (!connection) throw new Error('Hosting connection not found.');
    return { ...connection };
  }

  listConnections(): HostingConnection[] {
    this.load();
    return [...this.connections.values()].map((connection) => ({
      ...connection,
      hasCredentials: Boolean(this.credentialStore.get(connection.id)?.accessToken),
      tokenPersisted: this.credentialStore.isPersisted(connection.id),
    }));
  }

  hasGithubInfrastructureConnection(): boolean {
    return this.listConnections().some(
      (connection) =>
        connection.provider === 'github' &&
        connection.baseUrl === 'https://github.com' &&
        connection.apiBaseUrl === 'https://api.github.com' &&
        connection.hasCredentials,
    );
  }

  async createGithubInfrastructureSession() {
    const connection = this.listConnections()
      .filter(
        (candidate) =>
          candidate.provider === 'github' &&
          candidate.baseUrl === 'https://github.com' &&
          candidate.apiBaseUrl === 'https://api.github.com' &&
          candidate.hasCredentials,
      )
      .sort((left, right) => Number(right.authenticated) - Number(left.authenticated))[0];
    if (!connection) return null;
    await this.authenticatedAdapter(connection.id);
    const generation = this.generation(connection.id);
    const credential = await this.auth.credentials(connection.id, generation);
    const { GitHubService } = await import('../GitHubService');
    const client = new GitHubService();
    const current = () => this.connections.has(connection.id) && generation === this.generation(connection.id);
    const abort = () => client.logout();
    const signal = this.auth.signal(connection.id);
    signal.addEventListener('abort', abort, { once: true });
    const dispose = () => {
      signal.removeEventListener('abort', abort);
      client.logout();
    };
    try {
      if (
        !(await client.authenticate(credential.accessToken, 'github.com', current)) ||
        !current() ||
        client.getUsername() !== this.connection(connection.id).username
      )
        throw new Error('The GitHub.com account changed before feedback submission.');
      return { client, dispose };
    } catch (error) {
      dispose();
      throw error;
    }
  }

  private update(connection: HostingConnection): void {
    const previous = this.connections.get(connection.id);
    const migratedCatalog =
      previous && !previous.userId && connection.userId && previous.username === connection.username ? this.catalogStore.read(previous) : null;
    this.connections.set(connection.id, { ...connection });
    this.persist();
    if (migratedCatalog) this.catalogStore.write(connection, migratedCatalog);
  }

  saveConnection(input: HostingConnectionInput): HostingConnection {
    this.load();
    const urls = normalizeConnectionUrls(input);
    const existing = input.id ? this.connection(input.id) : undefined;
    const id = existing?.id || randomUUID();
    if (existing && (existing.provider !== input.provider || existing.baseUrl !== urls.baseUrl || existing.apiBaseUrl !== urls.apiBaseUrl))
      throw new Error('Create a new connection to use a different provider or server.');
    if (!String(input.label || '').trim() || input.label.length > 200) throw new Error('A connection name is required (maximum 200 characters).');
    if (
      input.oauth &&
      (typeof input.oauth.clientId !== 'string' ||
        !input.oauth.clientId ||
        input.oauth.clientId.length > 1000 ||
        typeof input.oauth.redirectUri !== 'string' ||
        input.oauth.redirectUri.length > 2000)
    )
      throw new Error('Invalid OAuth application configuration.');
    this.auth.cancel(id);
    const oauth = input.oauth
      ? { clientId: input.oauth.clientId, redirectUri: input.oauth.redirectUri, allowHttpLoopback: input.oauth.allowHttpLoopback === true }
      : undefined;
    const connection: HostingConnection = {
      ...existing,
      id,
      provider: input.provider,
      label: input.label.trim(),
      ...urls,
      username: existing?.username || null,
      userId: existing?.userId || null,
      authenticated: false,
      hasCredentials: Boolean(this.credentialStore.get(id)?.accessToken),
      oauth,
    };
    if (input.clientSecret !== undefined) {
      const credential = this.credentialStore.get(id) || { accessToken: '' };
      if (input.clientSecret.trim()) this.credentialStore.set(id, { ...credential, clientSecret: input.clientSecret.trim() });
      else if (credential.accessToken) this.credentialStore.set(id, { ...credential, clientSecret: undefined });
    }
    this.update(connection);
    return this.connection(id);
  }

  private preventLegacyCredentialReimport(id: string): void {
    if (!id.startsWith('legacy-github-') || this.legacyGithubMigrated) return;
    // An explicit logout/removal is durable user intent even when OS-backed
    // credential storage failed during import. Retain old recovery files, but
    // never adopt their token again after restarting the application.
    this.legacyGithubMigrated = true;
    try {
      this.persist();
    } catch (error) {
      this.legacyGithubMigrated = false;
      throw error;
    }
  }

  removeConnection(id: string): void {
    this.connection(id);
    this.auth.cancel(id);
    this.preventLegacyCredentialReimport(id);
    this.credentialStore.remove(id);
    this.catalogStore.remove(id);
    this.connections.delete(id);
    this.adapters.delete(id);
    this.persist();
  }

  generation(id: string): number {
    this.connection(id);
    return this.auth.generation(id);
  }

  getConnectionSignal(id: string): AbortSignal {
    this.connection(id);
    return this.auth.signal(id);
  }

  private adapter(id: string): HostingAdapter {
    const connection = this.connection(id);
    const generation = this.auth.generation(id);
    const cached = this.adapters.get(id);
    if (cached?.generation === generation) return cached.adapter;
    const adapter = this.factory(connection, () => this.auth.credentials(id, generation));
    this.adapters.set(id, { generation, adapter });
    return adapter;
  }

  async authenticatedAdapter(id: string): Promise<HostingAdapter> {
    if (!this.connection(id).authenticated) {
      let pending = this.restorations.get(id);
      if (!pending) {
        pending = this.auth.restore(id).finally(() => {
          if (this.restorations.get(id) === pending) this.restorations.delete(id);
        });
        this.restorations.set(id, pending);
      }
      await pending;
    }
    return this.adapter(id);
  }

  validateRepository(ref: HostedRepositoryRef): void {
    if (
      !ref ||
      typeof ref.connectionId !== 'string' ||
      typeof ref.repositoryId !== 'string' ||
      !ref.repositoryId ||
      ref.repositoryId.length > 1000 ||
      typeof ref.fullPath !== 'string' ||
      !ref.fullPath ||
      ref.fullPath.length > 2000 ||
      ref.fullPath.split('/').some((part) => !part || part === '.' || part === '..') ||
      hasControlCharacters(ref.fullPath) ||
      ref.fullPath.includes('\\')
    )
      throw new Error('Invalid hosted repository reference.');
    this.connection(ref.connectionId);
  }

  private async gitCredential(id: string, urls: string[]) {
    const connection = this.connection(id);
    const base = new URL(connection.baseUrl);
    for (const value of urls) {
      const url = new URL(value);
      if (url.origin !== base.origin || !`${url.pathname}/`.startsWith(`${base.pathname.replace(/\/+$/, '')}/`))
        throw new Error('The Git endpoint does not belong to the selected hosting connection.');
    }
    await this.authenticatedAdapter(id);
    const generation = this.auth.generation(id);
    const credential = await this.auth.credentials(id, generation);
    const username =
      connection.provider === 'bitbucket-cloud'
        ? credential.authType === 'oauth'
          ? 'x-token-auth'
          : 'x-bitbucket-api-token-auth'
        : connection.provider === 'gitlab' && credential.authType === 'oauth'
          ? 'oauth2'
          : credential.username || this.connection(id).username || 'git';
    return {
      username,
      password: credential.accessToken,
      isCurrent: () => this.auth.generation(id) === generation && this.connections.has(id) && this.connection(id).authenticated,
    };
  }

  createGitCredentialEnvironment(request: GitCredentialRequest) {
    const generation = this.generation(request.connectionId);
    if (request.expectedGeneration !== undefined && request.expectedGeneration !== generation)
      throw new Error('The hosting session changed after transfer review. Review the push again.');
    const signal = request.signal ? AbortSignal.any([request.signal, this.auth.signal(request.connectionId)]) : this.auth.signal(request.connectionId);
    return this.credentialBridge.createGitCredentialEnvironment({ ...request, signal });
  }

  private async repositories(params: HostingOperations['repositories']['input']): Promise<HostingPage<HostedRepository>> {
    const id = params.connectionId;
    try {
      const adapter = await this.authenticatedAdapter(id);
      const generation = this.generation(id);
      const page = await adapter.repositories(params);
      if (generation !== this.generation(id)) throw new Error('The hosting account changed while loading repositories.');
      if (!params.search) {
        const previous = this.catalogScans.get(id);
        const scan = !params.cursor ? { generation, cursor: null as string | null, items: [] as HostedRepository[] } : previous;
        if (scan && scan.generation === generation && (!params.cursor || scan.cursor === params.cursor)) {
          scan.items.push(...page.items);
          scan.cursor = page.nextCursor;
          this.catalogScans.set(id, scan);
          if (!page.nextCursor) {
            this.catalogStore.write(this.connection(id), [...new Map(scan.items.map((repo) => [repo.ref.repositoryId, repo])).values()]);
            this.catalogScans.delete(id);
          }
        }
      }
      return page;
    } catch (error) {
      const connection = this.connection(id);
      const cached = connection.hasCredentials ? this.catalogStore.read(connection) : null;
      if (!cached || params.cursor) throw error;
      const search = (params.search || '').toLowerCase();
      return { items: cached.filter((repo) => `${repo.fullName} ${repo.description || ''}`.toLowerCase().includes(search)), nextCursor: null, stale: true };
    }
  }

  async request<K extends HostingOperation>(operation: K, input: HostingOperations[K]['input']): Promise<HostingOperations[K]['output']> {
    const result = await this.execute(operation, input);
    return result as HostingOperations[K]['output'];
  }

  private async execute(operation: HostingOperation, input: unknown): Promise<unknown> {
    const params = (input || {}) as Record<string, unknown>;
    const id = String(params.connectionId || (params.repository as HostedRepositoryRef | undefined)?.connectionId || '');
    if (operation === 'connections') return this.listConnections();
    if (operation === 'saveConnection') return this.saveConnection(input as HostingConnectionInput);
    if (operation === 'removeConnection') {
      this.removeConnection(id);
      return true;
    }
    if (operation === 'login')
      return this.auth.login(id, String(params.token || ''), params.email as string | undefined, params.username as string | undefined);
    if (operation === 'loginBrowser') return this.auth.browser(id);
    if (operation === 'inspectCliLogin') return this.auth.inspectCli(id);
    if (operation === 'loginWithCli') return this.auth.cli(id, params.expectedUsername as string | undefined);
    if (operation === 'startDeviceLogin') return this.auth.startDevice(id);
    if (operation === 'pollDeviceLogin') return this.auth.pollDevice(id, String(params.deviceCode || ''));
    if (operation === 'cancelAuth') {
      this.connection(id);
      this.auth.cancel(id);
      return true;
    }
    if (operation === 'logout') {
      this.connection(id);
      this.preventLegacyCredentialReimport(id);
      this.auth.logout(id);
      this.catalogStore.remove(id);
      return true;
    }
    if (params.repository) this.validateRepository(params.repository as HostedRepositoryRef);
    if (params.source) {
      this.validateRepository(params.source as HostedRepositoryRef);
      if ((params.source as HostedRepositoryRef).connectionId !== id) throw new Error('Cross-provider change requests are not supported.');
    }
    if (['inspectRelease', 'downloadArtifact', 'uploadAsset', 'createRelease', 'clone', 'checkoutChangeRequest', 'releaseNotesCommits'].includes(operation))
      throw new Error('This operation requires a main-process repository or file authorization context.');
    if (operation === 'capabilities') {
      const adapter = this.connection(id).hasCredentials ? await this.authenticatedAdapter(id) : this.adapter(id);
      return adapter.capabilities(params.repository as HostedRepositoryRef | undefined, params.targetBranch as string | undefined);
    }
    if (operation === 'repositories') return this.repositories(input as HostingOperations['repositories']['input']);
    const adapter = await this.authenticatedAdapter(id);
    if (operation === 'resolveRepository') return adapter.resolveRepository(String(params.url || ''));
    if (!ADAPTER_OPERATIONS.has(operation)) throw new Error('Unknown hosting operation.');
    const method = adapter[operation as keyof HostingAdapter];
    if (typeof method !== 'function') throw new Error('Unknown hosting operation.');
    return (method as (request: unknown) => Promise<unknown>).call(adapter, input);
  }
}

export const hostingService = new HostingService();
