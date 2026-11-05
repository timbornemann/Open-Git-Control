import type { TutorialChapter, TutorialText } from './types';
import { amendStep as s, amendRecipe as recipe } from './amendLessonHelpers';
import {
  AMEND_ORIGINAL_MESSAGE,
  AMEND_ORIGINAL_DESCRIPTION,
  AMEND_CONTENT,
  AMEND_FILE_MESSAGE,
  AMEND_FILE_DESCRIPTION,
  AMEND_MESSAGE_ONLY,
  AMEND_DESCRIPTION_ONLY,
} from './amendLessonExamples';
import { mergeHead, mergeField as field, element, value } from './mergeLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import { stagingRow } from './stagingLessonHelpers';
function amendLesson(files: boolean): TutorialChapter {
  const seed = (stage: Parameters<typeof recipe>[0] = 'start', form = 0) => recipe(stage, files, form);
  const message = files ? AMEND_FILE_MESSAGE : AMEND_MESSAGE_ONLY,
    description = files ? AMEND_FILE_DESCRIPTION : AMEND_DESCRIPTION_ONLY;
  const title: TutorialText = [(files ? 'fix' : 'feat') + '(lernen): ' + message[0], (files ? 'fix' : 'feat') + '(lernen): ' + message[1]];
  return {
    id: files ? 'amend-files' : 'amend-message',
    section: 'repo',
    title: files
      ? ['Amend: eine vorgemerkte Korrektur in den letzten Commit aufnehmen', 'Amend: include a staged correction in the last commit']
      : ['Amend: nur die letzte lokale Commit-Nachricht korrigieren', 'Amend: correct only the last local commit message'],
    description: [
      'Prüfe den unveröffentlichten Ziel-Commit, die automatisch übernommenen Felder und den Ersatz mit neuem Hash und unverändertem Vorgänger.',
      'Inspect the unpublished target commit, the prefilled fields and the replacement with a new hash and unchanged parent.',
    ],
    question: files
      ? ['Wie ergänze ich eine vergessene Änderung im letzten lokalen Commit?', 'How do I add a forgotten change to the last local commit?']
      : ['Wie ändere ich nur die Nachricht des letzten lokalen Commits?', 'How do I change only the last local commit message?'],
    keywords: 'amend letzter commit ersetzen korrigieren nachricht beschreibung typ bereich index staged vorgemerkt hash autor lokal unveröffentlicht',
    steps: [
      s(
        'overview',
        ['Amend ersetzt den letzten Commit', 'Amend replaces the last commit'],
        files
          ? [
              'README ist für diese Übung mit einer Team-Begrüßung vorgemerkt. Wir nehmen die Korrektur in den letzten lokalen Commit auf. Sein ursprünglicher Inhalt bleibt enthalten; ein zusätzlicher Folgecommit wird nicht angelegt.',
              'For this exercise README is staged with a team greeting. We will include the correction in the last local commit. Its original contents remain included; no additional follow-up commit is added.',
            ]
          : [
              'Der Arbeitsbaum ist sauber. Wir korrigieren ausschließlich die Nachricht des letzten lokalen Commits. Dafür muss bei Amend keine Datei vorgemerkt sein.',
              'The working tree is clean. We will correct only the last local commit’s message. Amend needs no staged file for this.',
            ],
        '[data-tutorial="graph"]',
        { continue: false, prepare: seed() },
      ),
      s(
        'head',
        ['Der vierte Commit ist der zu ersetzende lokale Stand', 'The fourth commit is the local revision to replace'],
        [
          'main und HEAD stehen hier am vierten Commit. Amend betrifft ausschließlich diesen letzten Commit, nicht einen beliebigen älteren Eintrag.',
          'main and HEAD point to the fourth commit. Amend concerns only this last commit, not an arbitrary older entry.',
        ],
        mergeHead(4),
        { prepare: seed() },
      ),
      s(
        'remote',
        ['Der bekannte Remote-Stand liegt noch einen Commit zurück', 'The known remote revision is still one commit behind'],
        [
          'Der vierte Beispielcommit wurde noch nicht veröffentlicht. origin/main steht am dritten Commit. Prüfe in eigenen Repositories den Veröffentlichungsstand und stimme das Umschreiben geteilter Historie ab.',
          'The fourth sample commit has not been published. origin/main points to the third commit. In your own repositories, check publication status and coordinate rewriting shared history.',
        ],
        graphRow(3) + ' .commit-refs',
        { prepare: seed() },
      ),
      ...(files
        ? [
            s(
              'index',
              ['Die Korrektur muss im Index liegen', 'The correction must be in the index'],
              [
                'README ist vorgemerkt. Nur dieser Indexstand ergänzt beim Amend den bestehenden Commit; spätere ungestagte Entwürfe gehören nicht automatisch dazu.',
                'README is staged. Only this index version supplements the existing commit during amend; later unstaged drafts are not automatically included.',
              ],
              '[data-tutorial="staged-files"]',
              { prepare: seed() },
            ),
            s(
              'open-diff',
              ['Prüfe die vorgemerkte Korrektur', 'Inspect the staged correction'],
              ['Öffne README.md im vorgemerkten Bereich.', 'Open README.md in the staged section.'],
              stagingRow('staged', 'README.md'),
              { prepare: seed(), completion: element(historyViewer('staged')) },
            ),
            s(
              'staged-diff',
              ['Dieser Diff zeigt nur die zusätzliche Korrektur', 'This diff shows only the additional correction'],
              [
                'Rot ist die bisherige Welt-Begrüßung des vierten Commits, grün die vorgemerkte Team-Begrüßung. Der vorhandene Commit enthält außerdem frühere Änderungen, die erhalten bleiben.',
                'Red is the fourth commit’s previous world greeting; green is the staged team greeting. The existing commit also contains earlier changes that will be retained.',
              ],
              historyViewer('staged'),
              { prepare: seed('diff') },
            ),
            s(
              'close-staged',
              ['Schließe den Diff für die Commit-Felder', 'Close the diff to reach the commit fields'],
              ['Schließe die Dateiansicht. Die vorgemerkte Korrektur bleibt im Index.', 'Close the file viewer. The staged correction remains in the index.'],
              fileControl('close-file'),
              { prepare: seed('diff'), completion: { kind: 'absent' as const, selector: historyViewer('staged') } },
            ),
          ]
        : [
            s(
              'clean',
              ['Amend darf auch ohne neue Dateiänderung arbeiten', 'Amend may work without a new file change'],
              [
                'Der Index und die Arbeitsdateien entsprechen dem bisherigen Commit. Wir ändern seine Angaben, nicht den gespeicherten Dateibaum.',
                'The index and working files match the previous commit. We change its message, not the saved file tree.',
              ],
              '[data-tutorial="staging"]',
              { prepare: seed() },
            ),
          ]),
      s(
        'toggle',
        ['Aktiviere Amend', 'Enable Amend'],
        [
          'Aktiviere Amend. Warte, bis Nachricht und Beschreibung des letzten Commits übernommen wurden. Das Häkchen allein schreibt noch keinen Commit.',
          'Enable Amend. Wait for the last commit’s message and description to load. Checking the box alone writes no commit.',
        ],
        field('amend'),
        {
          prepare: seed(),
          completion: {
            kind: 'all',
            conditions: [
              value(field('amend') + ' input', 'true'),
              { kind: 'value', selector: field('message'), value: AMEND_ORIGINAL_MESSAGE },
              { kind: 'value', selector: field('description'), value: AMEND_ORIGINAL_DESCRIPTION },
            ],
          },
        },
      ),
      s(
        'prefill',
        ['Die vorhandene Nachricht ist die Ausgangsbasis', 'The existing message is the starting point'],
        [
          'Die Felder zeigen den letzten Commit. Prüfe sie vor dem Bearbeiten; ein automatisch übernommener Text ist noch keine bestätigte Korrektur.',
          'The fields show the last commit. Review them before editing; prefilled text is not yet a confirmed correction.',
        ],
        '.staging-commit-fields',
        { prepare: seed('amend') },
      ),
      s(
        'type',
        files
          ? ['Wähle fix für die Korrektur', 'Choose fix for the correction']
          : ['Der vorhandene Typ feat bleibt erhalten', 'The existing feat type is retained'],
        files
          ? [
              'Wähle fix. Der Typ beschreibt hier die korrigierte Begrüßung, ohne selbst eine Datei zu verändern.',
              'Choose fix. The type describes the corrected greeting without changing any file itself.',
            ]
          : [
              'feat wurde aus dem bisherigen Titel erkannt. Wir behalten diese Einordnung bei und präzisieren die Nachricht.',
              'feat was recognized from the old title. We retain this classification and make the message more precise.',
            ],
        field('type'),
        { prepare: seed('amend'), ...(files ? { completion: value(field('type'), 'fix') } : {}) },
      ),
      s(
        'scope',
        ['Trage lernen als Bereich ein', 'Enter lernen as the scope'],
        [
          'Schreibe lernen in das Bereichsfeld. Die Vorschau setzt den Bereich bei gewähltem Typ in Klammern.',
          'Enter lernen in the scope field. The preview encloses the scope in parentheses when a type is selected.',
        ],
        field('prefix'),
        { prepare: seed('amend', 1), completion: value(field('prefix'), 'lernen') },
      ),
      s(
        'message',
        ['Formuliere die korrigierte Nachricht', 'Write the corrected message'],
        files
          ? [
              'Schreibe „Begrüßung für das Team korrigieren“. Diese Nachricht wird Teil des Ersatzcommits.',
              'Enter “correct the team greeting”. This message will belong to the replacement commit.',
            ]
          : [
              'Schreibe „Begrüßung auf der Startseite ergänzen“. Du beschreibst denselben gespeicherten Dateiinhalt genauer.',
              'Enter “add the greeting to the home page”. You are describing the same saved file contents more precisely.',
            ],
        field('message'),
        { prepare: seed('amend', 2), completion: { kind: 'value', selector: field('message'), value: message } },
      ),
      s(
        'description',
        ['Bearbeite die Beschreibung bewusst mit', 'Deliberately edit the description too'],
        files
          ? [
              'Schreibe „Die Team-Begrüßung gehört zum selben lokalen Arbeitsschritt.“. Prüfe bei Amend auch den Beschreibungstext; er wird nicht stillschweigend außerhalb deiner Angaben ergänzt.',
              'Enter “The team greeting belongs to the same local piece of work.” With amend, also review the description; it is not silently added outside your supplied message.',
            ]
          : [
              'Schreibe „Die Nachricht beschreibt den vorhandenen Dateiinhalt genauer.“. Eine reine Nachrichtenkorrektur kann Titel und Beschreibung ändern.',
              'Enter “The message describes the existing file contents more precisely.” A message-only correction can change both title and description.',
            ],
        field('description'),
        { prepare: seed('amend', 3), completion: { kind: 'value', selector: field('description'), value: description } },
      ),
      s(
        'preview',
        ['Prüfe den vollständigen neuen Titel', 'Review the complete new title'],
        [
          'Die Vorschau verbindet Typ, Bereich und Nachricht. Dieser Titel ersetzt den bisherigen Titel des letzten Commits.',
          'The preview combines type, scope and message. This title replaces the last commit’s previous title.',
        ],
        '.staging-commit-preview',
        { prepare: seed('amend', 4) },
      ),
      s(
        'review-amend',
        ['Amend muss für die Ersatzaktion aktiv bleiben', 'Amend must remain enabled for replacement'],
        files
          ? [
              'Mit ausgeschaltetem Amend würdest du die vorgemerkte Korrektur als zusätzlichen Commit speichern. Hier bleibt Amend eingeschaltet, damit sie zum letzten Commit gehört.',
              'With Amend off, the staged correction would be saved as an additional commit. Here Amend remains enabled so it belongs to the last commit.',
            ]
          : [
              'Ohne Amend gibt es hier keine neuen vorgemerkten Dateien für einen weiteren Commit. Die aktive Option erlaubt die Nachrichtenkorrektur des letzten Commits.',
              'Without Amend there are no newly staged files for another commit here. The enabled option allows correcting the last commit’s message.',
            ],
        field('amend'),
        { prepare: seed('amend', 4) },
      ),
      s(
        'commit',
        ['Speichere den Ersatzcommit', 'Save the replacement commit'],
        [
          'Prüfe Titel, Beschreibung, Index und Amend. Klicke Commit. main soll auf einen neuen Hash zeigen, dessen Vorgänger weiterhin der dritte Commit ist.',
          'Check the title, description, index and Amend. Click Commit. main should point to a new hash whose parent is still the third commit.',
        ],
        '.staging-commit-btn',
        {
          prepare: seed('amend', 4),
          completion: {
            kind: 'all',
            conditions: [
              element(mergeHead(5)),
              { kind: 'absent', selector: graphRow(4) },
              { kind: 'text', selector: graphRow(5) + ' .commit-subject', value: title },
              {
                kind: 'working-tree',
                staged: [],
                unstaged: [],
                untracked: [],
                content: [{ path: 'README.md', source: 'head', value: files ? AMEND_CONTENT : { example: 'history-readme', version: 'latest' } }],
              },
            ],
          },
        },
      ),
      s(
        'parent',
        ['Der neue Hash führt denselben Arbeitsschritt fort', 'The new hash represents the same piece of work'],
        [
          'Der Ersatzcommit hat weiterhin den dritten Commit als Vorgänger. Der alte vierte Commit ist nicht sein Vorgänger und erscheint hier ohne weitere Referenz nicht mehr im normalen Graphen.',
          'The replacement still has the third commit as its parent. The old fourth commit is not its parent and, with no other reference here, is no longer shown in the normal graph.',
        ],
        mergeHead(5),
        { prepare: seed('result') },
      ),
      s(
        'refs',
        ['Andere Referenzen bleiben an ihren bisherigen Zielen', 'Other references remain at their previous targets'],
        [
          'origin/main und feature/begruessung bleiben am dritten Commit. Auch v1.0.0 behält seinen zweiten Commit. Amend verschiebt nur den aktuellen lokalen Branch auf den Ersatz.',
          'origin/main and feature/begruessung remain at the third commit. v1.0.0 also retains its second commit. Amend moves only the current local branch to the replacement.',
        ],
        graphRow(3) + ' .commit-refs',
        { prepare: seed('result') },
      ),
      s(
        'select',
        ['Untersuche den neuen Commit', 'Inspect the new commit'],
        ['Wähle den neuen obersten Commit im Graphen.', 'Select the new top commit in the graph.'],
        graphRow(5),
        { prepare: seed('result'), completion: element(commitPanel(5)) },
      ),
      s(
        'description-saved',
        ['Die bearbeitete Beschreibung ist gespeichert', 'The edited description is saved'],
        [
          'Prüfe den neuen Beschreibungstext. Autor und Autordatum des ursprünglichen Commits bleiben bei diesem Amend erhalten; der Hash ist dennoch neu.',
          'Check the new description. This amend preserves the original commit’s author and author date, while its hash is still new.',
        ],
        '.commit-details-description',
        { prepare: seed('commit') },
      ),
      s(
        'comparison',
        ['Die Dateiliste vergleicht weiterhin mit dem ursprünglichen Vorgänger', 'The file list still compares against the original parent'],
        files
          ? [
              'Die Liste enthält die ursprünglichen Änderungen an README und src/app.ts einschließlich der neuen README-Korrektur. Sie ist umfangreicher als der zuvor gelesene zusätzliche Staging-Diff.',
              'The list contains the original README and src/app.ts changes including the new README correction. It is broader than the additional staged diff you read earlier.',
            ]
          : [
              'Die Dateiliste enthält weiterhin dieselben ursprünglichen README- und src/app.ts-Änderungen. Das Umschreiben der Nachricht hat den gespeicherten Dateibaum nicht geändert.',
              'The list still contains the same original README and src/app.ts changes. Rewriting the message did not change the saved file tree.',
            ],
        commitPanel(5),
        { prepare: seed('commit') },
      ),
      s(
        'open-result',
        ['Öffne die README des Ersatzcommits', 'Open the replacement commit’s README'],
        ['Öffne README.md aus der neuen Commit-Dateiliste.', 'Open README.md from the new commit file list.'],
        commitPanel(5) + ' ' + commitFile(),
        { prepare: seed('commit'), completion: element(historyViewer(5)) },
      ),
      s(
        'result-diff',
        ['Lies den gespeicherten Vergleich gegen den dritten Commit', 'Read the saved comparison against the third commit'],
        files
          ? [
              'Rot stammt aus dem dritten Commit, grün zeigt jetzt die Team-Begrüßung. Dieser gespeicherte Diff umfasst den ursprünglichen Arbeitsschritt mit der Korrektur, nicht nur den letzten Zusatz gegenüber dem alten vierten Commit.',
              'Red comes from the third commit and green now shows the team greeting. This saved diff covers the original piece of work with its correction, not only the final addition relative to the old fourth commit.',
            ]
          : [
              'Die Welt-Begrüßung ist unverändert gespeichert. Der Diff bleibt derselbe wie beim alten vierten Commit; geändert wurden nur seine Angaben und dadurch sein Hash.',
              'The world greeting is saved unchanged. The diff is the same as the old fourth commit’s; only its message and consequently its hash changed.',
            ],
        historyViewer(5),
        { prepare: seed('file') },
      ),
      s(
        'close-result',
        ['Schließe die Ergebnisprüfung', 'Close the result check'],
        ['Kehre zum Arbeitsbereich zurück.', 'Return to the workspace.'],
        fileControl('close-file'),
        { prepare: seed('file'), completion: { kind: 'absent', selector: historyViewer(5) } },
      ),
      s(
        'amend-reset',
        ['Amend ist nach dem Erfolg wieder ausgeschaltet', 'Amend is off again after success'],
        [
          'Die App hat den einmaligen Modus beendet und das Nachrichtenformular geleert. Prüfe die Option bei jedem weiteren Commit erneut.',
          'The app ended the one-time mode and cleared the message form. Check the option again for every subsequent commit.',
        ],
        field('amend'),
        { prepare: seed('result') },
      ),
      s(
        'finish',
        ['Der letzte lokale Commit wurde bewusst ersetzt', 'The last local commit was deliberately replaced'],
        [
          'Du hast Ausgangsstand, vorgeladene Felder, Ersatzhash, Vorgänger und gespeicherte Dateien geprüft. Die Aktion blieb lokal und hat nichts veröffentlicht. Weiter beendet die Lektion.',
          'You checked the starting revision, prefilled fields, replacement hash, parent and saved files. The action stayed local and published nothing. Next finishes this lesson.',
        ],
        '[data-tutorial="graph"]',
        { prepare: seed('result') },
      ),
    ],
  };
}
export const TUTORIAL_AMEND_MESSAGE = amendLesson(false);
export const TUTORIAL_AMEND_FILES = amendLesson(true);
