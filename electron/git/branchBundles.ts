import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { writeTextFileAtomicallyAsync } from '../main-process/atomicFile';
import { assertManagedPathAsync, readStorageJsonAsync } from '../main-process/storageSafety';
import { branchReadOptions, branchRecoveryEnvironment, isMissing, recoveryOid, validLocalRef, type BranchRepository } from './branchRecoveryRepository';
import { cleanupPrivateTempDirAsync, createPrivateTempDir } from './PrivateTempFiles';
import { runCommitEditProcess } from './CommitEditProcess';
import type { GitRunner } from './GitRunner';

const manifestName = 'manifest.json';
const bundleName = 'branches.bundle';
const versionName = /^v1-[0-9]{13}-[0-9a-f-]{36}$/;
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
  verifiedAt: number;
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
  constructor(private readonly git: Pick<GitRunner, 'run' | 'runResult' | 'runWithInput'>) {}

  private async repositoryDirectory(root: string, repo: BranchRepository): Promise<string> {
    const resolved = await fs.realpath(root);
    if (path.relative(root, resolved) || !(await fs.stat(resolved)).isDirectory()) throw new Error('The backup directory changed.');
    const directory = path.join(root, storageName, repo.key);
    if ([await fs.realpath(repo.repoPath), repo.commonDir, repo.gitDir].some((base) => withinDirectory(base, directory))) {
      throw new Error('The backup directory must be outside the repository.');
    }
    await assertManagedPathAsync(root, directory);
    return directory;
  }

  async versions(root: string, repo: BranchRepository): Promise<BranchBundle[]> {
    const directory = await this.repositoryDirectory(root, repo);
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const bundles: BranchBundle[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !versionName.test(entry.name)) continue;
      const current = path.join(directory, entry.name);
      const file = path.join(current, bundleName);
      const value = await readStorageJsonAsync(root, path.join(current, manifestName)).catch(() => null);
      const data = value as (Omit<BranchBundle, 'directory' | 'file'> & { version: number; repositoryKey: string }) | null;
      if (
        data?.version !== 1 ||
        data.id !== entry.name ||
        data.repositoryKey !== repo.key ||
        data.format !== repo.format ||
        !Number.isFinite(data.verifiedAt) ||
        typeof data.digest !== 'string' ||
        !/^[0-9a-f]{64}$/.test(data.digest) ||
        !data.refs ||
        Array.isArray(data.refs) ||
        typeof data.refs !== 'object' ||
        !Object.entries(data.refs).every(([ref, oid]) => validLocalRef(ref) && typeof oid === 'string' && recoveryOid(oid, repo.format))
      )
        continue;
      try {
        await assertManagedPathAsync(root, file);
        if (!(await fs.lstat(file)).isFile()) continue;
        bundles.push({ ...data, directory: current, file });
      } catch {
        // A partial or redirected version is never a recovery source.
      }
    }
    return bundles.sort((a, b) => b.verifiedAt - a.verifiedAt || b.id.localeCompare(a.id));
  }

  async withVerifiedBundle<T>(
    bundle: BranchBundle,
    repo: BranchRepository,
    signal: AbortSignal | undefined,
    consume: (directory: string, file: string) => Promise<T>,
  ): Promise<T> {
    const temporary = createPrivateTempDir('bundle-verification');
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
      await cleanupPrivateTempDirAsync(temporary);
    }
  }

  async create(root: string, repo: BranchRepository, refs: Record<string, string>, signal: AbortSignal): Promise<BranchBundle> {
    const directory = await this.repositoryDirectory(root, repo);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const pending = path.join(directory, `.pending-${randomUUID()}`);
    await assertManagedPathAsync(root, pending);
    await fs.mkdir(pending, { mode: 0o700 });
    try {
      const file = path.join(pending, bundleName);
      await this.git.run(repo.repoPath, ['bundle', 'create', file, '--branches'], branchReadOptions({ signal, requestedKind: 'preflight' }));
      const digest = await digestFile(file, signal);
      const draft = { directory: pending, file, id: '', verifiedAt: 0, refs, digest, format: repo.format };
      await this.withVerifiedBundle(draft, repo, signal, async () => {});
      if (!sameBranchTips(refs, await readBranchTips(this.git, repo, signal))) throw new Error('Local branches changed during backup.');
      const verifiedAt = Date.now();
      const id = `v1-${verifiedAt}-${randomUUID()}`;
      const manifest = { version: 1, repositoryKey: repo.key, verifiedAt, id, refs, digest, format: repo.format };
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
      await fs.rename(pending, publication);
      return { ...manifest, directory: publication, file: path.join(publication, bundleName) };
    } finally {
      await this.removeFolder(root, pending, true).catch(() => {});
    }
  }

  async retainLatest(root: string, repo: BranchRepository, keep = 3): Promise<void> {
    for (const version of (await this.versions(root, repo)).slice(keep)) await this.removeFolder(root, version.directory);
  }

  private async removeFolder(root: string, directory: string, pending = false): Promise<void> {
    await assertManagedPathAsync(root, directory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const allowed = pending ? [manifestName, bundleName, `${bundleName}.lock`] : [manifestName, bundleName];
    if (entries.some((entry) => !entry.isFile() || !allowed.includes(entry.name))) throw new Error('Backup folder contains unfamiliar files.');
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      await assertManagedPathAsync(root, file);
      await fs.unlink(file);
    }
    await fs.rmdir(directory);
  }
}
