import type { SecretScanProgressDto } from '../../src/types/secretScan';

/** No guessed percentages: a commit advances only after its batch was inspected. */
export class SecretScanProgress {
  private state: SecretScanProgressDto = { phase: 'preparing', checkedLines: 0 };
  private lastEmittedAt = 0;
  private lastEmittedLines = 0;
  constructor(private readonly notify?: (progress: SecretScanProgressDto) => void) {}
  private emit() {
    this.lastEmittedAt = Date.now();
    this.lastEmittedLines = this.state.checkedLines;
    this.notify?.({ ...this.state });
  }
  phase(phase: SecretScanProgressDto['phase']) {
    this.state = { phase, checkedLines: this.state.checkedLines };
    this.emit();
  }
  lines(checkedLines: number) {
    this.state.checkedLines = checkedLines;
    if (this.notify && checkedLines - this.lastEmittedLines >= 250 && Date.now() - this.lastEmittedAt >= 100) this.emit();
  }
  beginCommits(totalCommits: number, tags: boolean) {
    this.state = { phase: tags ? 'tags' : 'history', checkedLines: this.state.checkedLines, processedCommits: 0, totalCommits };
    this.emit();
  }
  completeBatch(count: number) {
    this.state.processedCommits = Math.min(this.state.totalCommits ?? 0, (this.state.processedCommits ?? 0) + count);
    this.emit();
  }
}
