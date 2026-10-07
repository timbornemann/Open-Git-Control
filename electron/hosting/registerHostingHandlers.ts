import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { GitService } from '../GitService';
import type { HostingOperation, HostingOperations } from '../../src/shared/ipc/contracts/hosting';
import { getLocalHostingWorkflows } from './HostingLocalWorkflows';
import { IpcChannel } from '../../src/types/ipcContract';
import type { HostedRepositoryRef, HostingChangeRequest } from '../../src/types/hostingDtos';
import type { SecretScanPushGuard } from '../main-process/ipc/git/secretScanPushGuard';
import { getAuthorizedSelectedFile, getAuthorizedProjectParentDirectory } from '../main-process/fileAccessGrant';
import { requireActiveRepositoryPath, repositoryPathKey } from '../main-process/activeRepositoryAuthorization';
import { RemotePreferencesStore } from '../git/RemotePreferencesStore';
import { remoteUrl } from '../git/remoteTransferValidation';
import { beginCommitProtection } from '../main-process/RepositoryCommitProtection';
import { repoJobRegistry } from '../main-process/repoJobRegistry';
import { emitJobEvent } from '../main-process/ipc/jobEvents';
import { redactGitSensitiveText } from '../git/GitErrorFormatter';
import { hostingService, type HostingService } from './HostingService';
import { HostingReleaseSafety } from './HostingReleaseSafety';
import { getHostingReleaseContext } from './HostingReleaseContext';
import type { GitCredentialEnvironment } from './HostingCredentialBridge';
import { hasControlCharacters } from './hostingUrls';
import { parseReleaseCommits, RELEASE_COMMIT_FORMAT } from '../main-process/parsing';

type Dependencies = { gitService: GitService; pushGuard?: SecretScanPushGuard; hostingService?: HostingService };
const MAX_TRANSFER_BYTES = 512 * 1024 * 1024;
const sameRepository = (left: HostedRepositoryRef, right: HostedRepositoryRef) =>
  left.connectionId === right.connectionId && left.repositoryId === right.repositoryId && left.fullPath === right.fullPath;

async function findChangeRequest(service: HostingService, repository: HostedRepositoryRef, id: string): Promise<HostingChangeRequest> {
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const response = await service.request('changeRequests', { repository, state: 'all', cursor });
    const result = response.items.find((request) => request.id === id);
    if (result) return result;
    if (!response.nextCursor) break;
    cursor = response.nextCursor;
  }
  throw new Error('The change request is no longer available. Refresh it before checking out.');
}

