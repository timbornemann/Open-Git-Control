import { inflateRawSync } from 'node:zlib';
import type { HostingOperations } from '../../../src/shared/ipc/contracts/hosting';
import type {
  HostedRepository,
  HostedRepositoryRef,
  HostingCapabilities,
  HostingConnection,
  HostingLog,
  HostingPage,
  HostingFeature,
} from '../../../src/types/hostingDtos';
import type { CredentialGetter, HostingAdapter } from '../HostingAdapter';
import { HostingHttpError, HostingHttpTransport } from './HostingHttpTransport';
import { listCreationTargets, verifyCreationTarget, updateDefaultBranch } from './creationTargets';

export type Input<K extends keyof HostingOperations> = HostingOperations[K]['input'];
export type Output<K extends keyof HostingOperations> = HostingOperations[K]['output'];
export type Row = Record<string, unknown>;
export const object = (value: unknown): Row => (value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {});
export const rows = (value: unknown): Row[] => (Array.isArray(value) ? value.map(object) : []);
export const string = (value: unknown, fallback = ''): string => (value === null || value === undefined ? fallback : String(value));
export const number = (value: unknown, fallback = 0): number => (Number.isFinite(Number(value)) ? Number(value) : fallback);
export const encode = (value: string): string => encodeURIComponent(value);
export function safeCloneUrl(value: unknown, ssh = false): string {
  const source = string(value).trim();
  if (!source) return '';
  if (ssh && /^[^/@\s:]+@[^/:\s]+:[^\s]+$/.test(source)) return source;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new HostingHttpError(0, 'invalid_clone_url', 'The provider returned an invalid clone URL.');
  }
  const protocols = ssh ? ['ssh:'] : ['http:', 'https:'];
  if (!protocols.includes(url.protocol) || url.password || url.search || url.hash)
    throw new HostingHttpError(0, 'invalid_clone_url', 'The provider returned a clone URL containing credentials or unsupported parameters.');
  if (!ssh) url.username = '';
  return url.href;
}
export const unsupported = (feature: string): never => {
  throw new HostingHttpError(501, 'unsupported', `${feature} is not available through this provider's public API.`);
};
export const caps = (overrides: Partial<HostingCapabilities> = {}): HostingCapabilities => {
  const result: HostingCapabilities = {
    createRepository: true,
    fork: true,
    defaultBranchOnlyFork: false,
    changeRequests: true,
    changeRequestLabel: 'Pull Requests',
    mergeMethods: ['merge', 'squash'],
    ciLabel: 'CI',
    runs: false,
    jobs: false,
    steps: false,
    logs: false,
    runLogs: false,
    artifacts: false,
    cancelRun: false,
    retryRun: false,
    dispatch: false,
    releases: 'tags',
    releaseAssets: false,
    draftRelease: false,
    prerelease: false,
    ...overrides,
  };
  const availability = { ...result.availability };
  for (const [key, value] of Object.entries(result)) if (typeof value === 'boolean') availability[key as HostingFeature] = value ? 'available' : 'unsupported';
  result.availability = { ...availability, ...overrides.availability };
  return result;
};

export function linkCursor(headers: Headers): string | null {
  const next = (headers.get('link') ?? '').split(',').find((part) => /rel="next"/.test(part));
  return next?.match(/<([^>]+)>/)?.[1] ?? null;
}

export function pageNumber(cursor?: string): number {
  if (!cursor) return 1;
  if (!/^\d+$/.test(cursor) || Number(cursor) < 1) throw new HostingHttpError(0, 'invalid_cursor', 'Invalid page cursor.');
  return Number(cursor);
}

export function logResult(text: string): HostingLog {
  const limit = 2 * 1024 * 1024;
  return { text: text.slice(0, limit), truncated: text.length > limit, nextCursor: null };
}

export function checkState(checks: Array<{ status: string }>, fallback = 'unknown'): string {
  const values = checks.map((check) => check.status.toLowerCase());
  if (values.some((value) => ['failure', 'failed', 'error', 'cancelled', 'canceled', 'stopped', 'timed_out', 'action_required'].includes(value)))
    return 'failure';
  if (values.some((value) => ['pending', 'queued', 'waiting', 'created', 'running', 'in_progress', 'inprogress', 'requested'].includes(value)))
    return 'pending';
  if (values.length && values.every((value) => ['success', 'successful', 'skipped', 'neutral'].includes(value))) return 'success';
  return fallback;
}

