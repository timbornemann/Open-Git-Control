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

  it('parses real Vitest failures without treating successful test names as errors', () => {
    const result = parseRepositoryRunOutput(
      [
        { sequence: 1, stream: 'stdout', text: '✓ continues processing after a failed command', timestamp: 1, stepIndex: 0 },
        { sequence: 2, stream: 'stderr', text: 'FAIL  src/example.test.ts > rejects invalid input', timestamp: 2, stepIndex: 0 },
        { sequence: 3, stream: 'stderr', text: 'AssertionError: expected true to be false', timestamp: 3, stepIndex: 0 },
      ],
      () => 'vitest-jest',
    );

    expect(result).toEqual([expect.objectContaining({ sequence: 2, severity: 'error' }), expect.objectContaining({ sequence: 3, severity: 'error' })]);
  });
});
