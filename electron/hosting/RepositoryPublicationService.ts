import { randomUUID } from 'crypto';
import type { GitService } from '../GitService';
import type { HostingService } from './HostingService';
import type { HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import type { PublicationSelection } from '../../src/types/repositoryPublication';
import type { HostingAdapter } from './HostingAdapter';
import { RepositoryPublicationStore, publicationDto, type StoredPublication } from './RepositoryPublicationStore';
import {
  publicationAccountKey,
  publicationGitContext,
  capturePublicationRefs,
  assertPublicationRefs,
  publicationFingerprint,
  connectPublicationGit,
  publicationPreferences,
  publicationReader,
  countPublicationCommits,
  type PublicationGit,
} from './RepositoryPublicationGit';
import { RemotePreferencesStore } from '../git/RemotePreferencesStore';
import { readRemoteSnapshot } from '../git/remoteSnapshot';
import { remoteName, remoteUrl } from '../git/remoteTransferValidation';
import { requireActiveRepositoryPath, repositoryPathKey } from '../main-process/activeRepositoryAuthorization';
import { beginCommitProtection } from '../main-process/RepositoryCommitProtection';
import { repoJobRegistry } from '../main-process/repoJobRegistry';
import { HostingHttpError } from './providers/HostingHttpTransport';
import { safeCloneUrl } from './providers/providerUtils';
import { redactGitSensitiveText } from '../git/GitErrorFormatter';

type Dependencies = { gitService: GitService; hostingService: HostingService; store?: RepositoryPublicationStore; preferences?: RemotePreferencesStore };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function checkedSelection(raw: PublicationSelection, repoPath: string): PublicationSelection {
  const creation = {
    connectionId: raw.creation.connectionId,
    namespace: raw.creation.namespace,
    projectKey: raw.creation.projectKey,
    name: raw.creation.name,
    description: raw.creation.description,
    private: raw.creation.private,
    initializeReadme: false,
  };
  if (
    !/^[a-z\d][a-z\d._-]{0,99}$/i.test(creation.name) ||
    typeof creation.private !== 'boolean' ||
    (creation.description && creation.description.length > 2000)
  )
    throw new Error('Use a repository name with letters, numbers, dots, underscores or hyphens (at most 100 characters).');
  if (!['https', 'ssh'].includes(raw.transport) || !['connection', 'system'].includes(raw.credentialMode) || typeof raw.makePrimary !== 'boolean')
    throw new Error('Invalid repository connection options.');
  if (raw.transport === 'ssh' && raw.credentialMode !== 'system') throw new Error('SSH uses your system credentials.');
  return {
    repoPath,
    creation,
    remoteName: remoteName(raw.remoteName),
    transport: raw.transport,
    credentialMode: raw.credentialMode,
    makePrimary: raw.makePrimary,
    branches: raw.branches,
    tagNames: raw.tagNames,
  };
}

export class RepositoryPublicationService {
  private readonly store: RepositoryPublicationStore;
  private readonly preferences: RemotePreferencesStore;
  private readonly busy = new Set<string>();
  private readonly cancellations = new Map<string, AbortController>();
  constructor(private readonly deps: Dependencies) {
    this.store = deps.store ?? new RepositoryPublicationStore();
    this.preferences = deps.preferences ?? new RemotePreferencesStore();
  }
  private repo(repoPath: string) {
    return requireActiveRepositoryPath(repoPath, this.deps.gitService.getRepoPath(), 'hosting:publication');
  }
  private async locked<T>(repoPath: string, operation: () => Promise<T>): Promise<T> {
    const key = repositoryPathKey(this.repo(repoPath));
    if (this.busy.has(key)) throw new Error('A repository publication is already running.');
    this.busy.add(key);
    this.cancellations.set(key, new AbortController());
    try {
      return await operation();
    } finally {
      this.busy.delete(key);
      this.cancellations.delete(key);
    }
  }
  cancel(repoPath: string): true {
    this.cancellations.get(repositoryPathKey(this.repo(repoPath)))?.abort();
    return true;
  }
  async context(input: HostingOperations['publicationContext']['input']) {
    const repoPath = this.repo(input.repoPath);
    const generation = repoJobRegistry.getGeneration();
    const result = await publicationGitContext(repoPath, this.deps.gitService.runner);
    this.repo(repoPath);
    if (generation !== repoJobRegistry.getGeneration()) throw new Error('The repository changed while loading publication details.');
    return { ...result, publications: this.store.list(repoPath).map(publicationDto) };
  }
  private async scope(record: StoredPublication) {
    const repoPath = this.repo(record.selection.repoPath),
      service = this.deps.hostingService;
    const adapter = await service.authenticatedAdapter(record.selection.creation.connectionId);
    const generation = service.generation(record.selection.creation.connectionId),
      repoGeneration = repoJobRegistry.getGeneration();
    const signal = AbortSignal.any([
      service.getConnectionSignal(record.selection.creation.connectionId),
      this.cancellations.get(repositoryPathKey(repoPath))!.signal,
    ]);
    const current = () => {
      if (signal.aborted) throw new Error('Repository publication was cancelled. Completed steps remain available for resuming.');
      this.repo(repoPath);
      if (
        generation !== service.generation(record.selection.creation.connectionId) ||
        repoGeneration !== repoJobRegistry.getGeneration() ||
        record.accountKey !== publicationAccountKey(service.connection(record.selection.creation.connectionId))
      )
        throw new Error('The repository or hosting account changed. Review the publication before continuing.');
    };
    current();
    const gitDirectory = (await this.deps.gitService.runner.run(repoPath, ['rev-parse', '--absolute-git-dir'])).trim();
    if (gitDirectory !== record.gitDirectory) throw new Error('The local Git repository was replaced.');
    current();
    return { adapter, current, signal };
  }
  async prepare(input: HostingOperations['preparePublication']['input']) {
    return this.locked(input.selection.repoPath, async () => {
      const repoPath = this.repo(input.selection.repoPath),
        service = this.deps.hostingService;
      const selection = checkedSelection(input.selection, repoPath),
        creation = selection.creation,
        name = selection.remoteName;
      const adapter = await service.authenticatedAdapter(creation.connectionId);
      const accountKey = publicationAccountKey(service.connection(creation.connectionId));
      const generation = service.generation(creation.connectionId),
        repoGeneration = repoJobRegistry.getGeneration();
      const current = () => {
        this.repo(repoPath);
        if (
          this.cancellations.get(repositoryPathKey(repoPath))?.signal.aborted ||
          generation !== service.generation(creation.connectionId) ||
          repoGeneration !== repoJobRegistry.getGeneration() ||
          accountKey !== publicationAccountKey(service.connection(creation.connectionId))
        )
          throw new Error('Repository, account or publication context changed during preparation. Review the selection again.');
      };
      const target = await adapter.verifyCreationTarget(creation);
      const capabilities = await adapter.capabilities();
      if (!capabilities.createRepository)
        throw new HostingHttpError(
          capabilities.availability?.createRepository === 'permission' ? 403 : 501,
          capabilities.availability?.createRepository === 'permission' ? 'permission_denied' : 'unsupported',
          'Repository creation is not available for this hosting account.',
        );
      const refs = await capturePublicationRefs(selection, this.deps.gitService.runner);
      const gitDirectory = (await this.deps.gitService.runner.run(repoPath, ['rev-parse', '--absolute-git-dir'])).trim();
      const snapshot = await readRemoteSnapshot(repoPath, this.deps.gitService.runner, false);
      const head = await this.deps.gitService.runner.runResult(repoPath, ['rev-parse', '--verify', 'HEAD']);
      let record = input.publicationId ? this.store.get(repoPath, input.publicationId) : undefined;
      if (!record?.repository && snapshot.remotes.some((r) => r.name === name)) throw new Error('This remote name already exists. Choose an unused name.');
      if (record) {
        if (record.stage === 'complete') throw new Error('This publication is complete. Start a new publication for another upload.');
        if (record.accountKey !== accountKey) throw new Error('Resume with the same hosting account that created this repository.');
        const withoutRefs = (s: PublicationSelection) => ({ ...s, branches: [], tagNames: [] });
        if (record.stage !== 'prepared' && !same(withoutRefs(record.selection), withoutRefs(selection)))
          throw new Error('An existing publication retains its repository and remote. Start a new publication for another target.');
        if (record.repository) await this.verifyConnected(record, false);
      }
      this.repo(repoPath);
      if (generation !== service.generation(creation.connectionId) || repoGeneration !== repoJobRegistry.getGeneration())
        throw new Error('Repository or account changed during preparation.');
      const now = new Date().toISOString();
      const expectedName = service.connection(creation.connectionId).provider === 'bitbucket-cloud' ? creation.name.toLowerCase() : creation.name;
      record = {
        ...record,
        id: record?.id ?? randomUUID(),
        selection,
        ...refs,
        accountKey,
        gitDirectory,
        initialRemoteCount: record?.initialRemoteCount ?? snapshot.remotes.length,
        preparedBranch: snapshot.branch,
        preparedHead: head.exitCode === 0 ? head.stdout.trim() : '',
        expectedPath: `${target.namespace}/${expectedName}`,
        fingerprint: await publicationFingerprint(repoPath, this.deps.gitService.runner, this.preferences),
        stage: record?.stage ?? 'prepared',
        createdAt: record?.createdAt ?? now,
        updatedAt: now,
      };
      record.commitCount = await countPublicationCommits(repoPath, refs, this.deps.gitService.runner);
      await assertPublicationRefs(record, this.deps.gitService.runner);
      current();
      this.store.save(record);
      return publicationDto(record);
    });
  }
  private async lookup(record: StoredPublication, adapter: HostingAdapter) {
    try {
      return await adapter.repository({
        repository: { connectionId: record.selection.creation.connectionId, repositoryId: '', fullPath: record.expectedPath },
      });
    } catch (error) {
      if (error instanceof HostingHttpError && error.status === 404) return null;
      throw error;
    }
  }
  private async verifyConnected(record: StoredPublication, required: boolean, git: PublicationGit = this.deps.gitService.runner) {
    const snapshot = await readRemoteSnapshot(record.selection.repoPath, publicationReader(git), false);
    const remote = snapshot.remotes.find((r) => r.name === record.selection.remoteName);
    if (!remote) {
      if (required) throw new Error('The publication remote was removed. Restore its verified URL before continuing.');
      return false;
    }
    const binding = this.preferences.read(record.selection.repoPath).bindings?.find((b) => b.remoteName === remote.name && b.url === record.remoteUrl);
    if (
      !same(remote.fetchUrls, [record.remoteUrl]) ||
      !same(remote.pushUrls, [record.remoteUrl]) ||
      !same(binding?.repository, record.repository?.ref) ||
      (binding?.credentialMode === 'system') !== (record.selection.credentialMode === 'system')
    )
      throw new Error('The publication remote or account binding changed. No other endpoint will be used.');
    return true;
  }
  async connect(input: HostingOperations['connectPublication']['input']) {
    return this.locked(input.repoPath, async () => {
      const record = this.store.get(this.repo(input.repoPath), input.publicationId);
      const { adapter, current, signal } = await this.scope(record);
      try {
        await assertPublicationRefs(record, this.deps.gitService.runner);
        if ((await publicationFingerprint(input.repoPath, this.deps.gitService.runner, this.preferences)) !== record.fingerprint)
          throw new Error('Remote configuration changed. Review the publication before continuing.');
        if (['creating', 'uncertain'].includes(record.stage)) {
          const reviewedCandidate = record.candidate;
          const existing = await this.lookup(record, adapter);
          current();
          record.stage = 'uncertain';
          record.candidate = existing ?? undefined;
          if (existing && (!input.confirmCandidate || !same(reviewedCandidate?.ref, existing.ref))) {
            record.message =
              'The server contains a repository at this name. Confirm its current identity explicitly before resuming; creation will not be repeated.';
            this.store.save(record);
            return publicationDto(record);
          }
          if (!existing && !input.retryCreation) {
            record.message = 'The server confirms this name is currently absent. You can explicitly retry creation.';
            this.store.save(record);
            return publicationDto(record);
          }
          if (existing) {
            record.repository = existing;
            record.stage = 'created';
            record.candidate = undefined;
          } else record.stage = 'prepared';
        }
        if (record.stage === 'prepared') {
          if (await this.lookup(record, adapter))
            throw new HostingHttpError(409, 'name_conflict', 'A repository with this name already exists. Choose another name; it will not be adopted.');
          current();
          await assertPublicationRefs(record, this.deps.gitService.runner);
          if ((await publicationFingerprint(input.repoPath, this.deps.gitService.runner, this.preferences)) !== record.fingerprint)
            throw new Error('Remote configuration changed before repository creation.');
          record.stage = 'creating';
          this.store.save(record);
          try {
            record.repository = await adapter.createRepository({ ...record.selection.creation, initializeReadme: false, readmeContent: undefined });
            record.stage = 'created';
            record.message = undefined;
            this.store.save(record);
          } catch (error) {
            record.stage = error instanceof HostingHttpError && [400, 401, 403, 404, 409, 422].includes(error.status) ? 'prepared' : 'uncertain';
            throw error;
          }
        }
        current();
        if (!record.repository) throw new Error('The provider did not confirm repository creation.');
        this.deps.hostingService.validateRepository(record.repository.ref);
        const verified = await adapter.repository({ repository: record.repository.ref });
        current();
        if (
          !same(verified.ref, record.repository.ref) ||
          verified.private !== record.selection.creation.private ||
          verified.ref.fullPath.toLowerCase() !== record.expectedPath.toLowerCase()
        )
          throw new Error('The provider returned an unexpected repository identity or visibility.');
        record.repository = verified;
        const url = record.selection.transport === 'ssh' ? verified.sshUrl : verified.cloneUrl;
        if (!url || (record.selection.transport === 'https' && !url.startsWith('https://')))
          throw new Error('The selected transport is unavailable for this repository.');
        remoteUrl(url);
        if (record.selection.transport === 'ssh' && safeCloneUrl(url, true) !== url) throw new Error('The provider returned an invalid SSH clone URL.');
        // SSH can use a separate hostname or port. Its URL comes from the verified API
        // repository; validate the canonical HTTPS identity without guessing SSH aliases.
        if (!same((await adapter.resolveRepository(record.selection.transport === 'ssh' ? verified.cloneUrl : url))?.ref, verified.ref))
          throw new Error('The clone URL could not be verified against the created repository.');
        current();
        record.remoteUrl = url;
        this.store.save(record);
        current();
        if (record.stage === 'created') {
          if (!(await this.verifyConnected(record, false))) {
            const protection = beginCommitProtection(input.repoPath);
            if (!protection) throw new Error('Another repository write operation is running.');
            try {
              await connectPublicationGit(record, this.deps.gitService, this.preferences, current, signal);
            } finally {
              protection();
            }
          } else record.fingerprint = await publicationFingerprint(input.repoPath, this.deps.gitService.runner, this.preferences);
          record.stage = 'connected';
          record.message = undefined;
          this.store.save(record);
        } else await this.verifyConnected(record, true);
        return publicationDto(record);
      } catch (error) {
        record.message = redactGitSensitiveText(error instanceof Error ? error.message : String(error));
        this.store.save(record);
        throw error;
      }
    });
  }
  async finish(input: HostingOperations['finishPublication']['input']) {
    return this.locked(input.repoPath, async () => {
      const record = this.store.get(this.repo(input.repoPath), input.publicationId);
      const { adapter, current, signal } = await this.scope(record);
      if (record.stage === 'complete') return publicationDto(record);
      if (!record.repository || !record.remoteUrl || !['connected', 'uploaded', 'setup-pending'].includes(record.stage))
        throw new Error('Connect the created repository before completing publication.');
      await this.verifyConnected(record, true);
      await assertPublicationRefs(record, this.deps.gitService.runner);
      const service = this.deps.hostingService,
        repoPath = record.selection.repoPath;
      const credential =
        record.selection.credentialMode === 'connection'
          ? await service.createGitCredentialEnvironment({ connectionId: record.repository.ref.connectionId, urls: [record.remoteUrl], signal })
          : undefined;
      const envOverrides = credential?.envOverrides ?? { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
      const refs = [
        ...record.branches.map((b) => ({ ref: `refs/heads/${b.destinationBranch}`, oid: b.sourceOid })),
        ...record.tags.map((t) => ({ ref: `refs/tags/${t.name}`, oid: t.oid })),
      ];
      try {
        current();
        if (refs.length) {
          const advertised = await this.deps.gitService.runner.run(repoPath, ['ls-remote', '--refs', '--', record.remoteUrl, ...refs.map((r) => r.ref)], {
            signal: credential?.signal ?? signal,
            envOverrides,
          });
          const actual = new Map(
            advertised
              .trim()
              .split(/\r?\n/)
              .filter(Boolean)
              .map((line) => {
                const [oid, ref] = line.split(/\s+/);
                return [ref, oid];
              }),
          );
          if (refs.some((ref) => actual.get(ref.ref) !== ref.oid)) {
            if (input.inspectOnly) return publicationDto(record);
            throw new Error('Upload is not fully confirmed at the selected endpoint. Retry missing refs before repository setup.');
          }
        }
        current();
        record.stage = 'uploaded';
        if ((await publicationFingerprint(repoPath, this.deps.gitService.runner, this.preferences)) !== record.fingerprint)
          throw new Error('Remote settings changed before completing publication. Review the publication again.');
        this.store.save(record);
        if (input.inspectOnly) return publicationDto(record);
        if (record.branches.length) {
          await assertPublicationRefs(record, this.deps.gitService.runner);
          current();
          await adapter.setDefaultBranch(record.repository.ref, record.branches[0].destinationBranch);
          record.repository.defaultBranch = record.branches[0].destinationBranch;
          current();
        }
        const protection = beginCommitProtection(repoPath);
        if (!protection) throw new Error('Another repository write operation is running.');
        try {
          await this.deps.gitService.runner.withExclusiveWrite(
            repoPath,
            'hosting-publication-finish',
            async (git) => {
              current();
              await this.verifyConnected(record, true, git);
              await assertPublicationRefs(record, git);
              if ((await publicationFingerprint(repoPath, git, this.preferences)) !== record.fingerprint)
                throw new Error('Remote settings changed before final setup. Review the publication again.');
              if (!record.initialRemoteCount || record.selection.makePrimary) {
                for (const branch of record.branches) {
                  await git.run(
                    repoPath,
                    [
                      'fetch',
                      '--no-tags',
                      '--no-write-fetch-head',
                      '--',
                      record.remoteUrl!,
                      `refs/heads/${branch.destinationBranch}:refs/remotes/${record.selection.remoteName}/${branch.destinationBranch}`,
                    ],
                    { signal: credential?.signal ?? signal, envOverrides },
                  );
                  current();
                  const trackingRef = `refs/remotes/${record.selection.remoteName}/${branch.destinationBranch}`;
                  if ((await git.run(repoPath, ['rev-parse', '--verify', trackingRef])).trim() !== branch.sourceOid)
                    throw new Error('The published branch changed at the endpoint before tracking setup. Review the server state before continuing.');
                  await git.run(repoPath, ['config', '--local', `branch.${branch.sourceBranch}.remote`, record.selection.remoteName]);
                  await git.run(repoPath, ['config', '--local', `branch.${branch.sourceBranch}.merge`, `refs/heads/${branch.destinationBranch}`]);
                  await git.run(repoPath, ['config', '--local', `branch.${branch.sourceBranch}.pushRemote`, record.selection.remoteName]);
                  record.fingerprint = await publicationFingerprint(repoPath, git, this.preferences);
                  this.store.save(record);
                }
                const snapshot = await readRemoteSnapshot(repoPath, publicationReader(git), false);
                await git.run(repoPath, ['config', '--local', 'remote.pushDefault', record.selection.remoteName]);
                this.preferences.write(repoPath, publicationPreferences(record, this.preferences.read(repoPath), snapshot));
              }
              current();
              record.fingerprint = await publicationFingerprint(repoPath, git, this.preferences);
            },
            credential?.signal ?? signal,
          );
        } finally {
          protection();
        }
        record.stage = record.branches.length ? 'complete' : 'connected';
        record.message = record.branches.length ? undefined : 'Repository created and connected. Create the first commit in Staging, then resume publication.';
        this.store.save(record);
        return publicationDto(record);
      } catch (error) {
        if (record.stage === 'uploaded') record.stage = 'setup-pending';
        record.message = redactGitSensitiveText(error instanceof Error ? error.message : String(error));
        this.store.save(record);
        throw error;
      } finally {
        credential?.dispose();
      }
    });
  }
}
