import { setImmediate } from 'node:timers/promises';
import type { GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import type { GitRunOptions } from './GitProcessTypes';
import { classifyLfsObjectBatches, gitObjectId, readLfsObjectInfo, type LfsBlob, type LfsObjectReader } from './GitLfsPointers';
import { physicalPathKey, repositoryCommonDirectory } from './RepositoryCommonDirectory';
import { lfsHistoryContext, lfsInventoryOptions } from './GitLfsInventoryContext';
import {
  lfsInventoryDocument,
  lfsInventoryHash,
  MAX_LFS_CACHE_BYTES,
  MAX_LFS_CACHE_OBJECTS,
  MAX_LFS_SNAPSHOTS,
  type LfsInventoryPayload,
  type LfsInventorySnapshot,
} from './GitLfsInventoryFormat';
import type { GitLfsInventoryStore } from './GitLfsInventoryStore';

type State = {
  namespace: string;
  context?: string;
  objects: Map<string, GitLfsPointer | null>;
  snapshots: Map<string, LfsInventorySnapshot>;
  store?: GitLfsInventoryStore;
  loaded: boolean;
  pending: Promise<void>;
  users: number;
  requests: Set<{ controller: AbortController; background: boolean; key: string }>;
};
type Transaction = Pick<State, 'namespace' | 'objects' | 'snapshots'> & { context: string; dirty: boolean };
const objectLines = (data: Buffer): string[] => {
  const result = data.toString().trim().split('\n').filter(Boolean);
  if (result.some((oid) => !gitObjectId.test(oid))) throw new Error('Invalid Git LFS inventory response.');
  return [...new Set(result)];
};
function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Complete historical inventories, shared by worktrees and extended only through proven ancestor snapshots. */
export class GitLfsInventory {
  private readonly repositories = new Map<string, State>();
  constructor(private readonly createStore?: (namespace: string) => GitLfsInventoryStore) {}

  async read(repoPath: string, refs: string[], git: LfsObjectReader, requestedOptions: GitRunOptions = {}): Promise<GitLfsPointer[]> {
    requestedOptions.signal?.throwIfAborted();
    if (!refs.length) return [];
    if (refs.some((oid) => !gitObjectId.test(oid))) throw new Error('Invalid Git LFS source revision.');
    const common = repositoryCommonDirectory(repoPath);
    const namespace = lfsInventoryHash(physicalPathKey(common ?? repoPath));
    let state = this.repositories.get(namespace);
    if (!state) {
      state = {
        namespace,
        objects: new Map(),
        snapshots: new Map(),
        store: this.createStore?.(namespace),
        loaded: false,
        pending: Promise.resolve(),
        users: 0,
        requests: new Set(),
      };
    }
    this.repositories.delete(namespace);
    this.repositories.set(namespace, state);
    state.users++;
    const current = state;
    const request = {
      controller: new AbortController(),
      background: ['background', 'preflight'].includes(requestedOptions.requestedKind ?? ''),
      key: [...refs].sort().join('\n'),
    };
    // An unrelated idle inventory must not hold a foreground push behind other
    // branches/tags. Matching work can finish and its complete snapshot is reused.
    if (!request.background) for (const pending of current.requests) if (pending.background && pending.key !== request.key) pending.controller.abort();
    current.requests.add(request);
    const signal = AbortSignal.any([request.controller.signal, ...(requestedOptions.signal ? [requestedOptions.signal] : [])]);
    const work = current.pending.then(() => this.scan(repoPath, common, refs, git, lfsInventoryOptions({ ...requestedOptions, signal }), current));
    current.pending = work
      .then(
        () => undefined,
        () => undefined,
      )
      .finally(() => {
        current.users--;
        current.requests.delete(request);
        this.trimRepositories();
      });
    return abortable(work, requestedOptions.signal);
  }

  private trimRepositories() {
    for (const [key, entry] of this.repositories) {
      if (this.repositories.size <= 4) break;
      if (!entry.users) this.repositories.delete(key);
    }
  }

  private async scan(repo: string, common: string | null, refs: string[], git: LfsObjectReader, options: GitRunOptions, state: State) {
    options.signal?.throwIfAborted();
    if (!state.loaded) {
      const saved = await state.store?.load();
      if (saved) {
        state.context = saved.context;
        state.objects = new Map(saved.objects);
        state.snapshots = new Map(saved.snapshots.map((snapshot) => [snapshot.root, snapshot]));
      }
      state.loaded = true;
    }
    const context = await lfsHistoryContext(common, options);
    const reusable = context !== undefined && context === state.context;
    const transaction: Transaction = {
      namespace: state.namespace,
      context: context ?? '',
      objects: reusable ? new Map(state.objects) : new Map(),
      snapshots: reusable ? new Map(state.snapshots) : new Map(),
      dirty: false,
    };
    const resolved = await readLfsObjectInfo(
      repo,
      [...new Set(refs)].map((oid) => `${oid}^{}`),
      git,
      options,
    );
    const roots = new Map<string, 'commit' | 'tree' | 'blob'>();
    for (const info of resolved) {
      if (!info || info.type === 'tag') throw new Error('Invalid Git LFS source revision.');
      roots.set(info.oid, info.type);
    }
    const independent = [...roots.keys()].every((root) => transaction.snapshots.has(root))
      ? [...roots.keys()]
      : await this.independentRoots(repo, roots, git, options);
    const byOid = new Map<string, GitLfsPointer>();
    for (const root of independent) {
      const inventory = await this.rootInventory(repo, root, roots.get(root)!, git, options, transaction);
      for (const { pointer } of inventory) {
        const existing = byOid.get(pointer.oid);
        if (existing && existing.size !== pointer.size) throw new Error('Conflicting Git LFS object sizes.');
        byOid.set(pointer.oid, pointer);
      }
    }
    options.signal?.throwIfAborted();
    if (context !== (await lfsHistoryContext(common, options)))
      throw new Error('Repository history changed while inspecting Git LFS objects. Try the push again.');
    if (context !== undefined) {
      if (transaction.dirty) {
        const document = this.boundedDocument(transaction);
        await state.store?.save(document, options.signal);
      }
      options.signal?.throwIfAborted();
      state.context = context;
      state.objects = transaction.objects;
      state.snapshots = transaction.snapshots;
      state.store?.used();
    }
    return [...byOid.values()].sort((a, b) => a.oid.localeCompare(b.oid)).map((pointer) => ({ ...pointer }));
  }

  private async independentRoots(repo: string, roots: Map<string, string>, git: LfsObjectReader, options: GitRunOptions): Promise<string[]> {
    const commits = [...roots].filter(([, kind]) => kind === 'commit').map(([oid]) => oid);
    if (commits.length < 2) return [...roots.keys()];
    const independent = objectLines(
      await git.runBuffer(repo, ['merge-base', '--independent', ...commits], {
        ...options,
        maxBytes: 65536,
        tooLargeMessage: 'Too many Git LFS source revisions.',
      }),
    );
    if (!independent.length || independent.some((oid) => !commits.includes(oid))) throw new Error('Invalid Git LFS source ancestry.');
    return [...independent, ...[...roots].filter(([, kind]) => kind !== 'commit').map(([oid]) => oid)];
  }

  private async ancestorBases(repo: string, root: string, git: LfsObjectReader, options: GitRunOptions, transaction: Transaction) {
    const candidates = [...transaction.snapshots.values()].filter((snapshot) => snapshot.kind === 'commit');
    if (!candidates.length) return [];
    const present = await readLfsObjectInfo(
      repo,
      candidates.map((snapshot) => snapshot.root),
      git,
      options,
      true,
    );
    const available = candidates.filter((snapshot, index) => {
      if (present[index]?.type === 'commit') return true;
      transaction.snapshots.delete(snapshot.root);
      return false;
    });
    if (!available.length) return [];
    // Only this commit walk may exclude unrelated cached heads. Excluding their
    // objects would also hide blobs reused by a different, selected history.
    const graph = await git.runBuffer(repo, ['rev-list', '--boundary', '--stdin'], {
      ...options,
      input: `${[root, ...available.map((snapshot) => `^${snapshot.root}`)].join('\n')}\n`,
      maxBytes: 16 * 1024 * 1024,
      tooLargeMessage: 'Git LFS ancestry exceeds its inventory limit.',
    });
    const lines = graph.toString().trim().split('\n').filter(Boolean);
    if (lines.some((line) => !gitObjectId.test(line.replace(/^-/, '')))) throw new Error('Invalid Git LFS source ancestry.');
    const boundaries = new Set(lines.filter((line) => line.startsWith('-')).map((line) => line.slice(1)));
    return available.filter((snapshot) => boundaries.has(snapshot.root));
  }

  private async rootInventory(
    repo: string,
    root: string,
    kind: LfsInventorySnapshot['kind'],
    git: LfsObjectReader,
    options: GitRunOptions,
    transaction: Transaction,
  ): Promise<LfsBlob[]> {
    options.signal?.throwIfAborted();
    const saved = transaction.snapshots.get(root);
    if (saved) {
      transaction.snapshots.delete(root);
      transaction.snapshots.set(root, saved);
      return saved.pointers;
    }
    let bases: LfsInventorySnapshot[] = [];
    if (kind === 'commit') {
      try {
        bases = await this.ancestorBases(repo, root, git, options, transaction);
      } catch {
        options.signal?.throwIfAborted(); /* A fresh object walk remains authoritative if an old base disappeared. */
      }
    }
    const pointers = new Map<string, GitLfsPointer>();
    for (const base of bases) for (const { blob, pointer } of base.pointers) pointers.set(blob, pointer);
    const objects = objectLines(
      await git.runBuffer(repo, ['rev-list', '--objects', '--no-object-names', '--stdin'], {
        ...options,
        input: `${[root, ...bases.map((base) => `^${base.root}`)].join('\n')}\n`,
        maxBytes: 64 * 1024 * 1024,
        tooLargeMessage: 'Git LFS object inventory exceeded its limit.',
      }),
    );
    if (!objects.includes(root)) throw new Error('Incomplete Git LFS object inventory.');
    const known = new Map<string, GitLfsPointer | null>();
    for (const oid of objects) {
      const value = transaction.objects.get(oid);
      if (value !== undefined) known.set(oid, value);
    }
    let classifiedCount = 0;
    const remember = async (values: Map<string, GitLfsPointer | null>) => {
      options.signal?.throwIfAborted();
      classifiedCount += values.size;
      for (const [oid, pointer] of values) {
        if (pointer) pointers.set(oid, pointer);
        transaction.objects.delete(oid);
        transaction.objects.set(oid, pointer);
        if (transaction.objects.size > MAX_LFS_CACHE_OBJECTS) transaction.objects.delete(transaction.objects.keys().next().value!);
      }
      await setImmediate();
    };
    await classifyLfsObjectBatches(
      repo,
      objects.filter((oid) => !known.has(oid)),
      git,
      options,
      remember,
    );
    await remember(known);
    if (classifiedCount !== objects.length) throw new Error('Incomplete Git LFS object classification.');
    const inventory = [...pointers].map(([blob, pointer]) => ({ blob, pointer }));
    if (inventory.length <= MAX_LFS_CACHE_OBJECTS) transaction.snapshots.set(root, { root, kind, pointers: inventory });
    while (transaction.snapshots.size > MAX_LFS_SNAPSHOTS) transaction.snapshots.delete(transaction.snapshots.keys().next().value!);
    transaction.dirty = true;
    return inventory;
  }

  private boundedDocument(transaction: Transaction) {
    const payload = (): LfsInventoryPayload => ({
      version: 1,
      namespace: transaction.namespace,
      context: transaction.context,
      objects: [...transaction.objects],
      snapshots: [...transaction.snapshots.values()],
    });
    let document = lfsInventoryDocument(payload());
    while (Buffer.byteLength(JSON.stringify(document)) > MAX_LFS_CACHE_BYTES) {
      if (transaction.snapshots.size > 1) transaction.snapshots.delete(transaction.snapshots.keys().next().value!);
      else if (transaction.objects.size) {
        const remove = Math.ceil(transaction.objects.size / 2);
        for (const key of [...transaction.objects.keys()].slice(0, remove)) transaction.objects.delete(key);
      } else transaction.snapshots.clear();
      document = lfsInventoryDocument(payload());
    }
    return document;
  }
}
