import { createHash } from 'node:crypto';
import type { Runner, RemoteTransferContext } from './remoteTransferModels';

const REF_FORMAT = '--format=%(refname)%00%(objectname)%00%(symref)%00';
const readRefs = (repoPath: string, git: Pick<Runner, 'runBuffer'>, signal?: AbortSignal, prefixes: string[] = []) =>
  git.runBuffer(repoPath, ['for-each-ref', '--sort=refname', REF_FORMAT, ...prefixes], {
    signal,
    maxBytes: 16 * 1024 * 1024,
    tooLargeMessage: 'Repository references exceed the remote sync limit.',
  });

/** Ref identity changes for moves, deletions, annotated tags and symbolic refs, never FETCH_HEAD or timestamps. */
export async function remoteSyncReferenceVersion(repoPath: string, git: Pick<Runner, 'runBuffer'>, signal?: AbortSignal): Promise<string> {
  return createHash('sha256')
    .update(await readRefs(repoPath, git, signal))
    .digest('hex');
}

/** Batch-create only missing tags. A racing local tag always wins; other write failures remain visible. */
export async function adoptMissingRemoteTags(repoPath: string, remote: string, git: Runner, context: RemoteTransferContext): Promise<void> {
  const prefix = `refs/ogc/remote-tags/${remote}/`;
  let previousCandidates: string[] = [];
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    context.ensureActive();
    const raw = await readRefs(repoPath, git, context.signal, ['refs/tags/', prefix]);
    const refs = new Map<string, string>();
    for (const line of raw.toString().split('\n').filter(Boolean)) {
      const [name, oid] = line.split('\0');
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(oid)) throw new Error('Invalid remote tag reference.');
      refs.set(name, oid);
    }
    const candidates = [...refs]
      .filter(([name]) => name.startsWith(prefix) && !refs.has(`refs/tags/${name.slice(prefix.length)}`))
      .map(([name, oid]) => [`refs/tags/${name.slice(prefix.length)}`, oid]);
    if (!candidates.length) return;
    // Retry only if another writer actually created one of our previous targets.
    if (attempt && !previousCandidates.some((name) => refs.has(name))) throw lastError;
    previousCandidates = candidates.map(([name]) => name);
    context.ensureActive();
    try {
      await git.runWithInput(repoPath, ['update-ref', '--stdin'], `${candidates.map(([name, oid]) => `create ${name} ${oid}`).join('\n')}\n`, {
        signal: context.signal,
      });
      return;
    } catch (error) {
      context.ensureActive();
      if (attempt === 2) throw error;
      lastError = error;
    }
  }
}
