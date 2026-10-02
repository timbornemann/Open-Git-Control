import type { GitHubReleaseTargetDto } from '../../src/types/githubDtos';

export type ReleaseGitRead = (args: string[], network?: boolean) => Promise<string>;
export type ReleaseTargetState = Omit<GitHubReleaseTargetDto, 'inspectionId'> & {
  fetchUrl: string;
  pushUrls: string[];
  head: string;
  currentBranch: string;
};

export const normalizeReleaseRevision = (value: unknown, label: string): string => {
  const revision = String(value || '').trim();
  if (!revision || revision.length > 255 || revision.startsWith('-') || /[\0\r\n]/.test(revision)) throw new Error(`Invalid ${label}.`);
  return revision;
};

const parseRefs = (raw: string): Map<string, string> => {
  const refs = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{40,64})\s+(refs\/\S+)$/);
    if (match) refs.set(match[2], match[1]);
  }
  return refs;
};

export async function localReleaseCommit(git: ReleaseGitRead, ref: string): Promise<string | null> {
  const refs = parseRefs(await git(['for-each-ref', '--format=%(objectname) %(refname)', ref]));
  return refs.has(ref) ? (await git(['rev-parse', '--verify', `${ref}^{commit}`])).trim() : null;
}

export async function remoteReleaseRefs(git: ReleaseGitRead, url: string, refs: string[]): Promise<Map<string, string>> {
  return parseRefs(await git(['ls-remote', '--', url, ...refs], true));
}

async function compareReleaseBranch(git: ReleaseGitRead, fetchUrl: string, branch: string | null, localSha: string | null, remoteSha: string | null) {
  if (!branch || !localSha || localSha === remoteSha) return { ahead: 0, behind: 0 };
  if ((await git(['rev-parse', '--is-shallow-repository'])).trim() === 'true') {
    throw new Error('Die unvollständige lokale Historie erlaubt keine sichere Release-Prüfung. Bitte die Historie zuerst vollständig laden.');
  }
  if (!remoteSha) {
    const ahead = Number((await git(['rev-list', '--count', localSha])).trim());
    if (!Number.isSafeInteger(ahead) || ahead < 1) throw new Error('Commit-Vergleich fehlgeschlagen.');
    return { ahead, behind: 0 };
  }
  const objectType = await git(['cat-file', '-t', remoteSha]).catch(() => '');
  if (objectType.trim() !== 'commit') {
    const branchRef = `refs/heads/${branch}`;
    await git(
      ['fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', '--no-auto-maintenance', '--refmap=', '--', fetchUrl, branchRef],
      true,
    );
    const updated = await remoteReleaseRefs(git, fetchUrl, [branchRef]);
    if (updated.get(branchRef) !== remoteSha) throw new Error('Der entfernte Branch wurde geändert. Bitte den Release erneut prüfen.');
  }
  const counts = (await git(['rev-list', '--left-right', '--count', `${localSha}...${remoteSha}`])).trim().split(/\s+/).map(Number);
  if (counts.length !== 2 || counts.some((count) => !Number.isSafeInteger(count) || count < 0)) throw new Error('Commit-Vergleich fehlgeschlagen.');
  return { ahead: counts[0], behind: counts[1] };
}

async function resolveExplicitReleaseTarget(
  git: ReleaseGitRead,
  target: string,
  localSha: string | null,
  remoteSha: string | null,
  resolvePublishedCommit: (ref: string) => Promise<string | null>,
) {
  if (localSha && !remoteSha) throw new Error('Der gewählte Tag ist auf GitHub nicht verfügbar. Bitte zuerst manuell pushen.');
  if (localSha && remoteSha !== localSha) throw new Error('Lokaler und entfernter Ziel-Tag zeigen auf unterschiedliche Commits.');
  // Resolve local revision expressions and abbreviated hashes locally first.
  // Resolving HEAD~1 against GitHub's default branch could select other code.
  const localTarget = (await git(['rev-parse', '--revs-only', '--end-of-options', `${target}^{commit}`])).trim();
  if (localTarget && !/^[a-f0-9]{40,64}$/.test(localTarget)) throw new Error('Invalid release commit.');
  localSha ||= localTarget || null;
  const published = await resolvePublishedCommit(remoteSha || localSha || target);
  if (!published) throw new Error('Der gewählte Commit oder Tag ist auf GitHub nicht verfügbar. Bitte zuerst manuell pushen.');
  localSha ||= published;
  if (localSha !== published) throw new Error('Lokaler und entfernter Ziel-Tag zeigen auf unterschiedliche Commits.');
  return { localSha, remoteSha: published };
}

