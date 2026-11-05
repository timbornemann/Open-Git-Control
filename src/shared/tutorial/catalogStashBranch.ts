import type { TutorialChapter } from './types';
import { branchControl as c, branchRow as row, branchElement as element } from './branchLessonHelpers';
import { stagingRow, tree } from './stagingLessonHelpers';
import { graphRow, historyViewer as viewer } from './historyLessonHelpers';
import { stashStep as s, ordinaryAction as action, stashConfirm, stashCancel, emptyStashes } from './stashLessonHelpers';
import { stashBranchRecipe as seed, stashBranchName as name, stashBranchField as field } from './stashBranchHelpers';
export const TUTORIAL_STASH_BRANCH: TutorialChapter = {
  id: 'stash-branch',
  section: 'repo',
  title: ['Einen Branch vom gespeicherten Stash-Ausgangspunkt beginnen', 'Start a branch at the saved stash base'],
  description: [
    'Prüfe einen älteren Sicherungsstand, benenne den neuen Branch und kontrolliere Basis, Index, Arbeitsdatei sowie neue Datei nach der Übernahme.',
    'Inspect an older backup base, name the new branch and verify its base, index, working file and new file after restoration.',
  ],
  question: ['Wie erstelle ich einen Branch aus einem Stash?', 'How do I create a branch from a stash?'],
  keywords: 'stash branch neuer zweig basis ausgangspunkt älter original sichern wiederherstellen index name',
  steps: [
    s(
      'overview',
      ['Das Arbeitspaket stammt von einem älteren Ausgangspunkt', 'The work bundle comes from an older starting revision'],
      [
        'Diese Lektion beginnt frisch mit einer Sicherung vom älteren main. Aktuell ist der saubere, neuere feature/begruessung aktiv. Wir erstellen einen eigenen Branch an der ursprünglichen Stash-Basis und holen dort die offene Arbeit zurück.',
        'This lesson starts fresh with a backup from the older main. The clean, newer feature/begruessung is currently active. We will create a separate branch at the original stash base and restore the uncommitted work there.',
      ],
      c('staging'),
      { continue: false, prepare: seed() },
    ),
    s(
      'source',
      ['main markiert den älteren Sicherungsstand', 'main marks the older backup base'],
      [
        'Die Sicherung wurde angelegt, als main auf diesem Commit stand. Der neue Branch soll von genau diesem gespeicherten Ausgangspunkt beginnen.',
        'The backup was created when main pointed to this commit. The new branch should start at exactly this saved base.',
      ],
      graphRow(3),
      { prepare: seed() },
    ),
    s(
      'current',
      ['Der aktuelle Beispielbranch ist bereits einen Commit weiter', 'The current sample branch is already one commit ahead'],
      [
        'HEAD gehört zu feature/begruessung am neueren Commit. Die Stash-Branch-Aktion verwendet trotzdem die ursprüngliche Sicherungsbasis und verschiebt diesen vorhandenen Branch nicht.',
        'HEAD belongs to feature/begruessung at the newer commit. The stash-branch action still uses the original backup base and does not move this existing branch.',
      ],
      graphRow(4),
      { prepare: seed() },
    ),
    s(
      'open',
      ['Öffne Branch am Stash-Eintrag', 'Open Branch on the stash entry'],
      [
        'Wähle Branch am Arbeitspaket. Der Dialog soll einen neuen Branch-Namen anfragen und die Herkunft der Sicherung erklären.',
        'Choose Branch on the work bundle. The dialog should request a new branch name and explain the backup’s origin.',
      ],
      action('branch'),
      { prepare: seed(), completion: element(field) },
    ),
    s(
      'purpose',
      ['Die Aktion verbindet neue Basis und Wiederherstellung', 'The action combines a new base and restoration'],
      [
        'Der neue Branch beginnt am ursprünglichen Stash-Ausgangspunkt. Anschließend wird die gesicherte Arbeit einschließlich Staging-Zustand angewendet. Erst bei erfolgreicher Übernahme wird die ausgewählte Sicherung entfernt.',
        'The new branch starts at the original stash base. The saved work is then applied including its staged state. The selected backup is removed only after successful restoration.',
      ],
      '.dialog-modal',
      { prepare: seed('dialog') },
    ),
    s(
      'default-name',
      ['Der vorgeschlagene Name lässt sich ersetzen', 'The suggested name can be replaced'],
      [
        'stash-0 ist ein Vorschlag aus der aktuellen Stapelposition. Wähle für deine Arbeit einen verständlichen Branch-Namen. Das Feld ist im Unterschied zur Stash-Nachricht verpflichtend.',
        'stash-0 is a suggestion based on the current stack position. Choose a recognizable branch name for your work. Unlike the stash message, this field is required.',
      ],
      field,
      { prepare: seed('dialog') },
    ),
    s(
      'empty',
      ['Entferne den vorgeschlagenen Namen probeweise', 'Temporarily clear the suggested name'],
      [
        'Leere das Namensfeld. Die App soll einen Branch ohne Namen nicht bestätigen lassen.',
        'Clear the name field. The app should not allow confirming a branch without a name.',
      ],
      field,
      { prepare: seed('dialog'), completion: { kind: 'value', selector: field, value: ['', ''] } },
    ),
    s(
      'required',
      ['Ohne Namen bleibt die Bestätigung gesperrt', 'Confirmation stays disabled without a name'],
      [
        'Das leere Pflichtfeld zeigt eine Rückmeldung und sperrt Branch erstellen. Es wurde noch kein Branch angelegt und keine Sicherung verbraucht.',
        'The empty required field shows feedback and disables Create branch. No branch has been created and no backup has been consumed.',
      ],
      field,
      { prepare: seed('empty') },
    ),
    s(
      'cancel',
      ['Brich den noch unbenannten Vorgang ab', 'Cancel the unnamed operation'],
      [
        'Wähle Abbrechen. Der aktuelle Branch und die Sicherung sollen unverändert erhalten bleiben.',
        'Choose Cancel. The current branch and backup should remain unchanged.',
      ],
      stashCancel,
      { prepare: seed('empty'), completion: { kind: 'absent', selector: '.dialog-modal' } },
    ),
    s(
      'unchanged',
      ['Der neuere Branch ist weiterhin aktiv', 'The newer branch is still active'],
      [
        'feature/begruessung ist weiterhin sauber aktiv; main und das Arbeitspaket sind noch vorhanden. Wir öffnen den Branch-Dialog erneut und bestätigen einen bewussten Namen.',
        'feature/begruessung remains active and clean; main and the work bundle still exist. We will reopen the branch dialog and confirm a deliberate name.',
      ],
      row('feature/begruessung', true),
      { prepare: seed() },
    ),
    s(
      'retry',
      ['Öffne die Branch-Aktion erneut', 'Open the Branch action again'],
      [
        'Wähle erneut Branch am Stash. Der Vorgang beginnt wieder mit einem frischen Namensvorschlag.',
        'Choose Branch on the stash again. The operation starts again with a fresh suggested name.',
      ],
      action('branch'),
      { prepare: seed(), completion: element(field) },
    ),
    s(
      'name',
      ['Benenne den Branch feature/saved-work', 'Name the branch feature/saved-work'],
      [
        'Trage feature/saved-work ein. Dieser Name bezeichnet einen neuen lokalen Branch für die zurückgeholte Arbeit.',
        'Enter feature/saved-work. This names a new local branch for the restored work.',
      ],
      field,
      { prepare: seed('dialog'), completion: { kind: 'value', selector: field, value: [name, name] } },
    ),
    s(
      'name-explained',
      ['Der Name ändert nicht den gespeicherten Ausgangspunkt', 'The name does not change the saved base'],
      [
        'Auch mit dem neuen Namen beginnt der Branch an der älteren Sicherungsbasis. Der aktuell neuere feature/begruessung bleibt als eigener Branch erhalten.',
        'Even with the new name, the branch starts at the older backup base. The currently newer feature/begruessung remains a separate branch.',
      ],
      field,
      { prepare: seed('named') },
    ),
    s(
      'create',
      ['Bestätige Branch erstellen', 'Confirm Create branch'],
      [
        'Bestätige den Dialog. Die Übung ist erst erfolgreich, wenn feature/saved-work aktiv ist und README sowie notes.txt mit ihren ursprünglichen Index- und Arbeitszuständen zurückgekehrt sind.',
        'Confirm the dialog. The exercise succeeds once feature/saved-work is active and README and notes.txt have returned with their original index and working states.',
      ],
      stashConfirm,
      {
        prepare: seed('named'),
        completion: {
          kind: 'all',
          conditions: [
            element(row(name, true)),
            { kind: 'absent', selector: '.dialog-modal' },
            tree(['README.md'], ['README.md'], ['notes.txt'], {
              content: [
                { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'index' } },
                { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
                { path: 'notes.txt', source: 'worktree', value: { example: 'tree-files', version: 'note' } },
              ],
            }),
          ],
        },
      },
    ),
    s(
      'branch',
      ['Der neue lokale Branch ist aktiv', 'The new local branch is active'],
      [
        'HEAD gehört nun zu feature/saved-work. main und feature/begruessung sind weiterhin vorhanden; die Aktion hat keinen von beiden umbenannt oder gelöscht.',
        'HEAD now belongs to feature/saved-work. main and feature/begruessung still exist; the operation renamed or deleted neither.',
      ],
      row(name, true),
      { prepare: seed('result') },
    ),
    s(
      'base',
      ['HEAD steht an der ursprünglichen Stash-Basis', 'HEAD is at the original stash base'],
      [
        'Der neue Branch steht zusammen mit main am älteren Commit. Die offene Arbeit wurde nicht als neuer Commit gespeichert, sondern auf diesen Ausgangspunkt zurückgebracht.',
        'The new branch points to the older commit alongside main. The uncommitted work was restored onto this base rather than saved as a new commit.',
      ],
      graphRow(3),
      { prepare: seed('result') },
    ),
    s(
      'newer-kept',
      ['Der neuere Beispielbranch bleibt unverändert', 'The newer sample branch stays unchanged'],
      [
        'feature/begruessung zeigt weiterhin auf seinen neueren Commit. Er wurde durch den Beginn der geretteten Arbeit am älteren Stand nicht zurückgesetzt.',
        'feature/begruessung still points to its newer commit. Starting the restored work at the older base did not reset it.',
      ],
      graphRow(4),
      { prepare: seed('result') },
    ),
    s(
      'index',
      ['Die ursprüngliche Indexfassung ist wieder vorgemerkt', 'The original index version is staged again'],
      [
        'README ist wieder vorgemerkt und besitzt zusätzlich eine weitere Arbeitsbearbeitung. Diese Stash-Branch-Aktion stellt die ursprüngliche Trennung wieder her.',
        'README is staged again and also has a further working edit. This stash-branch action restores the original distinction.',
      ],
      c('staged-files'),
      { prepare: seed('result') },
    ),
    s(
      'open-index',
      ['Öffne den wiederhergestellten Index-Diff', 'Open the restored index diff'],
      [
        'Öffne README unter Vorgemerkt. Dieser Vergleich liest den älteren gespeicherten Ausgangspunkt gegen die gesicherte Indexfassung.',
        'Open README under Staged. This compares the older saved base against the restored index version.',
      ],
      stagingRow('staged', 'README.md'),
      { prepare: seed('result'), completion: element(viewer('staged')) },
    ),
    s(
      'index-content',
      ['Die Staging-Begrüßung liegt getrennt im Index', 'The staging greeting is separate in the index'],
      [
        'Die Indexfassung enthält die Staging-Begrüßung und die in der Sicherung enthaltenen Aktualisierungen gegenüber der älteren Basis. Die weitere Team-Begrüßung wurde nicht pauschal mit vorgemerkt.',
        'The index version contains the staging greeting and the saved updates relative to the older base. The further team greeting was not staged indiscriminately.',
      ],
      viewer('staged'),
      { prepare: seed('result', 'staged') },
    ),
    s(
      'close-index',
      ['Schließe den Index-Diff', 'Close the index diff'],
      [
        'Schließe den Viewer mit X. Danach kontrollieren wir die weitere ungestagte Bearbeitung getrennt.',
        'Close the viewer with X. We will then inspect the further unstaged edit separately.',
      ],
      c('close-file'),
      { prepare: seed('result', 'staged'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'work',
      ['Die zusätzliche Bearbeitung bleibt ungestagt', 'The additional edit remains unstaged'],
      [
        'README steht auch unter Änderungen. Das bedeutet hier einen Unterschied zwischen der wiederhergestellten Indexfassung und der zurückgebrachten Arbeitsdatei.',
        'README also appears under Changes. This represents a difference between the restored index version and the working file brought back.',
      ],
      c('unstaged-files'),
      { prepare: seed('result') },
    ),
    s(
      'open-work',
      ['Öffne den ungestagten Vergleich', 'Open the unstaged comparison'],
      [
        'Öffne README unter Änderungen. Nun soll die Staging-Begrüßung gegen die weitere Team-Begrüßung verglichen werden.',
        'Open README under Changes. This should now compare the staging greeting against the further team greeting.',
      ],
      stagingRow('unstaged', 'README.md'),
      { prepare: seed('result'), completion: element(viewer('unstaged')) },
    ),
    s(
      'work-content',
      ['Die weitere Team-Begrüßung ist erhalten', 'The further team greeting has survived'],
      [
        'Staging wird durch Team ersetzt. Zusammen mit dem vorherigen Index-Diff zeigt dies, dass die beiden gespeicherten Fassungen getrennt zurückgekehrt sind.',
        'Staging is replaced with team. Together with the previous index diff, this shows that the two saved versions returned separately.',
      ],
      viewer('unstaged'),
      { prepare: seed('result', 'unstaged') },
    ),
    s(
      'close-work',
      ['Kehre zur Übersicht der offenen Arbeit zurück', 'Return to the uncommitted work overview'],
      [
        'Schließe den Viewer mit X. Beide README-Fassungen bleiben offen, ohne sie weiter zu verändern oder zu committen.',
        'Close the viewer with X. Both README versions remain uncommitted without further editing them.',
      ],
      c('close-file'),
      { prepare: seed('result', 'unstaged'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
    s(
      'new-file',
      ['Die neue Notiz kehrt unversioniert zurück', 'The new note returns as untracked'],
      [
        'notes.txt liegt wieder als neue Datei im Arbeitsordner. Sie wurde von dieser vollständigen Wiederherstellung nicht automatisch vorgemerkt.',
        'notes.txt is back as a new file in the working directory. This complete restoration did not automatically stage it.',
      ],
      c('untracked-files'),
      { prepare: seed('result') },
    ),
    s(
      'backup-removed',
      ['Nach Erfolg ist genau diese Sicherung entfernt', 'After success, exactly this backup is removed'],
      [
        'Die Stash-Liste ist leer. Der ausgewählte Eintrag wurde nach erfolgreicher Branch-Erstellung und Wiederherstellung entfernt. Bei einem abgewiesenen Versuch muss die Sicherung erhalten bleiben.',
        'The stash list is empty. The selected entry was removed after successful branch creation and restoration. A refused attempt must retain the backup.',
      ],
      emptyStashes,
      { prepare: seed('result') },
    ),
    s(
      'finish',
      ['Die gerettete Arbeit hat einen eigenen Branch an ihrer Basis', 'The restored work has its own branch at its base'],
      [
        'Du hast Pflichtfeld und Abbrechen geprüft, einen Branch an der ursprünglichen Sicherungsbasis angelegt und Index, Arbeitsdatei, neue Datei sowie unveränderte vorhandene Branches kontrolliert. Weiter beendet diese Lektion.',
        'You inspected the required field and Cancel, created a branch at the original backup base and verified index, working file, new file and unchanged existing branches. Next completes this lesson.',
      ],
      c('staging'),
      { prepare: seed('result') },
    ),
  ],
};
