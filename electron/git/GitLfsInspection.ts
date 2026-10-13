import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { parseGitLfsPointer, type GitLfsFileRequest, type GitLfsFileState } from '../../src/shared/ipc/gitLfs';
import type { CommitEditGit } from './CommitEditGit';
import { normalizeRepositoryRelativePath, toLiteralPathspec } from './RepositoryPathSafety';
import { createRepositoryPathResolver } from './RepositoryPathSafetyAsync';
import { readRepositoryFileBytes } from './RepositoryFileRead';
import { readStagedLfsSamples } from './GitLfsBlobSamples';
import { LFS_SAMPLE_BYTES, lfsRecommendation } from './GitLfsRules';

export type LfsReader = Pick<CommitEditGit, 'run' | 'input'> & { prefix: NonNullable<CommitEditGit['prefix']> };
export type LfsInspection = { state: GitLfsFileState; contentVersion: string; oid?: string; mode: string; flags?: string; diskPath?: string };
export const lfsDigest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileExtension = (name: string): string | undefined => (/^\.[a-zA-Z0-9_-]+$/.test(path.posix.extname(name)) ? path.posix.extname(name) : undefined);

export function validateLfsFile(file: GitLfsFileRequest): GitLfsFileRequest {
  if (!file || !['staged', 'unstaged'].includes(file.source)) throw new Error('Invalid Git LFS file source.');
  const normalized = path.posix.normalize(normalizeRepositoryRelativePath(file.path));
  if (normalized.split('/').some((part) => part.toLowerCase().replace(/[. ]+$/, '') === '.git')) throw new Error('Git metadata is not a file target.');
  return { path: normalized, source: file.source };
}

function workingFileMode(indexMode: string, diskMode: number, config: string): string {
  if (process.platform === 'win32' || /^core\.filemode false$/m.test(config)) return indexMode;
  return diskMode & 0o111 ? '100755' : '100644';
}

export async function lfsAttributes(repoPath: string, files: string[], git: LfsReader, cached: boolean): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (let offset = 0; offset < files.length; offset += 256) {
    const output = await git.input(
      repoPath,
      ['check-attr', ...(cached ? ['--cached'] : []), '-z', '--stdin', 'filter'],
      `${files.slice(offset, offset + 256).join('\0')}\0`,
    );
    const parts = output.split('\0');
    for (let i = 0; i + 2 < parts.length; i += 3) result.set(parts[i], parts[i + 2]);
  }
  return result;
}

async function workingAttributes(filePath: string, read: (name: string) => Promise<string>): Promise<string[]> {
  const result: string[] = [];
  let parent = path.posix.dirname(filePath);
  while (true) {
    const name = parent === '.' ? '.gitattributes' : `${parent}/.gitattributes`;
    result.push(await read(name));
    if (parent === '.') break;
    parent = path.posix.dirname(parent);
  }
  return result;
}

