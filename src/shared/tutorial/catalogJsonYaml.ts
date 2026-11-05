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
const path = 'config.json';
export const TUTORIAL_JSON_YAML: TutorialChapter = {
  id: 'json-yaml',
  section: 'repo',
  title: ['JSON nach YAML konvertieren', 'Convert JSON to YAML'],
  description: [
    'Werte erhalten, Dateiendung beachten, Ergebnis und Fehler vor dem Speichern prüfen.',
    'Preserve values, note the extension, and check results and errors before saving.',
  ],
  question: ['Wie konvertiere ich JSON nach YAML?', 'How do I convert JSON to YAML?'],
  keywords: 'json yaml konvertieren convert dateiendung speichern syntax fehler',
  steps: [
    s(
      'tree',
      ['Darstellung ändern, Daten erhalten', 'Change representation, preserve data'],
      [
        'JSON und YAML können dieselben Objekte und Listen ausdrücken. Wir konvertieren config.json und prüfen die Einrückungen, Datentypen und Dateiendung getrennt.',
        'JSON and YAML can represent the same objects and lists. We will convert config.json and check indentation, data types and the file extension separately.',
      ],
      c('open-files'),
    ),
    s('open', ['Öffne config.json', 'Open config.json'], ['Klicke config.json.', 'Click config.json.'], fileRow(path), { completion: element(viewer(path)) }),
    s(
      'source',
      ['Prüfe die Ausgangswerte', 'Inspect the source values'],
      [
        'name ist die Zeichenkette OGC, z die Zahl 2. items enthält einen Eintrag mit id 1 und active true. Die Konvertierung soll diese Werte und Typen erhalten.',
        'name is the string OGC and z is the number 2. items contains one entry with id 1 and active true. Conversion should preserve those values and types.',
      ],
      editor,
      { prepare: p(path, 'base') },
    ),
    ...menu('convert', path, 'base', 'json', 'json-yaml'),
    s(
      'convert',
      ['Wandle JSON in YAML um', 'Convert JSON to YAML'],
      ['Klicke JSON → YAML. Das Ergebnis erscheint zunächst als Editorentwurf.', 'Click JSON → YAML. The result first appears as an editor draft.'],
      tool('json-yaml'),
      { prepare: p(path, 'base', { group: 'json' }), completion: value('yaml-formatted') },
    ),
    s(
      'indentation',
      ['Lies die YAML-Struktur', 'Read the YAML structure'],
      [
        'Doppelpunkte trennen Namen und Werte, der Bindestrich beginnt einen Listeneintrag. Einrückungen zeigen die Zugehörigkeit. true und die Zahlen behalten ihre Datentypen.',
        'Colons separate names and values; the dash starts a list entry. Indentation shows nesting. true and the numbers retain their data types.',
      ],
      editor,
      { prepare: p(path, 'base', { draft: 'yaml-formatted' }) },
    ),
    s(
      'extension',
      ['Die Dateiendung bleibt .json', 'The extension stays .json'],
      [
        'Das Werkzeug benennt die Datei nicht um. Der Titel zeigt weiterhin config.json, obwohl der Entwurf jetzt YAML enthält. In einem echten Projekt würdest du die gewünschte Zieldatei passend benennen.',
        'The tool does not rename the file. Its title still says config.json even though the draft now contains YAML. In a real project, name the destination file for the intended format.',
      ],
      viewer(path) + ' .file-viewer-title',
      { prepare: p(path, 'base', { draft: 'yaml-formatted' }) },
    ),
    s(
      'save',
      ['Speichere das Übungsergebnis', 'Save the practice result'],
      [
        'Klicke Arbeitsdatei speichern. In dieser isolierten Übung speichern wir den YAML-Text bewusst unter config.json. Der Index behält die ursprüngliche JSON-Fassung.',
        'Click Save working file. In this isolated exercise we deliberately save YAML text under config.json. The index retains the original JSON version.',
      ],
      c('save-file'),
      { prepare: p(path, 'base', { draft: 'yaml-formatted' }), completion: saved(path, 'yaml-formatted', 'base') },
    ),
    s(
      'restore',
      ['Stelle gültiges JSON wieder her', 'Restore valid JSON'],
      [
        'Ersetze den Editorinhalt durch: {"z":2,"name":"OGC","items":[{"id":1,"active":true}]}. Wir stellen die Ausgangsfassung vor dem Fehlerbeispiel wieder her.',
        'Replace the editor with: {"z":2,"name":"OGC","items":[{"id":1,"active":true}]}. We will restore the original before the error example.',
      ],
      editor,
      { prepare: p(path, 'yaml-formatted'), completion: value('base') },
    ),
    s(
      'save-restored',
      ['Speichere die Ausgangsfassung', 'Save the restored original'],
      ['Klicke Arbeitsdatei speichern. Die Git-Änderung verschwindet.', 'Click Save working file. The Git change disappears.'],
      c('save-file'),
      { prepare: p(path, 'yaml-formatted', { draft: 'base' }), completion: saved(path, 'base', 'base') },
    ),
    s(
      'break-json',
      ['Probiere einen unvollständigen JSON-Entwurf', 'Try an incomplete JSON draft'],
      [
        'Ersetze den Text durch {"name":. Die fehlende Wertangabe und Klammer machen das Dokument ungültig. Speichere es nicht.',
        'Replace the text with {"name":. The missing value and brace make the document invalid. Do not save it.',
      ],
      editor,
      { prepare: p(path, 'base'), completion: value('json-invalid') },
    ),
    ...menu('error', path, 'base', 'json', 'json-yaml', 'json-invalid'),
    s(
      'error',
      ['Versuche die Konvertierung', 'Attempt conversion'],
      [
        'Klicke JSON → YAML. Der Syntaxfehler wird gemeldet und der unvollständige Entwurf bleibt erhalten.',
        'Click JSON → YAML. The syntax error is reported and the incomplete draft is preserved.',
      ],
      tool('json-yaml'),
      {
        prepare: p(path, 'base', { draft: 'json-invalid', group: 'json' }),
        completion: feedback('json-yaml', ['Invalid JSON/JSONC:', 'Invalid JSON/JSONC:'], true, 'json-invalid'),
      },
    ),
    s(
      'repair',
      ['Verwirf den fehlerhaften Text durch Korrektur', 'Correct the invalid text'],
      [
        'Trage wieder {"z":2,"name":"OGC","items":[{"id":1,"active":true}]} ein. Die gespeicherte Datei wurde durch den Fehlversuch nicht verändert.',
        'Enter {"z":2,"name":"OGC","items":[{"id":1,"active":true}]} again. The failed attempt did not change the saved file.',
      ],
      editor,
      { prepare: p(path, 'base', { draft: 'json-invalid' }), completion: value('base') },
    ),
    s('close', ['Schließe config.json', 'Close config.json'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p(path, 'base'),
      completion: { kind: 'absent', selector: viewer(path) },
    }),
    s(
      'finish',
      ['Textformat und Dateiname getrennt kontrollieren', 'Check content format and file name separately'],
      [
        'Du hast Werte in YAML übertragen, die unveränderte Dateiendung geprüft, gespeichert und einen Syntaxfehler ohne Datenverlust korrigiert. Die YAML-Lektionen zeigen Formatieren, Validieren und den Weg zurück nach JSON.',
        'You converted values to YAML, checked the unchanged extension, saved, and corrected a syntax error without losing data. The YAML lessons cover formatting, validation and conversion back to JSON.',
      ],
      c('open-files'),
      { prepare: {} },
    ),
  ],
};
