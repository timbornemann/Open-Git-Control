import { randomUUID } from 'crypto';
import type { IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../GitService';
import type { HostingCreateRelease, HostingReleaseTarget } from '../../src/types/hostingDtos';
import type { HostingService } from './HostingService';
import type { SecretScanPushGuard } from '../main-process/ipc/git/secretScanPushGuard';
import { requireActiveRepositoryPath } from '../main-process/activeRepositoryAuthorization';
import { beginCommitProtection } from '../main-process/RepositoryCommitProtection';
import { repoJobRegistry } from '../main-process/repoJobRegistry';
import { hasControlCharacters } from './hostingUrls';
import { releaseEndpointResolver, releaseCredentialUrls } from './HostingReleaseEndpoint';
import { readReleaseRevision } from './HostingReleaseRevision';
import { createHostingReleaseLocalTag } from './HostingReleaseLocalTag';

type ReadGit = (args: string[], network?: boolean) => Promise<string>;
type State = {
  fetchUrl: string;
  bindingStamp: string;
  pushUrls: string[];
  target: string;
  branch: string | null;
  currentBranch: string;
  head: string;
  localSha: string | null;
  remoteSha: string | null;
  ahead: number;
  behind: number;
  canPush: boolean;
  canReleaseRemote: boolean;
  pushBlockedReason: string | null;
};
type Inspection = { id: string; key: string; generation: number; repoGeneration: number; expiresAt: number; state: State };
const key = (input: HostingCreateRelease) => JSON.stringify([input.repoPath, input.repository, input.remoteName, input.tagName, input.target]);
const pushRestriction = (branch: string | null, localSha: string | null, matchingEndpoint: boolean, currentBranch: string, behind: number) => {
  if (!branch || !localSha) return 'Only an existing local branch can be pushed from the release creator.';
  if (!matchingEndpoint) return 'No push endpoint matches this hosted repository.';
  if (!currentBranch) return 'Check out a local branch before publishing a release branch.';
  if (behind > 0) return 'Synchronize the local and remote histories before pushing.';
  return null;
};
const parseRefs = (value: string) =>
  new Map(
    value
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha, ref] = line.split(/\s+/);
        return [ref, sha];
      }),
  );

export class HostingReleaseSafety {
  private readonly inspections = new Map<number, Inspection>();
  private readonly registeredSenders = new Set<number>();
  private readonly uploadAuthorizations = new Map<
    number,
    {
      connectionId: string;
      repositoryId: string;
      fullPath: string;
      releaseId: string;
      repoPath: string;
      generation: number;
      expiresAt: number;
      tagName: string;
      targetOid: string;
      endpoint: string;
    }
  >();
  constructor(private readonly deps: { gitService: GitService; hostingService: HostingService; pushGuard?: SecretScanPushGuard }) {}

  private registerSender(event: IpcMainInvokeEvent): void {
    const id = event.sender.id;
    if (this.registeredSenders.has(id)) return;
    this.registeredSenders.add(id);
    event.sender.once('destroyed', () => {
      this.inspections.delete(id);
      this.uploadAuthorizations.delete(id);
      this.registeredSenders.delete(id);
    });
  }

  private assertCurrent(input: HostingCreateRelease, generation: number, repoGeneration: number): void {
    requireActiveRepositoryPath(input.repoPath, this.deps.gitService.getRepoPath(), 'hosting:createRelease');
    if (this.deps.hostingService.generation(input.repository.connectionId) !== generation || repoJobRegistry.getGeneration() !== repoGeneration)
      throw new Error('The repository or hosting account changed. Inspect the release again.');
  }

  private async validate(input: HostingCreateRelease, git: ReadGit): Promise<void> {
    this.deps.hostingService.validateRepository(input.repository);
    if (!input.remoteName || input.remoteName.startsWith('-') || /\s/.test(input.remoteName) || hasControlCharacters(input.remoteName))
      throw new Error('Select a valid Git remote for the release.');
    if (!input.tagName || input.tagName.startsWith('-')) throw new Error('A release tag is required.');
    await git(['check-ref-format', `refs/tags/${input.tagName}`]);
    if (!input.target || input.target.startsWith('-') || hasControlCharacters(input.target)) throw new Error('A valid release target is required.');
  }

