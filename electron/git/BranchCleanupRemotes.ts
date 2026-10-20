import type { BranchCleanupHostingMetadata } from '../../src/shared/ipc/branchCleanup';
import type { RemotePreferences } from '../../src/types/remoteTransfers';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { GitRunner } from './GitRunner';
import type { RemoteTransferService } from './RemoteTransferService';
import type { CredentialEnvironmentFactory } from './remoteTransferModels';
import { gitConfigurationEnvironment, remoteUrl } from './remoteTransferValidation';
import { CLEANUP_OID, cleanupDigest, cleanupError, type CleanupContext, type CleanupEndpoint, type CleanupRemoteState } from './branchCleanupModel';

type Dependencies = {
  git: GitRunner;
  transfers: RemoteTransferService;
  credentials?: CredentialEnvironmentFactory;
  credentialGeneration?: (id: string) => number;
  accountVersion: () => string;
  metadata: (endpoint: CleanupEndpoint, signal: AbortSignal) => Promise<BranchCleanupHostingMetadata | null>;
};

function transportUrl(repo: string, url: string) {
  const windowsPath = /^[a-z]:[/\\]/i.test(url);
  const transport = /^[a-z][a-z\d+.-]*:\/\//i.test(url) || (!windowsPath && /^(?:[^@/]+@)?[^/\\:]+:/.test(url));
  return transport ? url : pathToFileURL(path.resolve(repo, url)).href;
}

export function parseCleanupAdvertisement(output: string) {
  const heads = new Map<string, string>();
  let defaultBranch = '';
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const fields = line.split('\t');
    if (fields.length !== 2) throw new Error('Incomplete remote branch inventory.');
    const [oid, ref] = fields;
    if (oid.startsWith('ref: ')) {
      if (ref !== 'HEAD' || !oid.startsWith('ref: refs/heads/')) throw new Error('Invalid remote default branch.');
      defaultBranch = oid.slice('ref: refs/heads/'.length);
    } else {
      if (!CLEANUP_OID.test(oid)) throw new Error('Invalid remote branch revision.');
      if (ref === 'HEAD') continue;
      if (!ref.startsWith('refs/heads/') || heads.has(ref.slice(11))) throw new Error('Incomplete remote branch inventory.');
      heads.set(ref.slice(11), oid);
    }
  }
  return { heads, defaultBranch };
}

export class BranchCleanupRemotes {
  constructor(private readonly deps: Dependencies) {}

  async configuration(repo: string) {
    const [snapshot, config] = await Promise.all([this.deps.transfers.getRemotes(repo), this.deps.git.run(repo, ['config', '--null', '--list'])]);
    const preferences = this.deps.transfers.getPreferences(repo);
    const endpoints: CleanupEndpoint[] = [];
    for (const remote of snapshot.remotes) {
      for (const url of new Set([...remote.fetchUrls, ...remote.pushUrls])) {
        remoteUrl(url);
        const binding = preferences.bindings?.find((entry) => entry.remoteName === remote.name && entry.url === url);
        const connectionId = binding?.credentialMode === 'system' ? null : (binding?.repository?.connectionId ?? null);
        endpoints.push({
          id: cleanupDigest([remote.name, url]).slice(0, 32),
          remoteName: remote.name,
          url,
          canDelete: remote.pushUrls.includes(url),
          canIsolate: true,
          fetchUrl: remote.fetchUrls[0] === url,
          connectionId,
          credentialGeneration: connectionId ? (this.deps.credentialGeneration?.(connectionId) ?? 0) : null,
          ...(binding?.repository ? { repository: binding.repository } : {}),
        });
      }
    }
    if (endpoints.length > 64) throw new Error('Too many remote endpoints for a complete cleanup inspection.');
    return { endpoints, preferences, fingerprint: cleanupDigest([config, preferences, this.deps.accountVersion()]) };
  }

  private async scope<T>(
    endpoint: CleanupEndpoint,
    context: CleanupContext,
    environment: NodeJS.ProcessEnv,
    work: (env: NodeJS.ProcessEnv, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    context.ensureActive();
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(45_000)]);
    const base = { ...environment, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' };
    const scope = await this.deps.credentials?.({
      connectionId: endpoint.connectionId,
      urls: [endpoint.url],
      signal,
      envOverrides: base,
      expectedGeneration: endpoint.credentialGeneration ?? undefined,
    });
    try {
      const scopedSignal = scope?.signal ? AbortSignal.any([signal, scope.signal]) : signal;
      return await work(scope?.envOverrides ?? base, scopedSignal);
    } finally {
      await scope?.dispose();
    }
  }

