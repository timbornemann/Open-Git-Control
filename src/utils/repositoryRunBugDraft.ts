import type { AppLanguage } from '@/i18nCore';
import type { PlannerItemInput } from '@/types/projectPlanner';
import type { RepositoryRunStateDto } from '@/types/repositoryRun';
import { normalizeTerminalText } from '@/shared/terminalText';
import { cleanRepositoryRunLines } from './repositoryRunMessages';
import type { RepositoryRunProblem } from './repositoryRunOutput';

export const BUG_DRAFT_LOG_MAX_LINES = 40;
export const BUG_DRAFT_LOG_MAX_CHARACTERS = 6_000;
const clip = (value: string, limit: number) => (value.length > limit ? `${value.slice(0, limit - 1)}…` : value);

function logExcerpt(run: RepositoryRunStateDto, problem: RepositoryRunProblem, stepIndex: number | undefined, language: AppLanguage): string {
  const lines = cleanRepositoryRunLines(run.output)
    .filter((line) => line.stepIndex === stepIndex)
    .flatMap((line) => line.text.split('\n').map((text) => ({ sequence: line.sequence, text })));
  const index = lines.findIndex((line) => line.sequence === problem.sequence);
  const start = index < 0 ? Math.max(0, lines.length - BUG_DRAFT_LOG_MAX_LINES) : Math.max(0, index - 8);
  const selected = lines.slice(start, start + BUG_DRAFT_LOG_MAX_LINES);
  const text = selected.map((line) => clip(line.text, 500)).join('\n');
  const shortened =
    start > 0 || start + selected.length < lines.length || selected.some((line) => line.text.length > 500) || text.length > BUG_DRAFT_LOG_MAX_CHARACTERS;
  const marker = language === 'de' ? '\n[… Logauszug gekürzt …]' : '\n[… Log excerpt truncated …]';
  const bounded = text
    .split('\n')
    .slice(0, BUG_DRAFT_LOG_MAX_LINES - 1)
    .join('\n');
  return shortened ? bounded.slice(0, BUG_DRAFT_LOG_MAX_CHARACTERS - marker.length) + marker : text;
}

/** Capture a bounded, editable snapshot without creating or changing a planner item. */
export function buildRepositoryRunBugDraft(run: RepositoryRunStateDto, problem: RepositoryRunProblem, language: AppLanguage): PlannerItemInput {
  const tr = (de: string, en: string) => (language === 'de' ? de : en);
  const message = normalizeTerminalText(problem.message).trim();
  const stepIndex = problem.stepIndex ?? run.output.find((line) => line.sequence === problem.sequence)?.stepIndex;
  const step = stepIndex === undefined ? undefined : run.steps[stepIndex];
  const location = problem.file
    ? normalizeTerminalText(problem.file) + (problem.line ? `:${problem.line}${problem.column ? `:${problem.column}` : ''}` : '')
    : tr('Keine Dateiposition gemeldet.', 'No file location reported.');
  const excerpt = logExcerpt(run, problem, stepIndex, language);
  const section = (label: string, value: string) => `${label}\n${value}`;
  return {
    title: clip(message.replace(/\s+/g, ' ') || tr('Konsolenfehler', 'Console error'), 240),
    description: [
      section(tr('Fehlermeldung:', 'Error message:'), clip(message, 3_000)),
      section(tr('Dateiposition:', 'File location:'), clip(location, 2_000)),
      section(
        tr('Ausgeführter Befehl:', 'Executed command:'),
        step?.command ? clip(normalizeTerminalText(step.command), 4_000) : tr('Im gespeicherten Lauf nicht verfügbar.', 'Not available in the captured run.'),
      ),
      section(tr('Repository:', 'Repository:'), clip(run.repoPath, 1_000)),
      section(
        tr('Aktion / Schritt:', 'Action / step:'),
        `${run.action} / ${clip(normalizeTerminalText(step?.label || '—'), 160)}${step?.shell ? ` (${step.shell})` : ''}`,
      ),
      section(
        tr('Logauszug (max. 40 Zeilen / 6.000 Zeichen):', 'Log excerpt (max. 40 lines / 6,000 characters):'),
        excerpt || tr('Keine passenden Logzeilen mehr verfügbar.', 'No matching log lines remain available.'),
      ),
    ].join('\n\n'),
    priority: 'medium',
    status: 'bug',
    tags: ['Bug'],
  };
}
