import type { GitPushTargetDto } from '../../src/types/remoteTransfers';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { SecretScanPushScopeDto } from '../../src/types/secretScan';
import { redactGitSensitiveText } from './GitErrorFormatter';
import type { PublishedRef } from './remotePushResults';
import { digest, displayUrl, lines, type RemoteTransferContext, type Runner } from './remoteTransferModels';

/** Main-owned reachability proof. Renderer-supplied exclusions are never accepted. */
export type PushSecretScanScope = {
  historyCommits: string[];
  tagCommits: string[];
  summary: SecretScanPushScopeDto;
  notes: string[];
  historyScanIncomplete?: boolean;
  assertCurrent: () => Promise<void>;
};

type Dependencies = {
  repoPath: string;
  refs: PublishedRef[];
  targets: GitPushTargetDto[];
  git: Runner;
  context: RemoteTransferContext;
  validatePlan: () => Promise<unknown>;
  advertise: (target: GitPushTargetDto) => Promise<string>;
};

const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const localEnvironment = { GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' };

function advertisedRefs(raw: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of lines(raw)) {
    const [oid, ref, extra] = line.split('\t');
    if (!objectId.test(oid) || !/^refs\/(?:heads|tags)\/[^\s\0]+$/.test(ref ?? '') || extra !== undefined)
      throw new Error('The server returned an invalid ref advertisement.');
    if (refs.has(ref) && refs.get(ref) !== oid) throw new Error('The server returned conflicting ref advertisements.');
    refs.set(ref, oid.toLowerCase());
  }
  for (const ref of refs.keys()) {
    if (ref.endsWith('^{}') && (!ref.startsWith('refs/tags/') || !refs.has(ref.slice(0, -3))))
      throw new Error('The server returned a tag without its original ref.');
  }
  return refs;
}

const advertisementKey = (refs: Map<string, string>) => digest([...refs].sort(([left], [right]) => left.localeCompare(right)));
const advertisedObjects = (refs: Map<string, string>) => [...new Set([...refs].filter(([ref]) => !refs.has(`${ref}^{}`)).map(([, oid]) => oid))];

async function commitBases(dependencies: Dependencies, oids: string[]): Promise<string[]> {
  if (!oids.length) return [];
  const { git, repoPath, context } = dependencies;
  context.ensureActive();
  const raw = await git.runWithInput(repoPath, ['cat-file', '--batch-check=%(objectname) %(objecttype)'], `${oids.join('\n')}\n`, {
    envOverrides: localEnvironment,
  });
  context.ensureActive();
  const entries = lines(raw);
  if (entries.length !== oids.length) throw new Error('The remote commit objects could not be verified locally.');
  const commits: string[] = [];
  for (let index = 0; index < oids.length; index++) {
    const [oid, type] = entries[index].split(' ');
    if (oid !== oids[index] || !['commit', 'blob', 'tree'].includes(type))
      throw new Error('At least one remote history object is unavailable locally. Fetch the selected endpoint to enable an incremental scan.');
    // Tags can legitimately refer to blobs or trees; these exclude no commits.
    if (type === 'commit') commits.push(oid);
  }
  return commits;
}

async function outgoingCommits(dependencies: Dependencies, sources: string[], bases: string[]): Promise<string[]> {
  if (!sources.length) return [];
  const { git, repoPath, context } = dependencies;
  context.ensureActive();
  // stdin keeps even very large advertisements below Windows' argument limit.
  const revisions = [...new Set(sources), ...bases.map((oid) => `^${oid}`)];
  const raw = await git.runWithInput(repoPath, ['rev-list', '--reverse', '--topo-order', '--stdin'], `${revisions.join('\n')}\n`, {
    envOverrides: localEnvironment,
  });
  context.ensureActive();
  const commits = lines(raw);
  if (commits.some((oid) => !objectId.test(oid))) throw new Error('The complete push history could not be determined.');
  return commits;
}

async function shallowBoundaries(dependencies: Dependencies): Promise<Set<string>> {
  const { git, repoPath, context } = dependencies;
  const file = (await git.run(repoPath, ['rev-parse', '--git-path', 'shallow'], { signal: context.signal })).trim();
  const boundaries = lines(await readFile(resolve(repoPath, file), 'utf8'));
  context.ensureActive();
  if (!boundaries.length || boundaries.some((oid) => !objectId.test(oid))) throw new Error('The shallow history boundary could not be verified.');
  return new Set(boundaries);
}

