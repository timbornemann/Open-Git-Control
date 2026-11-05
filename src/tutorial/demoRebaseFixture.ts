import type { DemoRepository } from './demoRepository';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { tutorialText } from '@/shared/tutorial/types';
import { mergeLicenseNote } from '@/shared/tutorial/mergeExamples';
import { demoBlobText } from './demoBlob';
/** Two linear, independent patches make reordering observable without a conflict. */
export function prepareDemoRebaseFixture(repo: DemoRepository, language: 'de' | 'en') {
  const base = repo.commits.find((commit) => commit.hash === hash(2)),
    note = repo.commits.find((commit) => commit.hash === hash(3)),
    greeting = repo.commits.find((commit) => commit.hash === hash(4));
  if (!base?.files || !note || !greeting?.files) throw new Error('Missing independent practice rebase trees.');
  note.files = structuredClone(base.files);
  note.files.LICENSE = demoBlobText(base.files.LICENSE)! + tutorialText(mergeLicenseNote, language);
  note.subject = language === 'de' ? 'docs: Projekthinweis ergänzen' : 'docs: add project note';
  note.body = language === 'de' ? 'Die Lizenz erhält einen unabhängigen Übungshinweis.' : 'The license receives an independent practice note.';
  note.author = 'Sam Beispiel';
  note.email = 'sam@example.invalid';
  greeting.files.LICENSE = structuredClone(note.files.LICENSE);
}
