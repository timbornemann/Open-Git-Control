import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { parseGitLfsPointer } from '../../src/shared/ipc/gitLfs';
import { cleanLfsContent, localLfsObject } from './GitLfsObjects';
import type {
  RepositoryFileContextDto,
  RepositoryFilePreviewDto,
  RepositoryFilePreviewRequestDto,
  RepositoryFileInfoDto,
  SaveRepositoryFileRequestDto,
  SaveRepositoryFileResultDto,
} from '../../src/shared/ipc/repositoryFiles';
import type { GitRunner } from './GitRunner';
import type { CommitEditGit } from './CommitEditGit';
import type { RepositoryFiles } from './RepositoryFiles';
import { decodeRepositoryFile, detectRepositoryFileEncoding, encodeRepositoryFile } from './RepositoryFileEncoding';
import { normalizeRepositoryRelativePath, resolveExistingRepositoryPathWithoutSymlinks, toLiteralPathspec } from './RepositoryPathSafety';
import { withPrivateIndex } from './PrivateIndex';

export const FILE_PREVIEW_LIMIT = 2 * 1024 * 1024;
export const IMAGE_PREVIEW_LIMIT = 25 * 1024 * 1024;
const imageMimeTypes: Record<string, string> = {
  apng: 'image/apng',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};
type Reader = Pick<CommitEditGit, 'run'>;
type Snapshot = {
  lfs?: { oid: string; bytes: number; available: boolean };
  version: string;
  editable: boolean;
  readOnlyReason?: string;
  modifiedAt?: string;
  bytes: number;
  oid?: string;
  mode?: string;
  flags?: string;
  diskPath?: string;
  buffer?: Buffer;
  missing?: string;
};
const digest = (input: string | Buffer): string => createHash('sha256').update(input).digest('hex');
const changedError = () =>
  new Error('The selected file or repository context changed since it was opened. Your draft was kept. Reopen the file before saving.');

export class RepositoryFileViewerService {
  constructor(
    private readonly runner: GitRunner,
    private readonly files: RepositoryFiles,
  ) {}

  private validateContext(request: RepositoryFileContextDto): RepositoryFileContextDto {
    if (!request || typeof request.repoPath !== 'string' || !['unstaged', 'staged', 'commit'].includes(request.source))
      throw new Error('Invalid repository file context.');
    const filePath = path.posix.normalize(normalizeRepositoryRelativePath(request.path));
    if (filePath.split('/').some((part) => part.toLowerCase() === '.git')) throw new Error('File path cannot access Git metadata.');
    if (request.source === 'commit' && !/^[0-9a-f]{7,64}$/i.test(request.commitHash || '')) throw new Error('Invalid commit hash.');
    return { ...request, path: filePath };
  }

  private workingSnapshot(request: RepositoryFileContextDto): Snapshot {
    const identity = [fs.realpathSync(request.repoPath), request.path, request.source, request.commitHash || ''];
    try {
      const diskPath = resolveExistingRepositoryPathWithoutSymlinks(request.repoPath, request.path);
      const stat = fs.statSync(diskPath);
      if (!stat.isFile()) return { version: digest(JSON.stringify(identity)), bytes: 0, editable: false, missing: 'This path is not a regular file.' };
      const buffer = stat.size <= IMAGE_PREVIEW_LIMIT ? fs.readFileSync(diskPath) : undefined;
      return {
        diskPath,
        buffer,
        version: digest(JSON.stringify([...identity, stat.mode, stat.mtimeMs, stat.ctimeMs, buffer ? digest(buffer) : stat.size])),
        bytes: buffer?.length ?? stat.size,
        modifiedAt: stat.mtime.toISOString(),
        editable: Boolean(stat.mode & 0o222),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !/symbolic link/i.test(String(error))) throw error;
      return {
        version: digest(JSON.stringify(identity)),
        bytes: 0,
        editable: false,
        missing:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? 'The working file is missing. Its changes remain available in Diff.'
            : 'Symbolic links cannot be edited as regular files.',
      };
    }
  }

