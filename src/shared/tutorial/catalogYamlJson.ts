import type { TutorialChapter } from './types';
import {
  s,
  c,
  editor,
  element,
  tool,
  fileRow,
  structuredViewer as viewer,
  structuredRecipe as p,
  structuredValue as value,
  structuredSaved as saved,
  structuredMenu as menu,
  structuredFeedback as feedback,
} from './structuredToolLessonHelpers';
const path = 'config.yaml';
export const TUTORIAL_YAML_JSON: TutorialChapter = {
  id: 'yaml-json',
  section: 'repo',
  title: ['YAML nach JSON konvertieren', 'Convert YAML to JSON'],
  description: [
    'Objekte, Listen und Typen vergleichen, Endung erhalten und ungültiges YAML abweisen.',
    'Compare objects, lists and types, retain the extension and reject invalid YAML.',
  ],
  question: ['Wie konvertiere ich YAML nach JSON?', 'How do I convert YAML to JSON?'],
  keywords: 'yaml json konvertieren convert dateiendung speichern fehler typ liste',
  steps: [
    s(
      'tree',
      ['Dasselbe Beispiel als JSON', 'The same example as JSON'],
      [
        'Diese Lektion beginnt unabhängig mit frischem config.yaml. Wir konvertieren den Inhalt nach JSON, ohne den Dateinamen automatisch zu ändern.',
        'This lesson independently starts with fresh config.yaml. We will convert its content to JSON without automatically changing the file name.',
      ],
      c('open-files'),
    ),
    s('open', ['Öffne config.yaml', 'Open config.yaml'], ['Klicke config.yaml.', 'Click config.yaml.'], fileRow(path), { completion: element(viewer(path)) }),
    ...menu('convert', path, 'yaml-base', 'yaml', 'yaml-json'),
    s(
      'convert',
      ['Wandle YAML in JSON um', 'Convert YAML to JSON'],
      [
        'Klicke YAML → JSON. Die Daten erscheinen mit JSON-Klammern, Anführungszeichen und Einrückung im Editor.',
        'Click YAML → JSON. The data appears in the editor with JSON brackets, quotation marks and indentation.',
      ],
      tool('yaml-json'),
      { prepare: p(path, 'yaml-base', { group: 'yaml' }), completion: value('formatted') },
    ),
    s(
      'types',
      ['Vergleiche die Datentypen', 'Compare the data types'],
      [
        'OGC ist weiterhin eine Zeichenkette mit Anführungszeichen. 2 und 1 bleiben Zahlen, true ein Wahrheitswert. items ist eine Liste in eckigen Klammern; deren Eintrag ist ein Objekt.',
        'OGC remains a quoted string. 2 and 1 remain numbers, and true remains a boolean. items is an array in square brackets containing one object.',
      ],
      editor,
      { prepare: p(path, 'yaml-base', { draft: 'formatted' }) },
    ),
    s(
      'extension',
      ['Der Name bleibt config.yaml', 'The name remains config.yaml'],
      [
        'Die Konvertierung ändert nur den Text. Auch nach dem Speichern bleibt die Endung .yaml, bis du die Datei selbst umbenennst. Das Werkzeugmenü richtet sich weiterhin nach dieser Endung.',
        'Conversion only changes text. Even after saving, the extension stays .yaml until you rename the file yourself. The tool menu continues to follow that extension.',
      ],
      viewer(path) + ' .file-viewer-title',
      { prepare: p(path, 'yaml-base', { draft: 'formatted' }) },
    ),
    s(
      'save',
      ['Speichere das JSON-Ergebnis', 'Save the JSON result'],
      ['Klicke Arbeitsdatei speichern. Der Index behält die ursprünglichen YAML-Bytes.', 'Click Save working file. The index retains the original YAML bytes.'],
      c('save-file'),
      { prepare: p(path, 'yaml-base', { draft: 'formatted' }), completion: saved(path, 'formatted', 'yaml-base') },
    ),
    s(
      'duplicate',
      ['Probiere einen ungültigen Entwurf', 'Try an invalid draft'],
      [
        'Ersetze den Text durch name: OGC und name: Duplicate in zwei Zeilen, einschließlich abschließendem Zeilenumbruch. Speichere diesen doppelten Schlüssel nicht.',
        'Replace the text with name: OGC and name: Duplicate on two lines, including a final newline. Keep this duplicate key unsaved.',
      ],
      editor,
      { prepare: p(path, 'formatted'), completion: value('yaml-invalid') },
    ),
    ...menu('error', path, 'formatted', 'yaml', 'yaml-json', 'yaml-invalid'),
    s(
      'error',
      ['Versuche die Konvertierung', 'Attempt conversion'],
      [
        'Klicke YAML → JSON. Die Mehrdeutigkeit wird als Fehler gemeldet. Der Entwurf und das gespeicherte JSON-Ergebnis bleiben erhalten.',
        'Click YAML → JSON. The ambiguous data produces an error. Both the draft and the saved JSON result are preserved.',
      ],
      tool('yaml-json'),
      {
        prepare: p(path, 'formatted', { draft: 'yaml-invalid', group: 'yaml' }),
        completion: feedback('yaml-json', ['Invalid YAML:', 'Invalid YAML:'], true, 'yaml-invalid'),
      },
    ),
    s(
      'repair',
      ['Stelle den gespeicherten JSON-Text wieder her', 'Restore the saved JSON text'],
      [
        'Trage den gespeicherten Text wieder ein:\n{\n  "z": 2,\n  "name": "OGC",\n  "items": [\n    {\n      "id": 1,\n      "active": true\n    }\n  ]\n}\nKein zusätzlicher Zeilenumbruch nach der letzten Klammer. Der Stern verschwindet.',
        'Restore the saved text:\n{\n  "z": 2,\n  "name": "OGC",\n  "items": [\n    {\n      "id": 1,\n      "active": true\n    }\n  ]\n}\nNo extra newline after the final brace. The asterisk disappears.',
      ],
      editor,
      { prepare: p(path, 'formatted', { draft: 'yaml-invalid' }), completion: value('formatted') },
    ),
    s('close', ['Schließe config.yaml', 'Close config.yaml'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p(path, 'formatted'),
      completion: { kind: 'absent', selector: viewer(path) },
    }),
    s(
      'finish',
      ['Konvertieren verändert keine Dateipfade', 'Conversion does not change file paths'],
      [
        'Du hast YAML nach JSON übertragen, Typen und den unveränderten Namen geprüft sowie fehlerhafte Eingaben abgefangen. In einem echten Projekt kontrollierst du vor dem Commit zusätzlich Diff, Endung und Staging.',
        'You converted YAML to JSON, checked types and the unchanged name, and handled invalid input. In a real project, also check the diff, extension and staging before committing.',
      ],
      c('open-files'),
      { prepare: {} },
    ),
  ],
};
