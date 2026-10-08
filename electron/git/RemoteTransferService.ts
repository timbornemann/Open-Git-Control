import { createPushPlan } from './createPushPlan';
import { randomUUID } from 'crypto';
import { readPushSecretScanScope, type PushSecretScanScope } from './PushSecretScanScope';
import { readRemoteSnapshot, assertPushSourceUnchanged, probePushUrlIsolation, remoteConfigurationFingerprint } from './remoteSnapshot';
import { lfsEndpoint, lfsTransferEnvironment, uploadLfsObjects } from './GitLfsTransfers';
import type {
  GitRemoteSnapshotDto,
  GitPushBatchDto,
  GitPushPlanDto,
  GitPushTargetDto,
  GitPushTargetResultDto,
  RemoteMutation,
  RemotePreferences,
  RemoteTransferOperations,
} from '../../src/types/remoteTransfers';
import type { GitProcessResult } from './GitProcessTypes';
import { redactGitSensitiveText } from './GitErrorFormatter';
import { RemotePreferencesStore } from './RemotePreferencesStore';
import { reconcileRemotePreferences } from './reconcileRemotePreferences';
import { runGroupedRemotePush } from './groupedRemotePush';
import {
  isolatedPushEnvironment,
  normalizeRemotePreferences,
  referencedRemotePreferenceNames,
  refName,
  remoteName,
  remoteUrl,
  remoteFetchArguments,
} from './remoteTransferValidation';
import { batchState, parseAdvertisedRefs, pushResult, type PublishedRef } from './remotePushResults';
import { repositoryPathKey } from '../main-process/activeRepositoryAuthorization';

export type { CredentialEnvironmentFactory, RemoteTransferContext } from './remoteTransferModels';
import {
  digest,
  pruneTransfers,
  lines,
  type CredentialEnvironmentFactory,
  type RemoteTransferContext,
  type StoredPlan,
  type StoredBatch,
  type Runner,
} from './remoteTransferModels';

/** Named Git remotes retain hooks and transport configuration; accounts bind to individual URLs. */
export class RemoteTransferService {
  private readonly plans = new Map<string, StoredPlan>();
  private readonly batches = new Map<string, StoredBatch>();
  private readonly activePlans = new Set<string>();
  private isolationSupported: boolean | undefined;

  constructor(
    private readonly git: Runner,
    private readonly preferences = new RemotePreferencesStore(),
    private readonly credentials?: CredentialEnvironmentFactory,
    private readonly getCredentialGeneration?: (connectionId: string) => number,
  ) {}

  private async optional(repoPath: string, args: string[]): Promise<string> {
    const result = await this.git.runResult(repoPath, args);
    return result.exitCode === 0 ? result.stdout.trim() : '';
  }

  private async isolationCapability(repoPath: string): Promise<boolean> {
    if (this.isolationSupported !== undefined) return this.isolationSupported;
    this.isolationSupported = await probePushUrlIsolation(repoPath, this.git);
    return this.isolationSupported ?? false;
  }

  async getRemotes(repoPath: string): Promise<GitRemoteSnapshotDto> {
    return readRemoteSnapshot(repoPath, this.git, await this.isolationCapability(repoPath));
  }

  getPreferences(repoPath: string): RemotePreferences {
    return this.preferences.read(repoPath);
  }

  async setPreferences(repoPath: string, input: RemotePreferences, context?: RemoteTransferContext): Promise<RemotePreferences> {
    const preferences = normalizeRemotePreferences(input);
    const snapshot = await this.getRemotes(repoPath);
    const names = new Set(snapshot.remotes.map((remote) => remote.name));
    const selected = referencedRemotePreferenceNames(preferences);
    if (selected.some((name) => !names.has(name!))) throw new Error('Remote preferences reference an unknown remote.');
    for (const binding of preferences.bindings ?? []) {
      const remote = snapshot.remotes.find((candidate) => candidate.name === binding.remoteName)!;
      if (![...remote.fetchUrls, ...remote.pushUrls].includes(binding.url)) throw new Error('Account binding URL no longer matches this remote.');
    }
    context?.ensureActive();
    return this.preferences.write(repoPath, preferences);
  }

