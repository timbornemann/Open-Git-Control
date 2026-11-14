import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import {
  treeStep as s,
  treeAction as a,
  treeContext,
  treeInput,
  treePrepare,
  treeFile,
  treeViewer,
  treeValue,
  treeClosed,
  treeAll,
  named,
  nameField,
  c,
  row,
  editor,
  element,
  p,
  state,
  paths,
  content,
  dialog,
  confirmDialog,
  cancelDialog,
} from './treeLessonHelpers';
const root = a('root-menu');
const scratch = row('scratch');
export const TUTORIAL_TREE_CREATE: TutorialChapter = {
  id: 'tree-create',
  section: 'repo',
  title: ['Dateien und leere Ordner anlegen', 'Create files and empty folders'],
  description: [
    'Ordner erstellen, einen Dateidialog abbrechen, eine leere Datei anlegen und ihren ersten Inhalt speichern.',
    'Create a folder, cancel a file dialog, create an empty file and save its first contents.',
  ],
  question: ['Wie lege ich Dateien und Ordner im Projektbaum an?', 'How do I create files and folders in the project tree?'],
  keywords: 'datei ordner anlegen erstellen leer empty folder file create add working directory',
  steps: [
    s(
      'overview',
      ['Dateiaktionen gehören zum Arbeitsordner', 'File actions affect the working directory'],
      [
        'Wir legen scratch/notes.md an. Zuerst entsteht ein leerer Ordner, danach eine leere Datei und zuletzt ihr gespeicherter Inhalt. Keine dieser Aktionen erstellt einen Commit.',
        'We will create scratch/notes.md: first an empty folder, then an empty file and finally its saved contents. None of these actions creates a commit.',
      ],
      root,
      { continue: false },
    ),
    s(
      'root-menu',
      ['Öffne die Aktionen am Projektstamm', 'Open actions at the project root'],
      [
        'Klicke die drei Punkte neben dem Projektnamen. Die Aktionen gelten hier für den Stammordner. Ein Rechtsklick auf einen Ordner bietet dieselben Anlegeaktionen für diesen Ordner.',
        'Click the three dots beside the project name. Here the actions apply to the root folder. Right-clicking a folder offers the same creation actions for that folder.',
      ],
      root,
      { completion: element(a('create-folder')) },
    ),
    s(
      'folder-action',
      ['Wähle Add folder', 'Choose Add folder'],
      [
        'Klicke Add folder. Der folgende Dialog fragt nach einem einzelnen Ordnernamen und nennt den Zielordner.',
        'Click Add folder. The dialog asks for a single folder name and identifies the destination folder.',
      ],
      a('create-folder'),
      { prepare: treeContext('base', '', 'create-folder'), completion: element(nameField) },
    ),
    s(
      'folder-dialog',
      ['Name und Ziel gehören zusammen', 'Name and destination belong together'],
      [
        'Das Ziel lautet Repository root. Trage nur scratch ein, keinen absoluten Pfad und keine Schrägstriche. Die Schaltfläche wird erst mit einem gültigen Namen verfügbar.',
        'The destination is Repository root. Enter just scratch, without an absolute path or slashes. The button becomes available only with a valid name.',
      ],
      dialog,
      { prepare: treeInput('base', '', 'create-folder') },
    ),
    s(
      'folder-name',
      ['Nenne den Ordner scratch', 'Name the folder scratch'],
      [
        'Trage scratch in Folder name ein. Bestätige noch nicht; wir prüfen zuerst den Namen.',
        'Enter scratch in Folder name. Do not confirm yet; first we check the name.',
      ],
      nameField,
      { prepare: treeInput('base', '', 'create-folder'), completion: named('scratch') },
    ),
    s(
      'create-folder',
      ['Lege den Ordner an', 'Create the folder'],
      [
        'Klicke Add folder. scratch soll als neuer Ordner im Projektbaum erscheinen. Der Git-Index bleibt unverändert.',
        'Click Add folder. scratch should appear as a folder in the project tree. The Git index stays unchanged.',
      ],
      confirmDialog,
      { prepare: treeInput('base', '', 'create-folder', 'scratch'), completion: treeAll(element(scratch), treeClosed('empty-folder')) },
    ),
    s(
      'empty-folder',
      ['Git speichert keine leeren Ordner', 'Git does not store empty folders'],
      [
        'scratch existiert im Arbeitsordner. Die Git-Änderungsliste bleibt trotzdem leer: Git verwaltet Dateien und deren Pfade, keine eigenständigen leeren Ordner.',
        'scratch exists in the working directory. The Git change list remains empty: Git tracks files and their paths, rather than separate empty folders.',
      ],
      scratch,
      { prepare: p('empty-folder') },
    ),
    s(
      'folder-menu',
      ['Öffne die Aktionen für scratch', 'Open actions for scratch'],
      [
        'Öffne das Kontextmenü von scratch per Rechtsklick oder fokussiere den Ordner und drücke Umschalt+F10. Die neue Datei soll in diesem Ordner entstehen.',
        'Right-click scratch, or focus the folder and press Shift+F10. The new file will be created inside this folder.',
      ],
      scratch,
      { prepare: p('empty-folder'), gesture: 'contextmenu', completion: element(a('create-file')) },
    ),
    s(
      'file-action',
      ['Wähle Add file', 'Choose Add file'],
      [
        'Klicke Add file. Der Dialog soll scratch als Ziel nennen und noch keinen Dateinamen enthalten.',
        'Click Add file. The dialog should identify scratch as its destination and have no filename yet.',
      ],
      a('create-file'),
      { prepare: treeContext('empty-folder', 'scratch', 'create-file'), completion: element(nameField) },
    ),
    s(
      'cancel-file',
      ['Brich den ersten Versuch ab', 'Cancel the first attempt'],
      [
        'Klicke Abbrechen. Der leere Ordner bleibt erhalten, aber es wird noch keine Datei angelegt.',
        'Click Cancel. The empty folder is preserved, but no file is created.',
      ],
      cancelDialog,
      { prepare: treeInput('empty-folder', 'scratch', 'create-file'), completion: treeClosed('empty-folder') },
    ),
    s(
      'reopen-menu',
      ['Öffne die Ordneraktionen erneut', 'Open the folder actions again'],
      [
        'Öffne das Kontextmenü von scratch erneut. Abbrechen hat den Ordner und die bestehenden Projektdateien erhalten.',
        'Open scratch’s context menu again. Cancel preserved the folder and the existing project files.',
      ],
      scratch,
      { prepare: p('empty-folder'), gesture: 'contextmenu', completion: element(a('create-file')) },
    ),
    s(
      'reopen-file',
      ['Öffne Add file erneut', 'Open Add file again'],
      [
        'Klicke wieder Add file. Jetzt benennen wir die Datei und bestätigen ihre Erstellung.',
        'Click Add file again. This time we will name the file and confirm its creation.',
      ],
      a('create-file'),
      { prepare: treeContext('empty-folder', 'scratch', 'create-file'), completion: element(nameField) },
    ),
    s(
      'file-name',
      ['Die Endung gehört zum Dateinamen', 'The extension is part of the filename'],
      [
        'Trage notes.md ein. .md kennzeichnet eine Markdown-Datei. Der Zielordner scratch wird getrennt angegeben; trage deshalb nicht scratch/notes.md ein.',
        'Enter notes.md. .md identifies a Markdown file. The destination scratch is given separately, so do not enter scratch/notes.md.',
      ],
      nameField,
      { prepare: treeInput('empty-folder', 'scratch', 'create-file'), completion: named('notes.md') },
    ),
    s(
      'create-file',
      ['Erstelle die leere Datei', 'Create the empty file'],
      [
        'Klicke Add file. scratch/notes.md soll als leere, noch unversionierte Datei entstehen. Es wird weder Inhalt erzeugt noch etwas vorgemerkt.',
        'Click Add file. scratch/notes.md should be created empty and untracked. This neither generates contents nor stages anything.',
      ],
      confirmDialog,
      { prepare: treeInput('empty-folder', 'scratch', 'create-file', 'notes.md'), completion: treeClosed('new-empty') },
    ),
    s(
      'expand',
      ['Öffne den Ordner scratch', 'Expand scratch'],
      [
        'Klicke scratch. notes.md soll darunter sichtbar werden. Die neue Datei hat bisher keinen gespeicherten Git-Stand.',
        'Click scratch. notes.md should appear underneath. The new file has no saved Git version yet.',
      ],
      scratch,
      { prepare: p('new-empty'), completion: element(row(paths.created)) },
    ),
    s(
      'open',
      ['Öffne notes.md', 'Open notes.md'],
      [
        'Klicke notes.md unter scratch. Der Texteditor zeigt eine leere Arbeitsdatei, die du jetzt befüllen kannst.',
        'Click notes.md under scratch. The text editor shows an empty working file that you can now fill.',
      ],
      row(paths.created),
      { prepare: treePrepare('new-empty', [{ expand: scratch }]), completion: element(`${treeViewer(paths.created)} ${editor}`) },
    ),
    s(
      'write',
      ['Schreibe den ersten Inhalt', 'Write the first contents'],
      [
        'Trage genau diese drei Zeilen ein: „# Meine Notiz“, eine Leerzeile und „Erster Entwurf“. Füge am Ende einen Zeilenumbruch hinzu. Die Eingabe bleibt zunächst ein Editorentwurf.',
        'Enter these three lines exactly: “# My note”, a blank line and “First draft”. Add a final line break. The input initially remains an editor draft.',
      ],
      editor,
      { prepare: treeFile('new-empty', paths.created), completion: treeValue(content('created')) },
    ),
    s(
      'save',
      ['Speichere den Inhalt in der Arbeitsdatei', 'Save contents to the working file'],
      [
        'Klicke Arbeitsdatei speichern. Der Stern soll verschwinden. Die gespeicherte Datei bleibt unversioniert; Speichern übernimmt sie nicht in den Index.',
        'Click Save working file. The asterisk should disappear. The saved file remains untracked; saving does not add it to the index.',
      ],
      c('save-file'),
      {
        prepare: treeFile('new-empty', paths.created, 'created'),
        completion: treeAll(state('new-saved'), element(`${treeViewer(paths.created)}[data-dirty="false"]`)),
      },
    ),
    s(
      'close',
      ['Schließe die gespeicherte Datei', 'Close the saved file'],
      [
        'Schließe den Datei-Viewer mit X. Die neue Datei und ihr Inhalt bleiben im Beispielprojekt erhalten.',
        'Close the file viewer with X. The new file and its contents remain in the practice project.',
      ],
      c('close-file'),
      { prepare: treeFile('new-saved', paths.created), completion: { kind: 'absent', selector: treeViewer(paths.created) } },
    ),
    s(
      'open-staging',
      ['Prüfe die Änderungsliste', 'Check the change list'],
      [
        'Wechsle zur Staging Area. Dort soll scratch/notes.md unter Unversioniert stehen.',
        'Switch to Staging Area. scratch/notes.md should appear under Untracked.',
      ],
      c('open-staging'),
      { prepare: p('new-saved'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'result',
      ['Die Datei ist neu; der Index ist noch leer', 'The file is new; the index is still empty'],
      [
        'Nur scratch/notes.md ist neu. Erst mit Plus wird ihr gespeicherter Inhalt vorgemerkt. Ein späterer Commit speichert dann Datei und Pfad; der zuvor leere Ordner allein wäre kein Commit-Inhalt.',
        'Only scratch/notes.md is new. Plus stages its saved contents. A later commit stores the file and path; the previously empty folder alone would not be commit contents.',
      ],
      c('untracked-files'),
      { openView: undefined, inspector: 'staging', prepare: p('new-saved') },
    ),
    s(
      'finish',
      ['Anlegen, Speichern und Staging sind eigene Schritte', 'Creation, saving and staging are separate steps'],
      [
        'Du hast Ordner und Datei angelegt, einen Dialog abgebrochen und den ersten Inhalt gespeichert. Die nächsten Lektionen erklären Umbenennen, Kopieren, Verschieben und Löschen.',
        'You created a folder and file, canceled a dialog and saved the first contents. The next lessons cover renaming, copying, moving and deleting.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: p('new-saved') },
    ),
  ].flatMap(withTextViewSteps({ open: 'scratch/notes.md' })),
};
