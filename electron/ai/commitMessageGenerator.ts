import type { AiCommitMessageLanguage, AiCommitMessageStyle, AppSettings } from '../settings';
import { getTopDirectory, type FileChangeType } from './gitStatusSnapshot';
import type { AiProviderClient } from './AiProviderClient';
import type { CommitMessage, SnapshotFile } from './aiServiceTypes';
import { parseJsonFromText, safeString } from './jsonResponse';
import { CHAT_TIMEOUT_MS, runProviderText } from './providerText';

const MAX_USER_COMMIT_NOTES_CHARS = 8_000;
const MAX_COMMIT_DESCRIPTION_CHARS = 2_000;

export function clipCommitTitle(title: string): string {
  const normalized = title.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'chore: update files';
  if (normalized.length <= 72) return normalized;
  return normalized.slice(0, 72).trimEnd();
}

export function normalizeUserCommitNotes(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_USER_COMMIT_NOTES_CHARS);
}

export function normalizeCommitDescription(value: unknown): string {
  return safeString(value, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
    .slice(0, MAX_COMMIT_DESCRIPTION_CHARS);
}

export function buildCommitMessageStyleInstruction(style: AiCommitMessageStyle, language: AiCommitMessageLanguage = 'auto'): string {
  const useGermanExamples = language === 'de';
  if (style === 'plain') {
    return [
      'Style: plain.',
      'Use a short imperative title without a Conventional Commits prefix.',
      'Keep the description empty unless it adds important context.',
      useGermanExamples
        ? 'Examples: "verbessere Clone-Fortschritt"; "behebe Projektloeschung".'
        : 'Examples: "update clone progress display"; "fix project deletion flow".',
    ].join(' ');
  }

  if (style === 'detailed') {
    return [
      'Style: detailed.',
      'Use a concise imperative title and a useful description with 1-4 short lines when the notes contain multiple concrete details.',
      'Do not pad the description.',
      useGermanExamples
        ? 'Example title: "verbessere Fortschritt fuer Clone und Pull".'
        : 'Example title: "improve clone and pull progress feedback".',
      useGermanExamples
        ? 'Example description: "Zeigt Receiving und Resolving als getrennte Ladezustaende. Reduziert die rohe Git-Ausgabe auf relevante Statusdetails."'
        : 'Example description: "Shows Receiving and Resolving as separate progress states. Keeps the latest git transfer details visible without a scrolling log."',
    ].join(' ');
  }

  return [
    'Style: Conventional Commits.',
    'Use "type(scope): summary" when the scope is clear, otherwise "type: summary".',
    'Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore.',
    useGermanExamples
      ? 'Examples: "feat(git): zeige Transfer-Fortschritt"; "fix(settings): erhalte Commit-Sprache".'
      : 'Examples: "feat(git): show transfer progress phases"; "fix(settings): preserve commit message language".',
  ].join(' ');
}

export function buildCommitMessageLanguageInstruction(language: AiCommitMessageLanguage): string {
  if (language === 'de') {
    return 'Language: German. Write title and description in German. Keep Conventional Commit type tokens in English when using Conventional Commits.';
  }
  if (language === 'en') {
    return 'Language: English. Write title and description in English.';
  }
  return 'Language: auto. Preserve the language of the user notes unless the notes are mixed; then prefer English.';
}

export function buildFallbackCommitMessage(
  batch: Array<{ path: string; changeType: FileChangeType; additions: number; deletions: number }>,
): CommitMessage {
  if (!Array.isArray(batch) || batch.length === 0) {
    return { title: 'chore: update files', description: '' };
  }

  const weightedScopeCounts = new Map<string, number>();
  const typeCounts = new Map<FileChangeType, number>();
  for (const file of batch) {
    const scope = getTopDirectory(file.path);
    const weight = Math.max(1, file.additions + file.deletions);
    weightedScopeCounts.set(scope, (weightedScopeCounts.get(scope) || 0) + weight);
    typeCounts.set(file.changeType, (typeCounts.get(file.changeType) || 0) + 1);
  }

  const sortedScopes = [...weightedScopeCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([scope]) => scope);
  const primaryScope = sortedScopes[0] || 'repo';

  const dominantType = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)[0] || 'other';
  const hasMixedTypes = typeCounts.size > 1;

  const action = hasMixedTypes
    ? 'update'
    : dominantType === 'deleted'
      ? 'remove'
      : dominantType === 'renamed'
        ? 'rename'
        : dominantType === 'added' || dominantType === 'untracked'
          ? 'add'
          : 'update';

  const title = clipCommitTitle(`chore(${primaryScope}): ${action} ${batch.length} file${batch.length === 1 ? '' : 's'}`);

  const needsDescription = hasMixedTypes || sortedScopes.length > 1;
  const description = needsDescription
    ? `Covers ${sortedScopes.slice(0, 3).join(', ')}.`
    : '';

  return { title, description };
}

