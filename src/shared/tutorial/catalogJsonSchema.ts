import type { TutorialChapter, StructuredExample } from './types';
import {
  s,
  p,
  jsonRow,
  jsonViewer,
  jsonValue,
  jsonContent,
  c,
  tool,
  toolGroup,
  editor,
  element,
  schemaField,
  schemaDialog,
  schemaIssue,
  schemaResult,
  schemaSuccess,
  schemaSyntaxError,
  schemaClosed,
  dialog,
  confirmDialog,
  cancelDialog,
} from './schemaLessonHelpers';

const menu = (prefix: string, draft?: StructuredExample) => [
  s(
    prefix + '-menu',
    ['Öffne Werkzeuge', 'Open Tools'],
    ['Klicke Werkzeuge oben im Datei-Viewer.', 'Click Tools at the top of the file viewer.'],
    c('file-tools'),
    {
      prepare: p('base', { draft }),
      completion: element(toolGroup('json')),
    },
  ),
  s(prefix + '-group', ['Wechsle zur Gruppe JSON', 'Go to the JSON group'], ['Klicke JSON.', 'Click JSON.'], toolGroup('json'), {
    prepare: p('base', { draft, menu: true }),
    completion: element(tool('json-schema')),
  }),
  s(
    prefix + '-open',
    ['Öffne die Schema-Prüfung', 'Open schema validation'],
    [
      'Klicke Mit Schema validieren. Die Prüfung verwendet den aktuellen Editorinhalt und verändert keine Datei.',
      'Click Validate with schema. Validation uses the current editor content and does not modify any file.',
    ],
    tool('json-schema'),
    {
      prepare: p('base', { draft, group: true }),
      completion: element(schemaField),
    },
  ),
];
const enterContract = (id: string, draft?: StructuredExample) =>
  s(
    id,
    ['Trage das Projektschema ein', 'Enter the project schema'],
    [
      'Ersetze das Standardschema durch dieses Projektschema:\n{ "type": "object", "required": ["name", "items", "z"], "additionalProperties": false, "properties": { "name": { "type": "string" }, "z": { "type": "integer", "minimum": 0 }, "items": { "type": "array", "items": { "type": "object", "required": ["id", "active"], "additionalProperties": false, "properties": { "id": { "type": "integer", "minimum": 1 }, "active": { "type": "boolean" } } } } } }',
      'Replace the default schema with this project schema:\n{ "type": "object", "required": ["name", "items", "z"], "additionalProperties": false, "properties": { "name": { "type": "string" }, "z": { "type": "integer", "minimum": 0 }, "items": { "type": "array", "items": { "type": "object", "required": ["id", "active"], "additionalProperties": false, "properties": { "id": { "type": "integer", "minimum": 1 }, "active": { "type": "boolean" } } } } } }',
    ],
    schemaField,
    { prepare: schemaDialog(draft), completion: { kind: 'value', selector: schemaField, value: jsonContent('schema-contract'), comparison: 'json' } },
  );

