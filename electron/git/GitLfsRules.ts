import * as path from 'node:path';
import type { GitLfsFileState } from '../../src/shared/ipc/gitLfs';
import { detectRepositoryFileEncoding } from './RepositoryFileEncoding';

export const LFS_ASSET_MIN_BYTES = 1024 * 1024;
export const LFS_BINARY_MIN_BYTES = 10 * 1024 * 1024;
export const LFS_SAMPLE_BYTES = 64 * 1024;
const ASSETS = new Set(
  'png apng jpg jpeg gif webp avif bmp ico tif tiff psd psb ai sketch xd fig blend fbx glb gltf usd usdz mp3 wav flac aac ogg m4a mp4 mov mkv avi webm zip 7z rar gz bz2 xz tar pdf doc docx docm xls xlsx xlsm ppt pptx pptm odt ods odp epub ttf otf woff woff2'.split(
    ' ',
  ),
);
const TEXT = new Set(
  'ts tsx js jsx mjs cjs json jsonc yaml yml toml xml svg html htm css scss sass less md markdown txt csv tsv lock ini cfg conf env gitignore gitattributes gitmodules lfsconfig c h cpp hpp cc cs java py rb go rs sh bash ps1 bat cmd sql kt kts swift vue svelte'.split(
    ' ',
  ),
);

export function lfsRecommendation(filePath: string, bytes: number, sample: Buffer): GitLfsFileState['recommendation'] {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!bytes || TEXT.has(extension) || /(?:^|\/)(?:[^/]*lock[^/]*|\.env(?:\.[^/]*)?)$/i.test(filePath)) return undefined;
  if (ASSETS.has(extension) && bytes >= LFS_ASSET_MIN_BYTES) return 'asset';
  if (bytes >= LFS_BINARY_MIN_BYTES && detectRepositoryFileEncoding(sample) === 'binary') return 'binary';
  return undefined;
}

/** Match git lfs track --filename: glob characters are literal, and Git C quoting preserves whitespace. */
export function lfsAttributeRule(filePath: string, scope: 'file' | 'extension'): { attributesPath: string; rule: string; extension?: string } {
  const extension = path.posix.extname(filePath);
  if (scope === 'extension' && (!extension || !/^\.[a-zA-Z0-9_-]+$/.test(extension))) throw new Error('This file has no safely usable extension.');
  const parent = path.posix.dirname(filePath);
  const attributesPath = scope === 'extension' || parent === '.' ? '.gitattributes' : `${parent}/.gitattributes`;
  const pattern = scope === 'extension' ? `*${extension}` : `/${path.posix.basename(filePath).replace(/[\\*?[\]]/g, '\\$&')}`;
  const quoted = JSON.stringify(pattern);
  return { attributesPath, rule: `${quoted} filter=lfs diff=lfs merge=lfs -text`, extension: extension || undefined };
}

export function appendLfsRule(original: Buffer | null, rule: string): Buffer {
  const content = original?.toString('utf8') ?? '';
  if (content.split(/\r?\n/).includes(rule)) return original!;
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  return Buffer.concat([original ?? Buffer.alloc(0), Buffer.from(`${content && !content.endsWith('\n') ? eol : ''}${rule}${eol}`)]);
}
