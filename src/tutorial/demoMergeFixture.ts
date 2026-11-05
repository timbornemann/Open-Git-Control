import type { TutorialStep } from '@/shared/tutorial/types';
import { tutorialText } from '@/shared/tutorial/types';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { mergeLicenseNote } from '@/shared/tutorial/mergeExamples';
import type { DemoRepository } from './demoRepository';
import { demoBlobText } from './demoBlob';
import { historyText } from './demoHistoryExamples';
import { mergeConflictText } from './demoMergeExamples';

type Fixture = NonNullable<NonNullable<TutorialStep['prepare']>['branches']>['fixture'];
/** A divergent ref owns a complete tree, not just a decorative graph row. */
export function prepareDemoMergeFixture(repo: DemoRepository, fixture: Fixture, language: 'de' | 'en') {
  if (!fixture) return;
  const base = repo.commits.find((entry) => entry.hash === practiceCommitHash(3));
  if (!base?.files) throw new Error('Missing common practice revision.');
  const files = structuredClone(base.files);
  if (fixture === 'diverged-conflicts') {
    const target = repo.commits.find((entry) => entry.hash === practiceCommitHash(4));
    if (!target?.files) throw new Error('Missing current practice revision.');
    base.files['README.md'] = mergeConflictText('base', language);
    target.files['README.md'] = mergeConflictText('current', language);
    target.files.LICENSE = mergeConflictText('license-current', language);
    files['README.md'] = mergeConflictText('incoming', language);
    delete files.LICENSE;
  } else if (fixture === 'diverged-license') files.LICENSE = demoBlobText(files.LICENSE)! + tutorialText(mergeLicenseNote, language);
  else files['README.md'] = historyText('work', language);
  repo.commits.push({
    hash: practiceCommitHash(5),
    parent: base.hash,
    subject:
      fixture === 'diverged-license'
        ? language === 'de'
          ? 'docs: Projekthinweis ergänzen'
          : 'docs: add project note'
        : language === 'de'
          ? 'docs: Team begrüßen'
          : 'docs: greet the team',
    body: language === 'de' ? 'Eine eigene Änderung seit der gemeinsamen Ausgangsbasis.' : 'An independent change since the common base.',
    author: 'Sam Beispiel',
    email: 'sam@example.invalid',
    date: new Date(Date.parse(base.date) + 2 * 86_400_000).toISOString(),
    files,
  });
}
