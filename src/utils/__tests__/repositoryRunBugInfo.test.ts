import { describe, expect, it } from 'vitest';
import { buildRepositoryRunBugInfo, getRepositoryRunProblemHint } from '../repositoryRunBugInfo';
import type { RepositoryRunProblem } from '../repositoryRunOutput';
import { runLines, sampleRun } from './repositoryRunFixture';

const problem: RepositoryRunProblem = {
  sequence: 2,
  stepIndex: 0,
  severity: 'error',
  tool: 'TypeScript',
  message: '\u001b[31mTS2322: Ungültiger Typ\u001b[0m',
  file: 'src/main.ts',
  line: 7,
  column: 3,
  count: 3,
  details: ['    at check (src/check.ts:8:4)', 'Further diagnostic details'],
};

describe('repository run bug info for copying', () => {
  it.each(['de', 'en'] as const)('includes all diagnostic and run details with %s labels', (language) => {
    const run = sampleRun();
    run.steps[0] = { label: 'Check types', parser: 'typescript', command: 'npm run check -- --pretty false', shell: 'powershell' };
    run.message = 'Step failed';
    run.output = runLines(['Before check', 'src/main.ts(7,3): error TS2322: Ungültiger Typ', 'After check']);
    const originalRun = structuredClone(run);
    const originalProblem = structuredClone(problem);
    const report = buildRepositoryRunBugInfo(run, problem, language);

    for (const text of [
      'TS2322: Ungültiger Typ',
      'TypeScript',
      'src/main.ts:7:3',
      ...problem.details!,
      'npm run check -- --pretty false',
      'run / 1. Check types',
      'Shell: powershell',
      'Parser: typescript',
      run.repoPath,
      'sample',
      '1970-01-01T00:00:01.000Z',
      '1970-01-01T00:00:04.000Z',
      'Step failed',
      'Before check\nsrc/main.ts(7,3): error TS2322: Ungültiger Typ\nAfter check',
    ]) {
      expect(report).toContain(text);
    }
    expect(report).toContain(language === 'de' ? 'Technische Details:' : 'Technical details:');
    expect(report).toContain(language === 'de' ? 'Schweregrad: Fehler' : 'Severity: Error');
    expect(report).toContain(language === 'de' ? 'Vorkommen: 3' : 'Occurrences: 3');
    expect(report).toContain(language === 'de' ? 'Status: Fehlgeschlagen' : 'Status: Failed');
    expect(report).toContain(language === 'de' ? 'Exit-Code: 1' : 'Exit code: 1');
    expect(report).not.toContain('\u001b');
    expect(report).not.toContain('undefined');
    expect(run).toEqual(originalRun);
    expect(problem).toEqual(originalProblem);
  });

  it('copies full messages, details, commands and step logs beyond planner draft limits', () => {
    const run = sampleRun();
    const command = `npm run check -- ${'c'.repeat(8_000)}`;
    const message = `Error: ${'m'.repeat(5_000)} message end`;
    const details = Array.from({ length: 80 }, (_, index) => `Detail ${index} ${'d'.repeat(600)}`);
    const logs = Array.from({ length: 100 }, (_, index) => `Log ${index} ${'x'.repeat(800)}`);
    run.steps[0].command = command;
    run.output = runLines(logs);
    const report = buildRepositoryRunBugInfo(run, { ...problem, message, details }, 'en');

    expect(report).toContain(command);
    expect(report).toContain(message);
    expect(report).toContain(details.join('\n'));
    expect(report).toContain(logs.join('\n'));
    expect(report).not.toContain('truncated');
  });

  it('resolves a missing step index from the original output instead of the current active step', () => {
    const run = sampleRun();
    run.steps = [
      { label: 'Failed check', parser: 'typescript', command: 'npm run check' },
      { label: 'Other step', parser: 'none', command: 'npm run build' },
    ];
    run.activeStepIndex = 1;
    run.output = [
      ...runLines(['Before check', problem.message, 'After check']),
      ...runLines(['Unrelated build output'], 'stdout', 1).map((line) => ({ ...line, sequence: line.sequence + 100 })),
    ];
    const report = buildRepositoryRunBugInfo(run, { ...problem, stepIndex: undefined }, 'en');

    expect(report).toContain('npm run check');
    expect(report).toContain('Before check');
    expect(report).not.toContain('npm run build');
    expect(report).not.toContain('Unrelated build output');
  });

  it('keeps stored details when the corresponding output has been evicted', () => {
    const run = sampleRun();
    run.output = runLines(['Unrelated output'], 'stdout', 1);
    const report = buildRepositoryRunBugInfo(run, { ...problem, file: undefined, line: undefined, column: undefined }, 'en');

    expect(report).toContain(problem.details!.join('\n'));
    expect(report).toContain('No matching log lines remain available.');
    expect(report).toContain('No file location reported.');
    expect(report).toContain('Not available in the captured run.');
    expect(report).not.toContain('Unrelated output');
  });

  it('handles a running warning without a location, command or resolvable step', () => {
    const run = sampleRun();
    run.status = 'running';
    delete run.finishedAt;
    delete run.exitCode;
    run.output = [];
    const report = buildRepositoryRunBugInfo(run, { sequence: 42, severity: 'warning', message: 'Unsupported engine', hint: 'engine-mismatch' }, 'en');

    expect(report).toContain('Severity: Warning');
    expect(report).toContain('Occurrences: 1');
    expect(report).toContain('Status: Running');
    expect(report).toContain('Use a Node.js version supported by the project.');
    expect(report).toContain('No further details available.');
    expect(report).not.toContain('Finished:');
    expect(report).not.toContain('Exit code:');
    expect(report).not.toContain('undefined');
  });

  it('copies the visible hint and sanitized details even when logs are unavailable', () => {
    const run = sampleRun();
    run.output = [];
    const portProblem: RepositoryRunProblem = {
      sequence: 1,
      severity: 'error',
      message: 'Error: Port 5173 is already in use',
      hint: 'port-in-use',
      details: ['\u001b[31m    at start (src/server.ts:4:2)\u001b[0m'],
    };
    const report = buildRepositoryRunBugInfo(run, portProblem, 'de');

    expect(report).toContain(getRepositoryRunProblemHint(portProblem, 'de'));
    expect(report).toContain('auf Port 5173');
    expect(report).toContain('    at start (src/server.ts:4:2)');
    expect(report).not.toContain('\u001b');
  });
});
