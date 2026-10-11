import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { assertManagedPath } from '../main-process/storageSafety';

export const privateTempRoot = () => path.join(os.tmpdir(), 'open-git-control-workspaces');
const active = new Set<string>();
const MARKER = '.ogc-workspace.json';
export type PrivateTempWorkspace = { directory: string; bytes: number; files: number; eligible: boolean; unclear?: boolean };

export const createPrivateTempDir = (prefix: string, root = privateTempRoot()): string => {
  const safePrefix = String(prefix || 'ogc-temp-').replace(/[^a-z0-9_-]/gi, '-') || 'ogc-temp-';
  assertManagedPath(os.tmpdir(), root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const tempDir = fs.mkdtempSync(path.join(root, safePrefix.endsWith('-') ? safePrefix : `${safePrefix}-`));
  fs.writeFileSync(
    path.join(tempDir, MARKER),
    JSON.stringify({
      version: 1,
      application: 'Open-Git-Control',
      id: randomUUID(),
      pid: process.pid,
      createdAt: Date.now(),
      directory: path.basename(tempDir),
    }),
    { mode: 0o600, flag: 'wx' },
  );
  active.add(tempDir);
  try {
    fs.chmodSync(tempDir, 0o700);
  } catch {
    // Some platforms ignore chmod for temp directories.
  }
  return tempDir;
};

export const writePrivateTempFile = (filePath: string, content: string): void => {
  assertManagedPath(os.tmpdir(), filePath);
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Some platforms ignore chmod for temp files.
  }
};

export const cleanupPrivateTempDir = (tempDir: string | null, root = privateTempRoot()): void => {
  if (!tempDir) return;
  try {
    assertManagedPath(root, tempDir);
    if (!active.has(tempDir)) return;
    const owner = JSON.parse(fs.readFileSync(path.join(tempDir, MARKER), 'utf8'));
    if (owner.application !== 'Open-Git-Control' || owner.pid !== process.pid || owner.directory !== path.basename(tempDir)) return;
    const pending = [tempDir];
    while (pending.length) {
      const current = pending.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const file = path.join(current, entry.name);
        assertManagedPath(root, file);
        if (entry.isDirectory()) pending.push(file);
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
    active.delete(tempDir);
  } catch {
    // Best-effort cleanup: the directory is private and will be retried by the OS temp cleaner.
  }
};

export function inspectPrivateTempFiles(now = Date.now(), root = privateTempRoot()): PrivateTempWorkspace[] {
  let entries: fs.Dirent[];
  try {
    assertManagedPath(os.tmpdir(), root);
    if (!fs.existsSync(root)) return [];
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [{ directory: root, bytes: 0, files: 0, eligible: false, unclear: true }];
  }
  return entries.flatMap((entry) => {
    const directory = path.join(root, entry.name);
    const unknown = { directory, bytes: 0, files: 0, eligible: false, unclear: true };
    if (entry.isSymbolicLink()) return [unknown];
    try {
      assertManagedPath(root, directory);
      if (!entry.isDirectory()) return [{ ...unknown, files: 1, bytes: fs.lstatSync(directory).size }];
      let bytes = 0,
        files = 0;
      const pending = [directory];
      while (pending.length) {
        const current = pending.pop()!;
        for (const child of fs.readdirSync(current, { withFileTypes: true })) {
          const file = path.join(current, child.name);
          assertManagedPath(root, file);
          if (child.isDirectory()) pending.push(file);
          else if (child.isFile()) {
            bytes += fs.statSync(file).size;
            files++;
          }
        }
      }
      Object.assign(unknown, { bytes, files });
      const markerFile = path.join(directory, MARKER);
      assertManagedPath(root, markerFile);
      const owner = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
      if (
        owner.version !== 1 ||
        owner.application !== 'Open-Git-Control' ||
        owner.directory !== entry.name ||
        typeof owner.id !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(owner.id) ||
        !Number.isSafeInteger(owner.pid) ||
        owner.pid <= 0 ||
        !Number.isFinite(owner.createdAt) ||
        owner.createdAt < 0
      )
        return [unknown];
      let alive = true;
      try {
        process.kill(owner.pid, 0);
      } catch (error) {
        alive = (error as NodeJS.ErrnoException).code !== 'ESRCH';
      }
      return [{ directory, bytes, files, eligible: !active.has(directory) && !alive && now - owner.createdAt >= 7 * 86_400_000 }];
    } catch {
      return [unknown];
    }
  });
}

export function cleanPrivateTempFiles(now = Date.now(), root = privateTempRoot(), allowed?: Set<string>): { bytes: number; files: number } {
  let bytes = 0,
    files = 0;
  for (const candidate of inspectPrivateTempFiles(now, root)) {
    if (!candidate.eligible || (allowed && !allowed.has(candidate.directory))) continue;
    // Revalidate provenance, liveness, containment and every descendant immediately before removal.
    const current = inspectPrivateTempFiles(now, root).find((entry) => entry.directory === candidate.directory && entry.eligible);
    if (!current) continue;
    assertManagedPath(root, candidate.directory);
    fs.rmSync(candidate.directory, { recursive: true });
    bytes += current.bytes;
    files += current.files;
  }
  return { bytes, files };
}
