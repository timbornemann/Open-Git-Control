import type { AppSettings } from '../settings';
import type { AutoCommitChange } from './AutoCommitPlanTypes';
import type { CommitMessage } from './aiServiceTypes';
import { buildCommitMessageLanguageInstruction, buildCommitMessageStyleInstruction } from './commitMessageGenerator';

export type CommitPolicy = Pick<AppSettings, 'aiCommitMessageStyle' | 'aiCommitMessageLanguage' | 'commitSignoffByDefault'>;
const CONVENTIONAL = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\([^\r\n():]+\))?!?: \S.+$/;
const containsControl = (text: string, multiline = false) => [...text].some((char) => char.charCodeAt(0) < 32 && !(multiline && /[\t\r\n]/.test(char)));

export const commitPolicyPrompt = (settings: CommitPolicy): string =>
  [
    buildCommitMessageLanguageInstruction(settings.aiCommitMessageLanguage === 'auto' ? 'en' : settings.aiCommitMessageLanguage),
    buildCommitMessageStyleInstruction(settings.aiCommitMessageStyle, settings.aiCommitMessageLanguage),
    'Title: nonempty, imperative, at most 72 Unicode characters, no newline or trailing period.',
    'Description: factual, at most 2000 characters. Do not invent intent or claim tests passed.',
    'Do not add Signed-off-by trailers; Git handles sign-off.',
  ].join('\n');

export function validatePlannedMessage(value: unknown, settings: CommitPolicy): CommitMessage {
  if (!value || typeof value !== 'object') throw new Error('Missing commit message.');
  const { title, description } = value as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || [...title.trim()].length > 72 || containsControl(title) || title.trim().endsWith('.')) {
    throw new Error('Commit title must be a single nonempty line of at most 72 characters, without a trailing period.');
  }
  if (typeof description !== 'string' || description.length > 2000 || containsControl(description, true) || /(?:^|\n)Signed-off-by:/i.test(description)) {
    throw new Error('Invalid commit description.');
  }
  if (settings.aiCommitMessageStyle === 'conventional' && !CONVENTIONAL.test(title.trim())) throw new Error('Use the configured Conventional Commit format.');
  if (settings.aiCommitMessageStyle !== 'conventional' && CONVENTIONAL.test(title.trim()))
    throw new Error('The configured style does not use a Conventional Commit prefix.');
  // Catch clear language violations without rejecting identifiers, proper names
  // or short neutral titles. The prompt covers cases that cannot be proved locally.
  const firstWord = title
    .replace(/^[^:]+:\s*/, '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase();
  const english = new Set(['add', 'fix', 'update', 'remove', 'improve', 'implement', 'refactor', 'rename', 'document', 'preserve']);
  const german = new Set(['füge', 'fuege', 'behebe', 'aktualisiere', 'entferne', 'verbessere', 'implementiere', 'benenne', 'dokumentiere', 'erhalte']);
  if (settings.aiCommitMessageLanguage === 'de' ? english.has(firstWord) : german.has(firstWord)) throw new Error('Use the configured commit language.');
  return { title: title.trim(), description: description.replace(/\r\n/g, '\n').trim() };
}

export function fallbackPlannedMessage(changes: AutoCommitChange[], settings: CommitPolicy): CommitMessage {
  const de = settings.aiCommitMessageLanguage === 'de';
  const title = de ? 'aktualisiere die erfassten Änderungen' : 'update captured changes';
  const counts = new Map<string, number>();
  for (const change of changes) counts.set(change.status[0], (counts.get(change.status[0]) || 0) + 1);
  const labels: Record<string, string> = de
    ? { A: 'hinzugefügt', M: 'geändert', D: 'gelöscht', R: 'umbenannt', T: 'Typ geändert' }
    : { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', T: 'type changed' };
  const stats = [...counts].map(([kind, count]) => `${count} ${labels[kind] || (de ? 'geändert' : 'changed')}`).join(', ');
  const paths = [...new Set(changes.map((change) => change.path))];
  const detail = `${de ? 'Erfasste Dateien' : 'Captured files'}: ${paths.length} (${stats}).`;
  return {
    title: settings.aiCommitMessageStyle === 'conventional' ? `chore: ${title}` : title,
    description:
      settings.aiCommitMessageStyle === 'plain'
        ? ''
        : [detail, ...paths.slice(0, 8).map((file) => `- ${[...file].map((char) => (char.charCodeAt(0) < 32 ? ' ' : char)).join('')}`)]
            .join('\n')
            .slice(0, 2000),
  };
}
