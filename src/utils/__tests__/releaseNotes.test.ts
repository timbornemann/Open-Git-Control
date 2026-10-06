import { describe, expect, it } from 'vitest';
import type { ReleaseCommitDto } from '@/types/releaseNotes';
import {
  buildAlgorithmicChangeListMarkdown,
  buildOfflineReleaseNotesMarkdown,
  buildReleaseNotesPromptHints,
  filterCommitsForReleaseNotes,
  isLikelyMergeCommit,
  stripEmptyBreakingChangesSections,
} from '@/utils/releaseNotes';

type TestOptions = {
  omitMergeCommits: boolean;
  preferGroupedSections: boolean;
  includeTechnicalDetails: boolean;
  includeBreakingChangesSection: boolean;
  appendAlgorithmicChangeList: boolean;
  includeHashesInAlgorithmicList: boolean;
};

const DEFAULT_OPTIONS: TestOptions = {
  omitMergeCommits: true,
  preferGroupedSections: true,
  includeTechnicalDetails: true,
  includeBreakingChangesSection: true,
  appendAlgorithmicChangeList: true,
  includeHashesInAlgorithmicList: true,
};

const commit = (shortHash: string, subject: string, author = 'Tim', date = '2026-03-26', htmlUrl?: string | null): ReleaseCommitDto => ({
  hash: `${shortHash}-full`,
  shortHash,
  subject,
  author,
  date,
  htmlUrl,
});

