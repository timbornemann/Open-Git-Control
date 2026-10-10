import { describe, expect, it } from 'vitest';
import { parseRepositoryRunOutput } from '../repositoryRunOutput';
import { consoleSample, runLines } from './repositoryRunFixture';

describe('parseRepositoryRunOutput', () => {
  it('finds the actual port error and one repeated engine warning even when the step has no custom parser', () => {
    const result = parseRepositoryRunOutput(runLines(consoleSample), () => 'none');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ severity: 'warning', hint: 'engine-mismatch', count: 3 });
    expect(result[1]).toMatchObject({ severity: 'error', hint: 'port-in-use', message: 'Error: Port 5173 is already in use' });
    expect(result[1].details?.join('\n')).toContain('ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL');
    expect(result.some((problem) => problem.file?.includes('node_modules'))).toBe(false);
  });
  it('keeps a single fallback problem when only package-manager follow-up messages are available', () => {
    const result = parseRepositoryRunOutput(
      runLines(['ELIFECYCLE Command failed with exit code 1.', 'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL app', 'Exit status 1']),
      () => 'none',
    );
    expect(result).toHaveLength(1);
    expect(result[0].details).toHaveLength(2);
  });
  it('recognizes named runtime errors without turning standalone stack frames into file diagnostics', () => {
    expect(parseRepositoryRunOutput(runLines(['TypeError: invalid value', '    at start (file:///D:/project/src/main.js:2:4)']), () => 'none')).toEqual([
      expect.objectContaining({ severity: 'error', message: 'TypeError: invalid value', details: ['    at start (file:///D:/project/src/main.js:2:4)'] }),
    ]);
    expect(parseRepositoryRunOutput(runLines(['    at start (file:///D:/project/src/main.js:2:4)']), () => 'typescript')).toEqual([]);
  });
  it('recognizes npm warnings, Rust diagnostics with locations and multi-line ESLint reports', () => {
    expect(parseRepositoryRunOutput(runLines(['npm WARN deprecated old package']), () => 'none')[0]).toMatchObject({ severity: 'warning', tool: 'npm' });
    expect(parseRepositoryRunOutput(runLines(['error[E0308]: mismatched types', '  --> src/main.rs:8:5']), () => 'none')[0]).toMatchObject({
      severity: 'error',
      file: 'src/main.rs',
      line: 8,
      column: 5,
      tool: 'Cargo',
    });
    expect(
      parseRepositoryRunOutput(
        runLines([
          'C:\\Project with spaces\\src\\App.tsx',
          '  12:4 error Unexpected any @typescript-eslint/no-explicit-any',
          '  20:8 warning unused value no-unused-vars',
        ]),
        () => 'eslint',
      ),
    ).toEqual([
      expect.objectContaining({ file: 'C:\\Project with spaces\\src\\App.tsx', line: 12, column: 4, severity: 'error' }),
      expect.objectContaining({ file: 'C:\\Project with spaces\\src\\App.tsx', line: 20, column: 8, severity: 'warning' }),
    ]);
  });
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
