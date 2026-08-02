import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { GitService } from '../../../GitService';
import { decodeRepositoryFile, detectRepositoryFileEncoding } from '../../../git/RepositoryFileEncoding';
import { requireActiveRepositoryPath } from '../../activeRepositoryAuthorization';
import { IpcChannel } from '../../../../src/types/ipcContract';

type WorkingDirectoryPathResolver = (repoPath: string, value: unknown, label: string) => string;

const PREVIEW_LIMIT = 2 * 1024 * 1024;
const LARGE_IMAGE_PREVIEW_LIMIT = 25 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Map([
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

export function registerWorkingDirectoryPreviewHandler(gitService: GitService, workingDirectoryPath: WorkingDirectoryPathResolver): void {
  ipcMain.handle(
    IpcChannel.GitGetWorkingDirectoryPreview,
    async (_event: unknown, filePath: unknown, requestedRepoPath?: unknown, allowLargeImage?: unknown) => {
      try {
        const repoPath = requireActiveRepositoryPath(requestedRepoPath, gitService.getRepoPath(), IpcChannel.GitGetWorkingDirectoryPreview);
        const resolvedPath = workingDirectoryPath(repoPath, filePath, 'File path');
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile()) throw new Error('Target path is not a file.');
        const extension = path.extname(resolvedPath).slice(1).toLowerCase();
        const mimeType = IMAGE_MIME_TYPES.get(extension) || null;
        if (stat.size > PREVIEW_LIMIT && (!mimeType || allowLargeImage !== true || stat.size > LARGE_IMAGE_PREVIEW_LIMIT)) {
          return {
            success: true,
            data: {
              kind: 'binary',
              bytes: stat.size,
              mimeType,
              reason: 'tooLarge',
              canLoadImage: Boolean(mimeType) && stat.size <= LARGE_IMAGE_PREVIEW_LIMIT,
              modifiedAt: stat.mtime.toISOString(),
            },
          };
        }

        const buffer = fs.readFileSync(resolvedPath);
        if (mimeType) {
          return {
            success: true,
            data: {
              kind: 'image',
              dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
              mimeType,
              bytes: stat.size,
              modifiedAt: stat.mtime.toISOString(),
            },
          };
        }
        if (detectRepositoryFileEncoding(buffer) === 'binary') {
          return {
            success: true,
            data: { kind: 'binary', bytes: stat.size, mimeType: null, reason: 'binary', modifiedAt: stat.mtime.toISOString() },
          };
        }

        const decoded = decodeRepositoryFile(buffer);
        return {
          success: true,
          data: {
            kind: 'text',
            text: decoded.text,
            bytes: stat.size,
            isMarkdown: /\.md(?:own)?$/i.test(String(filePath)),
            encoding: decoded.encoding,
            modifiedAt: stat.mtime.toISOString(),
          },
        };
      } catch (error: unknown) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
}
