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
export const TUTORIAL_YAML_TOOLS: TutorialChapter = {
  id: 'yaml-tools',
  section: 'repo',
  title: ['YAML formatieren und prüfen', 'Format and validate YAML'],
  description: [
    'Einrückungen, Listen, Formatierung, Validierung und doppelte Schlüssel praktisch prüfen.',
    'Practise indentation, lists, formatting, validation and duplicate keys.',
  ],
  question: ['Wie formatiere und prüfe ich YAML?', 'How do I format and validate YAML?'],
  keywords: 'yaml yml formatieren validieren einrückung listen doppelte schlüssel fehler duplicate keys',
  steps: [
    s(
      'tree',
      ['YAML verwendet Einrückungen', 'YAML uses indentation'],
      [
        'Im Beispielprojekt liegt config.yaml. YAML stellt verschachtelte Daten mit Einrückungen dar. Wir prüfen die Struktur vor dem Speichern und üben anschließend einen Fehler mit doppeltem Schlüssel.',
        'The example project contains config.yaml. YAML represents nested data using indentation. We will check the structure before saving, then practise an error with a duplicate key.',
      ],
      c('open-files'),
    ),
    s('open', ['Öffne config.yaml', 'Open config.yaml'], ['Klicke config.yaml im Dateibaum.', 'Click config.yaml in the file tree.'], fileRow(path), {
      completion: element(viewer(path)),
    }),
    s(
      'structure',
      ['Namen, Werte und Listeneinträge', 'Names, values and list entries'],
      [
        'name: OGC und z: 2 stehen auf oberster Ebene. items enthält eine Liste; - beginnt deren ersten Eintrag. id und active gehören durch ihre Einrückung zu diesem Eintrag.',
        'name: OGC and z: 2 are at the root. items contains a list, and - starts its first entry. Indentation places id and active inside that entry.',
      ],
      editor,
      { prepare: p(path, 'yaml-base') },
    ),
    ...menu('format', path, 'yaml-base', 'yaml', 'yaml-format'),
    s(
      'format',
      ['Formatiere die YAML-Datei', 'Format the YAML file'],
      [
        'Klicke Formatieren. Das Werkzeug vereinheitlicht die Einrückung, ohne die Werte zu ändern.',
        'Click Format. The tool standardizes indentation without changing values.',
      ],
      tool('yaml-format'),
      { prepare: p(path, 'yaml-base', { group: 'yaml' }), completion: value('yaml-formatted') },
    ),
    s(
      'draft',
      ['Prüfe die neue Einrückung', 'Inspect the new indentation'],
      [
        'Der Listeneintrag ist jetzt mit zwei statt vier Leerzeichen eingerückt. Die id bleibt 1 und active bleibt true. Der Stern zeigt, dass nur der Editorentwurf geändert wurde.',
        'The list entry now uses two spaces instead of four. id remains 1 and active remains true. The asterisk shows that only the editor draft changed.',
      ],
      editor,
      { prepare: p(path, 'yaml-base', { draft: 'yaml-formatted' }) },
    ),
    s(
      'save',
      ['Speichere das formatierte YAML', 'Save the formatted YAML'],
      ['Klicke Arbeitsdatei speichern. Der Index behält die vorherige Einrückung.', 'Click Save working file. The index retains the previous indentation.'],
      c('save-file'),
      { prepare: p(path, 'yaml-base', { draft: 'yaml-formatted' }), completion: saved(path, 'yaml-formatted', 'yaml-base') },
    ),
    ...menu('valid', path, 'yaml-formatted', 'yaml', 'yaml-validate'),
    s(
      'validate',
      ['Prüfe gültiges YAML', 'Validate valid YAML'],
      [
        'Klicke Validieren. Die Erfolgsmeldung bestätigt die YAML-Struktur. Diese Prüfung wendet kein Projektschema an und speichert nichts.',
        'Click Validate. The success message confirms the YAML structure. This check does not apply a project schema or save anything.',
      ],
      tool('yaml-validate'),
      {
        prepare: p(path, 'yaml-formatted', { group: 'yaml' }),
        completion: feedback('yaml-validate', ['YAML ist gültig.', 'YAML is valid.'], false, 'yaml-formatted'),
      },
    ),
    s(
      'invalid-purpose',
      ['Ein Schlüssel darf nicht doppelt vorkommen', 'A key must not appear twice'],
      [
        'Ein versehentlich doppeltes Feld ist leicht zu übersehen. Der Validator weist doppelte Schlüssel zurück, statt stillschweigend einen Wert auszuwählen.',
        'An accidentally duplicated field is easy to miss. The validator rejects duplicate keys instead of silently choosing one value.',
      ],
      editor,
      { prepare: p(path, 'yaml-formatted') },
    ),
    s(
      'duplicate',
      ['Trage name zweimal ein', 'Enter name twice'],
      [
        'Ersetze den Entwurf durch zwei Zeilen: name: OGC und name: Duplicate. Beende auch die zweite Zeile mit einem Zeilenumbruch. Speichere nicht.',
        'Replace the draft with two lines: name: OGC and name: Duplicate. End the second line with a newline too. Do not save.',
      ],
      editor,
      { prepare: p(path, 'yaml-formatted'), completion: value('yaml-invalid') },
    ),
    ...menu('invalid', path, 'yaml-formatted', 'yaml', 'yaml-validate', 'yaml-invalid'),
    s(
      'validate-invalid',
      ['Prüfe den doppelten Schlüssel', 'Check the duplicate key'],
      [
        'Klicke Validieren. Invalid YAML und die Zeilenangabe zeigen den Fehler. Der ungespeicherte Text bleibt erhalten.',
        'Click Validate. Invalid YAML and the line position identify the error. The unsaved text is preserved.',
      ],
      tool('yaml-validate'),
      {
        prepare: p(path, 'yaml-formatted', { draft: 'yaml-invalid', group: 'yaml' }),
        completion: feedback('yaml-validate', ['Invalid YAML:', 'Invalid YAML:'], true, 'yaml-invalid'),
      },
    ),
    ...menu('format-error', path, 'yaml-formatted', 'yaml', 'yaml-format', 'yaml-invalid'),
    s(
      'format-invalid',
      ['Formatieren repariert keinen Datenkonflikt', 'Formatting does not repair a data conflict'],
      [
        'Klicke Formatieren. Auch dieses Werkzeug weist den doppelten Schlüssel zurück und erhält deinen Entwurf. Es entscheidet nicht, welcher Wert gemeint war.',
        'Click Format. This tool also rejects the duplicate key and preserves your draft. It does not decide which value you intended.',
      ],
      tool('yaml-format'),
      {
        prepare: p(path, 'yaml-formatted', { draft: 'yaml-invalid', group: 'yaml' }),
        completion: feedback('yaml-format', ['Invalid YAML:', 'Invalid YAML:'], true, 'yaml-invalid'),
      },
    ),
    s(
      'repair',
      ['Stelle den gültigen Text wieder her', 'Restore valid text'],
      [
        'Trage wieder ein: z: 2, name: OGC, items:, zwei Leerzeichen vor - id: 1 und vier vor active: true. Jede Angabe steht in einer eigenen Zeile; auch die letzte endet mit einem Zeilenumbruch.',
        'Enter z: 2, name: OGC, items:, two spaces before - id: 1 and four before active: true. Put each entry on its own line, including a final newline.',
      ],
      editor,
      { prepare: p(path, 'yaml-formatted', { draft: 'yaml-invalid' }), completion: value('yaml-formatted') },
    ),
    ...menu('retry', path, 'yaml-formatted', 'yaml', 'yaml-validate'),
    s(
      'revalidate',
      ['Bestätige die Korrektur', 'Confirm the correction'],
      ['Klicke Validieren. Die neue Erfolgsmeldung muss aus dieser Prüfung stammen.', 'Click Validate. A fresh success message must come from this check.'],
      tool('yaml-validate'),
      {
        prepare: p(path, 'yaml-formatted', { group: 'yaml' }),
        completion: feedback('yaml-validate', ['YAML ist gültig.', 'YAML is valid.'], false, 'yaml-formatted'),
      },
    ),
    s('close', ['Schließe config.yaml', 'Close config.yaml'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p(path, 'yaml-formatted'),
      completion: { kind: 'absent', selector: viewer(path) },
    }),
    s(
      'finish',
      ['Formatierung und Gültigkeit getrennt prüfen', 'Check formatting and validity separately'],
      [
        'Du hast YAML formatiert, das Ergebnis gespeichert, gültige Daten geprüft und einen doppelten Schlüssel korrigiert. Die nächste Lektion überträgt dieselben Werte nach JSON.',
        'You formatted YAML, saved the result, validated correct data and fixed a duplicate key. The next lesson converts the same values to JSON.',
      ],
      c('open-files'),
      { prepare: {} },
    ),
  ],
};