export async function readPushSecretScanScope(dependencies: Dependencies): Promise<PushSecretScanScope> {
  const { repoPath, refs, targets, git, context, advertise, validatePlan } = dependencies;
  await validatePlan();
  const sourceCommits: { oid: string; tag: boolean }[] = [];
  for (const ref of refs) {
    const oid = (
      await git.run(repoPath, ['rev-parse', '--verify', `${ref.sourceOid}^{commit}`], { envOverrides: localEnvironment, signal: context.signal })
    ).trim();
    if (!objectId.test(oid)) throw new Error('The selected push source does not reference a readable commit.');
    sourceCommits.push({ oid, tag: ref.destinationRef.startsWith('refs/tags/') });
  }
  context.ensureActive();
  const shallow = (await git.run(repoPath, ['rev-parse', '--is-shallow-repository'], { signal: context.signal })).trim() === 'true';
  const boundaries = shallow ? await shallowBoundaries(dependencies) : new Set<string>();
  const branchSources = sourceCommits.filter((source) => !source.tag).map((source) => source.oid);
  const tagSources = sourceCommits.filter((source) => source.tag).map((source) => source.oid);
  const historyCommits = new Set<string>();
  const tagCommits = new Set<string>();
  const fallbackReasons: string[] = [];
  const verified: { target: GitPushTargetDto; key: string }[] = [];
  let fullHistory: { branch: string[]; tags: string[] } | undefined;
  let historyScanIncomplete = false;
  for (const target of targets) {
    let branch: string[];
    let tags: string[];
    try {
      const advertised = advertisedRefs(await advertise(target));
      context.ensureActive();
      const objects = advertisedObjects(advertised);
      // An exact advertised commit proves synchronization even if other remote
      // branches have objects that this local clone has never fetched.
      if (sourceCommits.every((source) => objects.includes(source.oid))) {
        branch = [];
        tags = [];
      } else {
        const bases = await commitBases(dependencies, objects);
        branch = await outgoingCommits(dependencies, branchSources, bases);
        tags = await outgoingCommits(dependencies, tagSources, bases);
        if ([...branch, ...tags].some((oid) => boundaries.has(oid)))
          throw new Error('The missing commits include an incomplete history boundary (shallow clone).');
      }
      verified.push({ target, key: advertisementKey(advertised) });
    } catch (error) {
      context.ensureActive();
      context.signal?.throwIfAborted();
      if ((error as Error)?.name === 'AbortError') throw error;
      const reason = redactGitSensitiveText(error instanceof Error ? error.message : 'The current remote history could not be verified.');
      fallbackReasons.push(`Full history scan for ${target.remoteName} (${displayUrl(target.url)}): ${reason}`);
      fullHistory ??= {
        branch: await outgoingCommits(dependencies, branchSources, []),
        tags: await outgoingCommits(dependencies, tagSources, []),
      };
      branch = fullHistory.branch;
      tags = fullHistory.tags;
      if ([...branch, ...tags].some((oid) => boundaries.has(oid))) {
        historyScanIncomplete = true;
        fallbackReasons.push('The full history is unavailable in this shallow clone. Fetch the missing history before pushing.');
      }
    }
    branch.forEach((oid) => historyCommits.add(oid));
    tags.forEach((oid) => tagCommits.add(oid));
  }
  for (const oid of historyCommits) tagCommits.delete(oid);
  const totalCommits = historyCommits.size + tagCommits.size;
  await validatePlan();
  return {
    historyCommits: [...historyCommits],
    tagCommits: [...tagCommits],
    summary: {
      mode: fallbackReasons.length ? (verified.length ? 'mixed' : 'full') : 'incremental',
      endpointCount: targets.length,
      totalCommits,
      fallbackReasons,
    },
    notes: [
      ...fallbackReasons,
      totalCommits
        ? `Checking ${totalCommits} distinct commit(s) for ${targets.length} selected push endpoint(s).`
        : 'No new commits at the selected push endpoints; the history scan was skipped.',
    ],
    historyScanIncomplete: historyScanIncomplete || undefined,
    assertCurrent: async () => {
      await validatePlan();
      for (const { target, key } of verified) {
        if (advertisementKey(advertisedRefs(await advertise(target))) !== key)
          throw new Error('Remote history changed after the secret scan. Run the secret scan again before pushing.');
        context.ensureActive();
      }
      await validatePlan();
    },
  };
}
