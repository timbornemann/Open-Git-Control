import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { writeTextFileAtomically } from '../atomicFile';

type FeedbackHistoryEntry = {
  signature: string;
  createdAt: number;
  issueNumber: number;
  htmlUrl: string;
};

type FeedbackHistoryData = { entries: FeedbackHistoryEntry[] };

export type AutomaticFeedbackSubmissionResult =
  { kind: 'created'; issueNumber: number; htmlUrl: string } | { kind: 'duplicate'; issueNumber: number; htmlUrl: string } | { kind: 'rate-limited' };

const HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_AUTOMATIC_REPORTS_PER_WINDOW = 3;
const MAX_HISTORY_ENTRIES = 100;

export class FeedbackReportHistoryStore {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath = path.join(app.getPath('userData'), 'feedback-report-history.json'),
    private readonly now: () => number = () => Date.now(),
  ) {}

  private read(): FeedbackHistoryData {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Partial<FeedbackHistoryData>;
      return { entries: Array.isArray(parsed.entries) ? parsed.entries.filter(this.isValidEntry) : [] };
    } catch {
      return { entries: [] };
    }
  }

  private readonly isValidEntry = (entry: unknown): entry is FeedbackHistoryEntry => {
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Partial<FeedbackHistoryEntry>;
    return (
      typeof candidate.signature === 'string' &&
      candidate.signature.length === 64 &&
      Number.isFinite(candidate.createdAt) &&
      Number.isInteger(candidate.issueNumber) &&
      candidate.issueNumber! > 0 &&
      typeof candidate.htmlUrl === 'string' &&
      candidate.htmlUrl.startsWith('https://github.com/')
    );
  };

  private write(entries: FeedbackHistoryEntry[]): void {
    writeTextFileAtomically(this.filePath, JSON.stringify({ entries: entries.slice(-MAX_HISTORY_ENTRIES) }, null, 2));
  }

  async submit(signature: string, createIssue: () => Promise<{ number: number; htmlUrl: string }>): Promise<AutomaticFeedbackSubmissionResult> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      const currentTime = this.now();
      const entries = this.read().entries.filter((entry) => currentTime - entry.createdAt <= HISTORY_RETENTION_MS);
      const duplicate = entries.find((entry) => entry.signature === signature);
      if (duplicate) return { kind: 'duplicate', issueNumber: duplicate.issueNumber, htmlUrl: duplicate.htmlUrl };
      if (entries.filter((entry) => currentTime - entry.createdAt <= RATE_LIMIT_WINDOW_MS).length >= MAX_AUTOMATIC_REPORTS_PER_WINDOW) {
        return { kind: 'rate-limited' };
      }

      const issue = await createIssue();
      entries.push({ signature, createdAt: currentTime, issueNumber: issue.number, htmlUrl: issue.htmlUrl });
      try {
        this.write(entries);
      } catch {
        // The public issue already exists. Do not report a false submission
        // failure merely because local deduplication state could not persist.
      }
      return { kind: 'created', issueNumber: issue.number, htmlUrl: issue.htmlUrl };
    } finally {
      release();
    }
  }
}
