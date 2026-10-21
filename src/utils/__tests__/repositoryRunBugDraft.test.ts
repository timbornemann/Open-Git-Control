import { describe, expect, it } from 'vitest';
import { BUG_DRAFT_LOG_MAX_CHARACTERS, BUG_DRAFT_LOG_MAX_LINES, buildRepositoryRunBugDraft } from '../repositoryRunBugDraft';
import type { RepositoryRunProblem } from '../repositoryRunOutput';
import { runLines, sampleRun } from './repositoryRunFixture';

const problem: RepositoryRunProblem = {
  sequence: 2,
  stepIndex: 0,
  severity: 'error',
  message: 'TS2322: Ungültiger Typ',
  file: 'src/main.ts',
  line: 7,
  column: 3,
};

describe('repository run bug draft', () => {
  it.each(['de', 'en'] as const)('captures the diagnostic and the original command with %s labels', (language) => {
    const run = sampleRun();
    run.steps[0] = { label: 'Check types', parser: 'typescript', command: 'npm run check -- --pretty false', shell: 'powershell' };
    run.output = runLines(['Before check', '\u001b[31msrc/main.ts(7,3): error TS2322: Ungültiger Typ\u001b[0m', 'After check']);
    const original = structuredClone(run);
    const draft = buildRepositoryRunBugDraft(run, problem, language);

    expect(draft).toMatchObject({ title: problem.message, status: 'bug', priority: 'medium', tags: ['Bug'] });
    expect(draft.description).toContain('src/main.ts:7:3');
    expect(draft.description).toContain('npm run check -- --pretty false');
    expect(draft.description).toContain('Check types (powershell)');
    expect(draft.description).toContain(language === 'de' ? 'Fehlermeldung:' : 'Error message:');
    expect(draft.description).toContain('Before check');
    expect(draft.description).toContain('After check');
    expect(draft.description).not.toContain('\u001b');
    expect(run).toEqual(original);
  });

  it('takes the failing step instead of the active step and excludes logs from other commands', () => {
    const run = sampleRun();
    run.steps = [
      { label: 'Failing check', parser: 'typescript', command: 'npm run check' },
      { label: 'Other step', parser: 'none', command: 'npm run build' },
    ];
    run.activeStepIndex = 1;
    run.output = [
      ...runLines(['Before check', 'error TS2322', 'After check']),
      ...runLines(['Unrelated output'], 'stdout', 1).map((line) => ({ ...line, sequence: 100 })),
    ];
    const description = buildRepositoryRunBugDraft(run, problem, 'en').description;

    expect(description).toContain('npm run check');
    expect(description).not.toContain('npm run build');
    expect(description).not.toContain('Unrelated output');
  });

  it('bounds long and multiline logs around the selected error without dropping the error behind context', () => {
    const run = sampleRun();
    run.output = runLines(
      Array.from({ length: 200 }, (_, index) => (index === 120 ? 'Error: selected failure' : `Line ${index} ${'x'.repeat(5_000)}\ncontinuation`)),
    );
    const draft = buildRepositoryRunBugDraft(run, { ...problem, sequence: 121, message: 'Error: selected failure' }, 'en');
    const excerpt = draft.description.split('Log excerpt (max. 40 lines / 6,000 characters):\n')[1];

    expect(excerpt).toContain('Error: selected failure');
    expect(excerpt).toContain('Log excerpt truncated');
    expect(excerpt.length).toBeLessThanOrEqual(BUG_DRAFT_LOG_MAX_CHARACTERS);
    expect(excerpt.split('\n').length).toBeLessThanOrEqual(BUG_DRAFT_LOG_MAX_LINES);
    expect(excerpt).not.toContain('Line 0 ');
  });

  it('keeps a short complete log intact', () => {
    const run = sampleRun();
    run.output = runLines(['Before', 'Error: failed', 'After']);
    expect(buildRepositoryRunBugDraft(run, problem, 'en').description).toContain('Before\nError: failed\nAfter');
    expect(buildRepositoryRunBugDraft(run, problem, 'en').description).not.toContain('truncated');
  });

  it('reports unavailable locations, commands and evicted logs without substituting another step', () => {
    const run = sampleRun();
    run.output = runLines(['Unrelated output'], 'stdout', 1);
    const draft = buildRepositoryRunBugDraft(run, { ...problem, file: undefined, line: undefined, column: undefined }, 'en');

    expect(draft.description).toContain('No file location reported.');
    expect(draft.description).toContain('Not available in the captured run.');
    expect(draft.description).toContain('No matching log lines remain available.');
    expect(draft.description).not.toContain('Unrelated output');
  });

  it('fits oversized diagnostics and commands within planner field limits', () => {
    const run = sampleRun();
    run.repoPath = 'x'.repeat(4_000);
    run.steps[0].command = 'x'.repeat(16_000);
    run.steps[0].label = 'x'.repeat(160);
    const draft = buildRepositoryRunBugDraft(run, { ...problem, message: 'x'.repeat(20_000), file: 'x'.repeat(4_000) }, 'de');

    expect(draft.title.length).toBeLessThanOrEqual(240);
    expect(draft.description.length).toBeLessThanOrEqual(20_000);
    expect(draft.description).toContain('Logauszug');
    expect(draft.description).toContain('…');
  });
});
