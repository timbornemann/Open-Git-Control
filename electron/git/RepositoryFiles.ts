import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeRepositoryRelativePath, resolveExistingRepositoryPathWithoutSymlinks } from './RepositoryPathSafety';
import { decodeRepositoryFile, detectRepositoryFileEncoding, encodeRepositoryFile, type RepositoryTextEncoding } from './RepositoryFileEncoding';

export type RepositoryFileSource = 'unstaged' | 'staged' | 'commit';

export type RepositoryFileDataUrl = {
  dataUrl: string;
  mimeType: string;
  bytes: number;
};

const MAX_MARKDOWN_PREVIEW_FILE_BYTES = 2 * 1024 * 1024;
const MAX_MARKDOWN_PREVIEW_ASSET_BYTES = 10 * 1024 * 1024;
const COMMIT_HASH_RE = /^[0-9a-f]{7,64}$/i;
const IMAGE_MIME_TYPES = new Map<string, string>([
  ['apng', 'image/apng'],
  ['avif', 'image/avif'],
  ['bmp', 'image/bmp'],
  ['gif', 'image/gif'],
  ['ico', 'image/x-icon'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['svg', 'image/svg+xml'],
  ['webp', 'image/webp'],
]);

const writeRepositoryFileAtomically = (targetPath: string, contents: Buffer, mode: number): void => {
  const temporaryPath = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.ogc-write-${process.pid}-${randomUUID()}.tmp`);
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', mode);
    fs.writeFileSync(descriptor, contents);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, targetPath);
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // A successful rename has already published the replacement.
    }
  }
};

export class RepositoryFiles {
  constructor(
    private readonly getRepoPath: () => string,
    private readonly readGitFileBuffer: (repoPath: string, revisionSpec: string, maxBytes: number) => Promise<Buffer>,
  ) {}

  async readRepoFile(relativePath: string): Promise<string> {
    return this.readRepoFileAtPath(this.getRepoPath(), relativePath);
  }

  async readRepoFileAtPath(repoPath: string, relativePath: string): Promise<string> {
    const resolvedPath = resolveExistingRepositoryPathWithoutSymlinks(repoPath, relativePath);

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }
    if (stat.size > 2 * 1024 * 1024) {
      throw new Error('File is too large for inline conflict editing (>2MB).');
    }

    // Decode with the file's detected encoding (not a hard-coded UTF-8) so that
    // UTF-16/Latin-1/BOM content is not corrupted, and binary files are refused.
    return decodeRepositoryFile(fs.readFileSync(resolvedPath)).text;
  }

  async readRepositoryFileTextAtSource(source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<string> {
    return this.readRepositoryFileTextAtSourceAndPath(this.getRepoPath(), source, relativePath, commitHash);
  }

  async readRepositoryFileTextAtSourceAndPath(repoPath: string, source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<string> {
    const normalizedRelativePath = this.normalizeRepoRelativePath(relativePath);
    if (source === 'unstaged') {
      return decodeRepositoryFile(this.readWorkingTreeFileBuffer(repoPath, normalizedRelativePath, MAX_MARKDOWN_PREVIEW_FILE_BYTES)).text;
    }

    const revisionSpec = this.buildRevisionFileSpec(source, normalizedRelativePath, commitHash);
    return decodeRepositoryFile(await this.readGitFileBuffer(repoPath, revisionSpec, MAX_MARKDOWN_PREVIEW_FILE_BYTES)).text;
  }

  async readRepositoryImageDataUrlAtSource(source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<RepositoryFileDataUrl> {
    return this.readRepositoryImageDataUrlAtSourceAndPath(this.getRepoPath(), source, relativePath, commitHash);
  }

  async readRepositoryImageDataUrlAtSourceAndPath(
    repoPath: string,
    source: RepositoryFileSource,
    relativePath: string,
    commitHash?: string,
  ): Promise<RepositoryFileDataUrl> {
    const normalizedRelativePath = this.normalizeRepoRelativePath(relativePath);
    const mimeType = this.getImageMimeType(normalizedRelativePath);
    const buffer =
      source === 'unstaged'
        ? this.readWorkingTreeFileBuffer(repoPath, normalizedRelativePath, MAX_MARKDOWN_PREVIEW_ASSET_BYTES)
        : await this.readGitFileBuffer(repoPath, this.buildRevisionFileSpec(source, normalizedRelativePath, commitHash), MAX_MARKDOWN_PREVIEW_ASSET_BYTES);

    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
      bytes: buffer.length,
    };
  }

  async writeRepoFile(relativePath: string, content: string): Promise<void> {
    return this.writeRepoFileAtPath(this.getRepoPath(), relativePath, content);
  }

  async writeRepoFileAtPath(repoPath: string, relativePath: string, content: string, targetEncoding?: RepositoryTextEncoding): Promise<void> {
    const resolvedPath = resolveExistingRepositoryPathWithoutSymlinks(repoPath, relativePath);

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }

    // Preserve the file's original byte encoding. Re-detecting from the current
    // on-disk bytes means an unchanged conflict resolution is written back
    // identically instead of being silently converted to UTF-8. Binary files
    // are refused rather than corrupted.
    const detectedEncoding = detectRepositoryFileEncoding(fs.readFileSync(resolvedPath));
    if (detectedEncoding === 'binary') {
      throw new Error('This file appears to be binary and cannot be edited as text.');
    }
    const encoding = targetEncoding ?? detectedEncoding;

    const textValue = typeof content === 'string' ? content : String(content ?? '');
    writeRepositoryFileAtomically(resolvedPath, encodeRepositoryFile(textValue, encoding), stat.mode & 0o777);
  }

  async deleteRepoFileAtPath(repoPath: string, relativePath: string): Promise<void> {
    const resolvedPath = resolveExistingRepositoryPathWithoutSymlinks(repoPath, relativePath);
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }
    fs.unlinkSync(resolvedPath);
  }

  private normalizeRepoRelativePath(relativePath: string): string {
    return normalizeRepositoryRelativePath(relativePath);
  }

  private getImageMimeType(relativePath: string): string {
    const fileName = relativePath.split('/').pop() || relativePath;
    const lastDot = fileName.lastIndexOf('.');
    const extension = lastDot >= 0 ? fileName.slice(lastDot + 1).toLowerCase() : '';
    const mimeType = IMAGE_MIME_TYPES.get(extension);
    if (!mimeType) {
      throw new Error('Only image assets can be loaded for Markdown preview.');
    }
    return mimeType;
  }

  private buildRevisionFileSpec(source: RepositoryFileSource, relativePath: string, commitHash?: string): string {
    if (source === 'staged') {
      return `:${relativePath}`;
    }

    if (source === 'commit') {
      const normalizedHash = String(commitHash || '').trim();
      if (!COMMIT_HASH_RE.test(normalizedHash)) {
        throw new Error('Invalid commit hash.');
      }
      return `${normalizedHash}:${relativePath}`;
    }

    throw new Error('Working tree files are not addressed by a Git revision spec.');
  }

  private readWorkingTreeFileBuffer(repoPath: string, relativePath: string, maxBytes: number): Buffer {
    const normalizedRelativePath = this.normalizeRepoRelativePath(relativePath);
    const resolvedPath = resolveExistingRepositoryPathWithoutSymlinks(repoPath, normalizedRelativePath);

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }
    if (stat.size > maxBytes) {
      throw new Error('File is too large for Markdown preview.');
    }

    return fs.readFileSync(resolvedPath);
  }
}
