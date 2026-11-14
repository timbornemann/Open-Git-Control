import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter, TutorialText, ToolExample } from './types';
import { toolStep as s, toolRecipe, toolContent, toolValue, savedTool, tool, toolGroup, c, row, viewer, editor, element } from './toolLessonHelpers';
const p = (version: ToolExample = 'lines', options: Parameters<typeof toolRecipe>[1] = {}) =>
  toolRecipe('lines', { ...(version === 'lines' ? {} : { draft: version }), ...options });
type Action = { id: string; tool: string; before: ToolExample; after: ToolExample; title: TutorialText; description: TutorialText };
const actions: Action[] = [
  {
    id: 'trim',
    tool: 'trim-lines',
    before: 'lines',
    after: 'trimmed',
    title: ['Äußere Leerzeichen jeder Zeile entfernen', 'Remove outer whitespace from each line'],
    description: [
      'Zeilen trimmen entfernt Leerzeichen an Anfang und Ende jeder Zeile. Die Leerzeile und doppelte Einträge bleiben zunächst erhalten.',
      'Trim lines removes whitespace at the start and end of each line. The empty line and duplicate entries remain for now.',
    ],
  },
  {
    id: 'empty',
    tool: 'empty-lines',
    before: 'trimmed',
    after: 'nonempty',
    title: ['Die leere Zeile entfernen', 'Remove the empty line'],
    description: [
      'Leere Zeilen entfernen löscht Datensätze ohne sichtbaren Text. Die übrigen Zeilen behalten ihre Reihenfolge; beta kommt weiterhin zweimal vor.',
      'Remove empty lines deletes lines without visible text. The other lines retain their order, and beta still appears twice.',
    ],
  },
  {
    id: 'duplicates',
    tool: 'dedupe-lines',
    before: 'nonempty',
    after: 'unique',
    title: ['Doppelte Zeilen zusammenführen', 'Remove duplicate lines'],
    description: [
      'Duplikate entfernen behält das erste Vorkommen jeder identischen Zeile. Die erste Zeile beta bleibt; das zweite beta wird entfernt. Groß-/Kleinschreibung zählt dabei zum Inhalt.',
      'Remove duplicate lines keeps the first occurrence of each identical line. The first beta stays and the second beta is removed. Letter case is part of the content.',
    ],
  },
  {
    id: 'sort',
    tool: 'sort-lines',
    before: 'unique',
    after: 'sorted',
    title: ['Zeilen alphabetisch ordnen', 'Sort lines alphabetically'],
    description: [
      'Zeilen sortieren ordnet den gesamten Text. alpha soll vor beta stehen. Die Aktion verändert den Editorentwurf; sie ist kein Sortierfilter der Dateiansicht.',
      'Sort lines reorders the whole text. alpha should precede beta. This changes the editor draft; it is not a file-list sort filter.',
    ],
  },
  {
    id: 'upper',
    tool: 'uppercase',
    before: 'sorted',
    after: 'upper',
    title: ['Den Text in Großbuchstaben umwandeln', 'Convert the text to uppercase'],
    description: [
      'In Großbuchstaben bearbeitet den gesamten Editorinhalt. Aus alpha und beta werden ALPHA und BETA. Die Zeilenstruktur bleibt gleich.',
      'Convert to uppercase changes the whole editor contents. alpha and beta become ALPHA and BETA, retaining the line structure.',
    ],
  },
  {
    id: 'lower',
    tool: 'lowercase',
    before: 'upper',
    after: 'lower',
    title: ['Zur Kleinschreibung zurückkehren', 'Return to lowercase'],
    description: [
      'In Kleinbuchstaben wandelt ALPHA und BETA wieder in alpha und beta um. Ein Kodierungswechsel ist dafür nicht nötig; hier werden die tatsächlichen Schriftzeichen geändert.',
      'Convert to lowercase returns ALPHA and BETA to alpha and beta. No encoding change is needed: this action changes the actual characters.',
    ],
  },
];
export const TUTORIAL_EDITOR_LINES: TutorialChapter = {
  id: 'editor-lines',
  section: 'repo',
  title: ['Zeilen und Groß-/Kleinschreibung bearbeiten', 'Edit lines and letter case'],
  description: [
    'Trimmen, Leerzeilen und Duplikate entfernen, sortieren sowie Groß-/Kleinschreibung umwandeln.',
    'Trim lines, remove empty and duplicate lines, sort and change letter case.',
  ],
  question: ['Wie bereinige und sortiere ich Textzeilen?', 'How do I clean up and sort text lines?'],
  keywords: 'werkzeuge tools zeilen sortieren trimmen duplikate leerzeilen uppercase lowercase groß kleinschreibung',
  steps: [
    s(
      'overview',
      ['Eine Textliste Schritt für Schritt bereinigen', 'Clean up a text list step by step'],
      [
        'Das Beispiel enthält beta, eine Leerzeile, alpha und ein zweites beta mit unterschiedlichen äußeren Leerzeichen. Wir verwenden die echten Dateiwerkzeuge; jede Aktion erzeugt zunächst nur einen Entwurf.',
        'The example contains beta, an empty line, alpha and another beta with different outer whitespace. We will use the real file tools; each action initially changes only a draft.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne README.md', 'Open README.md'],
      [
        'Klicke README.md im Dateibaum. Lies die Zeilen, bevor du ein Werkzeug anwendest.',
        'Click README.md in the tree. Read its lines before applying a tool.',
      ],
      row(),
      { completion: element(`${viewer} ${editor}`) },
    ),
    s(
      'scope',
      ['Zeilenwerkzeuge bearbeiten den gesamten Text', 'Line tools process the whole text'],
      [
        'Diese Gruppe verändert den vollständigen Editorinhalt, auch wenn eine Textauswahl besteht. Base64-/URL-Werkzeuge berücksichtigen dagegen eine Auswahl; sie erhalten eine eigene Lektion.',
        'This group changes the full editor contents even if text is selected. Base64/URL tools can use a selection and have a separate lesson.',
      ],
      editor,
      { prepare: p() },
    ),
    ...actions.flatMap((action) => [
      s(action.id + '-purpose', action.title, action.description, editor, { prepare: p(action.before) }),
      s(
        action.id + '-menu',
        ['Öffne Werkzeuge', 'Open Tools'],
        ['Klicke Werkzeuge oben im Datei-Viewer.', 'Click Tools at the top of the file viewer.'],
        c('file-tools'),
        { prepare: p(action.before), completion: element(toolGroup('lines')) },
      ),
      s(
        action.id + '-group',
        ['Öffne Zeilen bearbeiten', 'Open Edit lines'],
        [
          'Klicke Zeilen bearbeiten. Die Gruppe enthält die Aktionen für den vollständigen Text.',
          'Click Edit lines. This group contains actions for the full text.',
        ],
        toolGroup('lines'),
        { prepare: p(action.before, { menu: true }), completion: element(tool(action.tool)) },
      ),
      s(
        action.id + '-apply',
        action.title,
        [
          action.description[0] + ' Klicke das hervorgehobene Werkzeug und prüfe danach den Text.',
          action.description[1] + ' Click the highlighted tool, then inspect the text.',
        ],
        tool(action.tool),
        { prepare: p(action.before, { group: 'lines' }), completion: toolValue(action.after) },
      ),
    ]),
    s(
      'result',
      ['Alle Änderungen sind noch ein Entwurf', 'All changes are still a draft'],
      [
        'Im Editor stehen jetzt alpha und beta ohne Leerzeile und Duplikat. Der Stern bleibt sichtbar. Die gespeicherte Arbeitsdatei enthält weiterhin die ursprüngliche Liste.',
        'The editor now contains alpha and beta without the empty line or duplicate. The asterisk remains. The saved working file still contains the original list.',
      ],
      '.file-viewer-title',
      { prepare: p('lower') },
    ),
    s(
      'save',
      ['Speichere die bereinigte Liste', 'Save the cleaned-up list'],
      [
        'Klicke Arbeitsdatei speichern. Erst dadurch erreicht die neue Fassung den Arbeitsordner. Der Index behält die ursprüngliche Liste.',
        'Click Save working file. Only this writes the new version to the worktree. The index retains the original list.',
      ],
      c('save-file'),
      { prepare: p('lower'), completion: savedTool('lower') },
    ),
    s('close', ['Schließe die Textdatei', 'Close the text file'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: toolRecipe('lower'),
      completion: { kind: 'absent', selector: viewer },
    }),
    s(
      'finish',
      ['Werkzeuge gezielt und vor dem Speichern prüfen', 'Inspect tool results before saving'],
      [
        'Du hast sechs Textaktionen einzeln angewendet und ihr gemeinsames Ergebnis gespeichert. Präfix/Suffix, Komprimieren, Kodieren und strukturierte Dateiformate werden in weiteren Detaillektionen behandelt.',
        'You applied six text actions individually and saved their combined result. Prefix/suffix, compaction, codecs and structured file formats are covered in further detail lessons.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'README.md', content: toolContent('lower') }] } },
    ),
  ].flatMap(withTextViewSteps({ open: 'README.md' })),
};
