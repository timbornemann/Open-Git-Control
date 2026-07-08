import { describe, expect, it } from 'vitest';
import { parseGitTransferProgressLine, summarizeGitTransferProgress } from '@/utils/gitTransferProgress';

describe('gitTransferProgress', () => {
  it('parses receiving progress with amount and speed', () => {
    const parsed = parseGitTransferProgressLine('Receiving objects: 96% (32866/34235), 322.40 MiB | 8.82 MiB/s');

    expect(parsed).toEqual(
      expect.objectContaining({
        key: 'receiving',
        percent: 96,
        current: 32866,
        total: 34235,
        amount: '322.40 MiB',
        speed: '8.82 MiB/s',
        done: false,
      }),
    );
  });

  it('parses remote-prefixed resolving progress', () => {
    const parsed = parseGitTransferProgressLine('remote: Resolving deltas: 2% (441/22006)');

    expect(parsed).toEqual(
      expect.objectContaining({
        key: 'resolving',
        percent: 2,
        current: 441,
        total: 22006,
        done: false,
      }),
    );
  });

  it('summarizes receiving as done when resolving is active', () => {
    const summary = summarizeGitTransferProgress([
      'Receiving objects: 100% (34235/34235), 327.79 MiB | 8.56 MiB/s, done.',
      'Resolving deltas: 0% (0/22006)',
      'Resolving deltas: 2% (441/22006)',
    ]);

    expect(summary.activePhase?.key).toBe('resolving');
    expect(summary.phases.find((phase) => phase.key === 'receiving')?.state).toBe('done');
    expect(summary.phases.find((phase) => phase.key === 'resolving')).toEqual(
      expect.objectContaining({
        state: 'active',
        percent: 2,
      }),
    );
  });

  it('keeps receiving and resolving visible before git emits progress', () => {
    const summary = summarizeGitTransferProgress(['Cloning into test...']);

    expect(summary.hasObservedProgress).toBe(false);
    expect(summary.latestDiagnostic).toBe('Cloning into test...');
    expect(summary.phases.map((phase) => phase.key)).toEqual(['receiving', 'resolving']);
    expect(summary.phases.every((phase) => phase.state === 'pending')).toBe(true);
  });
});
