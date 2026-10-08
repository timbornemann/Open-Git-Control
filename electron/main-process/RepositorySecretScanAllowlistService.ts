import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getOpenGitControlAssetPath, ensureOpenGitControlReadme } from './openGitControlDirectory';
import { addFindingPathsToSecretScanAllowlistText } from '../../src/shared/secretScanAllowlist';
import { validateSecretScanAllowlist } from '../../src/shared/secretScanAllowlistValidation';
import {
  MAX_SECRET_SCAN_ALLOWLIST_BYTES,
  SECRET_SCAN_ALLOWLIST_FILE,
  SECRET_SCAN_ALLOWLIST_PATH,
  type RepositorySecretScanAllowlistDto,
} from '../../src/types/repositorySecretScanAllowlist';

const VERSION_CHANGED = 'Secret-scan allowlist changed. Reload it before saving or scanning again.';

/** Working-tree policy, deliberately independent of the real or a private Git index. */
export class RepositorySecretScanAllowlistService {
  read(repoPath: string): RepositorySecretScanAllowlistDto {
    const value = this.readForEditing(repoPath);
    if (value.validationError) throw new Error(value.validationError);
    return value;
  }

  readForEditing(repoPath: string): RepositorySecretScanAllowlistDto {
    const filePath = getOpenGitControlAssetPath(repoPath, SECRET_SCAN_ALLOWLIST_FILE, 'Secret-scan allowlist');
    const canonicalRepo = fs.realpathSync(repoPath);
    let bytes: Buffer;
    try {
      const stats = fs.lstatSync(filePath);
      if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Secret-scan allowlist must be a regular repository file.');
      if (stats.size > MAX_SECRET_SCAN_ALLOWLIST_BYTES) throw new Error('Secret-scan allowlist exceeds 256 KiB.');
      const descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      try {
        // A bounded read also covers a file growing after stat.
        bytes = Buffer.alloc(MAX_SECRET_SCAN_ALLOWLIST_BYTES + 1);
        let length = 0;
        while (length < bytes.length) {
          const count = fs.readSync(descriptor, bytes, length, bytes.length - length, length);
          if (!count) break;
          length += count;
        }
        if (length > MAX_SECRET_SCAN_ALLOWLIST_BYTES) throw new Error('Secret-scan allowlist exceeds 256 KiB.');
        bytes = bytes.subarray(0, length);
      } finally {
        fs.closeSync(descriptor);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return { repoPath: canonicalRepo, relativePath: SECRET_SCAN_ALLOWLIST_PATH, exists: false, text: '', version: 'missing' };
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new Error('Secret-scan allowlist must use UTF-8 encoding.');
    }
    let validationError: string | undefined;
    try {
      validateSecretScanAllowlist(text);
    } catch (error) {
      validationError = (error as Error).message;
    }
    return {
      repoPath: canonicalRepo,
      relativePath: SECRET_SCAN_ALLOWLIST_PATH,
      exists: true,
      text,
      version: createHash('sha256').update(bytes).digest('hex'),
      ...(validationError ? { validationError } : {}),
    };
  }

  assertVersion(repoPath: string, expectedVersion: string): void {
    if (this.read(repoPath).version !== expectedVersion) throw new Error(VERSION_CHANGED);
  }

  save(repoPath: string, value: unknown, expectedVersion: unknown): RepositorySecretScanAllowlistDto {
    if (typeof value !== 'string' || typeof expectedVersion !== 'string') throw new Error('Allowlist text and expected version are required.');
    const text = value.replace(/\r\n?/g, '\n');
    if (Buffer.byteLength(text, 'utf8') > MAX_SECRET_SCAN_ALLOWLIST_BYTES) throw new Error('Secret-scan allowlist exceeds 256 KiB.');
    validateSecretScanAllowlist(text);
    this.assertSaveVersion(repoPath, expectedVersion);
    const filePath = getOpenGitControlAssetPath(repoPath, SECRET_SCAN_ALLOWLIST_FILE, 'Secret-scan allowlist');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = path.join(path.dirname(filePath), `.${SECRET_SCAN_ALLOWLIST_FILE}.${randomUUID()}.tmp`);
    try {
      const descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
      try {
        fs.writeFileSync(descriptor, text, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      // Synchronous compare/publication serializes app writes; no await can
      // permit another app request to replace a newly edited policy here.
      this.assertSaveVersion(repoPath, expectedVersion);
      if (getOpenGitControlAssetPath(repoPath, SECRET_SCAN_ALLOWLIST_FILE, 'Secret-scan allowlist') !== filePath) throw new Error(VERSION_CHANGED);
      fs.renameSync(temporaryPath, filePath);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
    // Failure to create optional documentation must not misreport a saved policy.
    try {
      ensureOpenGitControlReadme(repoPath);
    } catch {
      // The allowlist itself has been durably saved.
    }
    return this.read(repoPath);
  }

  private assertSaveVersion(repoPath: string, expectedVersion: string): void {
    if (this.readForEditing(repoPath).version !== expectedVersion) throw new Error(VERSION_CHANGED);
  }

  addPaths(repoPath: string, paths: unknown, expectedVersion: unknown): RepositorySecretScanAllowlistDto {
    if (!Array.isArray(paths) || paths.length > 2000) throw new Error('Repository-relative file paths are required.');
    const current = this.read(repoPath);
    if (current.version !== expectedVersion) throw new Error(VERSION_CHANGED);
    const relativePaths = paths.map((value) => {
      if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw new Error('Invalid allowlist file path.');
      const relativePath = value.replace(/\\/g, '/');
      if (
        !relativePath ||
        relativePath.startsWith('/') ||
        /^[a-z]:/i.test(relativePath) ||
        relativePath.split('/').some((part) => part === '..' || part === '.')
      ) {
        throw new Error('Allowlist file paths must be repository-relative.');
      }
      return { filePath: relativePath };
    });
    const update = addFindingPathsToSecretScanAllowlistText(current.text, relativePaths);
    if (update.addedPaths.length === 0) return current;
    return this.save(repoPath, `${update.allowlistText}\n`, current.version);
  }
}

export const repositorySecretScanAllowlistFiles = new RepositorySecretScanAllowlistService();