  async editRemote(repoPath: string, mutation: RemoteMutation, context: RemoteTransferContext): Promise<GitRemoteSnapshotDto> {
    context.ensureActive();
    const name = remoteName(mutation.name);
    const snapshot = await this.getRemotes(repoPath);
    this.getPreferences(repoPath);
    if (mutation.action !== 'add' && !snapshot.remotes.some((remote) => remote.name === name)) throw new Error('Unknown remote.');
    const urls = mutation.pushUrls === undefined ? undefined : mutation.pushUrls.map(remoteUrl);
    if ((mutation.action === 'remove' || mutation.action === 'rename') && urls) throw new Error('Push URLs cannot accompany removal or renaming.');
    if (urls && (urls.length > 16 || new Set(urls).size !== urls.length)) throw new Error('Invalid push URL list.');
    if (mutation.action === 'add') await this.git.run(repoPath, ['remote', 'add', name, remoteUrl(mutation.url)], { signal: context.signal });
    else if (mutation.action === 'remove') await this.git.run(repoPath, ['remote', 'remove', name], { signal: context.signal });
    else if (mutation.action === 'rename') await this.git.run(repoPath, ['remote', 'rename', name, remoteName(mutation.newName)], { signal: context.signal });
    else if (mutation.action === 'set-url') {
      if (mutation.url !== undefined) await this.git.run(repoPath, ['remote', 'set-url', name, remoteUrl(mutation.url)], { signal: context.signal });
      else if (!urls) throw new Error('Remote URL is required.');
    } else throw new Error('Unsupported remote mutation.');
    if (urls && ['add', 'set-url'].includes(mutation.action)) {
      const cleared = await this.git.runResult(repoPath, ['config', '--local', '--unset-all', `remote.${name}.pushurl`], { signal: context.signal });
      if (![0, 5].includes(cleared.exitCode)) throw new Error('Push URLs could not be updated.');
      for (const url of urls) await this.git.run(repoPath, ['config', '--local', '--add', `remote.${name}.pushurl`, url], { signal: context.signal });
    }
    const updated = await this.getRemotes(repoPath);
    const preferences = this.getPreferences(repoPath);
    context.ensureActive();
    this.preferences.write(repoPath, reconcileRemotePreferences(preferences, mutation, updated));
    context.ensureActive();
    return updated;
  }

  private async selectedRemote(repoPath: string, name: string) {
    const snapshot = await this.getRemotes(repoPath);
    const remote = snapshot.remotes.find((candidate) => candidate.name === remoteName(name));
    if (!remote) throw new Error('Unknown remote.');
    return remote;
  }

  private connectionId(repoPath: string, name: string, url: string): string | null {
    const binding = this.getPreferences(repoPath).bindings?.find((binding) => binding.remoteName === name && binding.url === url);
    return binding?.credentialMode === 'system' ? null : (binding?.repository?.connectionId ?? null);
  }

  private async withCredentials<T>(
    repoPath: string,
    name: string,
    url: string,
    context: RemoteTransferContext,
    environment: NodeJS.ProcessEnv,
    work: (env: NodeJS.ProcessEnv, signal?: AbortSignal) => Promise<T>,
    connectionId?: string | null,
    expectedGeneration?: number,
    lfsUrls: string[] = [],
  ): Promise<T> {
    remoteUrl(url);
    context.ensureActive();
    const scope = await this.credentials?.({
      connectionId: connectionId === undefined ? this.connectionId(repoPath, name, url) : connectionId,
      urls: [url],
      signal: context.signal,
      envOverrides: environment,
      expectedGeneration,
      lfsUrls,
    });
    try {
      const signal = scope?.signal ? AbortSignal.any([...(context.signal ? [context.signal] : []), scope.signal]) : context.signal;
      return await work(scope?.envOverrides ?? environment, signal);
    } finally {
      await scope?.dispose();
    }
  }

  async fetch(repoPath: string, name: string, context: RemoteTransferContext, tagsOnly = false): Promise<{ output: string }> {
    const remote = await this.selectedRemote(repoPath, name);
    const url = remoteUrl(remote.fetchUrls[0]);
    const output = await this.withCredentials(repoPath, name, url, context, {}, (envOverrides, signal) =>
      this.git.streamOutput(repoPath, remoteFetchArguments(name, tagsOnly), context.onProgress ?? (() => {}), signal, {
        envOverrides,
      }),
    );
    context.ensureActive();
    return { output: redactGitSensitiveText(output) };
  }

