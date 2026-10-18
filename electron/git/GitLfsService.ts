import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GitLfsStatusRequest, GitLfsStatus, TrackWithGitLfsRequest, TrackWithGitLfsResult } from '../../src/shared/ipc/gitLfs';
import { parseGitLfsPointer } from '../../src/shared/ipc/gitLfs';
import type { GitRunner } from './GitRunner';
import type { CommitEditGit } from './CommitEditGit';
import { inspectLfsFiles, indexFile, lfsAttributes, type LfsReader } from './GitLfsInspection';
import { appendLfsRule, lfsAttributeRule } from './GitLfsRules';
import { cleanLfsContent, exportGitBlob } from './GitLfsObjects';
import { withPrivateIndex } from './PrivateIndex';
import { createPrivateTempDir, cleanupPrivateTempDir } from './PrivateTempFiles';
import { resolveRepositoryPathForCreateWithoutSymlinks } from './RepositoryPathSafety';
import { inspectLfsTrackingTargets } from './GitLfsTracking';

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
      prefix: (cwd, args, maxBytes, input) =>
        this.runner.runBuffer(cwd, args, { maxBytes, input, allowTruncation: true, tooLargeMessage: 'Git sample is too large.' }),
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
  async track(
    request: TrackWithGitLfsRequest,
    ensureContext: () => void,
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<TrackWithGitLfsResult> {
    if (!request || !['file', 'extension'].includes(request.scope) || typeof request.expectedVersion !== 'string')
      throw new Error('Invalid Git LFS tracking request.');
    const staging = request.staging ?? 'selected';
    if (!['none', 'selected', 'matching'].includes(staging) || (staging === 'matching' && request.scope !== 'extension'))
      throw new Error('Invalid Git LFS staging selection.');
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
        const targets = staging === 'none' ? [] : await inspectLfsTrackingTargets(request, initial, reader);
        const scratch = staging === 'none' ? null : createPrivateTempDir('ogc-lfs-track');
        let replaced = false;
        try {
          await this.initialize(request.repoPath, git);
          const replaceWorkingRule = () => {
            ensureContext();
            git.signal?.throwIfAborted();
            const current = readAttributes(target);
            if (originalWork === null ? current !== null : !current?.equals(originalWork)) throw new Error('Git attributes changed during conversion.');
            resolveRepositoryPathForCreateWithoutSymlinks(request.repoPath, rule.attributesPath);
            replaceAttributes(target, preparedWork, mode);
            replaced = true;
          };
          if (staging === 'none') {
            if ((await inspectLfsFiles(request.repoPath, [request], reader))[0].contentVersion !== initial.contentVersion)
              throw new Error('The selected content changed before configuration.');
            replaceWorkingRule();
            const effective = await lfsAttributes(request.repoPath, [initial.state.path], reader, false);
            if (request.scope === 'file' && effective.get(initial.state.path) !== 'lfs')
              throw new Error('The working attributes override Git LFS for this file.');
            ensureContext();
            git.signal?.throwIfAborted();
            if (!readAttributes(target)?.equals(preparedWork)) throw new Error('Git attributes changed before publication.');
            replaced = false;
            return { path: initial.state.path, attributesPath: rule.attributesPath, bytes: initial.state.bytes, stagedFiles: 0 };
          }
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
            await git.input(
              request.repoPath,
              ['update-index', '-z', '--index-info'],
              `${previous?.mode ?? '100644'} ${attributesOid}\t${rule.attributesPath}\0`,
              false,
              envOverrides,
            );
            replaceWorkingRule();
            const names = targets.map((file) => file.state.path);
            const [cached, working] = await Promise.all([
              lfsAttributes(request.repoPath, names, isolated, true),
              lfsAttributes(request.repoPath, names, reader, false),
            ]);
            const matching = targets.filter((file) => cached.get(file.state.path) === 'lfs' && working.get(file.state.path) === 'lfs');
            if (staging === 'selected' && matching.length !== 1)
              throw new Error('An existing attributes rule overrides this file type. Use the individual file action instead.');
            const updates: string[] = [];
            let selectedPointer: ReturnType<typeof parseGitLfsPointer> = null;
            onProgress?.(0, matching.length);
            for (const [number, file] of matching.entries()) {
              ensureContext();
              git.signal?.throwIfAborted();
              let sourcePath = file.diskPath;
              if (file.state.source === 'staged') {
                sourcePath = path.join(scratch!, `content-${number}`);
                await exportGitBlob(request.repoPath, file.oid!, sourcePath, git.signal);
              }
              if (!sourcePath) throw new Error('The selected file content is unavailable.');
              const pointerBytes = await cleanLfsContent(request.repoPath, file.state.path, fs.createReadStream(sourcePath), git.signal);
              if (file.state.source === 'staged') fs.rmSync(sourcePath);
              const pointer = parseGitLfsPointer(pointerBytes.toString())!;
              if (file.state.path === initial.state.path) selectedPointer = pointer;
              const oid = (await git.input(request.repoPath, ['hash-object', '-w', '--stdin', '--no-filters'], pointerBytes)).trim();
              updates.push(`${file.mode} ${oid}\t${file.state.path}\0`);
              onProgress?.(number + 1, matching.length);
            }
            if (updates.length) await git.input(request.repoPath, ['update-index', '-z', '--index-info'], updates.join(''), false, envOverrides);
            for (const file of matching) {
              if (file.flags && file.flags === file.flags.toLowerCase())
                await git.run(request.repoPath, ['update-index', '--assume-unchanged', '--', file.state.path], { envOverrides });
              if (file.flags?.toUpperCase() === 'S')
                await git.run(request.repoPath, ['update-index', '--skip-worktree', '--', file.state.path], { envOverrides });
            }
            await publish(async () => {
              ensureContext();
              git.signal?.throwIfAborted();
              if (!readAttributes(target)?.equals(preparedWork)) throw new Error('Git attributes changed before publication.');
              const current = await inspectLfsFiles(
                request.repoPath,
                matching.map((file) => file.state),
                reader,
              );
              if (current.some((file, number) => file.contentVersion !== matching[number].contentVersion))
                throw new Error('The selected content changed before publication.');
              const [finalCached, finalWorking] = await Promise.all([
                lfsAttributes(
                  request.repoPath,
                  matching.map((file) => file.state.path),
                  isolated,
                  true,
                ),
                lfsAttributes(
                  request.repoPath,
                  matching.map((file) => file.state.path),
                  reader,
                  false,
                ),
              ]);
              if (matching.some((file) => finalCached.get(file.state.path) !== 'lfs' || finalWorking.get(file.state.path) !== 'lfs'))
                throw new Error('Git attributes changed before publication.');
              ensureContext();
            });
            replaced = false;
            return {
              path: initial.state.path,
              attributesPath: rule.attributesPath,
              oid: selectedPointer?.oid,
              bytes: initial.state.bytes,
              stagedFiles: matching.length,
            };
          });
        } catch (error) {
          if (replaced && readAttributes(target)?.equals(preparedWork)) {
            if (originalWork) replaceAttributes(target, originalWork, mode);
            else fs.rmSync(target, { force: true });
          }
          throw error;
        } finally {
          if (scratch) cleanupPrivateTempDir(scratch);
        }
      },
      signal,
    );
  }
}
