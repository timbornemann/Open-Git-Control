import type { RepositoryRunOutputLineDto } from '@/types/repositoryRun';
import { interpretRunMessages, type RunMessage } from './repositoryRunMessages';

export type RunConsoleEntry = RunMessage & {
  sequence: number;
  stepIndex: number;
  count: number;
  details: string[];
  group?: 'watch' | 'progress';
};

/** Keep the original clean transcript separately; only the overview folds repetitive tool output. */
export function createRunConsoleEntries(lines: RepositoryRunOutputLineDto[]): RunConsoleEntry[] {
  const entries: RunConsoleEntry[] = [];
  const warnings = new Map<string, RunConsoleEntry>();
  const causes = new Map<number, RunConsoleEntry>();
  for (const { line, message } of interpretRunMessages(lines)) {
    if (!message.text) continue;
    const previous = entries.at(-1);
    const sameStep = previous?.stepIndex === line.stepIndex;
    const cause = causes.get(line.stepIndex);
    if (cause && (message.kind === 'detail' || message.kind === 'cascade')) {
      cause.details.push(line.text);
      continue;
    }
    if (message.kind === 'watch' || message.kind === 'progress') {
      const group = message.kind;
      // A distinct build stage stays distinct; updates of the same progress message share a row.
      const sameProgress = group === 'watch' || previous?.text.split(/[:\s]/, 1)[0] === message.text.split(/[:\s]/, 1)[0];
      if (sameStep && previous.group === group && sameProgress) {
        previous.details.push(line.text);
        previous.count++;
        if (group === 'progress') previous.text = message.text;
        continue;
      }
      entries.push({ ...message, group, sequence: line.sequence, stepIndex: line.stepIndex, count: 1, details: [line.text] });
      continue;
    }
    const warningKey = `${line.stepIndex}:${message.text}`;
    const repeated = message.kind === 'warning' ? warnings.get(warningKey) : undefined;
    if (repeated) {
      repeated.count++;
      repeated.details.push(line.text);
      continue;
    }
    const entry = { ...message, sequence: line.sequence, stepIndex: line.stepIndex, count: 1, details: message.scope ? [line.text] : [] };
    entries.push(entry);
    if (message.kind === 'warning') warnings.set(warningKey, entry);
    if (message.kind === 'error' || message.kind === 'cascade') causes.set(line.stepIndex, entry);
    if (message.kind === 'command') causes.delete(line.stepIndex);
  }
  return entries;
}