export const TUTORIAL_JSON_SCHEMA: TutorialChapter = {
  id: 'json-schema',
  section: 'repo',
  title: ['JSON-Schema: Regeln und Fehler prüfen', 'JSON Schema: check rules and errors'],
  description: [
    'Schema-Dialog, Pflichtfelder, Datentypen, verschachtelte Fehler und erneute Prüfung.',
    'Schema dialog, required fields, data types, nested errors and revalidation.',
  ],
  question: ['Wie prüfe ich JSON mit einem Schema?', 'How do I validate JSON with a schema?'],
  keywords: 'json schema validieren validation required properties minimum zusätzliche felder fehler errors datentyp',
  steps: [
    s(
      'tree',
      ['Regeln zusätzlich zur JSON-Syntax', 'Rules beyond JSON syntax'],
      [
        'JSON kann syntaktisch korrekt sein und trotzdem falsche Daten enthalten. Ein Schema beschreibt erwartete Felder, Typen und Werte. Wir prüfen config.json und anschließend einen fehlerhaften Entwurf.',
        'JSON may have valid syntax but still contain incorrect data. A schema describes expected fields, types and values. We will check config.json and then an invalid draft.',
      ],
      c('open-files'),
    ),
    s('open', ['Öffne config.json', 'Open config.json'], ['Klicke config.json im Dateibaum.', 'Click config.json in the file tree.'], jsonRow, {
      completion: element(jsonViewer),
    }),
    ...menu('first'),
    s(
      'dialog',
      ['Datei und Schema sind getrennt', 'File and schema are separate'],
      [
        'Oben steht config.json als Ziel. Das große Textfeld enthält das Schema, nicht die zu prüfenden Daten. Das Standardschema verlangt lediglich ein Objekt. Schließe den Dialog zuerst ohne Prüfung.',
        'The target is config.json. The large field contains the schema, not the data being checked. The default schema only requires an object. First close the dialog without validating.',
      ],
      dialog,
      { prepare: schemaDialog() },
    ),
    s(
      'cancel',
      ['Brich die Prüfung ab', 'Cancel validation'],
      ['Klicke Abbrechen. config.json bleibt unverändert.', 'Click Cancel. config.json stays unchanged.'],
      cancelDialog,
      { prepare: schemaDialog(), completion: schemaClosed('base') },
    ),
    ...menu('project'),
    enterContract('contract'),
    s(
      'required',
      ['Pflichtfelder und zusätzliche Felder', 'Required and additional fields'],
      [
        'required verlangt name, items und z. additionalProperties: false weist andere Felder zurück. Diese Regeln prüfen die Daten; sie fügen keine Werte ein und entfernen keine Felder.',
        'required demands name, items and z. additionalProperties: false rejects other fields. These rules check data without inserting values or removing fields.',
      ],
      schemaField,
      { prepare: schemaDialog(undefined, 'schema-contract') },
    ),
    s(
      'types',
      ['Typen und verschachtelte Regeln', 'Types and nested rules'],
      [
        'name muss eine Zeichenkette sein, z eine ganze Zahl ab 0. Jeder Eintrag in items benötigt eine id ab 1 und einen booleschen active-Wert. Die Regeln gelten für jedes Listenelement.',
        'name must be a string and z an integer of at least 0. Each items entry needs an id of at least 1 and a boolean active value. The rules apply to every list entry.',
      ],
      schemaField,
      { prepare: schemaDialog(undefined, 'schema-contract') },
    ),
    s(
      'validate',
      ['Prüfe das gültige Dokument', 'Validate the valid document'],
      ['Klicke Validieren. Die Erfolgsmeldung bestätigt die geprüften Daten.', 'Click Validate. The success message confirms the data passed.'],
      confirmDialog,
      {
        prepare: schemaDialog(undefined, 'schema-contract'),
        completion: schemaSuccess,
      },
    ),
    s(
      'success',
      ['Validieren speichert oder korrigiert nicht', 'Validation does not save or fix data'],
      [
        'config.json ist weiterhin unverändert. Jetzt erzeugen wir absichtlich mehrere Regelverletzungen in einem ungespeicherten Entwurf.',
        'config.json is still unchanged. Next we will deliberately create several rule violations in an unsaved draft.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'edit-invalid',
      ['Erzeuge fünf Regelverletzungen', 'Create five rule violations'],
      [
        'Ersetze den Editorinhalt durch: {"z":-1,"name":42,"items":[{"id":0,"active":"yes"}],"extra":true}. Speichere den Entwurf nicht.',
        'Replace the editor content with: {"z":-1,"name":42,"items":[{"id":0,"active":"yes"}],"extra":true}. Keep the draft unsaved.',
      ],
      editor,
      { prepare: p(), completion: jsonValue('schema-failure') },
    ),
    ...menu('invalid', 'schema-failure'),
    enterContract('invalid-contract', 'schema-failure'),
    s(
      'validate-invalid',
      ['Prüfe den fehlerhaften Entwurf', 'Validate the invalid draft'],
      [
        'Klicke Validieren. Es müssen fünf Probleme erscheinen. Die gespeicherte Datei bleibt bei ihrer gültigen Fassung.',
        'Click Validate. Five issues should appear, while the saved file retains its valid version.',
      ],
      confirmDialog,
      { prepare: schemaDialog('schema-failure', 'schema-contract'), completion: schemaResult },
    ),
    ...(
      [
        [
          ['Zusätzliches Feld', 'Additional field'],
          [
            'Der Pfad $ bezeichnet die Wurzel. extra ist dort nicht erlaubt. Die Prüfung entfernt es nicht.',
            'The path $ denotes the root. extra is not allowed there, and validation does not remove it.',
          ],
        ],
        [
          ['Falscher Typ bei name', 'Wrong type for name'],
          ['/name muss eine Zeichenkette sein. Die Zahl 42 erfüllt diese Regel nicht.', '/name must be a string. The number 42 does not meet that rule.'],
        ],
        [
          ['Unterschrittene Untergrenze', 'Value below the minimum'],
          ['/z ist -1; erlaubt sind ganze Zahlen ab 0.', '/z is -1; integers of at least 0 are allowed.'],
        ],
        [
          ['Fehler im Listeneintrag', 'Error inside a list entry'],
          [
            '/items/0/id meint die id des ersten Listeneintrags. Der Index beginnt bei 0. Die id 0 unterschreitet das Minimum 1.',
            '/items/0/id points to id in the first list entry. Array indexes start at 0. The id 0 is below the minimum of 1.',
          ],
        ],
        [
          ['Zeichenkette ist kein Wahrheitswert', 'A string is not a boolean'],
          [
            '/items/0/active enthält "yes". Das Schema verlangt true oder false ohne Anführungszeichen.',
            '/items/0/active contains "yes". The schema requires true or false without quotation marks.',
          ],
        ],
      ] as const
    ).map(([title, description], index) =>
      s('issue-' + (index + 1), title, description, schemaIssue(index + 1), {
        prepare: schemaDialog('schema-failure', 'schema-contract', true),
      }),
    ),
    s(
      'close-issues',
      ['Schließe die Problemliste', 'Close the issue list'],
      ['Klicke Schließen. Die Prüfung hat den fehlerhaften Entwurf nicht verändert.', 'Click Close. Validation has not changed the invalid draft.'],
      confirmDialog,
      { prepare: schemaDialog('schema-failure', 'schema-contract', true), completion: schemaClosed('schema-failure') },
    ),
    s(
      'repair',
      ['Korrigiere die Daten im Editor', 'Correct the data in the editor'],
      [
        'Ersetze den Entwurf wieder durch: {"z":2,"name":"OGC","items":[{"id":1,"active":true}]}. Der Stern verschwindet, weil der Text wieder der gespeicherten Datei entspricht.',
        'Restore the draft to: {"z":2,"name":"OGC","items":[{"id":1,"active":true}]}. The asterisk disappears because the text matches the saved file again.',
      ],
      editor,
      { prepare: p('base', { draft: 'schema-failure' }), completion: jsonValue('base') },
    ),
    ...menu('retry'),
    enterContract('retry-contract'),
    s(
      'revalidate',
      ['Bestätige die Korrektur', 'Confirm the correction'],
      ['Klicke Validieren und prüfe die Erfolgsmeldung.', 'Click Validate and check the success message.'],
      confirmDialog,
      { prepare: schemaDialog(undefined, 'schema-contract'), completion: schemaSuccess },
    ),
    ...menu('syntax'),
    s(
      'break-schema',
      ['Probiere einen Syntaxfehler im Schema', 'Try a syntax error in the schema'],
      [
        'Ersetze den Schema-Inhalt nur durch eine öffnende geschweifte Klammer: {. Dies ist kein vollständiges JSON-Dokument.',
        'Replace the schema with a single opening brace: {. This is not a complete JSON document.',
      ],
      schemaField,
      { prepare: schemaDialog(), completion: { kind: 'value', selector: schemaField, value: jsonContent('schema-invalid') } },
    ),
    s(
      'syntax-error',
      ['Prüfe das unvollständige Schema', 'Check the incomplete schema'],
      [
        'Klicke Validieren. Der JSON/JSONC-Syntaxfehler betrifft hier das Schema und ist von einer Liste ungültiger Daten zu unterscheiden.',
        'Click Validate. This JSON/JSONC syntax error is in the schema and differs from a list of invalid data values.',
      ],
      confirmDialog,
      { prepare: schemaDialog(undefined, 'schema-invalid'), completion: schemaSyntaxError },
    ),
    s(
      'unchanged',
      ['Die Datei bleibt erhalten', 'The file is preserved'],
      [
        'Weder abgebrochene noch fehlgeschlagene Prüfungen speichern die Datei. Im Übungsmodus sind das Standardschema und das hier verwendete Projektschema verfügbar; andere Schemata erhalten eine Rückmeldung.',
        'Neither cancelled nor failed validation saves the file. Practice mode supports the default schema and the project schema used here; other schemas receive an explanatory response.',
      ],
      editor,
      { prepare: p() },
    ),
    s('close', ['Schließe config.json', 'Close config.json'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p(),
      completion: { kind: 'absent', selector: jsonViewer },
    }),
    s(
      'finish',
      ['Regeln schrittweise prüfen', 'Check rules step by step'],
      [
        'Du hast den Dialog abgebrochen, eigene Regeln eingegeben, fünf Datenfehler einzeln gelesen, korrigiert und erneut geprüft sowie einen Schema-Syntaxfehler ausprobiert. Eine erfolgreiche Prüfung ersetzt das Speichern und Staging nicht.',
        'You cancelled the dialog, entered rules, read five data errors individually, corrected and rechecked them, and tried a schema syntax error. Successful validation does not replace saving or staging.',
      ],
      c('open-files'),
      { prepare: {} },
    ),
  ],
};
