import type { TutorialChapter, TutorialStep } from './types';
import { branchStep, branchControl as c, branchRow as row, branchElement as element, branchValue as value } from './branchLessonHelpers';
import {
  branchCarryRecipe as seed,
  carryBranch as branch,
  carryDialog as dialog,
  carryButton as button,
  carryFile as file,
  carryField as field,
  carryName as name,
} from './branchCarryHelpers';
const s: typeof branchStep = (id, title, description, target, extra) => branchStep(id, title, description, target, { inspector: 'staging', ...extra });
const review = { dialog: 'review' as const };
const choice = { dialog: 'choice' as const };
const namedReview = { ...review, reviewedName: name };
const preview = '.branch-change-preview';
const selected = (group: 'staged' | 'unstaged' | 'new') => element(file(group) + '[aria-pressed="true"]');
const closed: TutorialStep['completion'] = { kind: 'absent', selector: dialog };
export const TUTORIAL_BRANCHES_CARRY_REVIEW: TutorialChapter = {
  id: 'branches-carry-review',
  section: 'repo',
  title: ['Offene Änderungen vor dem Branchwechsel prüfen', 'Review uncommitted changes before switching branches'],
  description: [
    'Lies gestagte, ungestagte und neue Inhalte im Wechsel-Dialog; übe Abbrechen, Sicherungsname, Rückweg und erneute Prüfung.',
    'Read staged, unstaged and new contents in the switch dialog; practise cancellation, backup naming, returning and reinspection.',
  ],
  question: ['Wie prüfe ich offene Änderungen vor einem Branchwechsel?', 'How do I review uncommitted changes before switching branches?'],
  keywords: 'branch wechsel checkout offene änderungen carry stash preview vorschau name prüfen abbrechen zurück gestagt ungestagt neu',
  steps: [
    s(
      'overview',
      ['Ein Wechsel mit offener Arbeit braucht eine eigene Prüfung', 'Switching with uncommitted work needs its own review'],
      [
        'README.md hat eine vorgemerkte und eine weitere bearbeitete Fassung; notes.txt ist neu. Beide Branches zeigen hier bewusst auf denselben gespeicherten Commit. Wir üben zunächst den Prüfungsdialog und führen noch keinen Wechsel aus.',
        'README.md has a staged version and a further working edit; notes.txt is new. Both branches deliberately point to the same saved commit here. We will first practise the review dialog without executing a switch.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'partial',
      ['README steht in zwei Änderungsbereichen', 'README appears in two change sections'],
      [
        'Die vorgemerkte Fassung begrüßt Staging, die Arbeitsdatei das Team. Ein Wechsel muss diese Trennung erhalten. Die gleiche Datei in zwei Bereichen ist keine doppelte Kopie im Repository.',
        'The staged version greets staging, while the working file greets the team. A switch must preserve that distinction. The same file in two sections is not a duplicate repository file.',
      ],
      c('staged-files'),
      { prepare: seed() },
    ),
    s(
      'new',
      ['Die neue Datei gehört ebenfalls zur offenen Arbeit', 'The new file also belongs to the uncommitted work'],
      [
        'notes.txt ist noch in keinem Commit enthalten. Der geführte Wechsel berücksichtigt gestagte, ungestagte und neue Dateien gemeinsam; ignorierte Dateien bleiben ausgeschlossen.',
        'notes.txt is not contained in any commit yet. The guided switch considers staged, unstaged and new files together; ignored files remain excluded.',
      ],
      c('untracked-files'),
      { prepare: seed() },
    ),
    s(
      'request',
      ['Fordere den Wechsel zum Beispielbranch an', 'Request a switch to the sample branch'],
      [
        'Klicke feature/begruessung. Wegen der offenen Änderungen erscheint zunächst eine Prüfung. Ein Klick auf den Branch soll die Dateien noch nicht stillschweigend verwerfen.',
        'Click feature/begruessung. The uncommitted changes first bring up a review. Clicking the branch should not silently discard the files.',
      ],
      row(branch),
      { prepare: seed(), completion: element('.branch-change-files') },
    ),
    s(
      'direction',
      ['Quelle und Wechselziel sind ausdrücklich angegeben', 'The source and switch target are explicit'],
      [
        'Der Dialog zeigt main als Quelle und feature/begruessung als Ziel. HEAD bleibt bis zur tatsächlichen Ausführung an main. Diese Prüfung ist weder ein Commit noch ein Merge.',
        'The dialog shows main as the source and feature/begruessung as the target. HEAD remains on main until execution. This review is neither a commit nor a merge.',
      ],
      '.branch-change > p:first-of-type',
      { prepare: seed(review) },
    ),
    s(
      'groups',
      ['Drei Gruppen unterscheiden die betroffenen Versionen', 'Three groups distinguish the affected versions'],
      [
        'README steht unter Gestagt und Ungestagt, notes.txt bei den neuen Dateien. Die Gruppen beschreiben unterschiedliche Quellen. Die Vorschau eines Eintrags wählt nicht einzelne Dateien vom Wechsel ab.',
        'README appears in Staged and Unstaged, while notes.txt is in new files. The groups describe different sources. Previewing an entry does not exclude individual files from the switch.',
      ],
      '.branch-change-files',
      { prepare: seed(review) },
    ),
    s(
      'preview-staged',
      ['Öffne README in der Gruppe Gestagt', 'Open README in the Staged group'],
      [
        'Wähle README.md im ersten Bereich. Der Vergleich soll den letzten Commit mit der vorgemerkten Fassung vergleichen.',
        'Choose README.md in the first group. The preview should compare the last commit with the staged version.',
      ],
      file('staged'),
      { prepare: seed(review), completion: selected('staged') },
    ),
    s(
      'staged-diff',
      ['Diese Vorschau erklärt die Indexänderung', 'This preview explains the index change'],
      [
        'Die entfernte Zeile begrüßt die Welt; die hinzugefügte Zeile begrüßt Staging. Genau diese Fassung ist vorgemerkt. Die weitere Bearbeitung im Arbeitsordner gehört noch nicht zu diesem Vergleich.',
        'The removed line greets the world; the added line greets staging. That version is staged. The further working-directory edit is not part of this comparison yet.',
      ],
      preview,
      { prepare: seed({ ...review, preview: 'staged' }) },
    ),
    s(
      'preview-unstaged',
      ['Wähle README unter Ungestagt', 'Choose README under Unstaged'],
      [
        'Wähle nun denselben Dateinamen im zweiten Bereich. Damit wechseln wir die Vergleichsquelle, ohne eine Datei zu bearbeiten.',
        'Now choose the same filename in the second group. This changes the comparison source without editing a file.',
      ],
      file('unstaged'),
      { prepare: seed({ ...review, preview: 'staged' }), completion: selected('unstaged') },
    ),
    s(
      'working-diff',
      ['Hier wird Index gegen Arbeitsdatei verglichen', 'This compares index against working file'],
      [
        'Jetzt wird Staging durch Team ersetzt. Dieser zusätzliche Unterschied bleibt ungestagt. Beide README-Vorschauen zusammen erklären, warum die Datei in zwei Gruppen steht.',
        'Now staging is replaced by team. This additional difference remains unstaged. Together, the two README previews explain why the file appears in two groups.',
      ],
      preview,
      { prepare: seed({ ...review, preview: 'unstaged' }) },
    ),
    s(
      'preview-new',
      ['Öffne die Vorschau der neuen notes.txt', 'Open the new notes.txt preview'],
      [
        'Wähle notes.txt in der dritten Gruppe. Da sie neu ist, wird ihr gespeicherter Arbeitsinhalt als neu hinzugefügter Text gezeigt.',
        'Choose notes.txt in the third group. Because it is new, its current working contents appear as added text.',
      ],
      file('new'),
      { prepare: seed({ ...review, preview: 'unstaged' }), completion: selected('new') },
    ),
    s(
      'new-content',
      ['Auch neue Inhalte sind vorab lesbar', 'New contents can also be read beforehand'],
      [
        'Die hinzugefügten Zeilen gehören zur noch unversionierten Beispieldatei. Eine Vorschau verändert weder ihren Inhalt noch den Staging-Zustand.',
        'The added lines belong to the still-untracked example file. Previewing changes neither its contents nor its staging state.',
      ],
      preview,
      { prepare: seed({ ...review, preview: 'new' }) },
    ),
    s(
      'cancel',
      ['Brich den ersten Wechselversuch ab', 'Cancel the first switch attempt'],
      [
        'Wähle Abbrechen. Wir verlassen die Prüfung, bevor ein Sicherungsname oder eine Wechselentscheidung bestätigt wird.',
        'Choose Cancel. We leave the review before confirming a backup name or switch decision.',
      ],
      button('cancel'),
      { prepare: seed({ ...review, preview: 'new' }), completion: closed },
    ),
    s(
      'retained',
      ['main und alle offenen Fassungen bleiben erhalten', 'main and all uncommitted versions remain'],
      [
        'main trägt weiterhin HEAD. README ist unverändert teilweise vorgemerkt und notes.txt bleibt neu. Der abgebrochene Dialog hat weder einen Commit noch einen Branchwechsel ausgeführt.',
        'main still carries HEAD. README remains partially staged and notes.txt stays new. The cancelled dialog executed neither a commit nor a branch switch.',
      ],
      row('main', true),
      { prepare: seed() },
    ),
    s(
      'request-again',
      ['Öffne die Wechselprüfung erneut', 'Open the switch review again'],
      [
        'Klicke erneut feature/begruessung. Dieses Mal gehen wir bis zur Entscheidung über die offenen Änderungen und üben ihren Rückweg.',
        'Click feature/begruessung again. This time we will reach the decision about uncommitted changes and practise returning from it.',
      ],
      row(branch),
      { prepare: seed(), completion: element('.branch-change-files') },
    ),
    s(
      'next',
      ['Gehe von der Prüfung zur Entscheidung', 'Proceed from review to decision'],
      [
        'Wähle Weiter im Dialog. Das bestätigt zunächst die geprüften Dateien und zeigt anschließend Sicherungsname und Wechselvarianten. Es führt noch keinen Checkout aus.',
        'Choose Next in the dialog. This first accepts the reviewed files and then shows the backup name and switch choices. It does not execute checkout yet.',
      ],
      button('confirm'),
      { prepare: seed(review), completion: element(field) },
    ),
    s(
      'name-purpose',
      ['Der Stash-Name bezeichnet die Sicherung', 'The stash name identifies the backup'],
      [
        'Dieser Name beschreibt die Sicherung der offenen Arbeit. Er ist weder ein Branch-Name noch eine Commit-Nachricht. Wir geben einen aussagekräftigen Namen ein, bevor wir über Mitnehmen oder Parken entscheiden.',
        'This name describes the backup of uncommitted work. It is neither a branch name nor a commit message. We will enter a useful name before choosing whether to carry or park the work.',
      ],
      field,
      { prepare: seed(choice) },
    ),
    s(
      'empty-name',
      ['Leere den Namen zunächst bewusst', 'Deliberately clear the name first'],
      [
        'Entferne den vorbelegten Text. Ein leerer Name soll die Ausführung noch nicht ermöglichen.',
        'Remove the prefilled text. An empty name should not enable execution.',
      ],
      field,
      { prepare: seed(choice), completion: value(field, '') },
    ),
    s(
      'disabled',
      ['Ohne Namen bleibt die Ausführung deaktiviert', 'Execution stays disabled without a name'],
      [
        'Die primäre Wechselaktion ist deaktiviert. Ein Name hilft dabei, eine erhaltene Sicherung später wiederzuerkennen. Abbrechen und der Rückweg zur Prüfung bleiben verfügbar.',
        'The primary switch action is disabled. A name helps identify a retained backup later. Cancellation and returning to the review remain available.',
      ],
      button('confirm'),
      { prepare: seed({ ...choice, name: ['', ''] }) },
    ),
    s(
      'name',
      ['Benenne die geprüften Übungsänderungen', 'Name the reviewed practice changes'],
      [
        'Trage „Notizen für den Branchwechsel“ ein. Die gültige Eingabe soll die primäre Wechselentscheidung wieder freigeben.',
        'Enter “Notes for the branch switch”. A valid entry should enable the primary switch decision again.',
      ],
      field,
      { prepare: seed({ ...choice, name: ['', ''] }), completion: { kind: 'value', selector: field, value: name } },
    ),
    s(
      'back',
      ['Kehre zur Dateiprüfung zurück', 'Return to the file review'],
      [
        'Wähle Zurück zur Prüfung. Der Name soll bei diesem Rückweg erhalten bleiben, während du die betroffenen Dateien erneut lesen kannst.',
        'Choose Back to review. The name should remain while you return to reading the affected files.',
      ],
      c('branch-change-review'),
      { prepare: seed({ ...choice, name }), completion: element('.branch-change-files') },
    ),
    s(
      'preview-again',
      ['Wähle erneut die vorgemerkte README', 'Select the staged README again'],
      [
        'Öffne noch einmal die vorgemerkte README-Vorschau. Damit können wir beobachten, was Erneut prüfen mit einer bereits ausgewählten Vorschau macht.',
        'Open the staged README preview once more. This lets us observe what Review again does with an already selected preview.',
      ],
      file('staged'),
      { prepare: seed(namedReview), completion: selected('staged') },
    ),
    s(
      'refresh',
      ['Lies den aktuellen Arbeitsstand erneut ein', 'Read the current working state again'],
      [
        'Wähle Erneut prüfen. Die App erstellt eine neue Prüfung und entfernt die bisher ausgewählte Vorschau. Deine Datei-Inhalte und der eingegebene Sicherungsname sollen dabei erhalten bleiben.',
        'Choose Review again. The app creates a fresh inspection and clears the selected preview. Your file contents and entered backup name should remain.',
      ],
      c('branch-change-refresh'),
      { prepare: seed({ ...namedReview, preview: 'staged' }), completion: { kind: 'absent', selector: preview } },
    ),
    s(
      'fresh-review',
      ['Die drei Quellen werden frisch geprüft', 'The three sources are inspected afresh'],
      [
        'Die Dateigruppen sind weiterhin vorhanden, aber noch keine Vorschau ist ausgewählt. Die neue Prüfung gehört zum aktuellen Arbeitsstand und ersetzt die vorherige Wechselprüfung.',
        'The file groups remain, but no preview is selected. The new inspection belongs to the current working state and replaces the previous switch review.',
      ],
      '.branch-change-files',
      { prepare: seed(namedReview) },
    ),
    s(
      'next-again',
      ['Gehe erneut zur Entscheidung', 'Proceed to the decision again'],
      [
        'Wähle wieder Weiter. Wir kontrollieren den zuvor eingegebenen Namen, ohne bereits einen Wechsel auszuführen.',
        'Choose Next again. We will inspect the previously entered name without executing a switch yet.',
      ],
      button('confirm'),
      { prepare: seed(namedReview), completion: element(field) },
    ),
    s(
      'name-kept',
      ['Dein Sicherungsname ist erhalten geblieben', 'Your backup name has been retained'],
      [
        'Der Name steht weiterhin im Feld. Der interne Rückweg und die Neuprüfung haben ihn nicht gelöscht. Für den eigentlichen Wechsel gibt es eine eigene Lektion mit anschließender Kontrolle aller drei Dateizustände.',
        'The name remains in the field. Returning and reinspecting did not erase it. The actual switch has its own lesson with verification of all three file states afterwards.',
      ],
      field,
      { prepare: seed({ ...choice, name }) },
    ),
    s(
      'cancel-choice',
      ['Schließe auch die Entscheidung ohne Wechsel', 'Close the decision without switching too'],
      [
        'Wähle Abbrechen. Auch mit gültigem Namen wird ohne deine Wechselbestätigung nichts umgeschaltet.',
        'Choose Cancel. Even with a valid name, nothing switches without your explicit switch confirmation.',
      ],
      button('cancel'),
      { prepare: seed({ ...choice, name }), completion: closed },
    ),
    s(
      'finish',
      ['Du kannst offene Arbeit vor einem Wechsel prüfen', 'You can review uncommitted work before switching'],
      [
        'Du hast alle drei Vorschauquellen gelesen, abgebrochen, den Namen geprüft und Rückweg sowie Neuprüfung ausprobiert. main und die offenen Änderungen sind erhalten. Weiter beendet diese Prüfungslektion.',
        'You read all three preview sources, cancelled, checked the name and tried returning and reinspecting. main and the uncommitted changes remain. Next completes this review lesson.',
      ],
      c('staging'),
      { prepare: seed() },
    ),
  ],
};
