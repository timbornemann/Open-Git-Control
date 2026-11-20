import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { assertManagedPathAsync, readStorageJsonAsync } from '../main-process/storageSafety';
import {
  branchReadOptions,
  branchRecoveryEnvironment,
  isMissing,
  recoveryDirectoryKey,
  recoveryOid,
  validLocalRef,
  type BranchRepository,
} from './branchRecoveryRepository';
import { cleanupPrivateTempDirAsync, createPrivateTempDir } from './PrivateTempFiles';
import { runCommitEditProcess } from './CommitEditProcess';
import type { GitRunner } from './GitRunner';

const manifestName = 'manifest.json';
const bundleName = 'branches.bundle';
export const branchBundleId = /^v1-[0-9]{13}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
export const branchBundleRepositoryKey = /^[0-9a-f]{64}$/;
const storageName = 'Open-Git-Control-Bundles';
export const emptyGitConfig = (directory: string) => path.join(directory, 'empty.gitconfig');
export const isolatedGitEnvironment = (directory: string): NodeJS.ProcessEnv => ({
  ...branchRecoveryEnvironment,
  GIT_CONFIG: undefined,
  GIT_CONFIG_COUNT: undefined,
  GIT_CONFIG_PARAMETERS: undefined,
  GIT_CONFIG_SYSTEM: emptyGitConfig(directory),
  GIT_CONFIG_GLOBAL: emptyGitConfig(directory),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TEMPLATE_DIR: undefined,
  GIT_DEFAULT_HASH: 'sha1',
  GIT_DEFAULT_REF_FORMAT: 'files',
});

export interface BranchBundle {
  directory: string;
  file: string;
  id: string;
  repositoryKey: string;
  repoPath: string | null;
  verifiedAt: number;
  bytes: number;
  identity: string;
  refs: Record<string, string>;
  digest: string;
  format: BranchRepository['format'];
}

function parseBundleRefs(raw: string, repo: BranchRepository): Record<string, string> {
  const refs: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    const space = line.indexOf(' ');
    const oid = line.slice(0, space);
    const ref = line.slice(space + 1);
    if (space === -1 || !validLocalRef(ref) || !recoveryOid(oid, repo.format) || Object.hasOwn(refs, ref)) throw new Error('Invalid bundle branch list.');
    refs[ref] = oid;
  }
  return refs;
}

export const sameBranchTips = (first: Record<string, string>, second: Record<string, string>): boolean =>
  Object.keys(first).length === Object.keys(second).length && Object.entries(first).every(([ref, oid]) => second[ref] === oid);

export function withinDirectory(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function readBranchTips(git: Pick<GitRunner, 'runResult'>, repo: BranchRepository, signal?: AbortSignal): Promise<Record<string, string>> {
  const result = await git.runResult(
    repo.repoPath,
    ['for-each-ref', '--format=%(objectname) %(refname)%00%(objecttype)', 'refs/heads/'],
    branchReadOptions({ requestedKind: 'preflight', signal }),
  );
  if (result.exitCode !== 0 || result.stderr.trim()) throw new Error(result.stderr.trim() || 'Local branches could not be read.');
  const lines = result.stdout.trimEnd().split(/\r?\n/).filter(Boolean);
  if (lines.some((line) => !line.endsWith('\0commit'))) throw new Error('A local branch does not point to a commit.');
  return parseBundleRefs(lines.map((line) => line.slice(0, -7)).join('\n'), repo);
}

async function digestFile(file: string, signal?: AbortSignal): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file, { signal })) digest.update(chunk);
  return digest.digest('hex');
}

export class BranchBundleStore {
  private readonly readers = new Map<string, number>();

  constructor(private readonly git: Pick<GitRunner, 'run' | 'runResult' | 'runWithInput'>) {}

  private async checkRoot(root: string) {
    const resolved = await fs.realpath(root);
    if (path.relative(root, resolved) || !(await fs.stat(resolved)).isDirectory()) throw new Error('The backup directory changed.');
    await assertManagedPathAsync(root, path.join(root, storageName));
  }

  private async repositoryDirectory(root: string, repo: BranchRepository): Promise<string> {
    await this.checkRoot(root);
    const directory = path.join(root, storageName, repo.key);
    if ([await fs.realpath(repo.repoPath), repo.commonDir, repo.gitDir].some((base) => withinDirectory(base, directory))) {
      throw new Error('The backup directory must be outside the repository.');
    }
    await assertManagedPathAsync(root, directory);
    return directory;
  }

  async versions(root: string, repo: BranchRepository): Promise<BranchBundle[]> {
    await this.repositoryDirectory(root, repo);
    return (await this.versionsByKey(root, repo.key)).filter((entry) => entry.format === repo.format);
  }