  async read(repo: string, endpoint: CleanupEndpoint, context: CleanupContext, fetchObjects = true): Promise<CleanupRemoteState> {
    const state: CleanupRemoteState = { endpoint, heads: new Map(), defaultBranch: '', complete: false, metadata: null };
    try {
      await this.scope(endpoint, context, {}, async (envOverrides, signal) => {
        const advertise = async () =>
          parseCleanupAdvertisement(
            await this.deps.git.run(repo, ['ls-remote', '--symref', '--', transportUrl(repo, endpoint.url), 'HEAD', 'refs/heads/*'], { envOverrides, signal }),
          );
        const advertised = await advertise();
        state.heads = advertised.heads;
        state.defaultBranch = advertised.defaultBranch;
        if (fetchObjects && state.heads.size) {
          const entries = [...state.heads];
          const objects = await this.deps.git.runWithInput(
            repo,
            ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
            `${entries.map(([, oid]) => oid).join('\n')}\n`,
            { envOverrides, signal },
          );
          const present = new Set(
            objects
              .split(/\r?\n/)
              .filter((line) => line.endsWith(' commit'))
              .map((line) => line.split(' ')[0]),
          );
          const missing = entries.filter(([, oid]) => !present.has(oid));
          for (let offset = 0; offset < missing.length; offset += 64) {
            context.ensureActive();
            // Explicit source-only refspecs and an empty refmap download objects without updating local refs or FETCH_HEAD.
            await this.deps.git.run(
              repo,
              [
                'fetch',
                '--atomic',
                '--no-prune',
                '--no-prune-tags',
                '--no-tags',
                '--no-recurse-submodules',
                '--no-write-fetch-head',
                '--refmap=',
                '--',
                transportUrl(repo, endpoint.url),
                ...missing.slice(offset, offset + 64).map(([name]) => `refs/heads/${name}`),
              ],
              { envOverrides, signal },
            );
          }
          const checked = await advertise();
          if (cleanupDigest([...checked.heads].sort()) !== cleanupDigest([...state.heads].sort()) || checked.defaultBranch !== state.defaultBranch)
            throw new Error('Remote branches changed while downloading. Inspect again.');
        }
        context.ensureActive();
        state.complete = true;
      });
      try {
        state.metadata = await this.deps.metadata(endpoint, context.signal);
        if (state.metadata?.defaultBranch && state.defaultBranch && state.metadata.defaultBranch !== state.defaultBranch) {
          state.metadata = { ...state.metadata, complete: false, problem: 'The server default branch changed during inspection. Inspect again.' };
        }
        if (!state.defaultBranch) state.defaultBranch = state.metadata?.defaultBranch ?? '';
        if (!state.metadata?.complete) state.problem = state.metadata?.problem || 'Server protection and open change requests could not be verified.';
      } catch (error) {
        context.ensureActive();
        state.problem = cleanupError(error);
      }
    } catch (error) {
      context.ensureActive();
      state.problem = cleanupError(error);
    }
    return state;
  }

  async readAll(repo: string, endpoints: CleanupEndpoint[], context: CleanupContext) {
    const result: CleanupRemoteState[] = [];
    for (const endpoint of endpoints) {
      context.ensureActive();
      context.progress(`remotes: ${endpoint.remoteName} (${endpoint.url})`);
      result.push(await this.read(repo, endpoint, context));
    }
    return result;
  }

  async delete(repo: string, endpoint: CleanupEndpoint, name: string, oid: string, context: CleanupContext) {
    const ref = `refs/heads/${name}`;
    let message = '';
    let attempted = false;
    try {
      await this.scope(endpoint, context, gitConfigurationEnvironment([['push.followTags', 'false']]), async (envOverrides, signal) => {
        context.ensureActive();
        attempted = true;
        // A named remote also updates its fetch-tracking refs, even when its push URL is a different server. Use the reviewed URL directly.
        const result = await this.deps.git.runResult(
          repo,
          [
            'push',
            '--porcelain',
            '--no-follow-tags',
            '--recurse-submodules=no',
            `--force-with-lease=${ref}:${oid}`,
            '--',
            transportUrl(repo, endpoint.url),
            `:${ref}`,
          ],
          { envOverrides, signal },
        );
        message = result.stderr.trim() || result.stdout.trim();
      });
    } catch (error) {
      message = cleanupError(error);
    }
    if (!attempted)
      return { status: context.signal.aborted ? ('skipped' as const) : ('failed' as const), message: context.signal.aborted ? 'cancelled' : message };
    // A cancelled or disconnected push can already have been accepted. Verify its outcome without issuing another write.
    const verification: CleanupContext = { ...context, signal: AbortSignal.timeout(20_000), ensureActive: () => {} };
    try {
      const actual = await this.scope(endpoint, verification, {}, async (envOverrides, signal) =>
        parseCleanupAdvertisement(
          await this.deps.git.run(repo, ['ls-remote', '--refs', '--', transportUrl(repo, endpoint.url), ref], { envOverrides, signal }),
        ),
      );
      if (!actual.heads.has(name)) return { status: 'deleted' as const, message: 'deleted' };
      return { status: 'failed' as const, message: actual.heads.get(name) !== oid ? 'changed' : message || 'Server rejected deletion.' };
    } catch (error) {
      return { status: 'unknown' as const, message: `${message}\n${cleanupError(error)}`.trim() };
    }
  }

  preferences(repo: string): RemotePreferences {
    return this.deps.transfers.getPreferences(repo);
  }
}
