import * as fs from 'fs';
import * as path from 'path';

const FILE_ACCESS_GRANT_TTL_MS = 30 * 60 * 1000;

type FileAccessGrant = {
  expiresAt: number;
};

const grantsByWebContents = new Map<number, Map<string, FileAccessGrant>>();

function canonicalizeSelectedFile(filePath: unknown): string | null {
  if (typeof filePath !== 'string' || !filePath.trim()) return null;

  try {
    const absolutePath = path.resolve(filePath);
    if (!fs.statSync(absolutePath).isFile()) return null;
    return fs.realpathSync.native(absolutePath);
  } catch {
    return null;
  }
}

function pruneExpiredGrants(grants: Map<string, FileAccessGrant>, now: number): void {
  for (const [filePath, grant] of grants) {
    if (grant.expiresAt <= now) {
      grants.delete(filePath);
    }
  }
}

/**
 * Records files chosen through Electron's native file dialog for one renderer.
 * Main-process operations that upload arbitrary local paths must resolve their
 * path through this grant instead of trusting a renderer-provided path.
 */
export function grantSelectedFiles(webContentsId: number, filePaths: readonly string[]): void {
  if (!Number.isInteger(webContentsId) || webContentsId <= 0) return;

  const now = Date.now();
  const grants = grantsByWebContents.get(webContentsId) || new Map<string, FileAccessGrant>();
  pruneExpiredGrants(grants, now);

  for (const filePath of filePaths.slice(0, 100)) {
    const canonicalPath = canonicalizeSelectedFile(filePath);
    if (canonicalPath) {
      grants.set(canonicalPath, { expiresAt: now + FILE_ACCESS_GRANT_TTL_MS });
    }
  }

  if (grants.size > 0) {
    grantsByWebContents.set(webContentsId, grants);
  }
}

/**
 * Returns a canonical, dialog-authorized path, or null when the renderer did
 * not select the requested file in its current grant window.
 */
export function getAuthorizedSelectedFile(webContentsId: number, filePath: unknown): string | null {
  if (!Number.isInteger(webContentsId) || webContentsId <= 0) return null;

  const canonicalPath = canonicalizeSelectedFile(filePath);
  if (!canonicalPath) return null;

  const grants = grantsByWebContents.get(webContentsId);
  if (!grants) return null;

  pruneExpiredGrants(grants, Date.now());
  if (grants.size === 0) {
    grantsByWebContents.delete(webContentsId);
    return null;
  }

  return grants.has(canonicalPath) ? canonicalPath : null;
}

export function clearSelectedFileGrants(webContentsId: number): void {
  grantsByWebContents.delete(webContentsId);
}