describe('releaseNotes utilities', () => {
  describe('isLikelyMergeCommit', () => {
    it('detects common merge commit formats', () => {
      expect(isLikelyMergeCommit('Merge branch main into develop')).toBe(true);
      expect(isLikelyMergeCommit('merge pull request #42 from feature/a')).toBe(true);
      expect(isLikelyMergeCommit('  Merge hotfix  ')).toBe(true);
    });

    it('returns false for regular commits', () => {
      expect(isLikelyMergeCommit('feat: add release notes options')).toBe(false);
      expect(isLikelyMergeCommit('refactor release editor layout')).toBe(false);
    });
  });

  describe('filterCommitsForReleaseNotes', () => {
    it('returns source untouched when merge filtering is disabled', () => {
      const source = [commit('a1', 'Merge branch main into feature'), commit('a2', 'feat: add release notes')];
      const options = { ...DEFAULT_OPTIONS, omitMergeCommits: false };
      const result = filterCommitsForReleaseNotes(source, options);
      expect(result).toBe(source);
      expect(result).toHaveLength(2);
    });

    it('filters merge commits when enabled', () => {
      const source = [commit('b1', 'Merge pull request #9 from branch'), commit('b2', 'feat: add release UI'), commit('b3', 'fix: handle validation')];
      const result = filterCommitsForReleaseNotes(source, DEFAULT_OPTIONS);
      expect(result.map((entry) => entry.shortHash)).toEqual(['b2', 'b3']);
    });

    it('falls back to original source when filtering would remove all commits', () => {
      const source = [commit('c1', 'Merge branch feature/a'), commit('c2', 'Merge pull request #10 from user/branch')];
      const result = filterCommitsForReleaseNotes(source, DEFAULT_OPTIONS);
      expect(result).toBe(source);
    });

    it('handles non-array runtime input defensively', () => {
      const unsafe = null as unknown as ReleaseCommitDto[];
      const result = filterCommitsForReleaseNotes(unsafe, DEFAULT_OPTIONS);
      expect(result).toEqual([]);
    });
  });

  describe('buildReleaseNotesPromptHints', () => {
    it('builds grouped technical/breaking hints in german', () => {
      const hints = buildReleaseNotesPromptHints(DEFAULT_OPTIONS, 'de');
      expect(hints).toHaveLength(3);
      expect(hints[0]).toContain('Gruppiere Aenderungen');
      expect(hints[1]).toContain('technische Details');
      expect(hints[2]).toContain('Breaking Changes');
      expect(hints[2]).toContain('entfaellt der Abschnitt komplett');
    });

    it('builds reduced high-level hints in english when options are disabled', () => {
      const options = {
        ...DEFAULT_OPTIONS,
        preferGroupedSections: false,
        includeTechnicalDetails: false,
        includeBreakingChangesSection: false,
      };
      const hints = buildReleaseNotesPromptHints(options, 'en');
      expect(hints).toHaveLength(2);
      expect(hints[0]).toContain('high-level');
      expect(hints[1]).toContain('Only include a Breaking Changes section');
    });
  });

  describe('buildAlgorithmicChangeListMarkdown', () => {
    it('keeps multiline descriptions attached to their own commit, including lists and migration details', () => {
      const markdown = buildAlgorithmicChangeListMarkdown(
        [
          {
            ...commit('desc', 'feat!: replace settings'),
            description: 'New format.\r\n\r\nBREAKING CHANGE: migrate settings.\r\n- Rename old keys.\r\n- Keep values.',
          },
          commit('next', 'fix: parser'),
        ],
        'en',
        false,
      );
      expect(markdown).toContain('- feat!: replace settings\n\n  New format.\n\n  BREAKING CHANGE: migrate settings.\n  - Rename old keys.\n  - Keep values.');
      expect(markdown).toContain('### Fixed\n- fix: parser');
    });
    it('returns empty markdown for empty/non-array inputs', () => {
      expect(buildAlgorithmicChangeListMarkdown([], 'en', true)).toBe('');
      const unsafe = null as unknown as ReleaseCommitDto[];
      expect(buildAlgorithmicChangeListMarkdown(unsafe, 'de', false)).toBe('');
    });

    it('creates english markdown with sections in stable order and no hashes', () => {
      const markdown = buildAlgorithmicChangeListMarkdown(
        [
          commit('d1', 'docs: update readme'),
          commit('d2', 'feat: add export'),
          commit('d3', 'fix: handle null response'),
          commit('d4', 'refactor release workflow'),
        ],
        'en',
        false,
      );

      expect(markdown).toContain('## Commit List (Automatic)');
      expect(markdown).toContain('### Added');
      expect(markdown).toContain('### Changed');
      expect(markdown).toContain('### Fixed');
      expect(markdown).toContain('### Maintenance');
      expect(markdown).toContain('- feat: add export');
      expect(markdown).toContain('- refactor release workflow');
      expect(markdown).not.toContain('(d2)');

      const addedIndex = markdown.indexOf('### Added');
      const changedIndex = markdown.indexOf('### Changed');
      const fixedIndex = markdown.indexOf('### Fixed');
      const maintenanceIndex = markdown.indexOf('### Maintenance');
      expect(addedIndex).toBeGreaterThan(-1);
      expect(changedIndex).toBeGreaterThan(addedIndex);
      expect(fixedIndex).toBeGreaterThan(changedIndex);
      expect(maintenanceIndex).toBeGreaterThan(fixedIndex);
    });

    it('creates german markdown and includes hashes when requested', () => {
      const markdown = buildAlgorithmicChangeListMarkdown(
        [
          commit('e1', 'new settings dialog', 'Tim', '2026-03-26', 'https://github.com/acme/project/commit/e1-full'),
          commit('e2', 'patch: improve fallback'),
          commit('e3', 'style: align switches'),
        ],
        'de',
        true,
      );

      expect(markdown).toContain('## Commit-Liste (automatisch)');
      expect(markdown).toContain('### Neu');
      expect(markdown).toContain('### Behoben');
      expect(markdown).toContain('### Wartung');
      expect(markdown).toContain('- new settings dialog ([e1](https://github.com/acme/project/commit/e1-full))');
      expect(markdown).toContain('- patch: improve fallback (e2)');
      expect(markdown).toContain('- style: align switches (e3)');
      expect(markdown).not.toContain('example.com');
    });
  });

  describe('offline templates', () => {
    it.each(['patch', 'minor', 'major'] as const)('uses a %s template in both languages with one complete commit list', (versionBump) => {
      const commits = [{ ...commit('abc', 'fix: preserve content'), description: 'Keep the original file.' }];
      const params = { tagName: 'v2.0.0', releaseName: 'Release v2.0.0', commits, versionBump, language: 'en' as const };
      const english = buildOfflineReleaseNotesMarkdown(params, false);
      expect(english).toContain(`This ${versionBump} release`);
      expect(english).toContain('  Keep the original file.');
      expect(english.match(/## Commit List/g)).toHaveLength(1);
      expect(english).not.toContain('Breaking Changes');
      expect(english).not.toContain('(abc)');
      const german = buildOfflineReleaseNotesMarkdown({ ...params, language: 'de' });
      expect(german).toContain(versionBump === 'patch' ? 'Patch-Release' : versionBump === 'minor' ? 'Minor-Release' : 'Major-Release');
      expect(german).toContain('## Commit-Liste (automatisch)');
    });

    it('does not invent changes or an empty list when the selected range has no commits', () => {
      const markdown = buildOfflineReleaseNotesMarkdown({ tagName: 'v1', releaseName: 'Release v1', commits: [], language: 'en', versionBump: 'patch' });
      expect(markdown).toContain('no new commits');
      expect(markdown).not.toContain('Commit List');
      expect(markdown).not.toContain('Breaking');
    });
  });

  describe('empty breaking sections', () => {
    it.each(['None', '- **None.**', 'Keine', 'No breaking changes detected.', 'N/A', ''])('omits the placeholder %j and its heading', (placeholder) => {
      expect(stripEmptyBreakingChangesSections(`# Release\n\n## Breaking Changes\n${placeholder}\n\n## Fixed\n- Preserve content.`)).toBe(
        '# Release\n\n## Fixed\n- Preserve content.',
      );
    });

    it('preserves actual breaking changes, other sections and headings in fenced code', () => {
      const markdown =
        '# Release\n\n## Breaking Changes\n- None of the old keys are accepted; migrate the file.\n\n## Fixed\nNone\n\n```md\n## Breaking Changes\nNone\n```';
      expect(stripEmptyBreakingChangesSections(markdown)).toBe(markdown);
    });
  });
});