/** Only decompress bounded text entries; no archive is written to the filesystem. */
export function zipLogs(data: Uint8Array): HostingLog {
  const bytes = Buffer.from(data);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < Math.max(0, bytes.length - 65557)) throw new HostingHttpError(0, 'invalid_archive', 'Invalid CI log archive.');
  let position = bytes.readUInt32LE(end + 16);
  const count = bytes.readUInt16LE(end + 10);
  const output: string[] = [];
  let budget = 2 * 1024 * 1024;
  let truncated = false;
  for (let index = 0; index < count && budget > 0; index += 1) {
    if (position + 46 > bytes.length || bytes.readUInt32LE(position) !== 0x02014b50)
      throw new HostingHttpError(0, 'invalid_archive', 'Invalid CI log archive entry.');
    const method = bytes.readUInt16LE(position + 10);
    const compressedSize = bytes.readUInt32LE(position + 20);
    const size = bytes.readUInt32LE(position + 24);
    const nameLength = bytes.readUInt16LE(position + 28);
    const local = bytes.readUInt32LE(position + 42);
    const name = bytes.toString('utf8', position + 46, position + 46 + nameLength);
    position += 46 + nameLength + bytes.readUInt16LE(position + 30) + bytes.readUInt16LE(position + 32);
    if (name.endsWith('/')) continue;
    if (size > 16 * 1024 * 1024) {
      truncated = true;
      break;
    }
    if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== 0x04034b50)
      throw new HostingHttpError(0, 'invalid_archive', 'Invalid CI log archive offset.');
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    if (start + compressedSize > bytes.length) throw new HostingHttpError(0, 'invalid_archive', 'Truncated CI log archive.');
    const compressed = bytes.subarray(start, start + compressedSize);
    const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed, { maxOutputLength: 16 * 1024 * 1024 }) : null;
    if (!content) throw new HostingHttpError(0, 'unsupported_archive', 'Unsupported CI log compression.');
    const part = content.subarray(0, budget);
    budget -= part.length;
    truncated ||= part.length < content.length;
    output.push(`--- ${name} ---\n${part.toString('utf8')}`);
  }
  const result = logResult(output.join('\n'));
  return { ...result, truncated: result.truncated || truncated || budget <= 0 };
}

export abstract class BaseHostingAdapter implements HostingAdapter {
  readonly http: HostingHttpTransport;
  protected readonly connection: HostingConnection;
  protected readonly credentials: CredentialGetter;

  constructor(connection: HostingConnection, credentials: CredentialGetter, transport?: HostingHttpTransport) {
    this.connection = connection;
    this.credentials = credentials;
    this.http = transport ?? new HostingHttpTransport({ baseUrl: connection.apiBaseUrl, getToken: async () => (await credentials()).accessToken });
  }