  async pull(repoPath: string, input: RemoteTransferOperations['pull']['input'], context: RemoteTransferContext): Promise<{ output: string }> {
    const remote = await this.selectedRemote(repoPath, input.remote);
    await this.git.run(repoPath, ['check-ref-format', `refs/heads/${refName(input.branch)}`]);
    const flags: Record<string, string[]> = { default: [], rebase: ['--rebase'], 'no-ff': ['--no-ff'], 'ff-only': ['--ff-only'] };
    if (!Object.hasOwn(flags, input.mode)) throw new Error('Unsupported pull strategy.');
    const endpoint = await lfsEndpoint(repoPath, input.remote, this.git).catch(() => '');
    const base = endpoint ? lfsTransferEnvironment({}, input.remote, endpoint, remote.fetchUrls[0]) : {};
    const output = await this.withCredentials(
      repoPath,
      input.remote,
      remoteUrl(remote.fetchUrls[0]),
      context,
      base,
      (envOverrides, signal) =>
        this.git.streamOutput(
          repoPath,
          ['pull', ...flags[input.mode], '--no-recurse-submodules', '--', input.remote, input.branch],
          context.onProgress ?? (() => {}),
          signal,
          { envOverrides },
        ),
      undefined,
      undefined,
      endpoint ? [endpoint] : [],
    );
    context.ensureActive();
    return { output: redactGitSensitiveText(output) };
  }

