import type { TutorialChapter, TutorialText, StructuredExample } from './types';
import {
  jsonStep as s,
  jsonRecipe as p,
  jsonRow,
  jsonViewer,
  jsonPath,
  jsonContent,
  jsonValue,
  jsonSaved,
  c,
  editor,
  tool,
  toolGroup,
  element,
} from './structuredLessonHelpers';
type Operation = { id: string; before: StructuredExample; after: StructuredExample; title: TutorialText; description: TutorialText };
const operations: Operation[] = [
  {
    id: 'json-format',
    before: 'base',
    after: 'formatted',
    title: ['JSON lesbar formatieren', 'Format JSON for readability'],
    description: [
      'Formatieren fügt Einrückungen und Zeilenumbrüche hinzu. Die Werte und ihre Schreibweise bleiben erhalten. Aus der langen Zeile wird eine gegliederte Darstellung.',
      'Format adds indentation and line breaks while preserving values and their spelling. The long line becomes a structured layout.',
    ],
  },
  {
    id: 'json-minify',
    before: 'formatted',
    after: 'base',
    title: ['Die JSON-Darstellung minifizieren', 'Minify the JSON representation'],
    description: [
      'Minifizieren entfernt nicht benötigten Leerraum. Die Struktur und Werte bleiben erhalten; der Text passt wieder in eine Zeile. Auch diese Änderung beginnt als Editorentwurf.',
      'Minify removes unnecessary whitespace while retaining structure and values. The text fits on one line again, initially as an editor draft.',
    ],
  },
  {
    id: 'json-sort',
    before: 'base',
    after: 'sorted',
    title: ['Objektschlüssel sortieren', 'Sort object keys'],
    description: [
      'Schlüssel sortieren ordnet die Namen in Objekten, auch innerhalb der Liste. Hier steht items danach vor name und z; im Listeneintrag steht active vor id. Die Reihenfolge von Listeneinträgen wird erhalten.',
      'Sort keys orders names in objects, including objects inside the list. Here items precedes name and z, and active precedes id inside the list entry. The order of list entries is preserved.',
    ],
  },
];
function operationSteps(operation: Operation) {
  return [
    s(operation.id + '-purpose', operation.title, operation.description, editor, { prepare: p(operation.before) }),
    s(
      operation.id + '-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      ['Klicke Werkzeuge oben im Datei-Viewer.', 'Click Tools at the top of the file viewer.'],
      c('file-tools'),
      { prepare: p(operation.before), completion: element(toolGroup('json')) },
    ),
    s(
      operation.id + '-group',
      ['Öffne die Gruppe JSON', 'Open the JSON group'],
      [
        'Klicke JSON. Die Werkzeuggruppen richten sich nach dem Dateityp. Diese Gruppe ist für config.json verfügbar.',
        'Click JSON. Tool groups depend on the file type, and this group is available for config.json.',
      ],
      toolGroup('json'),
      { prepare: p(operation.before, { menu: true }), completion: element(tool(operation.id)) },
    ),
    s(
      operation.id + '-apply',
      operation.title,
      [operation.description[0] + ' Klicke das hervorgehobene Werkzeug.', operation.description[1] + ' Click the highlighted tool.'],
      tool(operation.id),
      { prepare: p(operation.before, { group: true }), completion: jsonValue(operation.after) },
    ),
    s(
      operation.id + '-draft',
      ['Prüfe den ungespeicherten Text', 'Inspect the unsaved text'],
      [
        'Der Stern kennzeichnet den Entwurf. Prüfe die Klammern, Feldnamen und Werte im Ergebnis. Die Arbeitsdatei behält ihre vorherige Fassung bis zum Speichern.',
        'The asterisk marks the draft. Check the brackets, field names and values in the result. The working file retains its previous version until saved.',
      ],
      editor,
      { prepare: p(operation.before, { draft: operation.after }) },
    ),
    s(
      operation.id + '-save',
      ['Speichere die JSON-Fassung', 'Save the JSON version'],
      [
        'Klicke Arbeitsdatei speichern. Der Index behält das ursprüngliche Beispiel. Beim Speichern der wiederhergestellten Ausgangsfassung verschwindet die Git-Änderung.',
        'Click Save working file. The index retains the original example. Saving the restored original version removes the Git change.',
      ],
      c('save-file'),
      { prepare: p(operation.before, { draft: operation.after }), completion: jsonSaved(operation.after) },
    ),
  ];
}
export const TUTORIAL_JSON_FORMAT: TutorialChapter = {
  id: 'json-formatting',
  section: 'repo',
  title: ['JSON formatieren, minifizieren und sortieren', 'Format, minify and sort JSON'],
  description: [
    'JSON-Struktur lesen und alle drei Darstellungswerkzeuge als einzelne Übungen anwenden und speichern.',
    'Read JSON structure and practice each of the three representation tools, then save.',
  ],
  question: ['Wie formatiere und sortiere ich JSON-Dateien?', 'How do I format and sort JSON files?'],
  keywords: 'json jsonc formatieren format minifizieren minify sortieren schlüssel keys config struktur klammern',
  steps: [
    s(
      'overview',
      ['Strukturierten Text gezielt bearbeiten', 'Edit structured text deliberately'],
      [
        'Das Beispiel config.json enthält ein Objekt, eine Liste und einen Listeneintrag. Wir formatieren, minifizieren und sortieren den Text und prüfen jedes Ergebnis vor dem Speichern.',
        'The config.json example contains an object, a list and a list entry. We will format, minify and sort the text, checking each result before saving.',
      ],
      jsonRow,
      { continue: false },
    ),
    s(
      'open',
      ['Öffne config.json', 'Open config.json'],
      [
        'Klicke config.json im Dateibaum. Die Ausgangsfassung steht in einer langen Zeile.',
        'Click config.json in the file tree. The original version is one long line.',
      ],
      jsonRow,
      { completion: element(`${jsonViewer} ${editor}`) },
    ),
    s(
      'object',
      ['Geschweifte Klammern und Feldnamen lesen', 'Read braces and field names'],
      [
        'Die äußeren geschweiften Klammern bilden ein Objekt. z und name sind Feldnamen in Anführungszeichen; ein Doppelpunkt trennt Namen und Wert. Kommas trennen die Felder.',
        'The outer braces form an object. z and name are quoted field names; a colon separates each name from its value. Commas separate fields.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'list',
      ['Liste, Zahlen und Wahrheitswerte unterscheiden', 'Distinguish lists, numbers and booleans'],
      [
        'items enthält eine Liste in eckigen Klammern. Ihr erster Eintrag ist ein Objekt mit id: 1 und active: true. Die Werkzeuge sollen diese Werte erhalten.',
        'items contains a list in square brackets. Its first entry is an object with id: 1 and active: true. The tools must preserve these values.',
      ],
      editor,
      { prepare: p() },
    ),
    ...operations.flatMap(operationSteps),
    s(
      'result',
      ['Das sortierte Ergebnis bleibt JSON', 'The sorted result remains JSON'],
      [
        'Alle Namen und Werte sind weiterhin vorhanden. Geändert sind die Darstellung und die Reihenfolge von Objektschlüsseln. Die Datei ist gespeichert, aber noch nicht vorgemerkt.',
        'All names and values remain. The representation and object-key order changed. The file is saved but remains unstaged.',
      ],
      editor,
      { prepare: p('sorted') },
    ),
    s('close', ['Schließe config.json', 'Close config.json'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p('sorted'),
      completion: { kind: 'absent', selector: jsonViewer },
    }),
    s(
      'finish',
      ['Darstellung vor dem Speichern kontrollieren', 'Check representation before saving'],
      [
        'Du hast drei JSON-Werkzeuge einzeln verwendet und die Ergebnisse gespeichert. Eine eigene Lektion zeigt den Pfad an einer Stelle im Dokument; Schema-Prüfung und Konvertierung erhalten weitere Übungen.',
        'You used three JSON tools individually and saved their results. A separate lesson covers paths within a document; schema validation and conversion have further exercises.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: jsonPath, content: jsonContent('sorted') }] } },
    ),
  ],
};