  private async state(input: HostingCreateRelease, git: ReadGit): Promise<State> {
    await this.validate(input, git);
    const configuredFetchUrl = (await git(['remote', 'get-url', input.remoteName])).trim();
    const pushUrls = (await git(['remote', 'get-url', '--push', '--all', input.remoteName])).trim().split(/\r?\n/).filter(Boolean);
    const adapter = await this.deps.hostingService.authenticatedAdapter(input.repository.connectionId);
    const resolver = releaseEndpointResolver(input.repoPath, input.remoteName, input.repository, adapter);
    let fetchUrl = '';
    for (const url of [configuredFetchUrl, ...pushUrls]) {
      if (await resolver.matches(url)) {
        fetchUrl = url;
        break;
      }
    }
    if (!fetchUrl) throw new Error('The selected remote has no endpoint for this hosted repository.');
    const { target, head, currentBranch, branch: branchName, localSha, remoteSha } = await readReleaseRevision(input.target, fetchUrl, git);
    let ahead = localSha && !remoteSha ? Number((await git(['rev-list', '--count', localSha])).trim()) : 0;
    let behind = 0;
    if (localSha && remoteSha && localSha !== remoteSha) {
      await git(['fetch', '--no-tags', '--no-write-fetch-head', '--', fetchUrl, remoteSha], true);
      [ahead, behind] = (await git(['rev-list', '--left-right', '--count', `${localSha}...${remoteSha}`])).trim().split(/\s+/).map(Number);
    }
    if (![ahead, behind].every((count) => Number.isSafeInteger(count) && count >= 0)) throw new Error('The release commit comparison failed.');
    const matchingPushUrls = await Promise.all(pushUrls.map(resolver.matches));
    resolver.assertCurrent();
    const pushBlockedReason = pushRestriction(branchName, localSha, matchingPushUrls.some(Boolean), currentBranch, behind);
    return {
      fetchUrl,
      bindingStamp: resolver.stamp,
      pushUrls,
      target,
      branch: branchName,
      currentBranch,
      head,
      localSha,
      remoteSha,
      ahead,
      behind,
      canPush: ahead > 0 && !pushBlockedReason,
      canReleaseRemote: Boolean(remoteSha),
      pushBlockedReason,
    };
  }

