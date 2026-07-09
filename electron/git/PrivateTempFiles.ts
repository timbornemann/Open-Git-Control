import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const createPrivateTempDir = (prefix: string): string => {
  const safePrefix = String(prefix || 'ogc-temp-').replace(/[^a-z0-9_-]/gi, '-') || 'ogc-temp-';
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), safePrefix.endsWith('-') ? safePrefix : `${safePrefix}-`));
  try {
    fs.chmodSync(tempDir, 0o700);
  } catch {
    // Some platforms ignore chmod for temp directories.
  }
  return tempDir;
};

export const writePrivateTempFile = (filePath: string, content: string): void => {
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Some platforms ignore chmod for temp files.
  }
};

export const cleanupPrivateTempDir = (tempDir: string | null): void => {
  if (!tempDir) return;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup: the directory is private and will be retried by the OS temp cleaner.
  }
};
