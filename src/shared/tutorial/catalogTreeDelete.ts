import type { TutorialChapter } from './types';
import {
  treeStep as s,
  treeAction as a,
  treeContext,
  treeContextStep,
  treeDeleteDialog,
  treePrepare,
  treeClosed,
  c,
  row,
  element,
  p,
  paths,
  dialog,
  confirmDialog,
  cancelDialog,
} from './treeLessonHelpers';
export const TUTORIAL_TREE_DELETE: TutorialChapter = {
  id: 'tree-delete',
  section: 'repo',
  title: ['Dateien und Ordner bewusst löschen', 'Delete files and folders deliberately'],
  description: [
    'Löschpfad und Umfang lesen, abbrechen, eine versionierte Datei löschen und den restlichen Ordner entfernen.',
    'Read deletion path and scope, cancel, delete a tracked file and remove the remaining folder.',
  ],
  question: ['Wie lösche ich Dateien oder ganze Ordner im Projektbaum?', 'How do I delete files or entire folders in the project tree?'],
  keywords: 'delete löschen entfernen permanent folder ordner bestätigung confirm cancel abbrechen wiederherstellen',
  steps: [
    s(
      'overview',
      ['Löschen im Baum betrifft den Arbeitsordner', 'Deleting in the tree affects the worktree'],
      [
        'practice enthält zwei versionierte Beispieldateien. Wir brechen zuerst eine Löschung ab, löschen dann nur note.md und anschließend den restlichen Ordner. Index und letzter Commit bleiben zunächst erhalten.',
        'practice contains two tracked sample files. First we cancel deletion, then delete note.md alone and finally the remaining folder. The index and last commit are preserved for now.',
      ],
      row('practice'),
      { continue: false },
    ),
    s(
      'expand',
      ['Öffne practice', 'Expand practice'],
      ['Klicke practice, damit beide Beispieldateien sichtbar werden.', 'Click practice to reveal both sample files.'],
      row('practice'),
      { completion: element(row(paths.note)) },
    ),
    treeContextStep('file-menu', paths.note, 'base', 'delete'),
    s(
      'delete-action',
      ['Öffne Delete für note.md', 'Open Delete for note.md'],
      [
        'Klicke Delete für practice/note.md. Die Datei wird erst nach der folgenden Bestätigung entfernt.',
        'Click Delete for practice/note.md. The file is removed only after the following confirmation.',
      ],
      a('delete'),
      { prepare: treeContext('base', paths.note, 'delete'), completion: element(confirmDialog) },
    ),
    s(
      'file-warning',
      ['Prüfe Pfad und Löschfolge', 'Review the path and deletion consequence'],
      [
        'Der Dialog nennt practice/note.md und erklärt, dass die Arbeitsdatei gelöscht wird. Ein Index oder Commit kann nur den dort gespeicherten Inhalt zurückbringen; ungespeicherte oder nicht versionierte Inhalte sind dadurch nicht gesichert.',
        'The dialog identifies practice/note.md and explains that its working file will be deleted. An index or commit can restore only the contents stored there; this does not back up unsaved or untracked contents.',
      ],
      dialog,
      { prepare: treeDeleteDialog('base', paths.note) },
    ),
    s(
      'cancel',
      ['Brich das Löschen ab', 'Cancel deletion'],
      ['Klicke Abbrechen. note.md und other.md müssen unverändert vorhanden bleiben.', 'Click Cancel. note.md and other.md must remain present and unchanged.'],
      cancelDialog,
      { prepare: treeDeleteDialog('base', paths.note), completion: treeClosed('base') },
    ),
    treeContextStep('repeat-menu', paths.note, 'base', 'delete'),
    s(
      'repeat-delete',
      ['Öffne die Bestätigung erneut', 'Open confirmation again'],
      [
        'Klicke wieder Delete bei note.md. Diesmal bestätigen wir genau diese eine Datei.',
        'Click Delete for note.md again. This time we confirm exactly this one file.',
      ],
      a('delete'),
      { prepare: treeContext('base', paths.note, 'delete'), completion: element(confirmDialog) },
    ),
    s(
      'delete-file',
      ['Lösche nur note.md', 'Delete only note.md'],
      [
        'Klicke Delete im Dialog. practice/note.md soll aus dem Arbeitsordner verschwinden. other.md bleibt erhalten; im Index bleibt der bisherige Inhalt von note.md gespeichert.',
        'Click Delete in the dialog. practice/note.md should disappear from the worktree. other.md is preserved; the index still stores note.md’s previous contents.',
      ],
      confirmDialog,
      { prepare: treeDeleteDialog('base', paths.note), completion: treeClosed('deleted-file') },
    ),
    s(
      'file-result',
      ['Eine versionierte Datei fehlt jetzt im Arbeitsordner', 'A tracked file is now missing from the worktree'],
      [
        'Unter practice bleibt other.md. Git sieht die fehlende note.md als noch nicht vorgemerkte Löschung. Sie ist nicht automatisch aus Index und Historie entfernt.',
        'other.md remains under practice. Git sees the missing note.md as an unstaged deletion. It has not automatically disappeared from the index or history.',
      ],
      row(paths.other),
      { prepare: treePrepare('deleted-file', [{ expand: row('practice') }]) },
    ),
    treeContextStep('folder-menu', 'practice', 'deleted-file', 'delete'),
    s(
      'folder-action',
      ['Wähle Delete für practice', 'Choose Delete for practice'],
      [
        'Klicke Delete am Ordner practice. Jetzt gehört der gesamte restliche Ordnerinhalt zur Auswahl.',
        'Click Delete for the practice folder. The selection now includes all remaining contents of that folder.',
      ],
      a('delete'),
      { prepare: treeContext('deleted-file', 'practice', 'delete'), completion: element(confirmDialog) },
    ),
    s(
      'folder-warning',
      ['Ordnerlöschen schließt enthaltene Dateien ein', 'Deleting a folder includes its files'],
      [
        'Der Pfad lautet practice. Die Folge nennt alle Dateien in diesem Ordner. In unserem Beispiel betrifft das die verbliebene other.md. archive und variant liegen außerhalb der Auswahl.',
        'The path is practice. The consequence includes every file in that folder. In our sample this affects the remaining other.md. archive and variant are outside the selection.',
      ],
      dialog,
      { prepare: treeDeleteDialog('deleted-file', 'practice') },
    ),
    s(
      'delete-folder',
      ['Entferne den restlichen Ordner', 'Remove the remaining folder'],
      [
        'Bestätige Delete. practice und other.md sollen verschwinden. archive/keep.txt, variant/note.md und die anderen Projektdateien müssen erhalten bleiben.',
        'Confirm Delete. practice and other.md should disappear. archive/keep.txt, variant/note.md and the other project files must be preserved.',
      ],
      confirmDialog,
      { prepare: treeDeleteDialog('deleted-file', 'practice'), completion: treeClosed('deleted-folder') },
    ),
    s(
      'folder-result',
      ['Die Auswahl war auf practice begrenzt', 'The selection was limited to practice'],
      [
        'practice fehlt im Baum. Die übrigen Ordner bleiben sichtbar. Git merkt sich die beiden fehlenden Dateien, aber keinen eigenen gelöschten Ordnereintrag.',
        'practice is absent from the tree. The other folders remain visible. Git records the two missing files, rather than a separate deleted folder entry.',
      ],
      row('archive'),
      { prepare: p('deleted-folder') },
    ),
    s(
      'open-staging',
      ['Prüfe die beiden Dateilöschungen', 'Check both file deletions'],
      [
        'Wechsle zur Staging Area. practice/note.md und practice/other.md sollen als noch nicht vorgemerkte Löschungen erscheinen.',
        'Switch to Staging Area. practice/note.md and practice/other.md should appear as unstaged deletions.',
      ],
      c('open-staging'),
      { prepare: p('deleted-folder'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'git-result',
      ['Löschen und Vormerken sind getrennte Entscheidungen', 'Deletion and staging are separate decisions'],
      [
        'Die Dateien fehlen nur im Arbeitsordner. Plus würde die Löschungen in den Index übernehmen; ein Commit würde sie in einer neuen Version festhalten. Verwerfen kann hier den gespeicherten Git-Stand wiederherstellen, aber keine unversionierten Inhalte retten.',
        'The files are missing only from the worktree. Plus would stage their deletions; a commit would record them in a new version. Discard can restore the saved Git version here, but cannot recover untracked contents.',
      ],
      c('unstaged-files'),
      { openView: undefined, inspector: 'staging', prepare: p('deleted-folder') },
    ),
    s(
      'finish',
      ['Pfad, Umfang und Sicherung vor dem Löschen prüfen', 'Check path, scope and backups before deleting'],
      [
        'Du hast eine Löschung abgebrochen, eine Datei gezielt entfernt und danach einen Ordner samt Restinhalt gelöscht. Ein Neustart dieser Lektion setzt ausschließlich die Beispieldaten zurück.',
        'You canceled deletion, removed a specific file and then deleted a folder with its remaining contents. Restarting this lesson resets only the sample data.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: p('deleted-folder') },
    ),
  ],
};
