import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { assertManagedPathAsync } from '../main-process/storageSafety';
import type { GitRunOptions } from './GitProcessTypes';
import type { GitRunner } from './GitRunner';
import { readRepositoryFileBytes } from './RepositoryFileRead';

export type BranchGitReader = Pick<GitRunner, 'runResult'>;
export type BranchRepository = {
  repoPath: string;
  commonDir: string;
  gitDir: string;
  key: string;
  format: 'sha1' | 'sha256';
  refStorage: string;
  bare: boolean;
};

export const branchRecoveryEnvironment: NodeJS.ProcessEnv = {
  GIT_DIR: undefined,
  GIT_WORK_TREE: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_NAMESPACE: undefined,
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ALLOW_PROTOCOL: '',
  LC_ALL: 'C',
};

export const branchReadOptions = (options: GitRunOptions = {}): GitRunOptions => ({
  ...options,
  envOverrides: { ...options.envOverrides, ...branchRecoveryEnvironment },
});

export const isMissing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';
export const recoveryOid = (value: string, format?: BranchRepository['format']) =>
  (format === 'sha1' ? /^[0-9a-f]{40}$/ : format === 'sha256' ? /^[0-9a-f]{64}$/ : /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/).test(value) && !/^0+$/.test(value);

export async function recoveryDirectoryKey(directory: string): Promise<string> {
  const canonical = await fs.realpath(directory);
  const stat = await fs.stat(canonical, { bigint: true });
  if (!stat.isDirectory()) throw new Error('Git metadata directory is unavailable.');
  const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  return createHash('sha256').update(`${key}\0${stat.dev}:${stat.ino}`).digest('hex');
}

export async function describeBranchRepository(git: BranchGitReader, repoPath: string, options?: GitRunOptions): Promise<BranchRepository> {
  const query = (args: string[]) => git.runResult(repoPath, args, branchReadOptions(options));
  const result = await query(['rev-parse', '--absolute-git-dir', '--git-common-dir', '--show-object-format', '--show-ref-format', '--is-bare-repository']);
  const fields = result.stdout.trimEnd().split(/\r?\n/);
  if (result.exitCode !== 0 || fields.length !== 5 || !path.isAbsolute(fields[0])) throw new Error(result.stderr || 'Git metadata could not be located.');
  const [gitDirectory, commonDirectory, objectFormat, storage, bare] = fields;
  const format = objectFormat === '--show-object-format' ? 'sha1' : objectFormat;
  if ((format !== 'sha1' && format !== 'sha256') || (bare !== 'true' && bare !== 'false')) throw new Error('Unknown Git repository format.');
  let refStorage = storage;
  if (storage === '--show-ref-format') {
    const configured = await query(['config', '--local', '--get', 'extensions.refStorage']);
    if (configured.exitCode === 1 && !configured.stderr) refStorage = 'files';
    else if (configured.exitCode === 0) refStorage = configured.stdout.trim();
    else throw new Error(configured.stderr || 'Git ref storage could not be determined.');
  }
  const [gitDir, commonDir] = await Promise.all([fs.realpath(gitDirectory), fs.realpath(path.resolve(repoPath, commonDirectory))]);
  return { repoPath, gitDir, commonDir, key: await recoveryDirectoryKey(commonDir), format, refStorage, bare: bare === 'true' };
}

export const validLocalRef = (ref: string) =>
  ref.startsWith('refs/heads/') &&
  !ref.endsWith('.') &&
  !ref.includes('..') &&
  !ref.includes('@{') &&
  !/[ \u007f~^:?*\[\\]/u.test(ref) &&
  !Array.from(ref).some((character) => character.charCodeAt(0) < 32) &&
  ref.split('/').every((part) => part && !part.startsWith('.') && !part.endsWith('.lock'));

export async function readRecoveryFile(root: string, relative: string, maxBytes = 4096): Promise<Buffer | null> {
  const target = path.join(root, relative);
  await assertManagedPathAsync(root, target);
  try {
    return (await readRepositoryFileBytes(target, maxBytes)).data;
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export function directRefOid(bytes: Buffer | null, format: BranchRepository['format']): string | undefined {
  const value = bytes?.toString('latin1').trimEnd().toLowerCase();
  return value && recoveryOid(value, format) ? value : undefined;
}

export async function packedBranchOid(repo: BranchRepository, ref: string): Promise<string | undefined> {
  const bytes = await readRecoveryFile(repo.commonDir, 'packed-refs', 32 * 1024 * 1024);
  if (!bytes) return undefined;
  const lines = bytes.toString('utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#') || line.startsWith('^')) continue;
    const space = line.indexOf(' ');
    if (space < 0 || !recoveryOid(line.slice(0, space), repo.format)) throw new Error('The packed-refs file is invalid.');
    if (line.slice(space + 1) === ref) return line.slice(0, space);
  }
  return undefined;
}

export async function readRecoveryReflog(repo: BranchRepository, ref: string): Promise<{ oid?: string; checkout?: string }> {
  const root = ref === 'HEAD' ? repo.gitDir : repo.commonDir;
  const target = path.join(root, 'logs', ref);
  await assertManagedPathAsync(root, target);
  const handle = await fs.open(target).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (!handle) return {};
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Git reflog is not a regular file.');
    const tail = Buffer.alloc(Math.min(stat.size, 128 * 1024));
    const offset = stat.size - tail.length;
    const { bytesRead } = await handle.read(tail, 0, tail.length, offset);
    const lines = tail.toString('utf8', 0, bytesRead).split('\n');
    lines.pop(); // Only complete records are evidence after a crash.
    if (offset > 0) lines.shift();
    const length = repo.format === 'sha1' ? 40 : 64;
    let latest: string | undefined;
    for (const line of lines.reverse()) {
      if (line[length] !== ' ' || line[length * 2 + 1] !== ' ' || !/^[0-9a-f]+$/.test(line.slice(0, length)) || !line.includes('\t')) continue;
      const oid = line.slice(length + 1, length * 2 + 1);
      if (!latest && /^0+$/.test(oid) && oid.length === length) return {};
      if (!recoveryOid(oid, repo.format)) continue;
      latest ??= oid;
      if (ref !== 'HEAD') break;
      const message = line.slice(line.indexOf('\t') + 1);
      const checkout = /^checkout: moving from .+ to (\S+)$/.exec(message)?.[1];
      if (checkout) return { oid: latest, checkout };
    }
    return { oid: latest };
  } finally {
    await handle.close();
  }
}

export const isReflogForBranch = (checkout: string | undefined, ref: string) => checkout === ref || checkout === ref.slice('refs/heads/'.length);
