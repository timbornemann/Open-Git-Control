import type { TutorialChapter } from './types';
import {
  fileStep as s,
  fileControl as c,
  fileRow as row,
  fileRecipe as seed,
  draftRecipe as draft,
  fileViewer,
  editor,
  element,
  editorValue,
  fileState,
} from './fileLessonHelpers';

export const TUTORIAL_FILES_EDIT: TutorialChapter = {
  id: 'files-edit',
  section: 'repo',
  title: ['Arbeitsdatei bearbeiten und speichern', 'Edit and save a working file'],
  description: [
    'Text gezielt ändern, Entwurf und gespeicherte Datei unterscheiden, Schaltfläche und Strg+S verwenden.',
    'Edit text precisely, distinguish a draft from a saved file and use both the button and Ctrl+S.',
  ],
  question: ['Wie bearbeite und speichere ich eine Datei?', 'How do I edit and save a file?'],
  keywords: 'editor bearbeiten speichern save draft entwurf strg ctrl s text arbeitsdatei',
  steps: [
    s(
      'overview',
      ['Bearbeiten beginnt mit einer Arbeitsdatei', 'Editing starts with a working file'],
      [
        'Das frische Beispiel enthält eine unveränderte README mit einer Statuszeile. Wir ändern ein Wort, speichern die Datei und prüfen, dass Speichern noch kein Staging und kein Commit ist.',
        'The fresh example has an unchanged README with a status line. We will change one word, save the file and check that saving is neither staging nor committing.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open-editor',
      ['Öffne README.md im Projektbaum', 'Open README.md in the tree'],
      [
        'Klicke README.md unter Working Directory. Der Texteditor öffnet sich im mittleren Bereich.',
        'Click README.md under Working Directory. The text editor opens in the middle pane.',
      ],
      row(),
      { completion: element(`${fileViewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'source',
      ['Speichern betrifft hier den Arbeitsordner', 'Saving here affects the worktree'],
      [
        'Die Quellenangabe lautet Arbeitsdatei. Der Speichern-Button schreibt diese Fassung zurück in den Arbeitsordner. Der Index und der letzte Commit werden dadurch noch nicht geändert.',
        'The source label says Working file. Save writes this version back to the worktree. The index and the last commit do not change yet.',
      ],
      c('file-source'),
      { prepare: seed() },
    ),
    s(
      'edit-purpose',
      ['Ändere nur das Wort in der Statuszeile', 'Change only the word in the status line'],
      [
        'Im Editor stehen Überschrift, Leerzeile und Status: Entwurf. Ersetze im nächsten Schritt nur Entwurf durch Bearbeitet. Die Überschrift und Zeilenstruktur bleiben erhalten.',
        'The editor contains a heading, a blank line and Status: Draft. In the next step replace only Draft with Edited. Keep the heading and line structure.',
      ],
      editor,
      { prepare: seed() },
    ),
    s(
      'edit',
      ['Ersetze Entwurf durch Bearbeitet', 'Replace Draft with Edited'],
      [
        'Klicke in den Text und ersetze in Status: Entwurf das Wort Entwurf durch Bearbeitet. Noch nicht speichern. Die Änderung soll zuerst als Editorentwurf erscheinen.',
        'Click in the text and replace Draft with Edited in Status: Draft. Do not save yet. The change should first appear as an editor draft.',
      ],
      editor,
      { prepare: seed(), completion: editorValue('edited') },
    ),
    s(
      'unsaved',
      ['Der Stern kennzeichnet einen ungespeicherten Entwurf', 'The asterisk marks an unsaved draft'],
      [
        'Neben dem Dateinamen erscheint ein Stern und Speichern wird verfügbar. Bisher hat sich nur der Editorinhalt geändert. Git kann ungespeicherte Editoränderungen noch nicht in den Index übernehmen.',
        'An asterisk appears beside the filename and Save becomes available. So far only the editor buffer changed. Git cannot stage unsaved editor edits.',
      ],
      '.file-viewer-title',
      { prepare: draft('edited') },
    ),
    s(
      'save-purpose',
      ['Die Schaltfläche nennt ihr Speicherziel', 'The button names the save target'],
      [
        'Arbeitsdatei speichern übernimmt den Entwurf in die Beispieldatei. Das ist eine andere Aktion als Plus im Staging und Commit. Danach soll der Stern verschwinden.',
        'Save working file writes the draft to the sample file. This differs from plus in Staging and Commit. The asterisk should disappear afterwards.',
      ],
      c('save-file'),
      { prepare: draft('edited') },
    ),
    s(
      'save',
      ['Speichere die Arbeitsdatei', 'Save the working file'],
      [
        'Klicke Arbeitsdatei speichern. Die gespeicherte README soll Status: Bearbeitet enthalten. Der Index bleibt beim ursprünglichen Entwurf.',
        'Click Save working file. The saved README should contain Status: Edited. The index stays at the original Draft version.',
      ],
      c('save-file'),
      { prepare: draft('edited'), completion: fileState('edited') },
    ),
    s(
      'saved',
      ['Gespeichert, aber noch nicht vorgemerkt', 'Saved, but not yet staged'],
      [
        'Der Stern ist weg. Der Arbeitsordner enthält jetzt die Bearbeitung; Git wird sie unter Änderungen anzeigen. Im nächsten Commit erscheint sie erst nach dem Vormerken.',
        'The asterisk is gone. The worktree now contains the edit, and Git will show it under Changes. It enters the next commit only after staging.',
      ],
      `${fileViewer}[data-dirty="false"]`,
      { prepare: seed('edited') },
    ),
    s(
      'second-edit',
      ['Erstelle eine zweite Bearbeitung', 'Make a second edit'],
      [
        'Ersetze Bearbeitet durch Weitere Bearbeitung in der Statuszeile. Damit üben wir den Speicherkurzbefehl an einem neuen Entwurf.',
        'Replace Edited with Further edit in the status line. This gives us a new draft for practicing the save shortcut.',
      ],
      editor,
      { prepare: seed('edited'), completion: editorValue('draft') },
    ),
    s(
      'shortcut-purpose',
      ['Strg+S speichert dieselbe Dateiquelle', 'Ctrl+S saves the same source'],
      [
        'Im Übungsmodus ist Strg+S der Standardkurzbefehl für Speichern. Er führt dieselbe Speicheraktion wie die Schaltfläche aus. Der Fokus darf dabei im Texteditor bleiben.',
        'In practice, Ctrl+S is the default Save shortcut. It performs the same save action as the button. Focus can remain in the text editor.',
      ],
      c('save-file'),
      { prepare: draft('draft', 'edited') },
    ),
    s(
      'save-shortcut',
      ['Speichere mit Strg+S', 'Save with Ctrl+S'],
      [
        'Setze den Fokus in den Editor und drücke Strg+S. Der neue Status soll gespeichert werden, ohne den Index zu verändern.',
        'Focus the editor and press Ctrl+S. The new status should be saved without changing the index.',
      ],
      editor,
      { prepare: draft('draft', 'edited'), completion: fileState('draft') },
    ),
    s(
      'saved-again',
      ['Auch der zweite Entwurf ist jetzt gespeichert', 'The second draft is now saved too'],
      [
        'Der Stern ist wieder verschwunden und Speichern ist nicht mehr verfügbar. Die Statuszeile Weitere Bearbeitung ist jetzt Teil der gespeicherten Arbeitsdatei.',
        'The asterisk is gone again and Save is no longer available. The Further edit status line is now part of the saved working file.',
      ],
      `${fileViewer}[data-dirty="false"]`,
      { prepare: seed('draft') },
    ),
    s(
      'status',
      ['Die Statusleiste beschreibt den Editorinhalt', 'The status bar describes the editor contents'],
      [
        'Unten siehst du Größe, Zeichen, Wörter, Zeilen, Encoding und Zeilenenden. Diese Angaben helfen, den bearbeiteten Text einzuordnen. Werkzeuge und Dateiformate bekommen eigene Lektionen.',
        'The bottom bar shows size, characters, words, lines, encoding and line endings. These describe the edited text. Tools and file formats have their own lessons.',
      ],
      '.working-file-viewer__status',
      { prepare: seed('draft') },
    ),
    s(
      'close',
      ['Schließe die gespeicherte Datei', 'Close the saved file'],
      [
        'Schließe den Viewer mit X. Weil der Entwurf gespeichert ist, ist keine Entwurfsentscheidung erforderlich.',
        'Close the viewer with X. Since the draft is saved, no draft decision is needed.',
      ],
      c('close-file'),
      { prepare: seed('draft'), completion: { kind: 'absent', selector: fileViewer } },
    ),
    s(
      'open-staging',
      ['Prüfe den Git-Status', 'Check the Git status'],
      [
        'Wechsle über Staging Area zurück zur Änderungsliste. README.md soll unter Änderungen stehen und noch nicht vorgemerkt sein.',
        'Switch back to the change list with Staging Area. README.md should be under Changes and remain unstaged.',
      ],
      c('open-staging'),
      { prepare: seed('draft', 'head', { click: [] }), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'result',
      ['Speichern hat den Index erhalten', 'Saving preserved the index'],
      [
        'README.md ist geändert, aber nicht vorgemerkt. Du kannst ihren Diff prüfen und anschließend die passende Datei, Hunks oder Zeilen für einen Commit auswählen.',
        'README.md is modified but not staged. You can inspect its diff and then select the file, hunks or lines for a commit.',
      ],
      '[data-tutorial="unstaged-files"] [aria-label="README.md"]',
      { openView: undefined, inspector: 'staging', prepare: seed('draft', 'head', { click: [] }) },
    ),
    s(
      'finish',
      ['Du kannst Entwurf und gespeicherte Datei unterscheiden', 'You can distinguish a draft from a saved file'],
      [
        'Du hast im Editor bearbeitet und mit Schaltfläche sowie Strg+S gespeichert. Die nächste Lektion zeigt die Entscheidungen beim Schließen oder Wechseln mit ungespeicherten Änderungen.',
        'You edited text and saved it with both the button and Ctrl+S. The next lesson covers decisions when closing or switching views with unsaved changes.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: seed('draft', 'head', { click: [] }) },
    ),
  ],
};
