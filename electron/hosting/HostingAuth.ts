import type { HostingConnection, DeviceFlowPollDto, DeviceFlowStartDto } from '../../src/types/hostingDtos';
import type { HostingAdapterFactory, ProviderCredential } from './HostingAdapter';
import type { HostingCredentialStore, HostingCredential } from './HostingCredentialStore';
import { browserOAuthLogin, refreshOAuthCredential } from './HostingOAuth';
import { GitHubAuthService } from '../github/GitHubAuthService';
import { runGithubCliOneClickLogin, inspectGithubCliLogin } from '../main-process/githubCliAuth';
import { registerHostingSecrets } from './hostingRedaction';

type AuthDependencies = {
  credentials: HostingCredentialStore;
  getConnection: (id: string) => HostingConnection;
  updateConnection: (connection: HostingConnection) => void;
  factory: HostingAdapterFactory;
};
type DeviceSession = { code: string; generation: number; expiresAt: number; nextPollAt: number; interval: number };

export class HostingAuth {
  private readonly generations = new Map<string, number>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly refreshes = new Map<string, Promise<HostingCredential>>();
  private readonly devices = new Map<string, DeviceSession>();
  private readonly cliPreviews = new Map<string, { username: string; host: string; generation: number; expiresAt: number }>();
  constructor(private readonly deps: AuthDependencies) {}

  generation(id: string): number {
    return this.generations.get(id) || 0;
  }
  signal(id: string): AbortSignal {
    let controller = this.controllers.get(id);
    if (!controller) {
      controller = new AbortController();
      this.controllers.set(id, controller);
    }
    return controller.signal;
  }

  cancel(id: string): void {
    this.generations.set(id, this.generation(id) + 1);
    this.controllers.get(id)?.abort();
    this.controllers.delete(id);
    this.devices.delete(id);
    this.cliPreviews.delete(id);
    this.refreshes.delete(id);
  }

  private begin(id: string): { generation: number; signal: AbortSignal } {
    this.cancel(id);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    return { generation: this.generation(id), signal: controller.signal };
  }

  private assertCurrent(id: string, generation: number): void {
    if (this.generation(id) !== generation) throw new Error('The hosting account changed or login was cancelled.');
  }

  private providerCredential(credential: HostingCredential): ProviderCredential {
    return { accessToken: credential.accessToken, authType: credential.authType || 'token', username: credential.username, email: credential.email };
  }

  private async apply(id: string, credential: HostingCredential, generation: number, expectedUsername?: string): Promise<HostingConnection> {
    this.assertCurrent(id, generation);
    const connection = this.deps.getConnection(id);
    const unregister = registerHostingSecrets([credential.accessToken, credential.refreshToken, credential.clientSecret]);
    try {
      const adapter = this.deps.factory(connection, async () => {
        this.assertCurrent(id, generation);
        return this.providerCredential(credential);
      });
      const identity = await adapter.authenticate();
      this.assertCurrent(id, generation);
      if (!identity.id || !identity.username) throw new Error('The provider could not verify this account identity.');
      if (expectedUsername && identity.username.toLowerCase() !== expectedUsername.toLowerCase())
        throw new Error('The browser or CLI signed into a different account. Create a separate connection for that account.');
      if (!connection.userId && connection.username && connection.username.toLowerCase() !== identity.username.toLowerCase())
        throw new Error('This migrated connection belongs to a different account. Create a new connection for the new account.');
      if (connection.userId && connection.userId !== identity.id)
        throw new Error('This connection belongs to a different account. Create a separate connection for the new account.');
      const tokenPersisted = this.deps.credentials.set(id, { ...credential, username: identity.username });
      const authenticated = {
        ...connection,
        userId: identity.id,
        username: identity.username,
        authenticated: true,
        hasCredentials: true,
        tokenPersisted,
        serverVersion: identity.serverVersion || connection.serverVersion,
      };
      this.deps.updateConnection(authenticated);
      return authenticated;
    } finally {
      unregister();
    }
  }

  async login(id: string, token: string, email?: string, username?: string): Promise<HostingConnection> {
    const { generation } = this.begin(id);
    const accessToken = String(token || '').trim();
    if (!accessToken || accessToken.length > 65536) throw new Error('A valid hosting token is required.');
    const secret = this.deps.credentials.get(id)?.clientSecret;
    return this.apply(id, { accessToken, authType: 'token', email, username, clientSecret: secret }, generation, username);
  }

  async restore(id: string): Promise<HostingConnection> {
    const generation = this.generation(id);
    const credential = await this.freshCredential(id);
    return this.apply(id, credential, generation);
  }

  async browser(id: string): Promise<HostingConnection> {
    const connection = this.deps.getConnection(id);
    if (connection.provider === 'github') throw new Error('Use GitHub browser device login, or review the GitHub CLI account before adopting it.');
    const { generation, signal } = this.begin(id);
    const credential = await browserOAuthLogin(connection, this.deps.credentials.get(id)?.clientSecret, signal);
    return this.apply(id, credential, generation, connection.username || undefined);
  }

