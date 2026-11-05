import type { TutorialChapter } from './types';
import { rewordStep as s, rewordRecipe as recipe, rewordControl as c, rewordMenu, rewordDialog, rewordCancel, rewordConfirm } from './rewordLessonHelpers';
import { REWORD_TITLE, REWORD_DESCRIPTION } from './rewordLessonExamples';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl } from './fileLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
const closed = { kind: 'absent' as const, selector: rewordDialog };
export const TUTORIAL_REWORD: TutorialChapter = {
  id: 'reword',
  section: 'repo',
  title: ['Eine ältere lokale Commit-Nachricht bearbeiten', 'Edit an older local commit message'],
  description: [
    'Dialog, Titel, Beschreibung, Abbrechen, Folgecommits und unveränderte Dateien einzeln prüfen.',
    'Inspect the dialog, title, description, cancellation, following commits and unchanged files separately.',
  ],
  question: ['Wie korrigiere ich die Nachricht eines älteren ungepushten Commits?', 'How do I correct an older unpublished commit’s message?'],
  keywords: 'reword commit nachricht bearbeiten älter titel beschreibung editor unpublished ungepusht umschreiben rewrite backup sicherung autor',
  steps: [
    s(
      'scope',
      ['Nur die Nachricht soll sich ändern', 'Only the message should change'],
      [
        'Wir korrigieren den dritten Commit. Dateien, Autoren und Autordaten bleiben erhalten. Der ausgewählte Commit und der darauf folgende vierte Commit erhalten neue Hashes.',
        'We will correct the third commit. Files, authors and author dates stay unchanged. The selected commit and the fourth commit that follows it receive new hashes.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe() },
    ),
    s(
      'head',
      ['main steht noch auf dem vierten Commit', 'main still points to the fourth commit'],
      [
        'HEAD markiert den aktuellen Branch. Die ältere Nachricht gehört dagegen zum Commit darunter. Die Aktion kann diesen älteren Commit gezielt bearbeiten.',
        'HEAD marks the current branch. The older message belongs to the commit below it. This action can specifically edit that older commit.',
      ],
      mergeHead(4),
      { prepare: recipe() },
    ),
    s(
      'publication',
      ['Das Beispiel enthält zwei lokale Folgearbeiten', 'The example contains two local pieces of work'],
      [
        'In diesem vorbereiteten Beispiel ist nur der zweite Commit veröffentlicht: origin/main und v1.0.0 stehen dort. In echten Projekten prüft die App zusätzlich den aktuellen Veröffentlichungsstand vor dem Umschreiben.',
        'In this prepared example only the second commit is published: origin/main and v1.0.0 point there. In real projects the app also checks the current publication state before rewriting.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe() },
    ),
    s(
      'select',
      ['Wähle den dritten Commit', 'Select the third commit'],
      [
        'Klicke den Dokumentationscommit direkt unter dem aktuellen HEAD an. Seine Details zeigen die gespeicherte Nachricht und Dateien.',
        'Click the documentation commit directly below the current HEAD. Its details show the saved message and files.',
      ],
      graphRow(3),
      { prepare: recipe(), completion: element(commitPanel(3)) },
    ),
    s(
      'original',
      ['Lies zuerst die gespeicherte Nachricht', 'Read the saved message first'],
      [
        'Die vorhandene Beschreibung erklärt das Lernprojekt. Wir präzisieren diese Angaben und verändern keine der darunter aufgelisteten Dateien.',
        'The existing description explains the learning project. We will clarify this information without changing any of the files listed below.',
      ],
      '.commit-details-description',
      { prepare: recipe('selected') },
    ),
    s(
      'menu',
      ['Öffne das Kontextmenü dieses Commits', 'Open this commit’s context menu'],
      [
        'Öffne am ausgewählten dritten Commit das Kontextmenü mit der rechten Maustaste. Das Menü bezieht sich auf diesen Commit, nicht automatisch auf HEAD.',
        'Right-click the selected third commit to open its context menu. The menu applies to this commit, rather than automatically to HEAD.',
      ],
      graphRow(3),
      { prepare: recipe('selected'), gesture: 'contextmenu', completion: element(rewordMenu) },
    ),
    s(
      'open',
      ['Öffne Commit-Nachricht bearbeiten', 'Open Edit commit message'],
      [
        'Wähle Commit-Nachricht bearbeiten. Die App prüft erst den Commit und das Repository und lädt anschließend Titel und Beschreibung.',
        'Choose Edit commit message. The app first checks the commit and repository, then loads the title and description.',
      ],
      rewordMenu,
      { prepare: recipe('menu'), completion: element(c('title')) },
    ),
    s(
      'branch',
      ['Der Dialog nennt den betroffenen Branch', 'The dialog identifies the affected branch'],
      [
        'main ist der Branch, dessen lokale Historie ersetzt würde. Prüfe diese Angabe vor dem Übernehmen; ein Branchwechsel macht einen zuvor geöffneten Editor ungültig.',
        'main is the branch whose local history would be replaced. Check this before applying; switching branches invalidates an already opened editor.',
      ],
      c('branch'),
      { prepare: recipe('dialog') },
    ),
    s(
      'commit',
      ['Der kurze Hash bezeichnet den ausgewählten Commit', 'The short hash identifies the selected commit'],
      [
        'Diese Zeile zeigt den dritten Commit, dessen Nachricht du bearbeitest. Der aktuelle vierte HEAD ist sein Nachfolger und bleibt ein eigener Commit.',
        'This line shows the third commit whose message you are editing. The current fourth HEAD is its descendant and remains a separate commit.',
      ],
      c('commit'),
      { prepare: recipe('dialog') },
    ),
    s(
      'following-count',
      ['Ein Folgecommit wird ebenfalls neu geschrieben', 'One following commit is also rewritten'],
      [
        'Folgecommits zeigt hier 1. Ändert sich der Hash eines Vorgängers, braucht auch der darauf aufbauende Commit einen neuen Hash, obwohl seine eigene Nachricht und Dateien gleich bleiben.',
        'Following commits shows 1 here. When a parent hash changes, the commit built on it also needs a new hash, even though its own message and files remain the same.',
      ],
      c('following'),
      { prepare: recipe('dialog') },
    ),
    s(
      'impact',
      ['Die Sicherung bewahrt die vorherige Historie', 'The backup preserves the previous history'],
      [
        'Die App bewahrt den alten HEAD im Recovery Center auf. Die normalen Branch-Referenzen wechseln erst nach erfolgreicher Prüfung gemeinsam auf die neue Historie.',
        'The app keeps the old HEAD in the Recovery Center. The normal branch references move together to the new history only after successful verification.',
      ],
      c('impact'),
      { prepare: recipe('dialog') },
    ),
    s(
      'unchanged',
      ['Unveränderte Angaben können nicht übernommen werden', 'Unchanged information cannot be applied'],
      [
        'Der Knopf bleibt deaktiviert, solange Titel und Beschreibung unverändert sind. Auch ein leerer Titel gibt die Aktion nicht frei.',
        'The button stays disabled while the title and description are unchanged. An empty title does not enable the action either.',
      ],
      rewordConfirm,
      { prepare: recipe('dialog') },
    ),
    s(
      'title',
      ['Trage den vollständigen korrigierten Titel ein', 'Enter the complete corrected title'],
      [
        'Schreibe „docs(lernen): Zweck des Lernprojekts erklären“. Dieser Dialog hat ein einziges Titelfeld: Typ, Bereich und Nachricht werden hier als vollständiger Titel eingegeben.',
        'Enter “docs(lernen): explain the learning project’s purpose”. This dialog has a single title field: enter type, scope and message as the complete title here.',
      ],
      c('title'),
      { prepare: recipe('dialog'), completion: { kind: 'value', selector: c('title'), value: REWORD_TITLE } },
    ),
    s(
      'description-purpose',
      ['Die Beschreibung ist ein eigener mehrzeiliger Text', 'The description is separate multiline text'],
      [
        'Hier steht bisher die vollständige alte Beschreibung. Zeilenumbrüche und Absätze gehören zum Nachrichtentext; die Dateiliste wird dadurch nicht bearbeitet.',
        'The full old description is shown here. Line breaks and paragraphs belong to the message; editing this field does not edit the file list.',
      ],
      c('description'),
      { prepare: recipe('dialog', { form: 1 }) },
    ),
    s(
      'description',
      ['Formuliere zwei kurze Absätze', 'Write two short paragraphs'],
      [
        'Schreibe „Die Beschreibung erläutert das vorhandene Übungsprojekt.“, dann eine Leerzeile und „Dateien und Autoren bleiben erhalten.“.',
        'Enter “The description explains the existing practice project.”, then a blank line and “Files and authors remain unchanged.”.',
      ],
      c('description'),
      { prepare: recipe('dialog', { form: 1 }), completion: { kind: 'value', selector: c('description'), value: REWORD_DESCRIPTION } },
    ),
    s(
      'review-draft',
      ['Die Angaben sind bisher nur ein Entwurf', 'The information is still only a draft'],
      [
        'Übernehmen ist jetzt verfügbar. Das Bearbeiten der Felder hat jedoch noch keinen Commit ersetzt. Probiere zuerst den sicheren Rückweg über Abbrechen aus.',
        'Apply change is now available. Editing the fields has not replaced any commit yet. First try the safe way back using Cancel.',
      ],
      rewordConfirm,
      { prepare: recipe('dialog', { form: 2 }) },
    ),
    s(
      'cancel',
      ['Verwirf diesen ersten Nachrichtenentwurf', 'Discard this first message draft'],
      [
        'Klicke Abbrechen. Der Dialog schließt sich, main bleibt auf dem vierten Commit und die ursprüngliche Nachricht bleibt gespeichert.',
        'Click Cancel. The dialog closes, main stays on the fourth commit and the original message remains saved.',
      ],
      rewordCancel,
      { prepare: recipe('dialog', { form: 2 }), completion: { kind: 'all', conditions: [closed, element(mergeHead(4))] } },
    ),
    s(
      'cancelled',
      ['Abbrechen hat keine neue Historie erzeugt', 'Cancellation created no new history'],
      [
        'Die alten vier Commits bleiben im Graphen. Das Abbrechen eines bloßen Entwurfs benötigt keine Wiederherstellung und erzeugt keine Nachrichtensicherung.',
        'The original four commits remain in the graph. Cancelling a draft requires no recovery and creates no message backup.',
      ],
      graphRow(3),
      { prepare: recipe('cancelled') },
    ),
    s(
      'reopen-menu',
      ['Öffne das Kontextmenü erneut', 'Open the context menu again'],
      ['Öffne noch einmal das Menü des dritten Commits.', 'Open the third commit’s context menu once more.'],
      graphRow(3),
      { prepare: recipe('cancelled'), gesture: 'contextmenu', completion: element(rewordMenu) },
    ),
    s(
      'reopen',
      ['Lade die gespeicherte Nachricht erneut', 'Load the saved message again'],
      [
        'Öffne Commit-Nachricht bearbeiten erneut. Der verworfene Entwurf wird nicht als gespeicherte Nachricht angezeigt.',
        'Open Edit commit message again. The discarded draft is not shown as the saved message.',
      ],
      rewordMenu,
      { prepare: recipe('menu'), completion: element(c('title')) },
    ),
    s(
      'loaded',
      ['Die ursprünglichen Angaben sind wieder geladen', 'The original information is loaded again'],
      [
        'Titel und Beschreibung stammen wieder aus dem unveränderten dritten Commit. Übernehmen ist noch deaktiviert.',
        'The title and description again come from the unchanged third commit. Apply change is still disabled.',
      ],
      c('title'),
      { prepare: recipe('dialog') },
    ),
    s(
      'title-again',
      ['Trage den korrigierten Titel erneut ein', 'Enter the corrected title again'],
      ['Schreibe erneut „docs(lernen): Zweck des Lernprojekts erklären“.', 'Enter “docs(lernen): explain the learning project’s purpose” again.'],
      c('title'),
      { prepare: recipe('dialog'), completion: { kind: 'value', selector: c('title'), value: REWORD_TITLE } },
    ),
    s(
      'description-again',
      ['Übernimm auch die gewünschte Beschreibung', 'Enter the desired description too'],
      [
        'Schreibe erneut die beiden Absätze: „Die Beschreibung erläutert das vorhandene Übungsprojekt.“ und „Dateien und Autoren bleiben erhalten.“, getrennt durch eine Leerzeile.',
        'Enter the two paragraphs again: “The description explains the existing practice project.” and “Files and authors remain unchanged.”, separated by a blank line.',
      ],
      c('description'),
      { prepare: recipe('dialog', { form: 1 }), completion: { kind: 'value', selector: c('description'), value: REWORD_DESCRIPTION } },
    ),
    s(
      'review',
      ['Prüfe Ziel, Folgecommit und Nachricht', 'Review the target, following commit and message'],
      [
        'main, der dritte Commit und ein Folgecommit sind weiterhin das Ziel. Nur der Titel und die Beschreibung des dritten Commits sollen sich ändern.',
        'main, the third commit and one following commit are still the target. Only the third commit’s title and description should change.',
      ],
      c('context'),
      { prepare: recipe('dialog', { form: 2 }) },
    ),
    s(
      'apply',
      ['Übernimm die korrigierte Nachricht', 'Apply the corrected message'],
      [
        'Klicke Änderung übernehmen. Die Übung prüft den neuen HEAD, die korrigierte Nachricht und den geschlossenen Dialog. Git, Internet und echte Dateien werden im Übungsmodus nicht verwendet.',
        'Click Apply change. The practice checks the new HEAD, corrected message and closed dialog. Practice mode uses no Git, internet or real files.',
      ],
      rewordConfirm,
      {
        prepare: recipe('dialog', { form: 2 }),
        completion: {
          kind: 'all',
          conditions: [element(mergeHead(6)), closed, { kind: 'text', selector: graphRow(5) + ' .commit-subject', value: REWORD_TITLE }],
        },
      },
    ),
    s(
      'chain',
      ['Beide betroffenen Commits haben neue Hashes', 'Both affected commits have new hashes'],
      [
        'main zeigt jetzt auf den neuen Folgecommit. Dieser hat den korrigierten Dokumentationscommit als Vorgänger. Die alten Fassungen sind über die Sicherung erhalten, aber ohne zusätzliche normale Referenz nicht mehr im Graphen.',
        'main now points to the new following commit. Its parent is the corrected documentation commit. The old versions are retained by the backup but, with no additional normal reference, no longer appear in the graph.',
      ],
      mergeHead(6),
      { prepare: recipe('result') },
    ),
    s(
      'refs',
      ['Andere Referenzen bleiben an ihren bisherigen Zielen', 'Other references stay at their previous targets'],
      [
        'origin/main und v1.0.0 bleiben am zweiten Commit. feature/begruessung bleibt am ersten Commit. Die Nachrichtenkorrektur verschiebt nur den aktuellen lokalen Branch.',
        'origin/main and v1.0.0 stay on the second commit. feature/begruessung stays on the first commit. Message editing moves only the current local branch.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe('result') },
    ),
    s(
      'saved-description',
      ['Die korrigierte Beschreibung ist gespeichert', 'The corrected description is saved'],
      [
        'Die App hat den Ersatz für den ausgewählten dritten Commit geöffnet. Prüfe beide Absätze; Autor und Autordatum dieses Commits wurden beibehalten.',
        'The app opened the replacement for the selected third commit. Check both paragraphs; this commit’s author and author date were retained.',
      ],
      '.commit-details-description',
      { prepare: recipe('commit') },
    ),
    s(
      'files',
      ['Die Dateiliste beschreibt weiterhin dieselbe Änderung', 'The file list still describes the same change'],
      [
        'Die Dateien werden weiterhin mit dem unveränderten zweiten Commit als Vorgänger verglichen. Die Nachrichtenkorrektur hat keinen neuen Dateiinhalt erzeugt.',
        'Files are still compared with the unchanged second commit, their parent revision. Correcting the message created no new file contents.',
      ],
      commitPanel(5),
      { prepare: recipe('commit') },
    ),
    s(
      'open-file',
      ['Öffne die gespeicherte README-Änderung', 'Open the saved README change'],
      ['Öffne README.md aus der Dateiliste des korrigierten Commits.', 'Open README.md from the corrected commit’s file list.'],
      commitPanel(5) + ' ' + commitFile(),
      { prepare: recipe('commit'), completion: element(historyViewer(5)) },
    ),
    s(
      'diff',
      ['Der Diff zeigt den bisherigen Dateiinhalt', 'The diff shows the original file contents'],
      [
        'Rot und grün vergleichen die README des zweiten und dritten Stands. Dieser gespeicherte Vergleich bleibt trotz neuer Nachricht gleich. Er zeigt keine Änderung durch den Nachrichteneditor.',
        'Red and green compare the README at the second and third revisions. This saved comparison stays the same despite the new message. It shows no change caused by the message editor.',
      ],
      historyViewer(5),
      { prepare: recipe('file') },
    ),
    s(
      'close-file',
      ['Schließe den Diff wieder', 'Close the diff again'],
      ['Schließe die Dateiansicht und kehre zur korrigierten Historie zurück.', 'Close the file view and return to the corrected history.'],
      fileControl('close-file'),
      { prepare: recipe('file'), completion: { kind: 'absent', selector: historyViewer(5) } },
    ),
    s(
      'following',
      ['Wähle den neu geschriebenen Folgecommit', 'Select the rewritten following commit'],
      [
        'Wähle den obersten Commit mit HEAD. Auch sein Hash musste sich ändern, weil er auf dem korrigierten Vorgänger aufbaut.',
        'Select the top commit marked HEAD. Its hash also had to change because it builds on the corrected parent.',
      ],
      graphRow(6),
      { prepare: recipe('result'), completion: element(commitPanel(6)) },
    ),
    s(
      'following-message',
      ['Die eigene Nachricht des Folgecommits bleibt erhalten', 'The following commit’s own message is retained'],
      [
        'Der Begrüßungscommit trägt weiterhin seinen ursprünglichen Titel und Beschreibungstext. Der Nachrichteneditor hat nur den ausgewählten Dokumentationscommit bearbeitet.',
        'The greeting commit still has its original title and description. The message editor changed only the selected documentation commit.',
      ],
      '.commit-details-description',
      { prepare: recipe('following') },
    ),
    s(
      'finish',
      ['Nachricht, Folgecommit und Dateien wurden geprüft', 'Message, following commit and files have been checked'],
      [
        'Die neue lokale Historie ist gespeichert, die vorherige im Recovery Center gesichert. Es wurde nichts gepusht. Weiter beendet diese Lektion.',
        'The new local history is saved and the previous one is backed up in the Recovery Center. Nothing was pushed. Next finishes this lesson.',
      ],
      mergeHead(6),
      { prepare: recipe('result') },
    ),
  ],
};