  protected ref(id: unknown, fullPath: string): HostedRepositoryRef {
    return { connectionId: this.connection.id, repositoryId: string(id), fullPath };
  }
  creationTargets(input: Input<'creationTargets'>): Promise<Output<'creationTargets'>> {
    return listCreationTargets(this.connection, this.http, input);
  }
  verifyCreationTarget(input: Input<'verifyCreationTarget'>): Promise<Output<'verifyCreationTarget'>> {
    return verifyCreationTarget(this.connection, this.http, input);
  }
  async setDefaultBranch(repository: HostedRepositoryRef, branch: string): Promise<void> {
    this.assertRepository(repository);
    await updateDefaultBranch(this.connection, this.http, repository, branch);
  }
  protected assertRepository(repository: HostedRepositoryRef): void {
    if (
      repository.connectionId !== this.connection.id ||
      !repository.fullPath ||
      repository.fullPath.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new HostingHttpError(0, 'invalid_repository', 'Repository does not belong to this connection.');
  }
  protected remotePath(value: string): string | null {
    let remote: URL;
    try {
      remote = new URL(value);
    } catch {
      const scp = value.match(/^[^@]+@([^:]+):(.+)$/);
      if (!scp) return null;
      remote = new URL(`ssh://${scp[1]}/${scp[2]}`);
    }
    const base = new URL(this.connection.baseUrl);
    if (!['http:', 'https:', 'ssh:'].includes(remote.protocol) || remote.password || remote.search || remote.hash) return null;
    if (remote.hostname.toLowerCase() !== base.hostname.toLowerCase()) return null;
    if (remote.protocol !== 'ssh:' && remote.origin !== base.origin) return null;
    const basePath = base.pathname.replace(/\/$/, '');
    let path = remote.pathname
      .replace(/\.git$/, '')
      .replace(/^\//, '')
      .replace(/\/$/, '');
    if (basePath && remote.protocol !== 'ssh:') {
      if (!remote.pathname.startsWith(basePath + '/')) return null;
      path = path.slice(basePath.length);
    }
    try {
      return path.split('/').map(decodeURIComponent).join('/');
    } catch {
      return null;
    }
  }
  protected async resolvePath(path: string | null): Promise<Output<'repository'> | null> {
    if (!path) return null;
    try {
      return await this.repository({ repository: this.ref('', path) });
    } catch (error) {
      if (error instanceof HostingHttpError && error.status === 404) return null;
      throw error;
    }
  }
  resolveCachedRepository(url: string, repositories: HostedRepository[]): HostedRepository | null {
    const path = this.remotePath(url);
    if (!path) return null;
    const normalize = (value: string) => (['github', 'bitbucket-data-center'].includes(this.connection.provider) ? value.toLowerCase() : value);
    return (
      repositories.find((repository) => repository.ref.connectionId === this.connection.id && normalize(repository.ref.fullPath) === normalize(path)) ?? null
    );
  }
  protected async json(path: string, method = 'GET', body?: unknown): Promise<Row> {
    return object((await this.http.json(path, { method, body })).data);
  }
  protected async arrayPage<T>(
    path: string,
    map: (value: Row) => T,
    cursor?: string,
    query: Record<string, string | number | boolean | undefined> = {},
  ): Promise<HostingPage<T>> {
    const response = await this.http.json(cursor ?? path, { query: cursor ? undefined : { per_page: 50, ...query } });
    return { items: rows(response.data).map(map), nextCursor: linkCursor(response.headers) };
  }
  abstract authenticate(): ReturnType<HostingAdapter['authenticate']>;
  abstract capabilities(repository?: HostedRepositoryRef): ReturnType<HostingAdapter['capabilities']>;
  abstract resolveRepository(url: string): ReturnType<HostingAdapter['resolveRepository']>;
  abstract repositories(input: Input<'repositories'>): ReturnType<HostingAdapter['repositories']>;
  abstract repository(input: Input<'repository'>): ReturnType<HostingAdapter['repository']>;
  abstract createRepository(input: Input<'createRepository'>): ReturnType<HostingAdapter['createRepository']>;
  abstract fork(input: Input<'fork'>): ReturnType<HostingAdapter['fork']>;
  abstract branches(input: Input<'branches'>): ReturnType<HostingAdapter['branches']>;
  abstract tags(input: Input<'tags'>): ReturnType<HostingAdapter['tags']>;
  abstract changeRequests(input: Input<'changeRequests'>): ReturnType<HostingAdapter['changeRequests']>;
  abstract createChangeRequest(input: Input<'createChangeRequest'>): ReturnType<HostingAdapter['createChangeRequest']>;
  abstract merge(input: Input<'merge'>): ReturnType<HostingAdapter['merge']>;
  async runs(_input: Input<'runs'>): Promise<Output<'runs'>> {
    return unsupported('CI runs');
  }
  async jobs(_input: Input<'jobs'>): Promise<Output<'jobs'>> {
    return unsupported('CI jobs');
  }
  async status(_input: Input<'status'>): Promise<Output<'status'>> {
    return unsupported('Commit status');
  }
  async logs(_input: Input<'logs'>): Promise<Output<'logs'>> {
    return unsupported('CI logs');
  }
  async artifacts(_input: Input<'artifacts'>): Promise<Output<'artifacts'>> {
    return unsupported('CI artifacts');
  }
  async downloadArtifact(_input: Input<'downloadArtifact'>): Promise<Uint8Array> {
    return unsupported('CI artifact download');
  }
  async dispatch(_input: Input<'dispatch'>): Promise<true> {
    return unsupported('Manual CI start');
  }
  async cancelRun(_input: Input<'cancelRun'>): Promise<true> {
    return unsupported('CI cancellation');
  }
  async retryRun(_input: Input<'retryRun'>): Promise<true> {
    return unsupported('CI retry');
  }
  async releases(_input: Input<'releases'>): Promise<Output<'releases'>> {
    return unsupported('Releases');
  }
  async releaseAssets(_input: Input<'releaseAssets'>): Promise<Output<'releaseAssets'>> {
    return unsupported('Release assets');
  }
  async createRelease(_input: Input<'createRelease'>): Promise<Output<'createRelease'>> {
    return unsupported('Release creation');
  }
  async uploadAsset(_input: Input<'uploadAsset'>, _data: Uint8Array): Promise<Output<'uploadAsset'>> {
    return unsupported('Release assets');
  }
}
