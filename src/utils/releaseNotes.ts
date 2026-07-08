import type { ReleaseCommitDto } from '@/global';
import type { ReleaseNotesOptions } from '@/types/releaseNotes';

type CommitBucket = 'added' | 'changed' | 'fixed' | 'maintenance';

const MERGE_COMMIT_PATTERN = /^(merge\b|merge pull request\b|merge branch\b)/i;

function classifyCommit(subject: string): CommitBucket {
  const normalized = (subject || '').toLowerCase();
  if (/^(feat|feature|add|new)\b/.test(normalized)) return 'added';
  if (/^(fix|bug|hotfix|patch)\b/.test(normalized)) return 'fixed';
  if (/^(docs|test|chore|build|ci|style)\b/.test(normalized)) return 'maintenance';
  return 'changed';
}

function sectionLabel(bucket: CommitBucket, language: 'de' | 'en'): string {
  if (language === 'de') {
    if (bucket === 'added') return 'Neu';
    if (bucket === 'changed') return 'Geaendert';
    if (bucket === 'fixed') return 'Behoben';
    return 'Wartung';
  }
  if (bucket === 'added') return 'Added';
  if (bucket === 'changed') return 'Changed';
  if (bucket === 'fixed') return 'Fixed';
  return 'Maintenance';
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : '';
}

function formatHashReference(commit: ReleaseCommitDto): string {
  const commitUrl = safeHttpUrl(commit.htmlUrl);
  return commitUrl ? `[${commit.shortHash}](${commitUrl})` : commit.shortHash;
}

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
        : 'Include technical details when they are clearly inferable from commit subjects.',
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
        ? 'Fuege einen Abschnitt "Breaking Changes" hinzu und schreibe "Keine", falls nichts ersichtlich ist.'
        : 'Add a "Breaking Changes" section and write "None" if there are no explicit breaking changes.',
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

export function buildAlgorithmicChangeListMarkdown(commits: ReleaseCommitDto[], language: 'de' | 'en', includeHashes: boolean): string {
  const source = Array.isArray(commits) ? commits : [];
  if (source.length === 0) return '';

  const buckets = new Map<CommitBucket, ReleaseCommitDto[]>([
    ['added', []],
    ['changed', []],
    ['fixed', []],
    ['maintenance', []],
  ]);

  for (const commit of source) {
    const bucket = classifyCommit(commit.subject);
    buckets.get(bucket)?.push(commit);
  }

  const heading = language === 'de' ? '## Commit-Liste (automatisch)' : '## Commit List (Automatic)';

  const lines: string[] = [heading];
  const order: CommitBucket[] = ['added', 'changed', 'fixed', 'maintenance'];

  for (const bucket of order) {
    const items = buckets.get(bucket) || [];
    if (items.length === 0) continue;
    lines.push('');
    lines.push(`### ${sectionLabel(bucket, language)}`);
    for (const commit of items) {
      const hashPart = includeHashes ? ` (${formatHashReference(commit)})` : '';
      lines.push(`- ${commit.subject}${hashPart}`);
    }
  }

  return lines.join('\n').trim();
}