export async function inspectReleaseTargetState(
  git: ReleaseGitRead,
  requestedTarget: string | undefined,
  matchesRepository: (url: string) => boolean,
  resolvePublishedCommit: (ref: string) => Promise<string | null>,
): Promise<ReleaseTargetState> {
  const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
  const currentBranch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const target = normalizeReleaseRevision(requestedTarget || (currentBranch === 'HEAD' ? head : currentBranch), 'release target');
  const fetchUrl = (await git(['remote', 'get-url', 'origin'])).trim();
  if (!matchesRepository(fetchUrl)) throw new Error('Release target does not match the active repository origin.');
  const pushUrls = (await git(['remote', 'get-url', '--push', '--all', 'origin'])).trim().split(/\r?\n/).filter(Boolean);
  const name = target.replace(/^refs\/(heads|tags)\//, '');
  const branchRef = `refs/heads/${name}`;
  const tagRef = `refs/tags/${name}`;
  const refs = await remoteReleaseRefs(git, fetchUrl, [branchRef, tagRef, `${tagRef}^{}`]);
  const localBranch = target.startsWith('refs/tags/') ? null : await localReleaseCommit(git, branchRef);
  const remoteBranch = target.startsWith('refs/tags/') ? null : (refs.get(branchRef) ?? null);
  if (target.startsWith('refs/heads/') && !localBranch && !remoteBranch) throw new Error('Der gewählte Ziel-Branch ist lokal und auf GitHub nicht vorhanden.');
  const isBranch = Boolean(localBranch || remoteBranch);
  const targetBranch = isBranch ? name : null;
  const localTag = isBranch ? null : await localReleaseCommit(git, tagRef);
  let localSha = localBranch || localTag;
  let remoteSha = isBranch ? remoteBranch : refs.get(`${tagRef}^{}`) || refs.get(tagRef) || null;
  if (!isBranch) {
    ({ localSha, remoteSha } = await resolveExplicitReleaseTarget(git, target, localSha, remoteSha, resolvePublishedCommit));
  }

  const { ahead, behind } = await compareReleaseBranch(git, fetchUrl, targetBranch, localSha, remoteSha);
  let pushBlockedReason: string | null = null;
  if (!targetBranch || !localSha) pushBlockedReason = 'Nur ein vorhandener lokaler Ziel-Branch kann hier hochgeladen werden.';
  else if (!pushUrls.length || pushUrls.some((url) => !matchesRepository(url)))
    pushBlockedReason = 'Die Push-URLs passen nicht zum Release-Repository. Bitte die Remote-Konfiguration prüfen.';
  else if (ahead > 0 && behind > 0) pushBlockedReason = 'Lokale und entfernte Historie sind auseinander gelaufen. Bitte zuerst manuell synchronisieren.';
  const state = {
    target,
    targetBranch,
    localSha,
    remoteSha,
    ahead,
    behind,
    canPush: ahead > 0 && !pushBlockedReason,
    canReleaseRemote: Boolean(remoteSha),
    pushBlockedReason,
    fetchUrl,
    pushUrls,
    head,
    currentBranch,
  };
  if ((await git(['rev-parse', '--verify', 'HEAD'])).trim() !== head || (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim() !== currentBranch) {
    throw new Error('Der lokale Repository-Zustand wurde geändert. Bitte den Release erneut prüfen.');
  }
  return state;
}

export async function validatePublishedReleaseTag(git: ReleaseGitRead, state: ReleaseTargetState, tagName: string, sha: string): Promise<void> {
  const ref = `refs/tags/${tagName}`;
  const local = await localReleaseCommit(git, ref);
  if (local && local !== sha)
    throw new Error(`Local tag "${tagName}" points to a different commit than the release target. Delete or move the local tag, or use a new tag name.`);
  const refs = await remoteReleaseRefs(git, state.fetchUrl, [ref, `${ref}^{}`]);
  const remote = refs.get(`${ref}^{}`) || refs.get(ref);
  if (remote && remote !== sha)
    throw new Error(
      `Remote tag "${tagName}" points to a different commit than the release target. Refresh the repository and align the tag, or use a new tag name.`,
    );
}

export const releasePushArgs = (state: ReleaseTargetState): string[] => [
  '--porcelain',
  '--no-follow-tags',
  '--recurse-submodules=no',
  '--',
  // Use the configured remote after validating every effective push URL.
  // Passing an expanded URL instead would apply Git's URL rewrites twice.
  'origin',
  `${state.localSha}:refs/heads/${state.targetBranch}`,
];

export async function assertReleaseTargetUnchanged(git: ReleaseGitRead, state: ReleaseTargetState, publishedSha: string): Promise<void> {
  const head = (await git(['rev-parse', '--verify', 'HEAD'])).trim();
  const branch = (await git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  const local = state.targetBranch ? await localReleaseCommit(git, `refs/heads/${state.targetBranch}`) : state.localSha;
  const fetchUrl = (await git(['remote', 'get-url', 'origin'])).trim();
  const pushUrls = (await git(['remote', 'get-url', '--push', '--all', 'origin'])).trim().split(/\r?\n/).filter(Boolean);
  if (
    head !== state.head ||
    branch !== state.currentBranch ||
    local !== state.localSha ||
    fetchUrl !== state.fetchUrl ||
    JSON.stringify(pushUrls) !== JSON.stringify(state.pushUrls)
  ) {
    throw new Error('Der lokale Release-Zustand wurde geändert. Bitte den Release erneut prüfen.');
  }
  if (state.targetBranch) {
    const ref = `refs/heads/${state.targetBranch}`;
    const remote = await remoteReleaseRefs(git, fetchUrl, [ref]);
    if (remote.get(ref) !== publishedSha) throw new Error('Der entfernte Release-Zustand wurde geändert. Bitte den Release erneut prüfen.');
  }
}