async function checkoutChangeRequest(
  event: IpcMainInvokeEvent,
  input: HostingOperations['checkoutChangeRequest']['input'],
  gitService: GitService,
  service: HostingService,
): Promise<true> {
  const repoPath = requireActiveRepositoryPath(input.repoPath, gitService.getRepoPath(), 'hosting:checkoutChangeRequest');
  service.validateRepository(input.repository);
  if (!/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(input.expectedHeadSha)) throw new Error('A verified change request head SHA is required.');
  const generation = service.generation(input.repository.connectionId);
  const repoGeneration = repoJobRegistry.getGeneration();
  const current = () => {
    requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), 'hosting:checkoutChangeRequest');
    if (generation !== service.generation(input.repository.connectionId) || repoGeneration !== repoJobRegistry.getGeneration())
      throw new Error('The repository or account changed. Refresh the change request.');
  };
  const change = await findChangeRequest(service, input.repository, input.id);
  if (change.headSha !== input.expectedHeadSha || !sameRepository(change.target, input.repository))
    throw new Error('The change request head or target changed. Refresh it before checking out.');
  const source = await service.request('repository', { repository: change.source });
  if (!sameRepository(source.ref, change.source) || !source.cloneUrl.startsWith('https://'))
    throw new Error('The verified source repository or its HTTPS clone endpoint changed.');
  remoteUrl(source.cloneUrl);
  const protection = beginCommitProtection(repoPath);
  if (!protection) throw new Error('Another repository write operation is running.');
  const job = repoJobRegistry.begin(repoPath);
  const lifecycle = AbortSignal.any([job.signal, service.getConnectionSignal(input.repository.connectionId)]);
  let credential: GitCredentialEnvironment | undefined;
  try {
    if (source.cloneUrl.startsWith('https://'))
      credential = await service.createGitCredentialEnvironment({ connectionId: source.ref.connectionId, urls: [source.cloneUrl], signal: lifecycle });
    const signal = credential?.signal || lifecycle;
    await gitService.runner.withExclusiveWrite(
      repoPath,
      'hosting-checkout-change-request',
      async (git) => {
        const run = async (args: string[]) => {
          current();
          return git.run(repoPath, args, { signal, envOverrides: credential?.envOverrides || { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } });
        };
        if ((await run(['status', '--porcelain'])).trim()) throw new Error('Commit or stash local changes before checking out a change request.');
        const adapter = await service.authenticatedAdapter(input.repository.connectionId);
        const names = (await run(['remote'])).trim().split(/\r?\n/).filter(Boolean);
        let matchingRemote = false;
        for (const name of names) {
          const urls = [
            ...new Set([
              ...(await run(['remote', 'get-url', '--all', name])).trim().split(/\r?\n/),
              ...(await run(['remote', 'get-url', '--push', '--all', name])).trim().split(/\r?\n/),
            ]),
          ].filter(Boolean);
          for (const url of urls) {
            const remote = await adapter.resolveRepository(url).catch(() => null);
            if (remote && (sameRepository(remote.ref, change.source) || sameRepository(remote.ref, change.target))) matchingRemote = true;
          }
        }
        if (!matchingRemote) throw new Error('The active local repository does not belong to this change request.');
        await run(['check-ref-format', `refs/heads/${change.sourceBranch}`]);
        const advertised = (await run(['ls-remote', '--', source.cloneUrl, `refs/heads/${change.sourceBranch}`])).trim().split(/\s+/)[0];
        if (advertised !== input.expectedHeadSha) throw new Error('The remote change request branch changed. Refresh it before checking out.');
        await run(['fetch', '--no-tags', '--no-write-fetch-head', '--', source.cloneUrl, input.expectedHeadSha]);
        const fresh = await findChangeRequest(service, input.repository, input.id);
        if (
          fresh.headSha !== input.expectedHeadSha ||
          !sameRepository(fresh.source, change.source) ||
          !sameRepository(fresh.target, change.target) ||
          fresh.sourceBranch !== change.sourceBranch ||
          fresh.targetBranch !== change.targetBranch
        )
          throw new Error('The change request changed during fetch. Refresh it before checking out.');
        if ((await run(['status', '--porcelain'])).trim()) throw new Error('Local changes appeared during fetch. Commit or stash them first.');
        const branch = `ogc/change-${change.number.replace(/[^a-z\d_-]/gi, '').slice(0, 40) || 'request'}-${input.expectedHeadSha.slice(0, 8)}`;
        const existing = (await run(['show-ref', '--verify', '--hash', `refs/heads/${branch}`]).catch(() => '')).trim();
        if (existing && existing !== input.expectedHeadSha) throw new Error('The local change request branch already points to another commit.');
        await run(existing ? ['checkout', '--no-guess', branch] : ['checkout', '--no-guess', '-b', branch, input.expectedHeadSha]);
        current();
      },
      signal,
    );
    return true;
  } finally {
    credential?.dispose();
    job.complete();
    protection();
  }
}