  async inspect(event: IpcMainInvokeEvent, input: HostingCreateRelease): Promise<HostingReleaseTarget> {
    this.registerSender(event);
    const { gitService, hostingService } = this.deps;
    const repoPath = requireActiveRepositoryPath(input.repoPath, gitService.getRepoPath(), 'hosting:inspectRelease');
    const generation = hostingService.generation(input.repository.connectionId);
    const repoGeneration = repoJobRegistry.getGeneration();
    const job = repoJobRegistry.begin(repoPath);
    const lifecycle = AbortSignal.any([job.signal, hostingService.getConnectionSignal(input.repository.connectionId)]);
    try {
      const state = await gitService.runner.withExclusiveWrite(
        repoPath,
        'hosting-release-inspect',
        async (git) => {
          const read: ReadGit = async (args, network = false) => {
            this.assertCurrent(input, generation, repoGeneration);
            let credential;
            const urls = network ? releaseCredentialUrls(repoPath, input.remoteName, args) : [];
            if (urls.length)
              credential = await hostingService.createGitCredentialEnvironment({
                connectionId: input.repository.connectionId,
                urls,
                signal: lifecycle,
              });
            try {
              return await git.run(repoPath, args, {
                signal: AbortSignal.any([credential?.signal || lifecycle, AbortSignal.timeout(60_000)]),
                envOverrides: credential?.envOverrides || { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
              });
            } finally {
              credential?.dispose();
            }
          };
          return this.state(input, read);
        },
        job.signal,
      );
      this.assertCurrent(input, generation, repoGeneration);
      const id = randomUUID();
      this.inspections.set(event.sender.id, { id, key: key(input), generation, repoGeneration, state, expiresAt: Date.now() + 5 * 60_000 });
      return {
        inspectionId: id,
        targetBranch: state.branch,
        localSha: state.localSha,
        remoteSha: state.remoteSha,
        ahead: state.ahead,
        behind: state.behind,
        canPush: state.canPush,
        canReleaseRemote: state.canReleaseRemote,
        pushBlockedReason: state.pushBlockedReason,
      };
    } finally {
      job.complete();
    }
  }

  async create(event: IpcMainInvokeEvent, input: HostingCreateRelease) {
    const inspection = this.inspections.get(event.sender.id);
    if (!inspection || inspection.id !== input.inspectionId || inspection.key !== key(input) || inspection.expiresAt < Date.now())
      throw new Error('Inspect the release target before publishing.');
    this.assertCurrent(input, inspection.generation, inspection.repoGeneration);
    if (input.mode !== 'remote') throw new Error('Push through the transfer review and inspect again before creating the release.');
    if (!inspection.state.canReleaseRemote) throw new Error('The target is not published on the selected endpoint.');
    this.inspections.delete(event.sender.id);
    const { gitService, hostingService } = this.deps;
    const releaseProtection = beginCommitProtection(input.repoPath);
    if (!releaseProtection) throw new Error('Another repository write operation is running.');
    const job = repoJobRegistry.begin(input.repoPath);
    const lifecycle = AbortSignal.any([job.signal, hostingService.getConnectionSignal(input.repository.connectionId)]);
    try {
      return await gitService.runner.withExclusiveWrite(
        input.repoPath,
        'hosting-release-publish',
        async (git) => {
          const read: ReadGit = async (command, network = false) => {
            this.assertCurrent(input, inspection.generation, inspection.repoGeneration);
            let credential;
            const urls = network ? releaseCredentialUrls(input.repoPath, input.remoteName, command) : [];
            if (urls.length)
              credential = await hostingService.createGitCredentialEnvironment({
                connectionId: input.repository.connectionId,
                urls,
                signal: lifecycle,
              });
            try {
              return await git.run(input.repoPath, command, {
                signal: AbortSignal.any([credential?.signal || lifecycle, AbortSignal.timeout(60_000)]),
                envOverrides: credential?.envOverrides || { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
              });
            } finally {
              credential?.dispose();
            }
          };
          const current = await this.state(input, read);
          if (JSON.stringify(current) !== JSON.stringify(inspection.state)) throw new Error('The release state changed. Inspect the target again.');
          const sha = current.remoteSha!;
          const localTag = (await read(['rev-parse', '--verify', `refs/tags/${input.tagName}^{commit}`]).catch(() => '')).trim();
          if (localTag && localTag !== sha) throw new Error('The local release tag points to a different commit.');
          const tagRefs = parseRefs(await read(['ls-remote', '--', current.fetchUrl, `refs/tags/${input.tagName}`, `refs/tags/${input.tagName}^{}`], true));
          const existingTag = tagRefs.get(`refs/tags/${input.tagName}^{}`) || tagRefs.get(`refs/tags/${input.tagName}`);
          if (existingTag && existingTag !== sha) throw new Error('The existing remote tag points to a different commit.');
          const after = await this.state(input, read);
          if (
            after.head !== current.head ||
            after.bindingStamp !== current.bindingStamp ||
            after.currentBranch !== current.currentBranch ||
            after.fetchUrl !== current.fetchUrl ||
            JSON.stringify(after.pushUrls) !== JSON.stringify(current.pushUrls) ||
            after.remoteSha !== sha
          )
            throw new Error('The published target changed before release creation.');
          this.assertCurrent(input, inspection.generation, inspection.repoGeneration);
          const release = await (await hostingService.authenticatedAdapter(input.repository.connectionId)).createRelease({ ...input, target: sha });
          this.uploadAuthorizations.set(event.sender.id, {
            connectionId: input.repository.connectionId,
            repositoryId: input.repository.repositoryId,
            fullPath: input.repository.fullPath,
            releaseId: release.id,
            repoPath: input.repoPath,
            generation: inspection.generation,
            expiresAt: Date.now() + 30 * 60_000,
            tagName: input.tagName,
            targetOid: sha,
            endpoint: current.fetchUrl,
          });
          const tagResult = await createHostingReleaseLocalTag(read, input.tagName, sha, current.fetchUrl);
          return { ...release, localTag: tagResult };
        },
        job.signal,
      );
    } finally {
      job.complete();
      releaseProtection();
    }
  }

  async syncTag(
    event: IpcMainInvokeEvent,
    input: { repository: { connectionId: string; repositoryId: string; fullPath: string }; releaseId: string; repoPath: string },
  ) {
    this.authorizeUpload(event.sender.id, input);
    const authorization = this.uploadAuthorizations.get(event.sender.id)!;
    const job = repoJobRegistry.begin(input.repoPath);
    const signal = AbortSignal.any([job.signal, this.deps.hostingService.getConnectionSignal(input.repository.connectionId)]);
    try {
      return await this.deps.gitService.runner.withExclusiveWrite(
        input.repoPath,
        'hosting-release-local-tag',
        async (git) => {
          const read: ReadGit = async (args, network = false) => {
            this.authorizeUpload(event.sender.id, input);
            job.ensureActive();
            signal.throwIfAborted();
            const credential = network
              ? await this.deps.hostingService.createGitCredentialEnvironment({
                  connectionId: input.repository.connectionId,
                  urls: [authorization.endpoint],
                  signal,
                })
              : null;
            try {
              return await git.run(input.repoPath, args, {
                signal: AbortSignal.any([credential?.signal || signal, AbortSignal.timeout(60_000)]),
                envOverrides: credential?.envOverrides || { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
              });
            } finally {
              credential?.dispose();
            }
          };
          return createHostingReleaseLocalTag(read, authorization.tagName, authorization.targetOid, authorization.endpoint);
        },
        signal,
      );
    } finally {
      job.complete();
    }
  }

  authorizeUpload(
    senderId: number,
    input: { repository: { connectionId: string; repositoryId: string; fullPath: string }; releaseId: string; repoPath: string },
  ): void {
    const authorization = this.uploadAuthorizations.get(senderId);
    if (
      !authorization ||
      authorization.expiresAt < Date.now() ||
      authorization.connectionId !== input.repository.connectionId ||
      authorization.repositoryId !== input.repository.repositoryId ||
      authorization.fullPath !== input.repository.fullPath ||
      authorization.releaseId !== input.releaseId ||
      authorization.repoPath !== input.repoPath ||
      authorization.generation !== this.deps.hostingService.generation(input.repository.connectionId)
    )
      throw new Error('The asset must belong to the release created by this window and account.');
    requireActiveRepositoryPath(input.repoPath, this.deps.gitService.getRepoPath(), 'hosting:uploadAsset');
  }
}
