import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { resolveExistingRepositoryPathWithoutSymlinks } from '../git/RepositoryPathSafety';
import { repositoryImageMimeType } from '../../src/shared/repositoryImageTypes';
import { REPOSITORY_ICON_MAX_BYTES, REPOSITORY_ICON_MAX_SVG_BYTES, type RepositoryIconSourceDto } from '../../src/shared/repositoryIcons';

const excluded = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  '.cache',
  'coverage',
  'dist',
  'dist-electron',
  'target',
  '.next',
  '.nuxt',
  '.venv',
  'venv',
  '.pnpm-store',
  '.yarn',
]);
const assets = new Set(['assets', 'public', 'static', 'resources', 'images', 'icons', 'build', 'docs', 'branding']);
const exactNames = new Set(['icon', 'logo', 'app-icon', 'app_icon', 'appicon', 'app-logo', 'app_logo', 'applogo']);
function rank(relativePath: string) {
  const name = path.basename(relativePath, path.extname(relativePath)).toLowerCase();
  const terms = exactNames.has(name) ? 0 : name === 'favicon' ? 1 : /icon|logo/.test(name) ? 2 : /brand|wordmark|emblem/.test(name) ? 3 : 4;
  const parts = relativePath.split('/');
  const location = parts.length === 1 ? 0 : parts.slice(0, -1).some((part) => assets.has(part.toLowerCase())) ? 1 : 2;
  return [terms, location];
}
export const compareRepositoryIcons = (a: string, b: string) => {
  const left = rank(a),
    right = rank(b);
  return (
    left[0] - right[0] || left[1] - right[1] || (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : a < b ? -1 : a > b ? 1 : 0)
  );
};
export async function discoverRepositoryIcons(repoPath: string, limits = { depth: 8, entries: 20_000 }) {
  const root = await fs.realpath(repoPath);
  const queue = [{ directory: root, relative: '', depth: 0 }];
  const candidates: string[] = [];
  let inspected = 0,
    limited = false;
  for (let index = 0; index < queue.length; index++) {
    const folder = queue[index];
    let directory: Awaited<ReturnType<typeof fs.opendir>>;
    try {
      directory = await fs.opendir(folder.directory);
    } catch (error) {
      if (index === 0) throw error;
      else continue;
    }
    for await (const entry of directory) {
      if (++inspected > limits.entries) {
        limited = true;
        break;
      }
      if (entry.isSymbolicLink()) continue;
      const relative = folder.relative ? `${folder.relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (excluded.has(entry.name.toLowerCase())) continue;
        if (folder.depth >= limits.depth) {
          limited = true;
          continue;
        }
        queue.push({ directory: path.join(folder.directory, entry.name), relative, depth: folder.depth + 1 });
      } else if (entry.isFile() && repositoryImageMimeType(entry.name) && rank(relative)[0] < 4) {
        candidates.push(relative);
      }
    }
    if (inspected > limits.entries) break;
  }
  return { candidates: candidates.sort(compareRepositoryIcons), limited };
}
export async function readRepositoryIconSource(repoPath: string, relativePath: string): Promise<RepositoryIconSourceDto> {
  const filePath = resolveExistingRepositoryPathWithoutSymlinks(repoPath, relativePath);
  const mimeType = repositoryImageMimeType(relativePath);
  if (!mimeType) throw new Error('Unsupported repository image format.');
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    const limit = mimeType === 'image/svg+xml' ? REPOSITORY_ICON_MAX_SVG_BYTES : REPOSITORY_ICON_MAX_BYTES;
    if (!stat.isFile() || stat.size > limit) throw new Error('Repository image is too large or not a regular file.');
    // Read only the permitted bytes even if another process grows the file.
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) break;
      offset += read.bytesRead;
    }
    if (offset !== stat.size) throw new Error('Repository image changed while being read.');
    const buffer = bytes.subarray(0, stat.size);
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error('Repository image changed while being read.');
    return {
      path: relativePath,
      version: createHash('sha256').update(buffer).digest('hex'),
      dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mtimeMs: stat.mtimeMs,
      bytes: stat.size,
    };
  } finally {
    await handle.close();
  }
}
