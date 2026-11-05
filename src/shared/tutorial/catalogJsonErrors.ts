import type { TutorialChapter, TutorialCompletion, TutorialText } from './types';
import {
  jsonStep as s,
  jsonRecipe as p,
  jsonValue,
  jsonContent,
  jsonRow,
  jsonViewer,
  jsonSelectionRule,
  jsonCopied,
  c,
  editor,
  element,
  tool,
} from './structuredLessonHelpers';
import { structuredMenu as menu, structuredFeedback as feedback } from './structuredToolLessonHelpers';
const unchanged: TutorialCompletion = {
  kind: 'working-tree',
  staged: [],
  unstaged: [],
  untracked: [],
  content: [
    { path: 'config.json', source: 'worktree', value: jsonContent('base') },
    { path: 'config.json', source: 'index', value: jsonContent('base') },
  ],
};
const operations: { id: string; title: TutorialText; description: TutorialText }[] = [
  {
    id: 'json-format',
    title: ['Ungültiges JSON formatieren', 'Format invalid JSON'],
    description: [
      'Formatieren benötigt vollständige Werte und Klammern. Es ergänzt keine geratenen Daten, wenn der Quelltext unvollständig ist.',
      'Formatting requires complete values and brackets. It does not invent data when the source is incomplete.',
    ],
  },
  {
    id: 'json-minify',
    title: ['Ungültiges JSON minifizieren', 'Minify invalid JSON'],
    description: [
      'Minifizieren prüft die Syntax, bevor es Leerraum entfernt. Es soll keinen scheinbar gültigen einzeiligen Text aus einem kaputten Dokument erzeugen.',
      'Minifying checks syntax before removing whitespace. It must not turn a broken document into an apparently valid one-line result.',
    ],
  },
  {
    id: 'json-sort',
    title: ['Schlüssel bei ungültigem JSON sortieren', 'Sort keys in invalid JSON'],
    description: [
      'Schlüssel sortieren benötigt eine vollständige Objektstruktur. Ein fehlender Wert wird nicht als leerer Text oder null interpretiert.',
      'Sorting keys requires a complete object structure. A missing value is not treated as empty text or null.',
    ],
  },
  {
    id: 'json-path',
    title: ['Pfad bei ungültigem JSON bestimmen', 'Find a path in invalid JSON'],
    description: [
      'Auch der Pfad an der Auswahl setzt gültiges JSON voraus. Ein fehlgeschlagener Versuch soll keinen neuen Pfad in die Übungszwischenablage schreiben.',
      'The path at selection also requires valid JSON. A failed attempt must not write a new path to the practice clipboard.',
    ],
  },
];
export const TUTORIAL_JSON_ERRORS: TutorialChapter = {
  id: 'json-errors',
  section: 'repo',
  title: ['JSON-Werkzeuge: Syntaxfehler beheben', 'JSON tools: recover from syntax errors'],
  description: [
    'Vier Werkzeuge mit unvollständigem JSON prüfen, Entwurf erhalten und nach Korrektur einen Pfad kopieren.',
    'Try four tools with incomplete JSON, preserve the draft, then correct it and copy a path.',
  ],
  question: ['Warum können die JSON-Werkzeuge meine Datei nicht verarbeiten?', 'Why can’t the JSON tools process my file?'],
  keywords: 'json jsonc syntax fehler error formatieren minifizieren sortieren pfad reparieren entwurf clipboard',
  steps: [
    s(
      'tree',
      ['Syntaxfehler sind keine Formatierungsfrage', 'Syntax errors are not formatting problems'],
      [
        'Wir lassen denselben unvollständigen Entwurf von vier Werkzeugen prüfen. Die gespeicherte Datei und der Index bleiben dabei unverändert. Danach korrigieren wir den Text und prüfen den Erfolg an einem kopierten Pfad.',
        'We will try the same incomplete draft with four tools while preserving the saved file and index. Then we will correct it and confirm the result by copying a path.',
      ],
      c('open-files'),
    ),
    s('open', ['Öffne config.json', 'Open config.json'], ['Klicke config.json im Dateibaum.', 'Click config.json in the file tree.'], jsonRow, {
      completion: element(jsonViewer),
    }),
    s(
      'invalid',
      ['Lass einen Wert und die Klammer offen', 'Leave a value and brace incomplete'],
      [
        'Ersetze den gesamten Editorinhalt durch {"name":. Nach dem Doppelpunkt fehlt der Wert und das Objekt ist nicht geschlossen. Speichere diesen Entwurf nicht.',
        'Replace the entire editor content with {"name":. The colon has no value after it and the object is not closed. Do not save this draft.',
      ],
      editor,
      { prepare: p(), completion: jsonValue('json-invalid') },
    ),
    ...operations.flatMap((operation) => [
      s(operation.id + '-purpose', operation.title, operation.description, editor, { prepare: p('base', { draft: 'json-invalid' }) }),
      ...menu(operation.id, 'config.json', 'base', 'json', operation.id, 'json-invalid'),
      s(
        operation.id + '-error',
        operation.title,
        [
          'Klicke das hervorgehobene Werkzeug. Der neue Fehlversuch muss erkannt werden, auch wenn dieselbe Fehlermeldung noch sichtbar ist.',
          'Click the highlighted tool. The new failed attempt must be recognized even if the same error message is still visible.',
        ],
        tool(operation.id),
        {
          prepare: p('base', { draft: 'json-invalid', group: true }),
          completion: {
            kind: 'all',
            conditions: [
              feedback(operation.id, ['Invalid JSON/JSONC:', 'Invalid JSON/JSONC:'], true, 'json-invalid'),
              unchanged,
              ...(operation.id === 'json-path' ? [{ kind: 'clipboard' as const, value: ['', ''] as const }] : []),
            ],
          },
        },
      ),
    ]),
    s(
      'repair',
      ['Korrigiere das Dokument', 'Correct the document'],
      [
        'Ersetze den Entwurf durch {"z":2,"name":"OGC","items":[{"id":1,"active":true}]}. Der Text entspricht wieder der gespeicherten Fassung; Speichern ist nicht erforderlich.',
        'Replace the draft with {"z":2,"name":"OGC","items":[{"id":1,"active":true}]}. The text matches the saved version again, so no save is required.',
      ],
      editor,
      { prepare: p('base', { draft: 'json-invalid' }), completion: { kind: 'all', conditions: [jsonValue('base'), unchanged] } },
    ),
    s(
      'select',
      ['Markiere OGC ohne Anführungszeichen', 'Select OGC without quotation marks'],
      [
        'Markiere die drei Buchstaben OGC beim Feld name. Die Auswahl legt fest, für welche Stelle der Pfad bestimmt wird.',
        'Select the three letters OGC in the name field. The selection determines which position the path is calculated for.',
      ],
      editor,
      { prepare: p(), completion: jsonSelectionRule(15, 18) },
    ),
    ...menu('retry', 'config.json', 'base', 'json', 'json-path').map((step) => ({
      ...step,
      prepare: { ...step.prepare, selection: { selector: editor, from: 15, to: 18 } },
    })),
    s(
      'copy',
      ['Kopiere den Pfad nach der Korrektur', 'Copy the path after correcting the data'],
      [
        'Klicke Pfad an Auswahl kopieren. Erst jetzt soll $.name in der Übungszwischenablage stehen und die Erfolgsmeldung erscheinen.',
        'Click Copy path at selection. Only now should the practice clipboard contain $.name and a success message appear.',
      ],
      tool('json-path'),
      { prepare: p('base', { group: true, selection: { selector: editor, from: 15, to: 18 } }), completion: jsonCopied('$.name') },
    ),
    s(
      'result',
      ['Die Korrektur macht die Werkzeuge wieder nutzbar', 'Correcting the syntax makes the tools usable again'],
      [
        '$.name bezeichnet das Feld name im Wurzelobjekt. Alle Fehlversuche haben die gespeicherte Datei erhalten. Die erfolgreiche Pfadbestimmung verändert ebenfalls keine Dateibytes.',
        '$.name refers to the name field in the root object. All failed attempts preserved the saved file, and successful path lookup does not change file bytes either.',
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
      ['Syntax vor Transformationen klären', 'Resolve syntax errors before transforming'],
      [
        'Du hast vier Fehlversuche einzeln geprüft und den Text anschließend korrigiert. Verwende Fehlermeldungen, Entwurfsmarkierung und Diff gemeinsam, bevor du eigene Änderungen speicherst oder stagest.',
        'You checked four failed attempts separately, then corrected the text. Use error messages, the draft indicator and the diff together before saving or staging your own changes.',
      ],
      c('open-files'),
      { prepare: {} },
    ),
  ],
};
