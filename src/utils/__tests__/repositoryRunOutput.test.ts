import { describe, expect, it } from 'vitest';
import { parseRepositoryRunOutput } from '../repositoryRunOutput';

describe('parseRepositoryRunOutput', () => {
  it('extracts TypeScript and ESLint-style file diagnostics', () => {
    const result = parseRepositoryRunOutput(
      [
        { sequence: 1, stream: 'stderr', text: 'src/App.tsx:12:4 - error TS2322: Type mismatch', timestamp: 1, stepIndex: 0 },
        { sequence: 2, stream: 'stdout', text: 'all fine', timestamp: 2, stepIndex: 0 },
      ],
      () => 'typescript',
    );

    expect(result).toEqual([expect.objectContaining({ file: 'src/App.tsx', line: 12, column: 4, severity: 'error', message: 'error TS2322: Type mismatch' })]);
  });

  it('keeps raw-only steps out of the problem view', () => {
    expect(parseRepositoryRunOutput([{ sequence: 1, stream: 'stderr', text: 'error: expected', timestamp: 1, stepIndex: 0 }], () => 'none')).toEqual([]);
  });
});
