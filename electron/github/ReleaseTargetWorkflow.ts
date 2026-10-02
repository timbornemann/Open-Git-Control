import { randomUUID } from 'crypto';
import type { IpcMainInvokeEvent } from 'electron';
import type { GitService } from '../GitService';
import type { GitHubService } from '../GitHubService';
import type { GitHubCreateReleaseParamsDto, GitHubInspectReleaseTargetParamsDto, GitHubReleaseTargetDto } from '../../src/types/githubDtos';
import type { CommitEditGit } from '../git/CommitEditGit';
import type { SecretScanPushGuard } from '../main-process/ipc/git/secretScanPushGuard';
import { beginCommitProtection } from '../main-process/RepositoryCommitProtection';
import { repoJobRegistry } from '../main-process/repoJobRegistry';
import { requireActiveRepositoryPath } from '../main-process/activeRepositoryAuthorization';
import { emitJobEvent } from '../main-process/ipc/jobEvents';
import { parseGithubRemoteTarget } from './releaseTargetIdentity';
import {
  assertReleaseTargetUnchanged,
  inspectReleaseTargetState,
  releasePushArgs,
  validatePublishedReleaseTag,
  type ReleaseTargetState,
  type ReleaseGitRead,
} from './releaseTargetInspection';

type Inspection = { id: string; key: string; repoPath: string; auth: number; repoGeneration: number; host: string; state: ReleaseTargetState };
type Dependencies = {
  gitService: GitService;
  githubService: GitHubService;
  getHost: () => string;
  pushGuard?: SecretScanPushGuard;
};
const requestKey = (params: GitHubInspectReleaseTargetParamsDto) =>
  JSON.stringify([params.repoPath, params.owner.toLowerCase(), params.repo.toLowerCase(), params.tagName.trim(), (params.targetCommitish || '').trim()]);
const changed = () => new Error('Der Release-Zustand wurde geändert oder die Prüfung ist abgelaufen. Bitte den Release erneut prüfen.');

export class ReleaseTargetWorkflow {
  private readonly inspections = new Map<number, Inspection>();
  private readonly registeredSenders = new Set<number>();
  constructor(private readonly deps: Dependencies) {}

  private assertCurrent(inspection: Inspection): void {
    const { gitService, githubService, getHost } = this.deps;
    requireActiveRepositoryPath(inspection.repoPath, gitService.getRepoPath(), 'github:createRelease');
    if (
      !githubService.isAuthenticated() ||
      inspection.auth !== githubService.getAuthenticationGeneration() ||
      inspection.host !== getHost() ||
      inspection.repoGeneration !== repoJobRegistry.getGeneration()
    )
      throw changed();
  }

