import type { GitService } from '../GitService';
import type { HostingConnection } from '../../src/types/hostingDtos';
import type { PublicationSelection, PublicationBranch, PublicationTag } from '../../src/types/repositoryPublication';
import type { Runner } from '../git/remoteTransferModels';
import { lines, digest } from '../git/remoteTransferModels';
import { remoteName, refName } from '../git/remoteTransferValidation';
import { remoteConfigurationFingerprint, readRemoteSnapshot } from '../git/remoteSnapshot';
import type { RemotePreferencesStore } from '../git/RemotePreferencesStore';
import { createRemoteSelectionSnapshot } from '../../src/shared/git/remoteTransferSelection';
import type { StoredPublication } from './RepositoryPublicationStore';

export const publicationAccountKey = (c: HostingConnection) => digest([c.id, c.provider, c.baseUrl, c.apiBaseUrl, c.userId, c.username]);
export type PublicationGit = Pick<Runner, 'run'> & Partial<Pick<Runner, 'runResult'>>;
export const publicationReader = (git: PublicationGit): Pick<Runner, 'run' | 'runResult'> => ({
  run: git.run.bind(git),
  runResult:
    git.runResult?.bind(git) ??
    (async (cwd, args, options) => {
      try {
        return { stdout: await git.run(cwd, args, options), stderr: '', exitCode: 0 };
      } catch (error) {
        if (options?.signal?.aborted) throw error;
        return { stdout: '', stderr: String(error), exitCode: 1 };
      }
    }),
});
export async function publicationGitContext(repoPath: string, git: Runner) {
  const snapshot = await readRemoteSnapshot(repoPath, git, false);
  const parse = (output: string) =>
    lines(output).map((line) => {
      const [name, oid] = line.split('\t');
      return { name, oid };
    });
  const branches = parse(await git.run(repoPath, ['for-each-ref', '--format=%(refname:strip=2)%09%(objectname)', 'refs/heads/']));
  const tags = parse(await git.run(repoPath, ['for-each-ref', '--format=%(refname:strip=2)%09%(objectname)', 'refs/tags/']));
  const entries = (await git.run(repoPath, ['status', '--porcelain=v1', '-z'])).split('\0').filter(Boolean);
  let dirtyFiles = 0;
  for (let i = 0; i < entries.length; i++) {
    dirtyFiles++;
    if (/[RC]/.test(entries[i].slice(0, 2))) i++;
  }
  return { snapshot, branches, tags, dirtyFiles };
}
export async function countPublicationCommits(repoPath: string, refs: { branches: PublicationBranch[]; tags: PublicationTag[] }, git: Runner) {
  const commits = refs.branches.map((b) => b.sourceOid);
  for (const tag of refs.tags) {
    const commit = await git.runResult(repoPath, ['rev-parse', '--verify', `${tag.oid}^{commit}`]);
    if (commit.exitCode === 0) commits.push(commit.stdout.trim());
  }
  return commits.length ? Number((await git.run(repoPath, ['rev-list', '--count', ...commits, '--'])).trim()) : 0;
}
export async function capturePublicationRefs(selection: PublicationSelection, git: PublicationGit) {
  if (!Array.isArray(selection.branches) || selection.branches.length > 64 || !Array.isArray(selection.tagNames) || selection.tagNames.length > 64)
    throw new Error('Select at most 64 branches and 64 tags.');
  const branches: PublicationBranch[] = [];
  for (const entry of selection.branches) {
    const sourceBranch = refName(entry.sourceBranch),
      destinationBranch = refName(entry.destinationBranch);
    await git.run(selection.repoPath, ['check-ref-format', `refs/heads/${sourceBranch}`]);
    await git.run(selection.repoPath, ['check-ref-format', `refs/heads/${destinationBranch}`]);
    if (branches.some((b) => b.destinationBranch === destinationBranch)) throw new Error('A destination branch may be selected only once.');
    const sourceOid = (await git.run(selection.repoPath, ['rev-parse', '--verify', `refs/heads/${sourceBranch}^{commit}`])).trim();
    branches.push({ sourceBranch, destinationBranch, sourceOid });
  }
  const tags: PublicationTag[] = [];
  for (const name of [...new Set(selection.tagNames)]) {
    const safe = refName(name);
    await git.run(selection.repoPath, ['check-ref-format', `refs/tags/${safe}`]);
    const oid = (await git.run(selection.repoPath, ['rev-parse', '--verify', `refs/tags/${safe}`])).trim();
    tags.push({ name: safe, oid });
  }
  if (!branches.length && tags.length) throw new Error('Select the main branch before publishing tags.');
  const head = await publicationReader(git).runResult(selection.repoPath, ['rev-parse', '--verify', 'HEAD']);
  if (head.exitCode === 0 && !branches.length) throw new Error('Choose a local branch before publication.');
  return { branches, tags };
}
export async function assertPublicationRefs(record: StoredPublication, git: PublicationGit) {
  const reader = publicationReader(git);
  const branch = await reader.runResult(record.selection.repoPath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const head = await reader.runResult(record.selection.repoPath, ['rev-parse', '--verify', 'HEAD']);
  if ((branch.exitCode === 0 ? branch.stdout.trim() : '') !== record.preparedBranch || (head.exitCode === 0 ? head.stdout.trim() : '') !== record.preparedHead)
    throw new Error('The current branch or commit changed. Review the publication before continuing.');
  const current = await capturePublicationRefs(record.selection, git);
  if (JSON.stringify(current) !== JSON.stringify({ branches: record.branches, tags: record.tags }))
    throw new Error('A selected branch or tag changed. Review the publication before continuing.');
}
export const publicationFingerprint = (repoPath: string, git: PublicationGit, prefs: RemotePreferencesStore) =>
  remoteConfigurationFingerprint(repoPath, publicationReader(git), prefs.read(repoPath));

export function publicationPreferences(
  record: StoredPublication,
  preferences: ReturnType<RemotePreferencesStore['read']>,
  snapshot: Awaited<ReturnType<typeof readRemoteSnapshot>>,
) {
  const next = {
    ...preferences,
    bindings: [
      ...(preferences.bindings ?? []).filter((b) => b.remoteName !== record.selection.remoteName),
      {
        remoteName: record.selection.remoteName,
        url: record.remoteUrl!,
        repository: record.repository!.ref,
        credentialMode: record.selection.credentialMode === 'system' ? ('system' as const) : ('hosting' as const),
      },
    ],
  };
  if (!record.initialRemoteCount || record.selection.makePrimary) {
    next.hostingRemote = record.selection.remoteName;
    next.hostingRepository = record.repository!.ref;
    next.fetchRemote = record.selection.remoteName;
    next.pullRemote = record.selection.remoteName;
    next.pushRemotes = [record.selection.remoteName];
    next.activeProfileId = undefined;
    next.selectionModes = { fetch: 'remember', pull: 'remember', push: 'remember' };
    next.selectionSnapshots = Object.fromEntries(
      (['fetch', 'pull', 'push'] as const).map((action) => [action, createRemoteSelectionSnapshot(action, snapshot, next, [record.selection.remoteName])]),
    );
    next.pullBranches = { ...next.pullBranches, ...Object.fromEntries(record.branches.map((b) => [b.sourceBranch, b.destinationBranch])) };
    next.pushBranches = {
      ...next.pushBranches,
      ...Object.fromEntries(
        record.branches.map((b) => [b.sourceBranch, { ...next.pushBranches?.[b.sourceBranch], [record.selection.remoteName]: b.destinationBranch }]),
      ),
    };
  }
  return next;
}
export async function connectPublicationGit(
  record: StoredPublication,
  gitService: GitService,
  preferences: RemotePreferencesStore,
  current: () => void,
  signal: AbortSignal,
) {
  await gitService.runner.withExclusiveWrite(
    record.selection.repoPath,
    'hosting-publication-connect',
    async (git) => {
      current();
      const repoPath = record.selection.repoPath,
        name = remoteName(record.selection.remoteName);
      await assertPublicationRefs(record, git);
      if ((await publicationFingerprint(repoPath, git, preferences)) !== record.fingerprint)
        throw new Error('Remote configuration changed. Review the publication again.');
      const snapshot = await readRemoteSnapshot(repoPath, publicationReader(git), false);
      if (snapshot.remotes.some((r) => r.name === name)) throw new Error('This remote name is already in use. Existing remotes are preserved.');
      await git.run(repoPath, ['remote', 'add', '--', name, record.remoteUrl!], { signal });
      try {
        current();
        const fresh = await readRemoteSnapshot(repoPath, publicationReader(git), false);
        // Primary defaults are applied only after verified upload. Binding is needed by the credential broker now.
        const next = {
          ...preferences.read(repoPath),
          bindings: [
            ...(preferences.read(repoPath).bindings ?? []),
            {
              remoteName: name,
              url: record.remoteUrl!,
              repository: record.repository!.ref,
              credentialMode: record.selection.credentialMode === 'system' ? ('system' as const) : ('hosting' as const),
            },
          ],
        };
        preferences.write(repoPath, record.branches.length ? next : publicationPreferences(record, next, fresh));
        record.fingerprint = await publicationFingerprint(repoPath, git, preferences);
      } catch (error) {
        await git.run(repoPath, ['remote', 'remove', '--', name]);
        throw error;
      }
    },
    signal,
  );
}
