import * as fs from 'fs';
import * as path from 'path';

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

export class RepositoryFiles {
  constructor(
    private readonly getRepoPath: () => string,
    private readonly readGitFileBuffer: (revisionSpec: string, maxBytes: number) => Promise<Buffer>,
  ) {}

  async readRepoFile(relativePath: string): Promise<string> {
    const repoPath = this.getRepoPath();
    const normalizedRelativePath = (relativePath || '').trim();
    if (!normalizedRelativePath) {
      throw new Error('File path is required.');
    }

    const resolvedPath = path.resolve(repoPath, normalizedRelativePath);
    if (!this.isPathInsideRepo(repoPath, resolvedPath)) {
      throw new Error('File path is outside the current repository.');
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }
    if (stat.size > 2 * 1024 * 1024) {
      throw new Error('File is too large for inline conflict editing (>2MB).');
    }

    return fs.readFileSync(resolvedPath, 'utf8');
  }

  async readRepositoryFileTextAtSource(source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<string> {
    const normalizedRelativePath = this.normalizeRepoRelativePath(relativePath);
    if (source === 'unstaged') {
      return this.readWorkingTreeFileBuffer(normalizedRelativePath, MAX_MARKDOWN_PREVIEW_FILE_BYTES).toString('utf8');
    }

    const revisionSpec = this.buildRevisionFileSpec(source, normalizedRelativePath, commitHash);
    return (await this.readGitFileBuffer(revisionSpec, MAX_MARKDOWN_PREVIEW_FILE_BYTES)).toString('utf8');
  }

  async readRepositoryImageDataUrlAtSource(source: RepositoryFileSource, relativePath: string, commitHash?: string): Promise<RepositoryFileDataUrl> {
    const normalizedRelativePath = this.normalizeRepoRelativePath(relativePath);
    const mimeType = this.getImageMimeType(normalizedRelativePath);
    const buffer =
      source === 'unstaged'
        ? this.readWorkingTreeFileBuffer(normalizedRelativePath, MAX_MARKDOWN_PREVIEW_ASSET_BYTES)
        : await this.readGitFileBuffer(this.buildRevisionFileSpec(source, normalizedRelativePath, commitHash), MAX_MARKDOWN_PREVIEW_ASSET_BYTES);

    return {
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mimeType,
      bytes: buffer.length,
    };
  }

  async writeRepoFile(relativePath: string, content: string): Promise<void> {
    const repoPath = this.getRepoPath();
    const normalizedRelativePath = (relativePath || '').trim();
    if (!normalizedRelativePath) {
      throw new Error('File path is required.');
    }

    const resolvedPath = path.resolve(repoPath, normalizedRelativePath);
    if (!this.isPathInsideRepo(repoPath, resolvedPath)) {
      throw new Error('File path is outside the current repository.');
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) {
      throw new Error('Target path is not a file.');
    }

    const textValue = typeof content === 'string' ? content : String(content ?? '');
    fs.writeFileSync(resolvedPath, textValue, 'utf8');
  }

  private isPathInsideRepo(repoPath: string, filePath: string): boolean {
    const relative = path.relative(repoPath, filePath);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  private normalizeRepoRelativePath(relativePath: string): string {
    const rawPath = String(relativePath || '').trim();
    if (!rawPath) {
      throw new Error('File path is required.');
    }

    const normalizedForCheck = rawPath.replace(/\\/g, '/');
    const segments = normalizedForCheck.split('/');
    if (
      path.isAbsolute(rawPath) ||
      path.win32.isAbsolute(rawPath) ||
      normalizedForCheck.startsWith('/') ||
      normalizedForCheck.startsWith(':(') ||
      segments.includes('..') ||
      /[\0\r\n]/.test(rawPath)
    ) {
      throw new Error('File path must be repository-relative.');
    }

    return normalizedForCheck;
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

  private readWorkingTreeFileBuffer(relativePath: string, maxBytes: number): Buffer {
    const repoPath = this.getRepoPath();
    const normalizedRelativePath = this.normalizeRepoRelativePath(relativePath);
    const resolvedPath = path.resolve(repoPath, normalizedRelativePath);
    if (!this.isPathInsideRepo(repoPath, resolvedPath)) {
      throw new Error('File path is outside the current repository.');
    }

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
