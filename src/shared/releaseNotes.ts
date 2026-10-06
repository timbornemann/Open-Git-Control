import type { ReleaseCommitDto, ReleaseNotesGenerationParamsDto } from '../types/releaseNotes';

type CommitBucket = 'added' | 'changed' | 'fixed' | 'maintenance';

function classifyCommit(subject: string): CommitBucket {
  const normalized = (subject || '').toLowerCase();
  if (/^(feat|feature|add|new)\b/.test(normalized)) return 'added';
  if (/^(fix|bug|hotfix|patch)\b/.test(normalized)) return 'fixed';
  if (/^(docs|test|chore|build|ci|style)\b/.test(normalized)) return 'maintenance';
  return 'changed';
}

function sectionLabel(bucket: CommitBucket, language: 'de' | 'en'): string {
  const labels =
    language === 'de'
      ? { added: 'Neu', changed: 'Geaendert', fixed: 'Behoben', maintenance: 'Wartung' }
      : { added: 'Added', changed: 'Changed', fixed: 'Fixed', maintenance: 'Maintenance' };
  return labels[bucket];
}

function formatHashReference(commit: ReleaseCommitDto): string {
  const url = typeof commit.htmlUrl === 'string' ? commit.htmlUrl.trim() : '';
  return /^https?:\/\/\S+$/i.test(url) ? `[${commit.shortHash}](${url})` : commit.shortHash;
}

/** One renderer-neutral formatter for manual notes, AI appendices and provider fallbacks. */
export function buildAlgorithmicChangeListMarkdown(commits: ReleaseCommitDto[], language: 'de' | 'en', includeHashes: boolean): string {
  const source = Array.isArray(commits) ? commits : [];
  if (source.length === 0) return '';
  const buckets = new Map<CommitBucket, ReleaseCommitDto[]>([
    ['added', []],
    ['changed', []],
    ['fixed', []],
    ['maintenance', []],
  ]);
  for (const commit of source) buckets.get(classifyCommit(commit.subject))?.push(commit);
  const lines = [language === 'de' ? '## Commit-Liste (automatisch)' : '## Commit List (Automatic)'];
  for (const [bucket, items] of buckets) {
    if (!items.length) continue;
    lines.push('', `### ${sectionLabel(bucket, language)}`);
    for (const commit of items) {
      lines.push(`- ${commit.subject}${includeHashes ? ` (${formatHashReference(commit)})` : ''}`);
      const description = commit.description?.replace(/\r\n?/g, '\n').trim();
      if (description) lines.push('', ...description.split('\n').map((line) => (line ? `  ${line}` : '')));
    }
  }
  return lines.join('\n').trim();
}

const intros = {
  de: {
    patch: 'Dieses Patch-Release bündelt Korrekturen und kleinere Verbesserungen. Die Commit-Liste dokumentiert die konkreten Änderungen.',
    minor: 'Dieses Minor-Release bündelt Weiterentwicklungen und zusätzliche Verbesserungen. Die Commit-Liste dokumentiert die konkreten Änderungen.',
    major:
      'Dieses Major-Release markiert eine neue Hauptversion. Die Commit-Liste dokumentiert die konkreten Änderungen und gegebenenfalls erforderliche Anpassungen.',
  },
  en: {
    patch: 'This patch release brings together fixes and smaller improvements. The commit list documents the specific changes.',
    minor: 'This minor release brings together further development and additional improvements. The commit list documents the specific changes.',
    major: 'This major release marks a new main version. The commit list documents the specific changes and any required adjustments.',
  },
};

/** Pure local generation: release-type template plus the existing complete commit list. */
export function buildOfflineReleaseNotesMarkdown(params: ReleaseNotesGenerationParamsDto, includeHashes = true): string {
  const commits = Array.isArray(params.commits) ? params.commits : [];
  const type = params.versionBump === 'major' ? 'Major' : params.versionBump === 'minor' ? 'Minor' : 'Patch';
  const introduction = commits.length
    ? intros[params.language][params.versionBump]
    : params.language === 'en'
      ? `This ${type.toLowerCase()} release has no new commits since the selected release baseline.`
      : `Dieses ${type} Release enthält seit der gewählten Release-Basis keine neuen Commits.`;
  return [`# ${params.releaseName}`, introduction, `Tag: \`${params.tagName}\``, buildAlgorithmicChangeListMarkdown(commits, params.language, includeHashes)]
    .filter(Boolean)
    .join('\n\n');
}

/** Omit empty/placeholder Breaking sections without touching real migration notes or code. */
export function stripEmptyBreakingChangesSections(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const headings: number[] = [];
  let fence = '';
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = '';
    } else if (!fence && /^\s{0,3}#{1,6}\s+/.test(lines[i])) headings.push(i);
  }
  const removed = new Set<number>();
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h];
    const title = lines[start]
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/[*_#:]|\s+$/g, '')
      .trim();
    if (!/^(?:breaking(?:[ -]+changes)?|inkompatible (?:Änderungen|Aenderungen))$/i.test(title)) continue;
    const end = headings[h + 1] ?? lines.length;
    const empty = lines.slice(start + 1, end).every((line) => {
      const text = line
        .trim()
        .replace(/^[-*+]\s+|^\d+[.)]\s+/, '')
        .replace(/[*_`]/g, '')
        .replace(/[.!]$/, '')
        .trim();
      return (
        !text ||
        /^(?:none(?: (?:identified|detected))?|keine|n\/?a|not applicable|no breaking changes(?: (?:identified|detected|in this release))?|keine (?:breaking changes|inkompatiblen (?:Änderungen|Aenderungen)))$/i.test(
          text,
        )
      );
    });
    if (empty) for (let i = start; i < end; i++) removed.add(i);
  }
  return lines
    .filter((_, i) => !removed.has(i))
    .join('\n')
    .trim();
}