  async inventory(root: string, defaultDirectory: boolean): Promise<Map<string, BranchBundle[]>> {
    try {
      await this.checkRoot(root);
    } catch (error) {
      if (defaultDirectory && isMissing(error)) return new Map();
      throw error;
    }
    const directory = path.join(root, storageName);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const result = new Map<string, BranchBundle[]>();
    for (const entry of entries) {
      if (!entry.isDirectory() || !branchBundleRepositoryKey.test(entry.name)) continue;
      const versions = await this.versionsByKey(root, entry.name);
      if (versions.length) result.set(entry.name, versions);
    }
    return result;
  }

  async versionsByKey(root: string, key: string): Promise<BranchBundle[]> {
    if (!branchBundleRepositoryKey.test(key)) throw new Error('Invalid backup repository.');
    const directory = path.join(root, storageName, key);
    await assertManagedPathAsync(root, directory);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const bundles: BranchBundle[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !branchBundleId.test(entry.name)) continue;
      const current = path.join(directory, entry.name);
      const bundle = await readManagedBundle(root, current, key);
      if (bundle) bundles.push(bundle);
    }
    return bundles.sort((a, b) => b.verifiedAt - a.verifiedAt || b.id.localeCompare(a.id));
  }

  async withVerifiedBundle<T>(
    bundle: Pick<BranchBundle, 'directory' | 'file' | 'digest' | 'refs'>,
    repo: BranchRepository,
    signal: AbortSignal | undefined,
    consume: (directory: string, file: string) => Promise<T>,
  ): Promise<T> {
    const temporary = createPrivateTempDir('bundle-verification');
    this.readers.set(bundle.directory, (this.readers.get(bundle.directory) ?? 0) + 1);
    try {
      const file = path.join(temporary, bundleName);
      await assertManagedPathAsync(bundle.directory, bundle.file);
      await fs.copyFile(bundle.file, file);
      if ((await digestFile(file, signal)) !== bundle.digest) throw new Error('Bundle checksum does not match.');
      const verification = path.join(temporary, 'verify.git');
      await fs.mkdir(verification);
      await fs.writeFile(emptyGitConfig(temporary), '', { flag: 'wx', mode: 0o600 });
      const envOverrides = isolatedGitEnvironment(temporary);
      const run = (args: string[]) => runCommitEditProcess(verification, args, signal, envOverrides);
      await run(['init', '--bare', '--template=', ...(repo.format === 'sha256' ? ['--object-format=sha256'] : [])]);
      const listed = await this.git.runResult(verification, ['bundle', 'list-heads', file], { signal, envOverrides });
      if (listed.exitCode !== 0) throw new Error(listed.stderr.trim() || 'Could not read the bundle branch list.');
      const refs = parseBundleRefs(listed.stdout, repo);
      if (!sameBranchTips(refs, bundle.refs) || !Object.keys(refs).length) throw new Error('Bundle branch tips do not match its manifest.');
      await run(['bundle', 'verify', file]);
      await run(['bundle', 'unbundle', file]);
      await this.git.runWithInput(
        verification,
        ['update-ref', '--stdin'],
        Object.entries(refs)
          .map(([ref, oid]) => `create ${ref} ${oid}\n`)
          .join(''),
        {
          signal,
          envOverrides,
        },
      );
      await run(['fsck', '--full', '--no-dangling']);
      return await consume(verification, file);
    } finally {
      const readers = (this.readers.get(bundle.directory) ?? 1) - 1;
      if (readers) this.readers.set(bundle.directory, readers);
      else this.readers.delete(bundle.directory);
      await cleanupPrivateTempDirAsync(temporary);
    }
  }

  async create(root: string, repo: BranchRepository, refs: Record<string, string>, signal: AbortSignal): Promise<BranchBundle> {
    const directory = await this.repositoryDirectory(root, repo);
    const rootKey = await recoveryDirectoryKey(root);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const pending = path.join(directory, `.pending-${randomUUID()}`);
    await assertManagedPathAsync(root, pending);
    await fs.mkdir(pending, { mode: 0o700 });
    try {
      const file = path.join(pending, bundleName);
      await this.git.run(repo.repoPath, ['bundle', 'create', file, '--branches'], branchReadOptions({ signal, requestedKind: 'preflight' }));
      const digest = await digestFile(file, signal);
      const draft = { directory: pending, file, refs, digest };
      await this.withVerifiedBundle(draft, repo, signal, async () => {});
      if (!sameBranchTips(refs, await readBranchTips(this.git, repo, signal))) throw new Error('Local branches changed during backup.');
      const verifiedAt = Date.now();
      const id = `v1-${verifiedAt}-${randomUUID()}`;
      const manifest = { version: 1, repositoryKey: repo.key, repoPath: repo.repoPath, verifiedAt, id, refs, digest, format: repo.format };
      const handle = await fs.open(file, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await writeTextFileAtomicallyAsync(path.join(pending, manifestName), JSON.stringify(manifest), root);
      signal.throwIfAborted();
      const publication = path.join(directory, id);
      await assertManagedPathAsync(root, publication);
      if ((await recoveryDirectoryKey(root)) !== rootKey) throw new Error('The backup directory changed.');
      await fs.rename(pending, publication);
      const published = await readManagedBundle(root, publication, repo.key);
      if (!published) throw new Error('The published backup could not be read.');
      return published;
    } finally {
      await this.removeFolder(root, pending, true).catch(() => {});
    }
  }

  async retainLatest(root: string, repo: BranchRepository, keep = 3): Promise<void> {
    const expired = (await this.versions(root, repo)).slice(keep);
    await this.removeVersions(root, expired);
  }

  async isIntact(bundle: BranchBundle, signal?: AbortSignal): Promise<boolean> {
    await assertManagedPathAsync(bundle.directory, bundle.file);
    return (await digestFile(bundle.file, signal)) === bundle.digest;
  }

  async removeVersions(root: string, expected: BranchBundle[]): Promise<void> {
    for (const version of expected) {
      const directory = path.join(root, storageName, version.repositoryKey, version.id);
      if (!branchBundleRepositoryKey.test(version.repositoryKey) || !branchBundleId.test(version.id) || path.relative(directory, version.directory)) {
        throw new Error('Invalid managed backup path.');
      }
      const observed = await readManagedBundle(root, directory, version.repositoryKey);
      if (!observed || observed.identity !== version.identity) throw new Error('The backup changed. Review the selection again.');
      await this.removalFiles(root, directory);
    }
    for (const version of expected) await this.removeFolder(root, version.directory);
  }

  private async removalFiles(root: string, directory: string, pending = false): Promise<string[]> {
    if (this.readers.has(directory)) throw new Error('This backup is being verified or restored.');
    await assertManagedPathAsync(root, directory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const allowed = pending ? [manifestName, bundleName, `${bundleName}.lock`] : [manifestName, bundleName];
    if (entries.some((entry) => !entry.isFile() || !allowed.includes(entry.name))) throw new Error('Backup folder contains unfamiliar files.');
    if (!pending && entries.length !== allowed.length) throw new Error('The backup changed. Review the selection again.');
    return allowed.filter((name) => entries.some((entry) => entry.name === name)).map((name) => path.join(directory, name));
  }

  private async removeFolder(root: string, directory: string, pending = false): Promise<void> {
    const files = await this.removalFiles(root, directory, pending);
    for (const file of files.reverse()) {
      await assertManagedPathAsync(root, file);
      await fs.unlink(file);
    }
    await fs.rmdir(directory);
  }
}

async function readManagedBundle(root: string, directory: string, key: string): Promise<BranchBundle | null> {
  const manifest = path.join(directory, manifestName);
  const file = path.join(directory, bundleName);
  try {
    const data = (await readStorageJsonAsync(root, manifest)) as
      (Pick<BranchBundle, 'id' | 'repositoryKey' | 'verifiedAt' | 'digest' | 'format' | 'refs'> & { version: number; repoPath?: unknown }) | null;
    if (
      data?.version !== 1 ||
      data.id !== path.basename(directory) ||
      data.repositoryKey !== key ||
      (data.format !== 'sha1' && data.format !== 'sha256') ||
      !Number.isFinite(data.verifiedAt) ||
      typeof data.digest !== 'string' ||
      !/^[0-9a-f]{64}$/.test(data.digest) ||
      !data.refs ||
      Array.isArray(data.refs) ||
      typeof data.refs !== 'object' ||
      !Object.entries(data.refs).every(([ref, oid]) => validLocalRef(ref) && typeof oid === 'string' && recoveryOid(oid, data.format))
    )
      return null;
    await assertManagedPathAsync(root, file);
    const stats = await Promise.all([fs.lstat(file, { bigint: true }), fs.lstat(manifest, { bigint: true })]);
    if (stats.some((stat) => !stat.isFile())) return null;
    const bytes = stats.reduce((sum, stat) => sum + Number(stat.size), 0);
    const identity = [data.digest, ...stats.map(({ dev, ino, size, mtimeNs, ctimeNs }) => `${dev}:${ino}:${size}:${mtimeNs}:${ctimeNs}`)].join(':');
    return { ...data, directory, file, bytes, identity, repoPath: typeof data.repoPath === 'string' && path.isAbsolute(data.repoPath) ? data.repoPath : null };
  } catch {
    return null;
  }
}
