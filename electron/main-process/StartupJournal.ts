import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { redactGitSensitiveText } from '../git/GitErrorFormatter';
import { assertManagedPathAsync } from './storageSafety';

type Details = Record<string, string | number | boolean | null>;
/** Small local diagnostics: two bounded logs, no repository contents or credentials. */
export class StartupJournal {
  private pending: Promise<void>;
  private count = 0;
  private readonly started = Date.now();
  readonly file: string;
  constructor(private readonly root: string) {
    this.file = path.join(root, 'startup.log');
    this.pending = this.initialize().catch(() => {});
  }
  private async initialize(): Promise<void> {
    const previous = path.join(this.root, 'startup.previous.log');
    await assertManagedPathAsync(this.root, this.file);
    await assertManagedPathAsync(this.root, previous);
    await fs.mkdir(this.root, { recursive: true });
    try {
      // Logs written by this journal never exceed 128 bounded records.
      if ((await fs.stat(this.file)).size <= 512 * 1024) await fs.copyFile(this.file, previous);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await fs.writeFile(this.file, '', { mode: 0o600 });
  }
  record(event: string, details: Details = {}): void {
    if (this.count++ >= 128) return;
    const safe = Object.fromEntries(
      Object.entries(details).map(([key, value]) => [key, typeof value === 'string' ? redactGitSensitiveText(value.slice(0, 2048)) : value]),
    );
    const line = `${JSON.stringify({ time: new Date().toISOString(), elapsedMs: Date.now() - this.started, event, ...safe })}\n`;
    this.pending = this.pending
      .then(async () => {
        await assertManagedPathAsync(this.root, this.file);
        await fs.appendFile(this.file, line, { mode: 0o600 });
      })
      .catch(() => {
        /* Diagnostics must not prevent startup or shutdown on a read-only profile. */
      });
  }
  flush(): Promise<void> {
    return this.pending;
  }
}