export function buildFallbackCommitMessageFromNotes(notes: string, style: AiCommitMessageStyle): CommitMessage {
  const firstUsefulLine = notes
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .find(Boolean);

  const summary = (firstUsefulLine || 'update changes')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const lowerSummary = summary ? summary.charAt(0).toLowerCase() + summary.slice(1) : 'update changes';
  const title = style === 'conventional'
    ? clipCommitTitle(`chore: ${lowerSummary}`)
    : clipCommitTitle(lowerSummary);

  const description = normalizeCommitDescription(notes);
  return {
    title,
    description: description === firstUsefulLine ? '' : description,
  };
}

export async function generateCommitMessageWithAi(
  providerClient: AiProviderClient,
  settings: AppSettings,
  batch: SnapshotFile[],
  getGeminiApiKey: () => string,
  shouldCancel?: () => boolean,
  timeoutMs = CHAT_TIMEOUT_MS,
): Promise<CommitMessage> {
  const systemPrompt = [
    'You write concise and factual git commit messages.',
    'Return strict JSON only: {"title": string, "description": string}.',
    'Title must be imperative, <=72 chars, no trailing period.',
    'Title must cover the full batch, not just one file.',
    'Only use single-file specific wording when the batch has exactly one file.',
    'If uncertain, use a safer and broader summary instead of inventing details.',
    'Description should be short and only included when it adds essential context.',
    buildCommitMessageLanguageInstruction(settings.aiCommitMessageLanguage),
    buildCommitMessageStyleInstruction(settings.aiCommitMessageStyle, settings.aiCommitMessageLanguage),
  ].join(' ');

  const userPrompt = [
    'Files in this commit:',
    ...batch.flatMap((file) => {
      const keyChanges = file.keyChanges.length > 0 ? file.keyChanges : [file.preview];
      return [
        `- path: ${file.path}`,
        `  type: ${file.changeType}, stats: +${file.additions}/-${file.deletions}, binary: ${file.isBinary ? 'yes' : 'no'}`,
        ...keyChanges.slice(0, 6).map((line) => `  key_change: ${line}`),
      ];
    }),
    'Return JSON only.',
  ].join('\n');

  try {
    const raw = await runProviderText(providerClient, settings, systemPrompt, userPrompt, getGeminiApiKey, shouldCancel, timeoutMs);
    const parsed = parseJsonFromText(raw) || {};
    const titleRaw = safeString(parsed.title, '').trim();
    const title = clipCommitTitle(titleRaw);
    if (!titleRaw) {
      return buildFallbackCommitMessage(batch);
    }
    const description = safeString(parsed.description, '').trim();
    return { title, description };
  } catch {
    return buildFallbackCommitMessage(batch);
  }
}

export async function generateCommitMessageFromUserNotes(
  providerClient: AiProviderClient,
  settings: AppSettings,
  getGeminiApiKey: () => string,
  params: { notes: string },
): Promise<CommitMessage> {
  const notes = normalizeUserCommitNotes(params?.notes);
  if (!notes) {
    throw new Error('Bitte beschreibe die Aenderungen fuer die Commit-Message.');
  }

  const commitLanguage = settings.aiCommitMessageLanguage;
  const systemPrompt = [
    'You write git commit messages from user-supplied change notes only.',
    'Do not infer repository state, file names, diffs, implementation details, or unstated intent.',
    'Return strict JSON only: {"title": string, "description": string}.',
    'Title must be imperative, <=72 chars, and have no trailing period.',
    'Description may be empty. When present, keep it factual and concise.',
    buildCommitMessageLanguageInstruction(commitLanguage),
    buildCommitMessageStyleInstruction(settings.aiCommitMessageStyle, commitLanguage),
  ].join(' ');

  const userPrompt = [
    'User change notes:',
    notes,
    'Return JSON only.',
  ].join('\n');

  const raw = await runProviderText(providerClient, settings, systemPrompt, userPrompt, getGeminiApiKey);
  const parsed = parseJsonFromText(raw) || {};
  const titleRaw = safeString(parsed.title, '').trim();
  if (!titleRaw) {
    return buildFallbackCommitMessageFromNotes(notes, settings.aiCommitMessageStyle);
  }

  return {
    title: clipCommitTitle(titleRaw),
    description: normalizeCommitDescription(parsed.description),
  };
}
