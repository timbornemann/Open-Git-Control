import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import type { DemoCommit } from './demoRepository';
import { getDemoBlob, type DemoFiles } from './demoBlob';
import { historyText } from './demoHistoryExamples';
import { AMEND_ORIGINAL_SUBJECT, AMEND_ORIGINAL_DESCRIPTION } from '@/shared/tutorial/amendLessonExamples';

/** Each revision has an actual tree; the latest one always equals HEAD. */
export function createDemoHistory(head: DemoFiles, time: number, language: 'de' | 'en'): DemoCommit[] {
  const english = language === 'en';
  const initial: DemoFiles = { 'README.md': historyText('initial', language) };
  if (getDemoBlob(head, 'LICENSE') !== undefined) initial.LICENSE = structuredClone(head.LICENSE);
  const app = structuredClone(initial);
  app['README.md'] = historyText('app', language);
  if (getDemoBlob(head, 'package.json') !== undefined) app['package.json'] = structuredClone(head['package.json']);
  if (getDemoBlob(head, 'src/app.ts') !== undefined) app['src/app.ts'] = 'export const greeting = "Hallo";\n';
  const described = structuredClone(head);
  described['README.md'] = historyText('description', language);
  if (getDemoBlob(head, 'src/app.ts') !== undefined) described['src/app.ts'] = app['src/app.ts'];
  const snapshots = [initial, app, described, structuredClone(head)];
  const subjects = english
    ? ['chore: initialize project', 'feat: add app', 'docs: describe learning project', AMEND_ORIGINAL_SUBJECT[1]]
    : ['chore: Projekt initialisieren', 'feat: App anlegen', 'docs: Lernprojekt beschreiben', AMEND_ORIGINAL_SUBJECT[0]];
  const bodies = english
    ? [
        'Create the README and license.',
        'Add the application and package configuration.',
        'Describe the project and include its sample files.',
        AMEND_ORIGINAL_DESCRIPTION[1],
      ]
    : [
        'README und Lizenz anlegen.',
        'Anwendung und Paketkonfiguration ergänzen.',
        'Projekt beschreiben und seine Beispieldateien aufnehmen.',
        AMEND_ORIGINAL_DESCRIPTION[0],
      ];
  return snapshots
    .map((files, index) => ({
      hash: practiceCommitHash(index + 1),
      parent: index ? practiceCommitHash(index) : '',
      subject: subjects[index],
      body: bodies[index],
      author: index < 2 ? 'Sam Beispiel' : 'Alex Beispiel',
      email: index < 2 ? 'sam@example.invalid' : 'alex@example.invalid',
      date: new Date(time - (3 - index) * 86_400_000).toISOString(),
      files,
    }))
    .reverse();
}
