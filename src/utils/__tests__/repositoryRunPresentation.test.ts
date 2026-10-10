import { describe, expect, it } from 'vitest';
import { cleanRepositoryRunLines, classifyRunMessage } from '../repositoryRunMessages';
import { createRunConsoleEntries } from '../repositoryRunPresentation';
import { consoleSample, runLines } from './repositoryRunFixture';

describe('structured run output', () => {
  it('groups repeated pnpm warnings, watch paths, stack traces and lifecycle follow-up failures from the reported run', () => {
    const clean = cleanRepositoryRunLines(runLines(consoleSample));
    expect(clean.every((line) => !line.text.includes('\u001b'))).toBe(true);
    const entries = createRunConsoleEntries(clean);
    expect(entries.filter((entry) => entry.kind === 'warning')).toHaveLength(1);
    expect(entries.find((entry) => entry.kind === 'warning')).toMatchObject({ count: 3, tool: 'pnpm' });
    expect(entries.find((entry) => entry.group === 'watch')).toMatchObject({ count: 13, details: expect.any(Array) });
    const error = entries.find((entry) => entry.hint === 'port-in-use')!;
    expect(error.details.join('\n')).toContain('httpServerStart');
    expect(error.details.join('\n')).toContain('ELIFECYCLE');
    expect(entries.some((entry) => entry.kind === 'info' && entry.text.includes('workspace inheritance'))).toBe(true);
    expect(clean.map((line) => line.text).join('\n')).toContain('A^3');
    expect(runLines(consoleSample)[1].text).toContain('\u001b');
  });
  it('keeps severity independent of stdout/stderr and folds progress updates without losing the transcript', () => {
    const lines = runLines(['Info ordinary information', 'Downloading 10%', 'Downloading 100%', 'Compiling app v1', 'Finished dev profile', 'plain text']);
    const entries = createRunConsoleEntries(lines);
    expect(entries.map((entry) => entry.kind)).toEqual(['info', 'progress', 'progress', 'success', 'message']);
    expect(entries[1]).toMatchObject({ text: 'Downloading 100%', count: 2, details: ['Downloading 10%', 'Downloading 100%'] });
    expect(classifyRunMessage({ ...lines[0], stream: 'stdout', text: 'npm error Something failed' })).toMatchObject({ kind: 'error', tool: 'npm' });
    expect(lines).toHaveLength(6);
  });
  it('does not merge warnings or trace details across workflow steps', () => {
    const lines = [...runLines(['[WARN] a warning', 'Error: a failure']), ...runLines(['[WARN] a warning', 'at unrelated code'], 'stderr', 1)];
    const entries = createRunConsoleEntries(lines);
    expect(entries.filter((entry) => entry.kind === 'warning')).toHaveLength(2);
    expect(entries.find((entry) => entry.kind === 'error')?.details).toEqual([]);
  });
});