  private async timed<T>(signal: AbortSignal, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const timer = setTimeout(cancel, 60_000);
    try {
      return await operation(controller.signal);
    } catch (error) {
      if (controller.signal.aborted && !signal.aborted) throw new Error('Die Release-Netzwerkprüfung hat das Zeitlimit von 60 Sekunden überschritten.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    }
  }

  private read(git: CommitEditGit, inspection: Inspection, signal: AbortSignal): ReleaseGitRead {
    return async (args, network = false) => {
      signal.throwIfAborted();
      this.assertCurrent(inspection);
      const run = (activeSignal: AbortSignal) =>
        git.run(inspection.repoPath, args, {
          signal: activeSignal,
          envOverrides: { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        });
      const result = network ? await this.timed(signal, run) : await run(signal);
      this.assertCurrent(inspection);
      return result;
    };
  }

  private inspectState(git: ReleaseGitRead, params: GitHubInspectReleaseTargetParamsDto, inspection: Inspection, signal: AbortSignal) {
    const { githubService } = this.deps;
    return inspectReleaseTargetState(
      git,
      params.targetCommitish,
      (url) => {
        const target = parseGithubRemoteTarget(url, inspection.host, githubService);
        return target?.owner.toLowerCase() === params.owner.toLowerCase() && target?.repo.toLowerCase() === params.repo.toLowerCase();
      },
      (ref) => this.timed(signal, (requestSignal) => githubService.resolvePublishedReleaseCommit(params.owner, params.repo, ref, requestSignal)),
    );
  }

  async inspect(event: IpcMainInvokeEvent, params: GitHubInspectReleaseTargetParamsDto): Promise<GitHubReleaseTargetDto> {
    if (!params.repoPath) throw new Error('Repository path is required.');
    const repoPath = requireActiveRepositoryPath(params.repoPath, this.deps.gitService.getRepoPath(), 'github:inspectReleaseTarget');
    const job = repoJobRegistry.begin(repoPath);
    const inspection: Inspection = {
      id: randomUUID(),
      key: requestKey(params),
      repoPath,
      auth: this.deps.githubService.getAuthenticationGeneration(),
      host: this.deps.getHost(),
      repoGeneration: repoJobRegistry.getGeneration(),
      state: null as unknown as ReleaseTargetState,
    };
    this.inspections.delete(event.sender.id);
    try {
      inspection.state = await this.deps.gitService.runner.withExclusiveWrite(
        repoPath,
        'release-inspect',
        async (git) => this.inspectState(this.read(git, inspection, job.signal), params, inspection, job.signal),
        job.signal,
      );
      this.assertCurrent(inspection);
      this.inspections.set(event.sender.id, inspection);
      if (!this.registeredSenders.has(event.sender.id)) {
        this.registeredSenders.add(event.sender.id);
        event.sender.once('destroyed', () => {
          this.inspections.delete(event.sender.id);
          this.registeredSenders.delete(event.sender.id);
        });
      }
      const { fetchUrl: _url, pushUrls: _urls, head: _head, currentBranch: _branch, ...data } = inspection.state;
      return { ...data, inspectionId: inspection.id };
    } finally {
      job.complete();
    }
  }

  async create(event: IpcMainInvokeEvent, params: GitHubCreateReleaseParamsDto) {
    const inspection = this.inspections.get(event.sender.id);
    if (
      !inspection ||
      !params.repoPath ||
      params.targetInspection?.id !== inspection.id ||
      requestKey({ ...params, repoPath: params.repoPath }) !== inspection.key
    )
      throw changed();
    this.assertCurrent(inspection);
    const mode = params.targetInspection.mode;
    if (mode !== 'remote' && mode !== 'push-local') throw new Error('Invalid release publication mode.');
    const { state } = inspection;
    if (mode === 'push-local' && !state.canPush) throw new Error(state.pushBlockedReason || 'Dieser Release-Stand kann nicht gepusht werden.');
    if (mode === 'remote' && !state.canReleaseRemote) throw new Error('Der Ziel-Branch ist auf GitHub noch nicht vorhanden.');
    this.inspections.delete(event.sender.id);
    const releaseProtection = beginCommitProtection(inspection.repoPath);
    if (!releaseProtection) throw new Error('Im Repository läuft bereits eine Schreiboperation. Bitte danach erneut versuchen.');
    const job = repoJobRegistry.begin(inspection.repoPath);
    let pushed = false;
    const notify = (status: 'start' | 'progress' | 'done' | 'failed', phase: string, message: string) =>
      emitJobEvent(event.sender, {
        id: inspection.id,
        operation: 'github:createRelease',
        status,
        message,
        details: { repoPath: inspection.repoPath, releasePhase: phase, inspectionId: inspection.id },
        timestamp: Date.now(),
      });
    try {
      notify('start', 'checking', 'Release-Ziel wird geprüft.');
      if (mode === 'push-local') {
        if (!this.deps.pushGuard) throw new Error('Die Push-Sicherheitsprüfung ist nicht verfügbar.');
        const block = await this.deps.pushGuard.requirePushSecretScanApproval(event, releasePushArgs(state), inspection.repoPath);
        if (block) throw new Error(block.error);
        this.assertCurrent(inspection);
      }
      const result = await this.deps.gitService.runner.withExclusiveWrite(
        inspection.repoPath,
        'release-publish',
        async (git) => {
          const read = this.read(git, inspection, job.signal);
          const current = await this.inspectState(read, { ...params, repoPath: inspection.repoPath }, inspection, job.signal);
          if (JSON.stringify(current) !== JSON.stringify(state)) throw changed();
          const sha = (mode === 'push-local' ? state.localSha : state.remoteSha)!;
          await validatePublishedReleaseTag(read, state, params.tagName.trim(), sha);
          if (mode === 'push-local') {
            notify('progress', 'pushing', 'Commits werden hochgeladen.');
            await read(['push', ...releasePushArgs(state)]);
            pushed = true;
            const afterPush = await this.inspectState(read, { ...params, repoPath: inspection.repoPath }, inspection, job.signal);
            if (
              afterPush.localSha !== state.localSha ||
              afterPush.remoteSha !== sha ||
              afterPush.head !== state.head ||
              afterPush.currentBranch !== state.currentBranch ||
              afterPush.fetchUrl !== state.fetchUrl ||
              JSON.stringify(afterPush.pushUrls) !== JSON.stringify(state.pushUrls)
            )
              throw changed();
            await validatePublishedReleaseTag(read, afterPush, params.tagName.trim(), sha);
          }
          await assertReleaseTargetUnchanged(read, state, sha);
          this.assertCurrent(inspection);
          job.ensureActive();
          notify('progress', 'creating', 'Release wird erstellt.');
          return this.deps.githubService.createRelease({
            owner: params.owner,
            repo: params.repo,
            tagName: params.tagName.trim(),
            releaseName: params.releaseName.trim(),
            targetCommitish: sha,
            body: params.body,
            draft: Boolean(params.draft),
            prerelease: Boolean(params.prerelease),
          });
        },
        job.signal,
      );
      notify('done', 'done', 'Release erstellt.');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Release fehlgeschlagen.';
      const detail = pushed ? `Die Commits wurden gepusht, der Release wurde nicht bestätigt: ${message}` : message;
      notify('failed', 'failed', detail);
      throw new Error(detail);
    } finally {
      job.complete();
      releaseProtection();
    }
  }
}
