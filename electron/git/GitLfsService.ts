import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GitLfsStatusRequest, GitLfsStatus, TrackWithGitLfsRequest, TrackWithGitLfsResult } from '../../src/shared/ipc/gitLfs';
import { parseGitLfsPointer } from '../../src/shared/ipc/gitLfs';
import type { GitRunner } from './GitRunner';
import type { CommitEditGit } from './CommitEditGit';
import { inspectLfsFiles, indexFile, type LfsReader } from './GitLfsInspection';
import { appendLfsRule, lfsAttributeRule } from './GitLfsRules';
import { cleanLfsContent, exportGitBlob } from './GitLfsObjects';
import { withPrivateIndex } from './PrivateIndex';
import { createPrivateTempDir, cleanupPrivateTempDir } from './PrivateTempFiles';
import { resolveRepositoryPathForCreateWithoutSymlinks } from './RepositoryPathSafety';

function readAttributes(target: string): Buffer | null {
  try {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error('Git attributes must be an unlinked regular file.');
    if (stat.size > 2 * 1024 * 1024) throw new Error('Git attributes file is too large.');
    return fs.readFileSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function replaceAttributes(target: string, data: Buffer, mode: number): void {
  const temporary = `${target}.ogc-lfs-${randomUUID()}`;
  try {
    const descriptor = fs.openSync(temporary, 'wx', mode);
    try {
      fs.writeFileSync(descriptor, data);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporary, target);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export class GitLfsService {
  constructor(private readonly runner: GitRunner) {}
  private reader(): LfsReader {
    return {
      run: (cwd, args, options) => this.runner.run(cwd, args, options),
      input: (cwd, args, input, _ignoreAbort, envOverrides) => this.runner.runWithInput(cwd, args, input, { envOverrides }),
      prefix: (cwd, args, maxBytes) => this.runner.runBuffer(cwd, args, { maxBytes, allowTruncation: true, tooLargeMessage: 'Git sample is too large.' }),
    };
  }
  async getStatus(request: GitLfsStatusRequest): Promise<GitLfsStatus> {
    if (!request || !Array.isArray(request.files) || request.files.length > 10000) throw new Error('Invalid Git LFS status request.');
    let available = true;
    let error: string | undefined;
    try {
      await this.runner.run(request.repoPath, ['lfs', 'version']);
    } catch {
      available = false;
      error = 'Git LFS is not installed or cannot be started. Install Git LFS and restart the application.';
    }
    const files = await inspectLfsFiles(request.repoPath, request.files, this.reader());
    return { available, error, files: files.map((file) => file.state) };
  }
  private async initialize(repoPath: string, git: CommitEditGit): Promise<void> {
    await git.run(repoPath, ['lfs', 'version']);
    await git.run(repoPath, ['lfs', 'install', '--local', '--skip-repo']);
    const custom = (await git.run(repoPath, ['config', '--get', 'core.hooksPath']).catch(() => '')).trim();
    if (custom) return;
    const hooks = path.resolve(repoPath, (await git.run(repoPath, ['rev-parse', '--git-path', 'hooks'])).trim());
    const names = ['pre-push', 'post-checkout', 'post-commit', 'post-merge'];
    if (names.some((name) => fs.existsSync(path.join(hooks, name)))) return;
    await git.run(repoPath, ['lfs', 'install', '--local']);
  }
  async track(request: TrackWithGitLfsRequest, ensureContext: () => void, signal?: AbortSignal): Promise<TrackWithGitLfsResult> {
    if (!request || !['file', 'extension'].includes(request.scope) || typeof request.expectedVersion !== 'string')
      throw new Error('Invalid Git LFS tracking request.');
    return this.runner.withExclusiveWrite(
      request.repoPath,
      'git-lfs-track',
      async (git) => {
        if (!git.prefix) throw new Error('Git LFS inspection is unavailable.');
        const reader = git as LfsReader;
        ensureContext();
        const [initial] = await inspectLfsFiles(request.repoPath, [request], reader);
        if (initial.state.version !== request.expectedVersion)
          throw new Error('The file, branch or attributes changed. Refresh the file before converting it.');
        if (!initial.state.eligible) throw new Error(initial.state.reason);
        const rule = lfsAttributeRule(initial.state.path, request.scope);
        const target = resolveRepositoryPathForCreateWithoutSymlinks(request.repoPath, rule.attributesPath);
        const originalWork = readAttributes(target);
        const mode = originalWork ? fs.statSync(target).mode & 0o777 : 0o644;
        const preparedWork = appendLfsRule(originalWork, rule.rule);
        const scratch = createPrivateTempDir('ogc-lfs-track');
        let replaced = false;
        try {
          // This verifies the source before any attributes or index are published.
          let sourcePath = initial.diskPath;
          if (request.source === 'staged') {
            sourcePath = path.join(scratch, 'content');
            await exportGitBlob(request.repoPath, initial.oid!, sourcePath, git.signal);
          }
          if (!sourcePath) throw new Error('The selected file content is unavailable.');
          await this.initialize(request.repoPath, git);
          const pointerBytes = await cleanLfsContent(request.repoPath, initial.state.path, fs.createReadStream(sourcePath), git.signal);
          const pointer = parseGitLfsPointer(pointerBytes.toString())!;
          return await withPrivateIndex(git, request.repoPath, async (index, publish) => {
            const envOverrides = { GIT_INDEX_FILE: index };
            const isolated: LfsReader = {
              ...reader,
              run: (cwd, args, options) => git.run(cwd, args, { ...options, envOverrides }),
              input: (cwd, args, input) => git.input(cwd, args, input, false, envOverrides),
            };
            const previous = await indexFile(request.repoPath, rule.attributesPath, isolated);
            if (previous && Number((await git.run(request.repoPath, ['cat-file', '-s', previous.oid])).trim()) > 2 * 1024 * 1024)
              throw new Error('The staged Git attributes file is too large.');
            const originalIndex = previous ? await git.buffer(request.repoPath, ['cat-file', 'blob', previous.oid]) : null;
            const preparedIndex = appendLfsRule(originalIndex, rule.rule);
            const attributesOid = (await git.input(request.repoPath, ['hash-object', '-w', '--stdin', '--no-filters'], preparedIndex)).trim();
            const oid = (await git.input(request.repoPath, ['hash-object', '-w', '--stdin', '--no-filters'], pointerBytes)).trim();
            await git.input(
              request.repoPath,
              ['update-index', '-z', '--index-info'],
              `${previous?.mode ?? '100644'} ${attributesOid}\t${rule.attributesPath}\0${initial.mode} ${oid}\t${initial.state.path}\0`,
              false,
              envOverrides,
            );
            if (initial.flags && initial.flags === initial.flags.toLowerCase())
              await git.run(request.repoPath, ['update-index', '--assume-unchanged', '--', initial.state.path], { envOverrides });
            if (initial.flags?.toUpperCase() === 'S')
              await git.run(request.repoPath, ['update-index', '--skip-worktree', '--', initial.state.path], { envOverrides });
            const cached = await git.input(
              request.repoPath,
              ['check-attr', '--cached', '-z', '--stdin', 'filter'],
              `${initial.state.path}\0`,
              false,
              envOverrides,
            );
            if (cached.split('\0')[2] !== 'lfs')
              throw new Error('An existing attributes rule overrides this file type. Use the individual file action instead.');
            ensureContext();
            // Filter initialization is an intended setup change. Compare using the updated configuration.
            const [current] = await inspectLfsFiles(request.repoPath, [request], reader);
            if (current.contentVersion !== initial.contentVersion) throw new Error('The selected content changed during conversion.');
            if (!readAttributes(target)?.equals(originalWork ?? Buffer.alloc(0)) && (originalWork !== null || readAttributes(target) !== null))
              throw new Error('Git attributes changed during conversion.');
            resolveRepositoryPathForCreateWithoutSymlinks(request.repoPath, rule.attributesPath);
            replaceAttributes(target, preparedWork, mode);
            replaced = true;
            const effective = await git.input(request.repoPath, ['check-attr', '-z', '--stdin', 'filter'], `${initial.state.path}\0`);
            if (effective.split('\0')[2] !== 'lfs') throw new Error('The working attributes override Git LFS for this file.');
            await publish(async () => {
              ensureContext();
              git.signal?.throwIfAborted();
              if (!readAttributes(target)?.equals(preparedWork)) throw new Error('Git attributes changed before publication.');
              if ((await inspectLfsFiles(request.repoPath, [request], reader))[0].contentVersion !== initial.contentVersion)
                throw new Error('The selected content changed before publication.');
              ensureContext();
            });
            replaced = false;
            return { path: initial.state.path, attributesPath: rule.attributesPath, oid: pointer.oid, bytes: pointer.size };
          });
        } catch (error) {
          if (replaced && readAttributes(target)?.equals(preparedWork)) {
            if (originalWork) replaceAttributes(target, originalWork, mode);
            else fs.rmSync(target, { force: true });
          }
          throw error;
        } finally {
          cleanupPrivateTempDir(scratch);
        }
      },
      signal,
    );
  }
}