  async setUpstream(repoPath: string, name: string, branch: string, context: RemoteTransferContext): Promise<true> {
    await this.selectedRemote(repoPath, name);
    await this.git.run(repoPath, ['check-ref-format', `refs/heads/${refName(branch)}`]);
    const localBranch = await this.optional(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (!localBranch) throw new Error('Select a local branch before setting its upstream.');
    await this.git.run(repoPath, ['branch', `--set-upstream-to=${name}/${branch}`, '--', localBranch], { signal: context.signal });
    context.ensureActive();
    return true;
  }

  private async fingerprint(repoPath: string): Promise<string> {
    return remoteConfigurationFingerprint(repoPath, this.git, this.getPreferences(repoPath));
  }

  private async advertised(repoPath: string, target: GitPushTargetDto, refs: PublishedRef[], context: RemoteTransferContext): Promise<Map<string, string>> {
    const output = await this.withCredentials(repoPath, target.remoteName, target.url, context, {}, (envOverrides, signal) =>
      this.git.run(repoPath, ['ls-remote', '--refs', '--', target.url, ...refs.map((ref) => ref.destinationRef)], { envOverrides, signal }),
    );
    return parseAdvertisedRefs(output);
  }

  async planPush(repoPath: string, input: RemoteTransferOperations['planPush']['input'], context: RemoteTransferContext): Promise<GitPushPlanDto> {
    pruneTransfers(this.plans, this.batches);
    const plan = await createPushPlan(repoPath, input, context, {
      git: this.git,
      getPreferences: () => this.getPreferences(repoPath),
      getRemotes: () => this.getRemotes(repoPath),
      fingerprint: () => this.fingerprint(repoPath),
      getCredentialGeneration: this.getCredentialGeneration,
      advertised: (target, refs) => this.advertised(repoPath, target, refs, context),
      connectionId: (name, url) => this.connectionId(repoPath, name, url),
    });
    this.plans.set(plan.dto.id, plan);
    return structuredClone(plan.dto);
  }

  async getPushScanScope(repoPath: string, args: string[], context: RemoteTransferContext): Promise<PushSecretScanScope | null> {
    if (!args[0]?.startsWith('__ogc_transfer_scan_')) return null;
    const id = /^__ogc_transfer_scan_([a-f0-9-]{36})__$/.exec(args[0])?.[1];
    if (!id) throw new Error('Invalid secret-scan push plan.');
    const plan = await this.validatePlan(repoPath, id, context);
    if (digest(args) !== digest(plan.dto.secretScanArgs)) throw new Error('Secret-scan sources no longer match the reviewed push plan.');
    return readPushSecretScanScope({
      repoPath,
      refs: plan.refs,
      targets: plan.dto.targets,
      git: this.git,
      context,
      validatePlan: () => this.validatePlan(repoPath, id, context),
      advertise: (target) => {
        const connectionId = plan.connections[target.id];
        return this.withCredentials(
          repoPath,
          target.remoteName,
          target.url,
          context,
          {},
          (envOverrides, signal) =>
            this.git.run(repoPath, ['ls-remote', '--heads', '--tags', '--', target.url], {
              envOverrides,
              signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]),
            }),
          connectionId,
          connectionId ? plan.credentialGenerations[connectionId] : undefined,
        );
      },
    });
  }

  private async validatePlan(repoPath: string, id: string, context: RemoteTransferContext): Promise<StoredPlan> {
    pruneTransfers(this.plans, this.batches);
    const plan = this.plans.get(id);
    if (
      !plan ||
      repositoryPathKey(plan.dto.repoPath) !== repositoryPathKey(repoPath) ||
      plan.ownerId !== context.ownerId ||
      plan.generation !== context.generation
    )
      throw new Error('Push plan expired or belongs to another repository or window. Create a new push plan.');
    if (plan.fingerprint !== (await this.fingerprint(repoPath))) throw new Error('Remote configuration or account bindings changed. Create a new push plan.');
    if ((await this.optional(repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])) !== plan.dto.branch)
      throw new Error('The current branch changed. Create a new push plan.');
    await assertPushSourceUnchanged(repoPath, this.git, plan.dto);
    if (this.getCredentialGeneration && Object.entries(plan.credentialGenerations).some(([id, generation]) => this.getCredentialGeneration!(id) !== generation))
      throw new Error('Hosting authentication changed. Review the push with the current account again.');
    for (const ref of plan.refs) await this.git.run(repoPath, ['cat-file', '-e', ref.sourceOid]);
    context.ensureActive();
    return plan;
  }

  async executePush(repoPath: string, planId: string, context: RemoteTransferContext): Promise<GitPushBatchDto> {
    const plan = await this.validatePlan(repoPath, planId, context);
    if (plan.executed || this.activePlans.has(planId))
      throw new Error('This push plan was already executed or is running. Retry its failed endpoints instead.');
    this.activePlans.add(planId);
    try {
      await context.authorizePush?.(plan.dto.secretScanArgs);
      await this.validatePlan(repoPath, planId, context);
      plan.executed = true;
      return await this.runBatch(repoPath, plan, context);
    } finally {
      this.activePlans.delete(planId);
    }
  }

  async retryPush(repoPath: string, batchId: string, targetIds: string[] | undefined, context: RemoteTransferContext): Promise<GitPushBatchDto> {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error('Push result expired. Create a new push plan.');
    const plan = await this.validatePlan(repoPath, batch.plan.dto.id, context);
    if (this.activePlans.has(plan.dto.id)) throw new Error('This push plan is already running.');
    if (targetIds && (!Array.isArray(targetIds) || targetIds.some((id) => !batch.dto.targets.some((target) => target.id === id))))
      throw new Error('Unknown retry endpoint.');
    const retry = batch.dto.targets.filter((target) => !['success', 'up-to-date'].includes(target.status) && (!targetIds || targetIds.includes(target.id)));
    if (retry.some((target) => target.grouped))
      throw new Error('Targeted retry requires isolated push URLs. Use separate named remotes or create a new normal grouped push plan.');
    if (!retry.length) return structuredClone(batch.dto);
    this.activePlans.add(plan.dto.id);
    try {
      await context.authorizePush?.(plan.dto.secretScanArgs);
      await this.validatePlan(repoPath, plan.dto.id, context);
      return await this.runBatch(
        repoPath,
        plan,
        context,
        retry.map((target) => target.id),
        batch.dto.targets,
      );
    } finally {
      this.activePlans.delete(plan.dto.id);
    }
  }

  private async pushTarget(
    repoPath: string,
    plan: StoredPlan,
    target: GitPushTargetDto,
    context: RemoteTransferContext,
    retry: boolean,
  ): Promise<GitPushTargetResultDto> {
    const isolated = isolatedPushEnvironment(target.remoteName, target.url, this.isolationSupported === true);
    const base = target.lfsEndpoint ? lfsTransferEnvironment(isolated, target.remoteName, target.lfsEndpoint, target.url) : isolated;
    let refs = plan.dto.branchRefs
      ? [...plan.refs]
      : plan.refs.map((ref) => (ref.destinationRef.startsWith('refs/heads/') ? { ...ref, destinationRef: target.destinationRef } : ref));
    if (retry) {
      const actual = await this.advertised(repoPath, target, refs, context);
      refs = refs.filter((ref) => actual.get(ref.destinationRef) !== ref.sourceOid);
      if (
        plan.dto.force &&
        actual.get(target.destinationRef) !== (target.leaseOid ?? undefined) &&
        refs.some((ref) => ref.destinationRef === target.destinationRef)
      )
        return {
          ...target,
          status: 'rejected',
          message: 'The destination changed after the force-with-lease plan. Create a new plan to inspect its current state.',
        };
    }
    return this.withCredentials(
      repoPath,
      target.remoteName,
      target.url,
      context,
      base,
      async (envOverrides, signal) => {
        const effective = await this.git.run(repoPath, ['remote', 'get-url', '--push', '--all', target.remoteName], { envOverrides, signal });
        if (lines(effective).length !== 1 || effective.trim() !== target.url)
          throw new Error('Git URL rewriting changed the planned push endpoint. Configure distinct named remotes.');
        if (target.lfsEndpoint)
          await uploadLfsObjects(
            repoPath,
            target.remoteName,
            target.lfsEndpoint,
            plan.dto.lfsObjects ?? [],
            this.git,
            envOverrides,
            signal,
            context.onProgress,
            target.url,
          );
        context.ensureActive();
        if (!refs.length) return { ...target, status: 'up-to-date', message: 'All planned refs and LFS objects are present on this endpoint.' };
        const args = ['push', '--porcelain', '--no-follow-tags', '--recurse-submodules=no'];
        if (plan.dto.force) args.push(`--force-with-lease=${target.destinationRef}:${target.leaseOid ?? ''}`);
        args.push('--', target.remoteName, ...refs.map((ref) => `${ref.sourceOid}:${ref.destinationRef}`));
        const result: GitProcessResult = await this.git.runResult(repoPath, args, { envOverrides, signal });
        context.ensureActive();
        return pushResult(target, result);
      },
      plan.connections[target.id],
      plan.connections[target.id] ? plan.credentialGenerations[plan.connections[target.id]!] : undefined,
      target.lfsEndpoint ? [target.lfsEndpoint] : [],
    );
  }

  private async runBatch(
    repoPath: string,
    plan: StoredPlan,
    context: RemoteTransferContext,
    selected?: string[],
    previous?: GitPushTargetResultDto[],
  ): Promise<GitPushBatchDto> {
    const targets: GitPushTargetResultDto[] = [];
    const completedGroups = new Set<string>();
    let cancelled = false;
    for (const target of plan.dto.targets) {
      if (target.grouped && completedGroups.has(target.remoteName)) continue;
      if (selected && !selected.includes(target.id)) {
        targets.push(previous!.find((result) => result.id === target.id)!);
        continue;
      }
      if (cancelled || context.signal?.aborted) {
        cancelled = true;
        targets.push({ ...target, status: 'skipped', message: 'Transfer was cancelled before this endpoint started.' });
        continue;
      }
      context.onProgress?.(`Pushing ${target.remoteName}: ${target.url}`);
      let contextValidated = false;
      try {
        context.ensureActive();
        await this.validatePlan(repoPath, plan.dto.id, context);
        contextValidated = true;
        if (target.grouped) {
          const group = plan.dto.targets.filter((candidate) => candidate.remoteName === target.remoteName);
          const outcomes = await runGroupedRemotePush(this.git, this.credentials, repoPath, plan, group, context, (candidate, refs) =>
            this.advertised(repoPath, candidate, refs, context),
          );
          targets.push(...outcomes);
          outcomes.forEach((outcome) => context.onProgress?.(`${outcome.status}: ${outcome.remoteName} → ${outcome.destinationRef} (${outcome.url})`));
        } else targets.push(await this.pushTarget(repoPath, plan, target, context, Boolean(selected)));
      } catch (error) {
        cancelled = !contextValidated || context.signal?.aborted === true;
        const failed = {
          ...target,
          status: !contextValidated
            ? ('skipped' as const)
            : cancelled || (error instanceof Error && error.name === 'AbortError')
              ? ('unknown' as const)
              : ('failed' as const),
          message: redactGitSensitiveText(error instanceof Error ? error.message : 'Push failed.'),
        };
        if (target.grouped)
          targets.push(...plan.dto.targets.filter((candidate) => candidate.remoteName === target.remoteName).map((candidate) => ({ ...failed, ...candidate })));
        else targets.push(failed);
      }
      if (target.grouped) completedGroups.add(target.remoteName);
      if (!target.grouped) context.onProgress?.(`${targets.at(-1)!.status}: ${target.remoteName} → ${target.destinationRef} (${target.url})`);
    }
    const dto: GitPushBatchDto = {
      id: randomUUID(),
      planId: plan.dto.id,
      repoPath,
      sourceOid: plan.dto.sourceOid,
      state: batchState(targets, cancelled || context.signal?.aborted === true),
      targets,
    };
    this.batches.set(dto.id, { dto, plan });
    return structuredClone(dto);
  }
}