async function clone(event: IpcMainInvokeEvent, input: HostingOperations['clone']['input'], gitService: GitService, service: HostingService) {
  const parent = getAuthorizedProjectParentDirectory(event.sender.id, input.targetDir);
  if (!parent) throw new Error('Choose the clone destination using the folder picker.');
  const repository = await service.request('repository', { repository: input.repository });
  let url = input.useSsh ? repository.sshUrl : repository.cloneUrl;
  if (!url) throw new Error('The provider did not return a clone URL for this transport.');
  if (url.startsWith('https://')) {
    const parsed = new URL(url);
    if (parsed.password || parsed.search || parsed.hash) throw new Error('The provider returned an invalid HTTPS clone URL.');
    parsed.username = '';
    url = parsed.href;
  } else if (!url.startsWith('ssh://') && !/^(?:[^@\s/:]+@)?(?:\[[a-f\d:]+\]|[a-z\d.-]+):[^\s]+$/i.test(url))
    throw new Error('Hosting clones require HTTPS or SSH transport.');
  remoteUrl(url);
  const controller = new AbortController();
  const lifecycle = AbortSignal.any([controller.signal, service.getConnectionSignal(input.repository.connectionId)]);
  const abort = () => controller.abort();
  event.sender.once('destroyed', abort);
  const generation = service.generation(input.repository.connectionId);
  const id = randomUUID();
  let credential;
  try {
    if (url.startsWith('https://'))
      credential = await service.createGitCredentialEnvironment({ connectionId: repository.ref.connectionId, urls: [url], signal: lifecycle });
    const result = await gitService.cloneRepo(
      url,
      parent,
      (message) => {
        if (service.generation(input.repository.connectionId) !== generation) controller.abort();
        if (!event.sender.isDestroyed()) emitJobEvent(event.sender, { id, operation: 'hosting:clone', status: 'progress', message, timestamp: Date.now() });
      },
      input.targetName || repository.name,
      { signal: credential?.signal || lifecycle, envOverrides: credential?.envOverrides },
    );
    if (!result.success) throw new Error(result.error || 'Clone failed.');
    lifecycle.throwIfAborted();
    if (service.generation(input.repository.connectionId) !== generation)
      throw new Error('The account changed during clone. Bind this repository to the account again.');
    const clonedPath = fs.realpathSync(result.repoPath);
    if (repositoryPathKey(path.dirname(clonedPath)) !== repositoryPathKey(parent)) throw new Error('The clone resolved outside the selected parent directory.');
    const actualRoot = (await gitService.runner.run(clonedPath, ['rev-parse', '--show-toplevel'], { signal: lifecycle })).trim();
    if (repositoryPathKey(actualRoot) !== repositoryPathKey(clonedPath)) throw new Error('The cloned repository root could not be verified.');
    const origin = (await gitService.runner.run(clonedPath, ['remote', 'get-url', 'origin'], { signal: lifecycle })).trim();
    const resolved = await (await service.authenticatedAdapter(repository.ref.connectionId)).resolveRepository(origin);
    if (!resolved || !sameRepository(resolved.ref, repository.ref)) throw new Error('The clone origin changed. Select its hosting account explicitly.');
    lifecycle.throwIfAborted();
    const preferences = new RemotePreferencesStore();
    preferences.write(clonedPath, {
      ...preferences.read(clonedPath),
      hostingRemote: 'origin',
      hostingRepository: repository.ref,
      fetchRemote: 'origin',
      pushRemotes: ['origin'],
      bindings: [{ remoteName: 'origin', url: origin, repository: repository.ref }],
    });
    return { path: clonedPath };
  } finally {
    credential?.dispose();
    event.sender.removeListener('destroyed', abort);
  }
}

async function downloadArtifact(event: IpcMainInvokeEvent, input: HostingOperations['downloadArtifact']['input'], service: HostingService) {
  service.validateRepository(input.repository);
  const adapter = await service.authenticatedAdapter(input.repository.connectionId);
  const generation = service.generation(input.repository.connectionId);
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = { title: 'CI artifact herunterladen', defaultPath: 'artifact.zip' };
  const selected = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (selected.canceled || !selected.filePath) return null;
  const data = await adapter.downloadArtifact(input);
  if (generation !== service.generation(input.repository.connectionId)) throw new Error('The hosting account changed during download.');
  if (data.length > MAX_TRANSFER_BYTES) throw new Error('This artifact exceeds the 512 MiB download limit.');
  const destination = path.resolve(selected.filePath);
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  return { path: destination };
}

