import type { RepositoryRunOutputLineDto, RepositoryRunParser } from '@/types/repositoryRun';

export type RepositoryRunProblem = {
  sequence: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  column?: number;
};

// eslint-disable-next-line no-control-regex -- ANSI SGR/control sequences are removed before diagnostic parsing.
const stripAnsi = (value: string): string => value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
const diagnosticPattern = /(?:^|\s)([^\s()]+\.[A-Za-z0-9]+)[:(](\d+)(?::|,)(\d+)\)?\s*[-:]?\s*(.*)$/;

export const parseRepositoryRunOutput = (
  lines: RepositoryRunOutputLineDto[],
  parserForStep: (stepIndex: number) => RepositoryRunParser,
): RepositoryRunProblem[] => {
  const problems: RepositoryRunProblem[] = [];
  for (const line of lines) {
    const text = stripAnsi(line.text).trim();
    if (!text) continue;
    const parser = parserForStep(line.stepIndex);
    if (parser === 'none') continue;
    const match = text.match(diagnosticPattern);
    const looksLikeFailure = /\b(error|failed|failure|fail|warning)\b/i.test(text);
    if (!match && !looksLikeFailure) continue;
    const severity: RepositoryRunProblem['severity'] = /\bwarning\b/i.test(text) && !/\b(error|failed|failure|fail)\b/i.test(text) ? 'warning' : 'error';
    if (match) {
      problems.push({
        sequence: line.sequence,
        severity,
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3]),
        message: match[4] || text,
      });
    } else if (parser !== 'prettier' || looksLikeFailure) {
      problems.push({ sequence: line.sequence, severity, message: text });
    }
  }
  return problems;
};
