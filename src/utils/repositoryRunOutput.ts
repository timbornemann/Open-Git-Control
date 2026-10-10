import type { RepositoryRunOutputLineDto, RepositoryRunParser } from '@/types/repositoryRun';
import { cleanRepositoryRunLines, interpretRunMessages, type RunMessage, type RunMessageHint } from './repositoryRunMessages';

export type RepositoryRunProblem = {
  sequence: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stepIndex?: number;
  tool?: string;
  hint?: RunMessageHint;
  count?: number;
  details?: string[];
};

const diagnosticPattern = /^(?:[×✗❯]\s*)?(.+?\.[A-Za-z0-9]+)[:(](\d+)(?::|,)(\d+)\)?\s*[-:]?\s*(.*)$/;
const vitestJestFailurePattern = /^(?:FAIL\b|[×✗]\s|AssertionError(?::|\b)|Error:|.*\bFailed Tests\b)/;
const prettierFailurePattern = /(?:^\[error\]|\bCode style issues found\b)/i;
const diagnosticFailurePattern = /^(?:error|warning|fatal)\b/i;

function readDiagnostic(line: RepositoryRunOutputLineDto, message: RunMessage, parser: RepositoryRunParser, eslintFile?: string): RepositoryRunProblem | null {
  if (parser === 'none' && !message.knownProblem) return null;
  const text = message.text;
  const match = text.match(diagnosticPattern);
  const eslint = parser === 'eslint' ? text.match(/^(\d+):(\d+)\s+(error|warning)\s+(.+)$/) : null;
  const frameworkFailure =
    (parser === 'vitest-jest' && vitestJestFailurePattern.test(text)) ||
    (parser === 'prettier' && prettierFailurePattern.test(text)) ||
    (parser === 'diagnostic' && diagnosticFailurePattern.test(text));
  if (!match && !eslint && !frameworkFailure && !message.knownProblem) return null;
  const severity = message.kind === 'warning' || eslint?.[3] === 'warning' || (/\bwarning\b/i.test(text) && !/\berror\b/i.test(text)) ? 'warning' : 'error';
  return {
    sequence: line.sequence,
    stepIndex: line.stepIndex,
    severity,
    message: match?.[4] || eslint?.[4] || text,
    tool: message.tool,
    hint: message.hint,
    ...(match ? { file: match[1], line: Number(match[2]), column: Number(match[3]) } : {}),
    ...(eslint && eslintFile ? { file: eslintFile, line: Number(eslint[1]), column: Number(eslint[2]) } : {}),
  };
}

export const parseRepositoryRunOutput = (
  lines: RepositoryRunOutputLineDto[],
  parserForStep: (stepIndex: number) => RepositoryRunParser,
): RepositoryRunProblem[] => {
  const problems: RepositoryRunProblem[] = [];
  const cascades: RepositoryRunProblem[] = [];
  const dedup = new Map<string, RepositoryRunProblem>();
  let eslintFile: string | undefined;
  let previousStep = -1;
  for (const { line, message } of interpretRunMessages(cleanRepositoryRunLines(lines))) {
    const text = message.text;
    if (!text) continue;
    const parser = parserForStep(line.stepIndex);
    if (line.stepIndex !== previousStep) eslintFile = undefined;
    previousStep = line.stepIndex;
    const last = problems.at(-1);
    if (message.kind === 'detail') {
      if (last?.stepIndex === line.stepIndex) {
        (last.details ??= []).push(line.text);
        const location = text.match(/^-->\s+(.+):(\d+):(\d+)$/);
        if (location) Object.assign(last, { file: location[1], line: Number(location[2]), column: Number(location[3]) });
      }
      continue;
    }
    if (message.kind === 'system' || message.kind === 'success') continue;
    if (message.kind === 'cascade') {
      cascades.push({ sequence: line.sequence, stepIndex: line.stepIndex, severity: 'error', message: text, tool: message.tool });
      continue;
    }
    if (parser === 'eslint' && !/\s+(?:error|warning)\s/.test(text) && /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(text)) {
      eslintFile = text;
      continue;
    }
    const problem = readDiagnostic(line, message, parser, eslintFile);
    if (problem) {
      const key = JSON.stringify([line.stepIndex, problem.severity, problem.file, problem.line, problem.column, problem.message]);
      const existing = dedup.get(key);
      if (existing) {
        existing.count = (existing.count ?? 1) + 1;
        (existing.details ??= []).push(line.text);
      } else {
        if (message.scope) problem.details = [line.text];
        dedup.set(key, problem);
        problems.push(problem);
      }
    }
  }
  for (const step of new Set(cascades.map((cascade) => cascade.stepIndex))) {
    const matching = cascades.filter((cascade) => cascade.stepIndex === step);
    const cause = problems.find((problem) => problem.stepIndex === step && problem.severity === 'error');
    if (cause) (cause.details ??= []).push(...matching.map((cascade) => cascade.message));
    else problems.push({ ...matching[0], details: matching.slice(1).map((cascade) => cascade.message) });
  }
  return problems;
};
