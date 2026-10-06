import type { GitRunner } from './GitRunner';
import type { GitLfsPointer } from '../../src/shared/ipc/gitLfs';
import { readLfsPointers } from './GitLfsPointers';
import { gitConfigurationEnvironment, remoteUrl } from './remoteTransferValidation';
import type { GitRunOptions } from './GitProcessTypes';
import * as fs from 'node:fs';
import { resolveExistingRepositoryPathWithoutSymlinks } from './RepositoryPathSafety';

type Reader = Pick<GitRunner, 'run' | 'runBuffer'>;
type TransferRunner = Pick<GitRunner, 'run' | 'streamOutput'>;

/** Pure Git inspection still detects LFS repositories when the LFS executable is missing. */
export async function referencedLfsObjects(repoPath: string, refs: string[], git: Reader, options: GitRunOptions = {}): Promise<GitLfsPointer[]> {
  if (!refs.length) return [];
  if (refs.some((ref) => !/^[a-f0-9]{40,64}$/.test(ref))) throw new Error('Invalid Git LFS source revision.');
  const objects = (await git.run(repoPath, ['rev-list', '--objects', '--no-object-names', ...refs], options)).trim().split(/\r?\n/).filter(Boolean);
  const pointers = new Map<string, GitLfsPointer>();
  for (const { pointer } of await readLfsPointers(repoPath, objects, git, options)) pointers.set(pointer.oid, pointer);
  return [...pointers.values()].sort((a, b) => a.oid.localeCompare(b.oid));
}

export async function lfsEndpoint(
  repoPath: string,
  remote: string,
  git: Pick<GitRunner, 'run' | 'runResult'>,
  environment: NodeJS.ProcessEnv = {},
  push = false,
  targetUrl?: string,
): Promise<string> {
  const entries: [string, string][] = [
    ['remote.lfsdefault', remote],
    ['remote.lfspushdefault', remote],
    ['lfs.remote.autodetect', 'false'],
  ];
  if (targetUrl) entries.push([`remote.${remote}.url`, ''], [`remote.${remote}.url`, targetUrl]);
  const config = gitConfigurationEnvironment(entries, environment);
  const output = await git.run(repoPath, ['lfs', 'env'], { envOverrides: config });
  const value = async (args: string[]) => {
    const result = await git.runResult(repoPath, ['config', ...args], { envOverrides: environment });
    return result.exitCode === 0 ? result.stdout.trim() : '';
  };
  const configured = push
    ? (await value(['--get', 'lfs.pushurl'])) ||
      (await value(['--get', 'lfs.url'])) ||
      (await value(['--file', '.lfsconfig', '--get', 'lfs.url'])) ||
      (await value(['--get', `remote.${remote}.lfspushurl`]))
    : '';
  // The tracked branch can make another remote the default despite lfsdefault.
  const match =
    output.split(/\r?\n/).find((line) => line.startsWith(`Endpoint (${remote})=`)) || output.split(/\r?\n/).find((line) => line.startsWith('Endpoint='));
  const endpoint = configured.trim() || match?.slice(match.indexOf('=') + 1).replace(/ \(auth=.*\)$/, '');
  if (!endpoint) throw new Error('Git LFS could not resolve this remote endpoint.');
  return remoteUrl(endpoint);
}

export function lfsTransferEnvironment(base: NodeJS.ProcessEnv, remote: string, endpoint: string, gitUrl?: string): NodeJS.ProcessEnv {
  // Keep Git LFS's native SSH discovery and git-lfs-authenticate metadata. Replacing
  // an SSH transport with its HTTPS URL would discard SSH authentication.
  if (gitUrl && (/^ssh:\/\//i.test(gitUrl) || (!gitUrl.includes('://') && !/^[A-Za-z]:[\\/]/.test(gitUrl) && /^[^/\\:]+:/.test(gitUrl))))
    return gitConfigurationEnvironment(
      [
        ['remote.lfsdefault', remote],
        ['remote.lfspushdefault', remote],
        ['lfs.remote.autodetect', 'false'],
        ['lfs.remote.searchall', 'false'],
        [`remote.${remote}.url`, gitUrl],
      ],
      base,
    );
  return gitConfigurationEnvironment(
    [
      ['lfs.url', endpoint],
      ['lfs.pushurl', endpoint],
      [`remote.${remote}.lfsurl`, endpoint],
      [`remote.${remote}.lfspushurl`, endpoint],
      ['lfs.remote.autodetect', 'false'],
      ['lfs.remote.searchall', 'false'],
    ],
    base,
  );
}

export async function lfsConfigurationStamp(repoPath: string, git: Pick<GitRunner, 'runResult'>): Promise<string> {
  try {
    const file = resolveExistingRepositoryPathWithoutSymlinks(repoPath, '.lfsconfig');
    if (fs.statSync(file).size > 1024 * 1024) throw new Error('Git LFS configuration is too large.');
    return fs.readFileSync(file).toString('base64');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const index = await git.runResult(repoPath, ['show', ':.lfsconfig']);
    if (index.exitCode === 0) return index.stdout;
    const head = await git.runResult(repoPath, ['show', 'HEAD:.lfsconfig']);
    return head.exitCode === 0 ? head.stdout : '';
  }
}

export async function uploadLfsObjects(
  repoPath: string,
  remote: string,
  endpoint: string,
  objects: GitLfsPointer[],
  git: TransferRunner,
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
  progress?: (message: string) => void,
  gitUrl?: string,
): Promise<void> {
  if (!objects.length) return;
  progress?.(`Uploading Git LFS objects: ${remote}`);
  const envOverrides = lfsTransferEnvironment(env, remote, endpoint, gitUrl);
  // Object IDs come from the captured revisions, not from the current branch or working tree.
  for (let offset = 0; offset < objects.length; offset += 100) {
    signal?.throwIfAborted();
    await git.streamOutput(
      repoPath,
      ['lfs', 'push', '--object-id', remote, ...objects.slice(offset, offset + 100).map((object) => object.oid)],
      progress ?? (() => {}),
      signal,
      { envOverrides },
    );
  }
}
