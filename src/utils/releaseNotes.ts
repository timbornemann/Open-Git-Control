import type { ReleaseCommitDto, ReleaseNotesOptions } from '@/types/releaseNotes';

export { buildAlgorithmicChangeListMarkdown, buildOfflineReleaseNotesMarkdown, stripEmptyBreakingChangesSections } from '@/shared/releaseNotes';

const MERGE_COMMIT_PATTERN = /^(merge\b|merge pull request\b|merge branch\b)/i;

export function isLikelyMergeCommit(subject: string): boolean {
  return MERGE_COMMIT_PATTERN.test((subject || '').trim());
}

export function filterCommitsForReleaseNotes(commits: ReleaseCommitDto[], options: ReleaseNotesOptions): ReleaseCommitDto[] {
  const source = Array.isArray(commits) ? commits : [];
  if (!options.omitMergeCommits) return source;
  const filtered = source.filter((commit) => !isLikelyMergeCommit(commit.subject));
  return filtered.length > 0 ? filtered : source;
}

export function buildReleaseNotesPromptHints(options: ReleaseNotesOptions, language: 'de' | 'en'): string[] {
  const hints: string[] = [];

  if (options.preferGroupedSections) {
    hints.push(
      language === 'de'
        ? 'Gruppiere Aenderungen in klare Abschnitte wie Neu, Geaendert, Behoben.'
        : 'Group changes into clear sections like Added, Changed, Fixed.',
    );
  }

  if (options.includeTechnicalDetails) {
    hints.push(
      language === 'de'
        ? 'Fuege technische Details hinzu, wenn sie aus den Commits eindeutig ableitbar sind.'
        : 'Include technical details when they are clearly inferable from commit subjects and descriptions.',
    );
  } else {
    hints.push(
      language === 'de'
        ? 'Halte die Notes eher high-level und vermeide zu tiefe technische Details.'
        : 'Keep the notes high-level and avoid overly deep technical details.',
    );
  }

  if (options.includeBreakingChangesSection) {
    hints.push(
      language === 'de'
        ? 'Zeige bestaetigte inkompatible Aenderungen aus Commit-Titeln und Beschreibungen in einem eigenen Abschnitt "Breaking Changes". Ohne solche Aenderungen entfaellt der Abschnitt komplett; keine Platzhalter wie "Keine".'
        : 'Show explicit breaking changes from commit subjects and descriptions in a separate "Breaking Changes" section. Omit the entire section if there are none; never use placeholders such as "None".',
    );
  } else {
    hints.push(
      language === 'de'
        ? 'Fuege nur dann einen Breaking-Changes-Abschnitt hinzu, wenn er aus Commits eindeutig hervorgeht.'
        : 'Only include a Breaking Changes section when commits clearly indicate it.',
    );
  }

  return hints;
}