async function releaseNotesCommits(input: HostingOperations['releaseNotesCommits']['input'], gitService: GitService) {
  const repoPath = requireActiveRepositoryPath(input.repoPath, gitService.getRepoPath(), 'hosting:releaseNotesCommits');
  const generation = repoJobRegistry.getGeneration();
  const resolve = async (ref: string) => {
    if (!ref || ref.length > 2000 || ref.startsWith('-') || hasControlCharacters(ref)) throw new Error('A valid release commit reference is required.');
    return (await gitService.runCommandAtPath(repoPath, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim();
  };
  const target = await resolve(input.toRef);
  const previous = input.fromRef ? await resolve(input.fromRef) : null;
  const output = await gitService.runCommandAtPath(repoPath, [
    'log',
    '--max-count=401',
    RELEASE_COMMIT_FORMAT,
    previous ? `${previous}..${target}` : target,
    '--',
  ]);
  requireActiveRepositoryPath(repoPath, gitService.getRepoPath(), 'hosting:releaseNotesCommits');
  if (generation !== repoJobRegistry.getGeneration()) throw new Error('The repository changed while loading release commits.');
  return parseReleaseCommits(output).map(({ hash, subject, description, author, date }) => ({ sha: hash, message: subject, description, author, date }));
}

export function registerHostingHandlers({ gitService, pushGuard, hostingService: service = hostingService }: Dependencies): void {
  const releaseSafety = new HostingReleaseSafety({ gitService, hostingService: service, pushGuard });
  ipcMain.handle(IpcChannel.HostingRequest, async (event: IpcMainInvokeEvent, operation: HostingOperation, input: unknown) => {
    try {
      let data: unknown;
      if (operation === 'inspectRelease') data = await releaseSafety.inspect(event, input as HostingOperations['inspectRelease']['input']);
      else if (operation === 'createRelease') data = await releaseSafety.create(event, input as HostingOperations['createRelease']['input']);
      else if (operation === 'downloadArtifact') data = await downloadArtifact(event, input as HostingOperations['downloadArtifact']['input'], service);
      else if (operation === 'clone') data = await clone(event, input as HostingOperations['clone']['input'], gitService, service);
      else if (operation === 'checkoutChangeRequest')
        data = await checkoutChangeRequest(event, input as HostingOperations['checkoutChangeRequest']['input'], gitService, service);
      else if (operation === 'releaseNotesCommits') data = await releaseNotesCommits(input as HostingOperations['releaseNotesCommits']['input'], gitService);
      else if (operation === 'localWorkflows')
        data = await getLocalHostingWorkflows(input as HostingOperations['localWorkflows']['input'], gitService, service);
      else if (operation === 'releaseContext')
        data = await getHostingReleaseContext(input as HostingOperations['releaseContext']['input'], gitService, service);
      else if (operation === 'uploadAsset') {
        const params = input as HostingOperations['uploadAsset']['input'];
        releaseSafety.authorizeUpload(event.sender.id, params);
        const file = getAuthorizedSelectedFile(event.sender.id, params.filePath);
        if (!file) throw new Error('Select the asset through the file picker before uploading.');
        if (fs.statSync(file).size > MAX_TRANSFER_BYTES) throw new Error('This asset exceeds the 512 MiB upload limit.');
        const bytes = fs.readFileSync(file);
        releaseSafety.authorizeUpload(event.sender.id, params);
        data = await (await service.authenticatedAdapter(params.repository.connectionId)).uploadAsset({ ...params, filePath: file }, bytes);
      } else data = await service.request(operation, input as HostingOperations[typeof operation]['input']);
      return { success: true, data };
    } catch (error: unknown) {
      const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
      const code = (error as { code?: unknown })?.code;
      return {
        success: false,
        error: redactGitSensitiveText(error instanceof Error ? error.message : 'Hosting request failed.'),
        ...(status ? { status } : {}),
        ...(typeof code === 'string' && /^[a-z\d_-]{1,100}$/i.test(code) ? { code } : {}),
      };
    }
  });
}