export async function inspectLfsFiles(repoPath: string, input: GitLfsFileRequest[], git: LfsReader): Promise<LfsInspection[]> {
  const files = input.map(validateLfsFile);
  const unique = [...new Set(files.map((file) => file.path))];
  const [working, cached, entries, head, branch, config] = await Promise.all([
    lfsAttributes(repoPath, unique, git, false),
    lfsAttributes(repoPath, unique, git, true),
    git.run(repoPath, ['ls-files', '--stage', '-v', '-z']),
    git.run(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD']).catch(() => ''),
    git.run(repoPath, ['symbolic-ref', '--quiet', 'HEAD']).catch(() => ''),
    git.run(repoPath, ['config', '--get-regexp', '^(filter\\.lfs\\.|lfs\\.|core\\.(attributesfile|hookspath|filemode))']).catch(() => ''),
  ]);
  const records = new Map<string, Array<{ flags: string; mode: string; oid: string; stage: string }>>();
  for (const line of entries.split('\0')) {
    const match = /^([A-Za-z?]) (\d{6}) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(line);
    if (!match) continue;
    const values = records.get(match[5]) ?? [];
    values.push({ flags: match[1], mode: match[2], oid: match[3], stage: match[4] });
    records.set(match[5], values);
  }
  const attributesIndex = [...records].filter(([name]) => path.posix.basename(name) === '.gitattributes');
  const resolver = await createRepositoryPathResolver(repoPath);
  const identity = [resolver.rootPath, head.trim(), branch.trim(), config, lfsDigest(attributesIndex)];
  const attributes = new Map<string, Promise<string>>();
  const readAttributes = (name: string) => {
    let pending = attributes.get(name);
    if (!pending) {
      pending = (async () => {
        try {
          const target = await resolver.existingWithoutSymlinks(name);
          return lfsDigest((await readRepositoryFileBytes(target, 2 * 1024 * 1024)).data.toString('base64'));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return 'missing';
        }
      })();
      attributes.set(name, pending);
    }
    return pending;
  };
  const stagedSamples = await readStagedLfsSamples(
    repoPath,
    files
      .filter((file) => file.source === 'staged')
      .flatMap(
        (file) =>
          records
            .get(file.path)
            ?.filter((entry) => entry.stage === '0' && /^100(?:644|755)$/.test(entry.mode))
            .map((entry) => entry.oid) ?? [],
      ),
    git,
  );
  const result: LfsInspection[] = [];
  for (const [index, file] of files.entries()) {
    // Cached attribute reads resolve as microtasks. Yield during staged-only
    // batches too, so they cannot monopolize the event loop with hashing.
    if (index > 0 && index % 64 === 0) await setImmediate();
    const values = records.get(file.path) ?? [];
    const entry = values.find((value) => value.stage === '0');
    let mode = entry?.mode ?? '100644';
    let bytes = 0;
    let sample: Buffer = Buffer.alloc(0);
    let diskPath: string | undefined;
    let reason: string | undefined;
    let diskVersion: unknown;
    try {
      if (values.some((value) => value.stage !== '0')) throw new Error('Resolve the file conflict before using Git LFS.');
      if (['.gitattributes', '.gitmodules', '.lfsconfig', '.gitignore'].includes(path.posix.basename(file.path)))
        throw new Error('Git control files cannot be stored in Git LFS.');
      if (entry && !['100644', '100755'].includes(entry.mode)) throw new Error('Symlinks and submodules cannot be converted to Git LFS.');
      if (file.source === 'staged') {
        if (!entry) throw new Error('The selected staged file no longer exists.');
        const blob = stagedSamples.get(entry.oid);
        if (!blob) throw new Error('The selected staged blob cannot be read.');
        ({ bytes, sample } = blob);
      } else {
        diskPath = await resolver.existingWithoutSymlinks(file.path);
        const { data, stat } = await readRepositoryFileBytes(diskPath, LFS_SAMPLE_BYTES, true);
        bytes = stat.size;
        mode = workingFileMode(mode, stat.mode, config);
        diskVersion = [stat.size, stat.mode, stat.mtimeMs, stat.ctimeMs, stat.ino];
        sample = data;
      }
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid file size.');
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    const pointer = bytes <= 1024 ? parseGitLfsPointer(sample.toString()) : null;
    const configured = working.get(file.path) === 'lfs' || cached.get(file.path) === 'lfs';
    const contentVersion = lfsDigest([identity.slice(0, 3), file, entry, diskVersion, sample.toString('base64')]);
    const version = lfsDigest([...identity, contentVersion, working.get(file.path), cached.get(file.path), await workingAttributes(file.path, readAttributes)]);
    result.push({
      contentVersion,
      oid: entry?.oid,
      mode,
      flags: entry?.flags,
      diskPath,
      state: {
        ...file,
        version,
        bytes: pointer?.size ?? bytes,
        eligible: !reason,
        reason,
        configured,
        pointer: Boolean(pointer),
        needsRestage: configured && !pointer && !reason,
        extension: fileExtension(file.path),
        recommendation: !reason && !configured && !pointer ? lfsRecommendation(file.path, bytes, sample) : undefined,
      },
    });
  }
  return result;
}

export async function indexFile(repoPath: string, filePath: string, git: Pick<CommitEditGit, 'run'>): Promise<{ mode: string; oid: string } | null> {
  const output = await git.run(repoPath, ['ls-files', '--stage', '-z', '--', toLiteralPathspec(filePath)]);
  const entries = output.split('\0').filter(Boolean);
  if (!entries.length) return null;
  const match = /^(100644|100755) ([a-f0-9]{40,64}) 0\t/.exec(entries[0]);
  if (!match || entries.length !== 1) throw new Error('The attributes entry is conflicted or is not a regular file.');
  return { mode: match[1], oid: match[2] };
}
