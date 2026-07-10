import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Writes a complete replacement beside the destination and publishes it with rename. */
export function writeTextFileAtomically(filePath: string, contents: string): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor: number | null = null;

  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original error.
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // A successfully renamed temporary file no longer exists.
    }
  }
}
