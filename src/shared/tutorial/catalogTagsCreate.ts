import type { TutorialChapter, TutorialText } from './types';
import {
  tagStep as s,
  tagRecipe as seed,
  tagPanel as panel,
  tagControl as c,
  tagRow as row,
  tagName as name,
  tagMessage,
  tagField as field,
  tagDialog,
  tagConfirm,
  tagCancel,
  element,
  value,
} from './tagLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';

function createTagLesson(annotated: boolean): TutorialChapter {
  const named = () => seed({ dialog: true, name });
  const filled = () => seed({ dialog: true, name, message: annotated });
  const created = (selected = false, file = false) =>
    seed({ created: true, message: annotated, ...(selected ? { selected: 'new' as const } : {}), ...(file ? { file: 'diff' as const } : {}) });
  const messageTitle: TutorialText = annotated
    ? ['Gib dem Tag eine eigene Nachricht', 'Give the tag its own message']
    : ['Lass die optionale Tag-Nachricht leer', 'Leave the optional tag message empty'];
  const messageText: TutorialText = annotated
    ? [
        'Schreibe „Erster bewusst markierter Lernstand.“. Eine ausgefüllte Nachricht erzeugt einen annotierten Tag. Sie ersetzt nicht die Nachricht des markierten Commits.',
        'Enter “First deliberately marked learning revision.” A filled message creates an annotated tag. It does not replace the marked commit’s message.',
      ]
    : [
        'Die Nachricht bleibt leer. Dadurch erstellt die App einen Lightweight-Tag: einen Namen, der unmittelbar auf den aktuellen Commit zeigt. Es wird kein zusätzlicher Commit erstellt.',
        'Leave the message empty. The app will create a lightweight tag: a name pointing directly to the current commit. It creates no additional commit.',
      ];
  return {
    id: annotated ? 'tags-annotated' : 'tags-lightweight',
    section: 'repo',
    title: annotated
      ? ['Annotierten Tag mit eigener Nachricht erstellen', 'Create an annotated tag with its own message']
      : ['Lightweight-Tag am aktuellen Commit erstellen', 'Create a lightweight tag at the current commit'],
    description: [
      'Öffne das Tag-Formular, prüfe Branch und Felder, brich zunächst ab und erstelle dann bewusst eine lokale Versionsmarkierung.',
      'Open the tag form, review its branch and fields, cancel first, then deliberately create a local version marker.',
    ],
    question: annotated
      ? ['Wie erstelle ich einen annotierten Tag mit Nachricht?', 'How do I create an annotated tag with a message?']
      : ['Wie markiere ich den aktuellen Commit mit einem einfachen Tag?', 'How do I mark the current commit with a lightweight tag?'],
    keywords: annotated
      ? 'tag annotated annotiert nachricht metadaten version erstellen lokal release message'
      : 'tag lightweight einfach name version erstellen lokal ohne nachricht release',
    steps: [
      s(
        'overview',
        annotated
          ? ['Eine Tag-Nachricht beschreibt die Markierung', 'A tag message describes the marker']
          : ['Ein einfacher Tag markiert den aktuellen Commit', 'A lightweight tag marks the current commit'],
        annotated
          ? [
              'Wir erstellen v1.1.0 mit einer eigenen Nachricht. Der annotierte Tag enthält zusätzliche Metadaten zur Markierung; die gespeicherten Dateien und die Commit-Nachricht bleiben dabei erhalten.',
              'We will create v1.1.0 with its own message. The annotated tag contains additional metadata for the marker; saved files and the commit message are preserved.',
            ]
          : [
              'Wir markieren den vierten Commit auf main mit v1.1.0. Der einfache Tag erhält keine eigene Nachricht. Er bleibt an diesem Commit, auch wenn spätere Commits den Branch weiterführen.',
              'We will mark the fourth commit on main with v1.1.0. The lightweight tag has no message of its own. It remains at this commit when later commits advance the branch.',
            ],
        branchControl('sidebar-toggle'),
        { continue: false, prepare: seed({ sidebarCollapsed: true }) },
      ),
      s(
        'sidebar',
        ['Öffne die Git-Seitenleiste', 'Open the Git sidebar'],
        ['Öffne die Karten über den Schalter oben links.', 'Open the cards using the upper-left toggle.'],
        branchControl('sidebar-toggle'),
        { prepare: seed({ sidebarCollapsed: true }), completion: element(panel) },
      ),
      s(
        'card',
        ['Finde die Tag-Karte des aktuellen Repositories', 'Find the current repository’s tag card'],
        [
          'Die vorhandene Markierung v1.0.0 bleibt erhalten. Der neue Tag wird eine zusätzliche lokale Referenz.',
          'The existing v1.0.0 marker will be retained. The new tag will be an additional local reference.',
        ],
        panel,
        { prepare: seed() },
      ),
      s('open', ['Öffne Tag erstellen', 'Open Create tag'], ['Klicke das Plus in der Tag-Karte.', 'Click the plus in the tag card.'], c('create'), {
        prepare: seed(),
        completion: element(tagDialog),
      }),
      s(
        'branch',
        ['Das Formular nennt main als aktuellen Branch', 'The form names main as the current branch'],
        [
          'Der Tag wird am aktuellen Commit erstellt. In dieser Übung ist das der vierte Commit auf main; es gibt kein separates Zielfeld in diesem Formular.',
          'The tag is created at the current commit. In this exercise that is the fourth commit on main; this form has no separate target field.',
        ],
        tagDialog + ' .dialog-context-list',
        { prepare: seed({ dialog: true }) },
      ),
      s(
        'name',
        ['Gib v1.1.0 als Tag-Namen ein', 'Enter v1.1.0 as the tag name'],
        [
          'Schreibe v1.1.0. Der Name ist frei wählbar, muss aber ein gültiger, noch nicht vorhandener Git-Tag sein. Ein v-Präfix ist eine Konvention.',
          'Enter v1.1.0. You can choose the name, but it must be a valid Git tag that does not yet exist. A v prefix is a convention.',
        ],
        field('name'),
        { prepare: seed({ dialog: true }), completion: value(field('name'), name) },
      ),
      s('message', messageTitle, messageText, field('message'), {
        prepare: named(),
        ...(annotated ? { completion: { kind: 'value' as const, selector: field('message'), value: tagMessage } } : {}),
      }),
      s(
        'impact',
        ['Prüfe die Bedeutung der Tag-Nachricht', 'Review what the tag message means'],
        [
          'Das Formular erklärt zusätzliche Metadaten bei annotierten Tags. Weder Variante ändert den Dateiinhalt oder erstellt einen weiteren Commit. Veröffentlichung ist eine separate Aktion.',
          'The form explains the extra metadata in annotated tags. Neither variant changes file contents or creates another commit. Publishing is a separate action.',
        ],
        tagDialog + ' .dialog-impact',
        { prepare: filled() },
      ),
      s(
        'cancel',
        ['Brich den ersten Entwurf ab', 'Cancel the first draft'],
        ['Wähle Abbrechen. Ein ausgefüllter Dialog allein soll noch keinen Tag erzeugen.', 'Choose Cancel. A completed form alone should not create a tag.'],
        tagCancel,
        { prepare: filled(), completion: { kind: 'all', conditions: [{ kind: 'absent', selector: tagDialog }, element(row('v1.0.0'))] } },
      ),
      s(
        'unchanged',
        ['Es gibt weiterhin nur den bisherigen Tag', 'Only the previous tag still exists'],
        [
          'v1.1.0 wurde beim Abbrechen nicht gespeichert. main bleibt am vierten Commit und die Dateien sind unverändert.',
          'Cancelling did not save v1.1.0. main remains at the fourth commit and the files are unchanged.',
        ],
        panel,
        { prepare: seed() },
      ),
      s('retry-open', ['Öffne das Formular erneut', 'Open the form again'], ['Klicke noch einmal Tag erstellen.', 'Click Create tag again.'], c('create'), {
        prepare: seed(),
        completion: element(tagDialog),
      }),
      s(
        'retry-name',
        ['Trage den Namen erneut ein', 'Enter the name again'],
        [
          'Schreibe erneut v1.1.0. Der abgebrochene Entwurf wurde nicht als Referenz gespeichert.',
          'Enter v1.1.0 again. The cancelled draft was not saved as a reference.',
        ],
        field('name'),
        { prepare: seed({ dialog: true }), completion: value(field('name'), name) },
      ),
      s('retry-message', messageTitle, messageText, field('message'), {
        prepare: named(),
        ...(annotated ? { completion: { kind: 'value' as const, selector: field('message'), value: tagMessage } } : {}),
      }),
      s(
        'review',
        ['Prüfe Namen, Nachricht und aktiven Branch', 'Review the name, message and active branch'],
        [
          'Prüfe v1.1.0 und main. Speichern markiert den vorhandenen Commit; es lädt nichts hoch.',
          'Check v1.1.0 and main. Saving marks the existing commit; it uploads nothing.',
        ],
        tagDialog,
        { prepare: filled() },
      ),
      s(
        'create',
        ['Erstelle die lokale Markierung', 'Create the local marker'],
        [
          'Bestätige Tag erstellen. Danach soll v1.1.0 in der Karte und am vierten Commit erscheinen.',
          'Confirm Create tag. Afterwards v1.1.0 should appear in the card and at the fourth commit.',
        ],
        tagConfirm,
        {
          prepare: filled(),
          completion: {
            kind: 'all',
            conditions: [
              element(row(name)),
              element(graphRow(4) + '[data-commit-head="true"]'),
              { kind: 'working-tree', staged: [], unstaged: [], untracked: [] },
            ],
          },
        },
      ),
      s(
        'saved',
        ['Der neue Name ist zusätzlich vorhanden', 'The new name exists alongside the old one'],
        [
          'v1.0.0 und v1.1.0 bleiben getrennte Referenzen. Durch die neue Markierung ist kein fünfter Commit entstanden.',
          'v1.0.0 and v1.1.0 remain separate references. The new marker created no fifth commit.',
        ],
        row(name),
        { prepare: created() },
      ),
      s(
        'reference',
        ['Der Graph zeigt v1.1.0 am bisherigen HEAD', 'The graph shows v1.1.0 at the existing HEAD'],
        [
          'main, HEAD und der neue Tag bezeichnen hier denselben Commit. Der Tag bleibt künftig fest, während main bei weiteren Commits vorwärtsgehen kann.',
          'main, HEAD and the new tag refer to the same commit here. The tag remains fixed while main can advance with later commits.',
        ],
        graphRow(4) + ' .commit-refs',
        { prepare: created() },
      ),
      s(
        'select',
        ['Untersuche den markierten Commit', 'Inspect the marked commit'],
        ['Klicke v1.1.0 in der Tag-Karte.', 'Click v1.1.0 in the tag card.'],
        row(name),
        { prepare: created(), completion: element(commitPanel(4)) },
      ),
      s(
        'commit',
        ['Die ursprüngliche Commit-Nachricht bleibt erhalten', 'The original commit message is preserved'],
        annotated
          ? [
              'Die Commit-Ansicht zeigt den markierten Commit. Deine zusätzliche Tag-Nachricht gehört zur Markierung und hat dessen Commit-Nachricht nicht ersetzt.',
              'The commit view shows the marked commit. Your additional tag message belongs to the marker and did not replace that commit’s message.',
            ]
          : [
              'Die Commit-Ansicht zeigt denselben vierten Commit mit seiner bisherigen Nachricht. Ein einfacher Tag ergänzt nur den Namen.',
              'The commit view shows the same fourth commit with its original message. A lightweight tag only adds the name.',
            ],
        commitPanel(4),
        { prepare: created(true) },
      ),
      s(
        'open-file',
        ['Öffne den gespeicherten README-Diff', 'Open the saved README diff'],
        ['Öffne README.md aus der Commit-Dateiliste.', 'Open README.md from the commit file list.'],
        commitPanel(4) + ' ' + commitFile(),
        { prepare: created(true), completion: element(historyViewer(4)) },
      ),
      s(
        'diff',
        ['Die Markierung hat keine neue Dateiänderung erzeugt', 'The marker created no new file change'],
        [
          'Der Diff gehört weiterhin zum ursprünglichen vierten Commit. Das Taggen hat keine neue README-Fassung geschrieben.',
          'The diff still belongs to the original fourth commit. Tagging wrote no new README version.',
        ],
        historyViewer(4),
        { prepare: created(true, true) },
      ),
      s(
        'close-file',
        ['Schließe die Dateiprüfung', 'Close the file check'],
        ['Kehre zur lokalen Tag-Karte zurück.', 'Return to the local tag card.'],
        fileControl('close-file'),
        { prepare: created(true, true), completion: { kind: 'absent', selector: historyViewer(4) } },
      ),
      s(
        'finish',
        ['Die lokale Versionsmarkierung ist gespeichert', 'The local version marker is saved'],
        [
          'Du hast beide Formularfelder geprüft, zuerst abgebrochen und dann bewusst bestätigt. main, Index und Arbeitsdateien sind erhalten. Der Tag wurde nicht veröffentlicht. Weiter beendet die Lektion.',
          'You reviewed both form fields, cancelled first and then deliberately confirmed. main, the index and working files are preserved. The tag was not published. Next finishes the lesson.',
        ],
        panel,
        { prepare: created() },
      ),
    ],
  };
}
export const TUTORIAL_TAGS_LIGHTWEIGHT = createTagLesson(false);
export const TUTORIAL_TAGS_ANNOTATED = createTagLesson(true);
