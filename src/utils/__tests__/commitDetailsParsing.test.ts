import { describe, expect, it } from 'vitest';
import { parseCommitDetails } from '../gitParsing';

describe('parseCommitDetails', () => {
  it('parses normal status lines', () => {
    const output = ['M\tsrc/App.tsx', 'A\tsrc/new-file.ts', 'D\told.txt'].join('\n');
    const result = parseCommitDetails(output);

    expect(result).toEqual([
      { status: 'M', path: 'src/App.tsx' },
      { status: 'A', path: 'src/new-file.ts' },
      { status: 'D', path: 'old.txt' },
    ]);
  });

  it('ignores malformed lines', () => {
    const output = ['not-a-status-line', '', '?? unknown'].join('\n');
    const result = parseCommitDetails(output);
    expect(result).toEqual([]);
  });
});