  private async snapshot(request: RepositoryFileContextDto, reader: Reader = this.runner): Promise<Snapshot> {
    if (request.source === 'unstaged') return this.resolveLfsSnapshot(request, this.workingSnapshot(request), reader);
    const identity = [fs.realpathSync(request.repoPath), request.path, request.source, request.commitHash || ''];
    const records = (
      await reader.run(
        request.repoPath,
        request.source === 'staged'
          ? ['ls-files', '--stage', '-v', '-z', '--', toLiteralPathspec(request.path)]
          : ['ls-tree', '-z', request.commitHash!, '--', toLiteralPathspec(request.path)],
      )
    )
      .split('\0')
      .filter(Boolean);
    const record = records.find((line) => line.slice(line.indexOf('\t') + 1) === request.path);
    if (!record)
      return {
        version: digest(JSON.stringify(identity)),
        bytes: 0,
        editable: false,
        missing: 'The selected version has no file content. Its deletion remains available in Diff.',
      };
    const match = request.source === 'staged' ? /^([A-Za-z?]) (\d{6}) ([0-9a-f]+) (\d)\t/.exec(record) : /^(\d{6}) (\w+) ([0-9a-f]+)\t/.exec(record);
    if (!match) throw new Error('Could not inspect the selected Git entry.');
    const mode = request.source === 'staged' ? match[2] : match[1];
    const oid = match[3];
    const flags = request.source === 'staged' ? match[1] : '';
    const conflicted = request.source === 'staged' && (match[4] !== '0' || records.length !== 1);
    const [head, headRef] =
      request.source === 'staged'
        ? await Promise.all([
            reader.run(request.repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD']).catch(() => ''),
            reader.run(request.repoPath, ['symbolic-ref', '--quiet', 'HEAD']).catch(() => ''),
          ])
        : ['', ''];
    const filter = request.source === 'staged' ? await reader.run(request.repoPath, ['check-attr', '--cached', '-z', 'filter', '--', request.path]) : '';
    const version = digest(JSON.stringify([...identity, oid, mode, flags, head.trim(), headRef.trim(), conflicted, filter]));
    if (conflicted || mode === '160000')
      return {
        version,
        bytes: 0,
        editable: false,
        missing: conflicted
          ? 'Resolve this conflict in the conflict resolver before editing the staged file.'
          : 'Submodules do not contain editable file content.',
      };
    const editable = request.source === 'staged' && ['100644', '100755'].includes(mode);
    const bytes = Number((await reader.run(request.repoPath, ['cat-file', '-s', oid])).trim());
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid Git blob size.');
    const snapshot: Snapshot = {
      version,
      bytes,
      oid,
      mode,
      flags,
      editable,
      readOnlyReason: request.source === 'commit' ? 'Commit versions are read-only.' : editable ? undefined : 'Symbolic links cannot be edited in the index.',
    };
    return this.resolveLfsSnapshot(request, snapshot, reader);
  }

  private async resolveLfsSnapshot(request: RepositoryFileContextDto, snapshot: Snapshot, reader: Reader): Promise<Snapshot> {
    if (!snapshot.missing && snapshot.bytes <= 1024 && ['100644', '100755', undefined].includes(snapshot.mode)) {
      const raw = snapshot.buffer?.toString() ?? (await reader.run(request.repoPath, ['cat-file', 'blob', snapshot.oid!]));
      const pointer = parseGitLfsPointer(`${raw.trimEnd()}\n`);
      if (pointer) {
        const diskPath = await localLfsObject(request.repoPath, pointer, reader).catch((error: unknown) => {
          snapshot.missing = error instanceof Error ? error.message : String(error);
          return null;
        });
        snapshot.bytes = pointer.size;
        snapshot.buffer = undefined;
        snapshot.diskPath = diskPath ?? undefined;
        snapshot.lfs = { oid: pointer.oid, bytes: pointer.size, available: Boolean(diskPath) };
        if (!diskPath) {
          snapshot.editable = false;
          snapshot.missing ??= 'The selected Git LFS object is not available locally. Pull its content from the selected remote.';
        }
      }
    }
    return snapshot;
  }

  private async buffer(request: RepositoryFileContextDto, snapshot: Snapshot, maxBytes = IMAGE_PREVIEW_LIMIT): Promise<Buffer> {
    if (snapshot.bytes > maxBytes) throw new Error('The selected file exceeds the preview size limit.');
    if (snapshot.buffer) return snapshot.buffer;
    if (snapshot.lfs && snapshot.diskPath) {
      const buffer = fs.readFileSync(snapshot.diskPath);
      if (buffer.length !== snapshot.bytes || digest(buffer) !== snapshot.lfs.oid) throw new Error('The selected Git LFS object failed its integrity check.');
      return buffer;
    }
    if (snapshot.oid)
      return this.runner.runBuffer(request.repoPath, ['cat-file', 'blob', snapshot.oid], {
        maxBytes,
        tooLargeMessage: 'The selected file exceeds the preview size limit.',
      });
    if (snapshot.diskPath) return fs.readFileSync(snapshot.diskPath);
    throw new Error(snapshot.missing || 'The selected file is unavailable.');
  }

  async getPreview(input: RepositoryFilePreviewRequestDto): Promise<RepositoryFilePreviewDto> {
    const request = this.validateContext(input);
    const snapshot = await this.snapshot(request);
    const common = {
      version: snapshot.version,
      editable: snapshot.editable,
      readOnlyReason: snapshot.readOnlyReason,
      modifiedAt: snapshot.modifiedAt,
      lfs: snapshot.lfs,
    };
    if (snapshot.missing) return { ...common, kind: 'missing', bytes: 0, reason: snapshot.missing };
    const mimeType = imageMimeTypes[path.extname(request.path).slice(1).toLowerCase()] || null;
    if (snapshot.bytes > FILE_PREVIEW_LIMIT && (!mimeType || !input.allowLargeImage || snapshot.bytes > IMAGE_PREVIEW_LIMIT))
      return {
        ...common,
        editable: false,
        kind: 'binary',
        bytes: snapshot.bytes,
        mimeType,
        reason: 'tooLarge',
        canLoadImage: Boolean(mimeType) && snapshot.bytes <= IMAGE_PREVIEW_LIMIT,
      };
    const buffer = await this.buffer(request, snapshot);
    if (mimeType)
      return { ...common, editable: false, kind: 'image', bytes: buffer.length, mimeType, dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` };
    if (detectRepositoryFileEncoding(buffer) === 'binary')
      return { ...common, editable: false, kind: 'binary', bytes: buffer.length, mimeType, reason: 'binary' };
    const decoded = decodeRepositoryFile(buffer);
    return { ...common, kind: 'text', text: decoded.text, encoding: decoded.encoding, isMarkdown: /\.md(?:own)?$/i.test(request.path), bytes: buffer.length };
  }

  async getInfo(input: RepositoryFileContextDto): Promise<RepositoryFileInfoDto> {
    const request = this.validateContext(input);
    const snapshot = await this.snapshot(request);
    if (snapshot.missing)
      return {
        path: request.path,
        bytes: snapshot.bytes,
        version: snapshot.version,
        editable: false,
        readOnlyReason: snapshot.missing,
        lfs: snapshot.lfs,
        hashes: null,
      };
    let hashes: NonNullable<RepositoryFileInfoDto['hashes']>;
    if (snapshot.lfs && snapshot.diskPath) {
      const sha256 = createHash('sha256'),
        sha1 = createHash('sha1'),
        md5 = createHash('md5');
      for await (const chunk of fs.createReadStream(snapshot.diskPath)) {
        sha256.update(chunk);
        sha1.update(chunk);
        md5.update(chunk);
      }
      hashes = { sha256: sha256.digest('hex'), sha1: sha1.digest('hex'), md5: md5.digest('hex') };
      if (hashes.sha256 !== snapshot.lfs.oid) throw new Error('The selected Git LFS object failed its integrity check.');
    } else {
      const buffer = await this.buffer(request, snapshot);
      hashes = { sha256: digest(buffer), sha1: createHash('sha1').update(buffer).digest('hex'), md5: createHash('md5').update(buffer).digest('hex') };
    }
    return {
      path: request.path,
      bytes: snapshot.bytes,
      version: snapshot.version,
      editable: snapshot.editable,
      readOnlyReason: snapshot.readOnlyReason,
      modifiedAt: snapshot.modifiedAt,
      lfs: snapshot.lfs,
      hashes,
    };
  }

  async save(input: SaveRepositoryFileRequestDto, ensureContext: () => void): Promise<SaveRepositoryFileResultDto> {
    const request = this.validateContext(input);
    if (request.source === 'commit') throw new Error('Commit versions are read-only.');
    if (typeof input.content !== 'string' || typeof input.expectedVersion !== 'string') throw new Error('Invalid file save request.');
    if (!['utf8', 'utf8-bom', 'utf16le', 'utf16be', 'latin1'].includes(input.encoding)) throw new Error('Invalid text encoding.');
    const contents = encodeRepositoryFile(input.content, input.encoding);
    if (contents.length > FILE_PREVIEW_LIMIT) throw new Error('The edited file exceeds the text editor size limit (2 MiB).');
    return this.runner.withExclusiveWrite(request.repoPath, 'save repository file', async (git) => {
      ensureContext();
      const initial = await this.snapshot(request, git);
      if (initial.version !== input.expectedVersion) throw changedError();
      if (!initial.editable || initial.missing) throw new Error(initial.readOnlyReason || initial.missing || 'This file cannot be edited.');
      let saved: Snapshot;
      if (request.source === 'unstaged') {
        await this.files.writeRepoFileAtPath(request.repoPath, request.path, input.content, input.encoding, () => {
          ensureContext();
          // No await between the final comparison and the atomic rename.
          if (this.workingSnapshot(request).version !== input.expectedVersion) throw changedError();
        });
        saved = this.workingSnapshot(request);
        if (!saved.buffer || digest(saved.buffer) !== digest(contents)) throw changedError();
      } else {
        saved = await withPrivateIndex(git, request.repoPath, async (index, publish) => {
          const current = await this.snapshot(request, git);
          if (current.version !== input.expectedVersion) throw changedError();
          const filter = (await git.run(request.repoPath, ['check-attr', '--cached', '-z', 'filter', '--', request.path])).split('\0')[2];
          const stored =
            current.lfs || filter === 'lfs' ? await cleanLfsContent(request.repoPath, request.path, Readable.from([contents]), git.signal) : contents;
          const oid = (await git.input(request.repoPath, ['hash-object', '-w', '--stdin', '--no-filters'], stored)).trim();
          if (!/^[0-9a-f]{40,64}$/.test(oid)) throw new Error('Git did not create a valid file blob.');
          const envOverrides = { GIT_INDEX_FILE: index };
          await git.input(request.repoPath, ['update-index', '-z', '--index-info'], `${current.mode} ${oid}\t${request.path}\0`, false, envOverrides);
          if (current.flags && current.flags === current.flags.toLowerCase())
            await git.run(request.repoPath, ['update-index', '--assume-unchanged', '--', request.path], { envOverrides });
          if (current.flags?.toUpperCase() === 'S') await git.run(request.repoPath, ['update-index', '--skip-worktree', '--', request.path], { envOverrides });
          const prepared = await this.snapshot(request, { run: (cwd, args, options) => git.run(cwd, args, { ...options, envOverrides }) });
          if (prepared.oid !== oid || prepared.mode !== current.mode) throw new Error('The prepared index entry could not be verified.');
          await publish(async () => {
            ensureContext();
            if ((await this.snapshot(request, git)).version !== input.expectedVersion) throw changedError();
            ensureContext();
          });
          // Return the version actually published, never a later external
          // index change paired with our editor's saved text.
          return prepared;
        });
      }
      return { version: saved.version, bytes: contents.length, modifiedAt: saved.modifiedAt };
    });
  }
}