  async cli(id: string, expectedUsername?: string): Promise<HostingConnection> {
    const connection = this.deps.getConnection(id);
    if (connection.provider !== 'github') throw new Error('CLI login is available for GitHub connections.');
    const preview = this.cliPreviews.get(id);
    if (
      !expectedUsername ||
      !preview ||
      preview.generation !== this.generation(id) ||
      preview.expiresAt < Date.now() ||
      preview.username !== expectedUsername ||
      preview.host !== new URL(connection.baseUrl).host
    )
      throw new Error('Review and confirm the GitHub CLI account before signing in.');
    const { generation, signal } = this.begin(id);
    const result = await runGithubCliOneClickLogin(new URL(connection.baseUrl).host, signal);
    return this.apply(id, { accessToken: result.accessToken, authType: 'oauth' }, generation, expectedUsername || connection.username || undefined);
  }

  async inspectCli(id: string): Promise<{ username: string; host: string }> {
    const connection = this.deps.getConnection(id);
    if (connection.provider !== 'github') throw new Error('CLI login is available for GitHub connections.');
    const { generation, signal } = this.begin(id);
    const result = await inspectGithubCliLogin(new URL(connection.baseUrl).host, signal);
    this.assertCurrent(id, generation);
    this.cliPreviews.set(id, { ...result, generation, expiresAt: Date.now() + 5 * 60_000 });
    return result;
  }

  async startDevice(id: string): Promise<DeviceFlowStartDto> {
    const connection = this.deps.getConnection(id);
    if (connection.provider !== 'github') throw new Error('Device login is available for GitHub connections.');
    const { generation } = this.begin(id);
    const result = await new GitHubAuthService().startDeviceFlow(connection.oauth?.clientId, new URL(connection.baseUrl).host);
    this.assertCurrent(id, generation);
    this.devices.set(id, {
      code: result.deviceCode,
      generation,
      expiresAt: Date.now() + result.expiresIn * 1000,
      nextPollAt: Date.now() + result.interval * 1000,
      interval: result.interval,
    });
    return result;
  }

  async pollDevice(id: string, code: string): Promise<DeviceFlowPollDto> {
    const connection = this.deps.getConnection(id);
    const session = this.devices.get(id);
    if (!session || session.code !== code || session.generation !== this.generation(id) || session.expiresAt <= Date.now())
      throw new Error('The device login expired or was cancelled.');
    if (Date.now() < session.nextPollAt) return { status: 'pending', interval: session.interval };
    session.nextPollAt = Date.now() + session.interval * 1000;
    const result = await new GitHubAuthService().pollDeviceFlow(code, connection.oauth?.clientId, new URL(connection.baseUrl).host);
    this.assertCurrent(id, session.generation);
    if (result.status === 'pending') {
      session.interval = result.interval || session.interval;
      session.nextPollAt = Date.now() + session.interval * 1000;
      return { status: 'pending', interval: session.interval };
    }
    if (result.status === 'error') {
      this.devices.delete(id);
      return { status: 'error', error: result.error, errorDescription: result.errorDescription || null };
    }
    const authenticated = await this.apply(id, { accessToken: result.accessToken, authType: 'oauth' }, session.generation);
    this.devices.delete(id);
    return { status: 'success', username: authenticated.username, tokenPersisted: authenticated.tokenPersisted };
  }

  async freshCredential(id: string): Promise<HostingCredential> {
    const credential = this.deps.credentials.get(id);
    if (!credential?.accessToken) throw new Error('Sign in to this hosting connection.');
    if (!credential.expiresAt || credential.expiresAt > Date.now() + 60_000) return credential;
    const pending = this.refreshes.get(id);
    if (pending) return pending;
    const generation = this.generation(id);
    const connection = this.deps.getConnection(id);
    const refresh = refreshOAuthCredential(connection, credential, this.signal(id))
      .then((updated) => {
        this.assertCurrent(id, generation);
        this.deps.credentials.set(id, updated);
        return updated;
      })
      .catch((error: unknown) => {
        if (this.generation(id) === generation) this.deps.updateConnection({ ...this.deps.getConnection(id), authenticated: false });
        throw error;
      })
      .finally(() => {
        if (this.refreshes.get(id) === refresh) this.refreshes.delete(id);
      });
    this.refreshes.set(id, refresh);
    return refresh;
  }

  async credentials(id: string, generation: number): Promise<ProviderCredential> {
    this.assertCurrent(id, generation);
    const credential = await this.freshCredential(id);
    this.assertCurrent(id, generation);
    return this.providerCredential(credential);
  }

  logout(id: string): void {
    this.cancel(id);
    this.deps.updateConnection({ ...this.deps.getConnection(id), authenticated: false });
    this.deps.credentials.remove(id);
    this.deps.updateConnection({ ...this.deps.getConnection(id), authenticated: false, hasCredentials: false, tokenPersisted: false });
  }
}
