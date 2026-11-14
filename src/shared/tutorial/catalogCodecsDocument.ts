import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter, TutorialText, ToolExample } from './types';
import { BASE64_DECODE_ERROR, URL_DECODE_ERROR } from '../fileCodecMessages';
import {
  codecStep as s,
  textRecipe,
  toolValue,
  toolContent,
  textSaved,
  unchangedError,
  tool,
  toolGroup,
  c,
  row,
  viewer,
  editor,
  element,
} from './textLessonHelpers';
const p = (saved: ToolExample = 'codec-base', options: Parameters<typeof textRecipe>[1] = {}) => textRecipe(saved, options);
const save = (version: ToolExample) => textSaved(version, 'codec-base');
type Operation = { id: string; before: ToolExample; after: ToolExample; title: TutorialText; description: TutorialText };
const operations: Operation[] = [
  {
    id: 'base64-encode',
    before: 'codec-base',
    after: 'codec-base64',
    title: ['Den gesamten Text als Base64 darstellen', 'Represent the entire text as Base64'],
    description: [
      'Base64 stellt die UTF-8-Bytes als ASCII-Zeichen dar. Auch Leerzeichen, & und der abschließende Zeilenumbruch werden mitkodiert. Base64 ist keine Verschlüsselung.',
      'Base64 represents UTF-8 bytes as ASCII characters. Spaces, &, and the final line break are encoded too. Base64 is not encryption.',
    ],
  },
  {
    id: 'base64-decode',
    before: 'codec-base64',
    after: 'codec-base',
    title: ['Base64 wieder in Text dekodieren', 'Decode Base64 back into text'],
    description: [
      'Base64 decodieren stellt die ursprünglichen UTF-8-Zeichen einschließlich Café und Zeilenumbruch wieder her. Ungültiges Base64 oder nicht als UTF-8 lesbare Bytes werden abgewiesen.',
      'Decode Base64 restores the original UTF-8 characters, including Café and the line break. Invalid Base64 or bytes that are not UTF-8 text are rejected.',
    ],
  },
  {
    id: 'url-encode',
    before: 'codec-base',
    after: 'codec-url',
    title: ['Text für einen URL-Bestandteil kodieren', 'Encode text for a URL component'],
    description: [
      'URL codieren verwendet Prozentfolgen für Sonderzeichen. Das Leerzeichen wird zu %20 und & zu %26. Diese Aktion kodiert einen Textbestandteil und baut keine vollständige Adresse.',
      'URL encode uses percent sequences for special characters. A space becomes %20 and & becomes %26. This encodes a text component rather than constructing a complete address.',
    ],
  },
  {
    id: 'url-decode',
    before: 'codec-url',
    after: 'codec-base',
    title: ['URL-kodierten Text zurückverwandeln', 'Decode URL-encoded text'],
    description: [
      'URL decodieren liest die Prozentfolgen und stellt Café, das Leerzeichen, & und den Zeilenumbruch wieder her. Ungültige Prozentfolgen erzeugen einen Fehler, ohne den Text zu überschreiben.',
      'URL decode reads the percent sequences and restores Café, spaces, & and the line break. Invalid percent sequences produce an error without overwriting the text.',
    ],
  },
];
function operationSteps(operation: Operation) {
  return [
    s(operation.id + '-purpose', operation.title, operation.description, editor, { prepare: p(operation.before) }),
    s(
      operation.id + '-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      [
        'Klicke Werkzeuge. In dieser Lektion bleibt keine Textauswahl aktiv; die Aktion soll das gesamte Dokument verarbeiten.',
        'Click Tools. Keep no text selected in this lesson so the action processes the whole document.',
      ],
      c('file-tools'),
      { prepare: p(operation.before), completion: element(toolGroup('codecs')) },
    ),
    s(
      operation.id + '-group',
      ['Öffne Base64 und URL-Encoding', 'Open Base64 and URL encoding'],
      [
        'Klicke Base64 und URL-Encoding. Die Beschreibung nennt Gesamte Datei verarbeiten, wenn nur der Textcursor aktiv ist.',
        'Click Base64 and URL encoding. The description says Process entire file when only the text cursor is active.',
      ],
      toolGroup('codecs'),
      { prepare: p(operation.before, { menu: true }), completion: element(tool(operation.id)) },
    ),
    s(
      operation.id + '-apply',
      operation.title,
      [operation.description[0] + ' Klicke das hervorgehobene Werkzeug.', operation.description[1] + ' Click the highlighted tool.'],
      tool(operation.id),
      { prepare: p(operation.before, { group: 'codecs' }), completion: toolValue(operation.after) },
    ),
    s(
      operation.id + '-result',
      ['Die Umwandlung ist ein Editorentwurf', 'The conversion is an editor draft'],
      [
        'Prüfe den neuen Text. Der Stern zeigt den Entwurf; die gespeicherte Arbeitsdatei hat noch ihre vorherige Fassung. Ein Base64-/URL-Werkzeug ändert die Textzeichen, nicht die Dateikodierung in der Statusleiste.',
        'Inspect the new text. The asterisk marks the draft, while the saved working file retains its previous version. A Base64/URL tool changes characters rather than the file encoding shown in the status bar.',
      ],
      editor,
      { prepare: p(operation.before, { draft: operation.after }) },
    ),
    s(
      operation.id + '-save',
      ['Speichere das Ergebnis', 'Save the result'],
      [
        'Klicke Arbeitsdatei speichern. Der Index behält das ursprüngliche Beispiel. Beim vollständigen Zurückdekodieren und Speichern entstehen wieder dessen ursprüngliche Bytes.',
        'Click Save working file. The index retains the original example. Decoding fully back and saving reproduces the original bytes.',
      ],
      c('save-file'),
      { prepare: p(operation.before, { draft: operation.after }), completion: save(operation.after) },
    ),
  ];
}
function errorSteps(id: string, invalid: ToolExample, toolId: string, message: TutorialText) {
  return [
    s(
      id + '-purpose',
      ['Eine ungültige Eingabe erkennen', 'Recognize invalid input'],
      [
        'Wir geben jetzt absichtlich ungültigen Text ein. Ein fehlgeschlagener Dekodierversuch soll eine Fehlermeldung zeigen und den Entwurf erhalten. Die Arbeitsdatei bleibt unverändert.',
        'We will deliberately enter invalid text. A failed decode should report an error while preserving the draft. The working file stays unchanged.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      id + '-type',
      ['Gib die ungültige Zeichenfolge ein', 'Enter the invalid sequence'],
      [
        invalid === 'invalid-base64'
          ? 'Ersetze den gesamten Editorinhalt durch %%%not-base64%%%. Noch nicht speichern.'
          : 'Ersetze den gesamten Editorinhalt durch %ZZ. Noch nicht speichern.',
        invalid === 'invalid-base64'
          ? 'Replace the entire editor contents with %%%not-base64%%%. Do not save.'
          : 'Replace the entire editor contents with %ZZ. Do not save.',
      ],
      editor,
      { prepare: p(), completion: toolValue(invalid) },
    ),
    s(id + '-menu', ['Öffne Werkzeuge', 'Open Tools'], ['Klicke Werkzeuge.', 'Click Tools.'], c('file-tools'), {
      prepare: p('codec-base', { draft: invalid }),
      completion: element(toolGroup('codecs')),
    }),
    s(
      id + '-group',
      ['Öffne Base64 und URL-Encoding', 'Open Base64 and URL encoding'],
      [
        'Klicke die Kodierungsgruppe. Die ungültige Eingabe soll weiterhin im Editor stehen.',
        'Click the codec group. The invalid input should still be in the editor.',
      ],
      toolGroup('codecs'),
      { prepare: p('codec-base', { draft: invalid, menu: true }), completion: element(tool(toolId)) },
    ),
    s(
      id + '-try',
      ['Versuche die Eingabe zu dekodieren', 'Try decoding the input'],
      [
        'Klicke das hervorgehobene Dekodierwerkzeug. Erwartet wird ein Fehler und derselbe Editorinhalt. Eine bereits sichtbare Fehlermeldung allein schließt diesen Schritt nicht ab.',
        'Click the highlighted decode tool. Expect an error and unchanged editor contents. An already visible error alone does not complete this step.',
      ],
      tool(toolId),
      { prepare: p('codec-base', { draft: invalid, group: 'codecs' }), completion: unchangedError(invalid, toolId, message) },
    ),
    s(
      id + '-repair',
      ['Stelle den ursprünglichen Text wieder her', 'Restore the original text'],
      [
        'Ersetze den Editorinhalt wieder durch Café & OGC mit einem abschließenden Zeilenumbruch. Weil die gespeicherte Datei noch genau diesen Text enthält, verschwindet der Stern ohne Speichern.',
        'Replace the editor contents with Café & OGC and a final line break. Since the saved file still contains exactly this text, the asterisk disappears without saving.',
      ],
      editor,
      {
        prepare: p('codec-base', { draft: invalid }),
        completion: { kind: 'all', conditions: [toolValue('codec-base'), element(`${viewer}[data-dirty="false"]`)] },
      },
    ),
  ];
}
export const TUTORIAL_CODECS_DOCUMENT: TutorialChapter = {
  id: 'codecs-document',
  section: 'repo',
  title: ['Ganze Dokumente mit Base64 und URL-Encoding umwandeln', 'Convert whole documents with Base64 and URL encoding'],
  description: [
    'Alle vier Werkzeuge verwenden, speichern, zurückdekodieren und mit ungültigen Eingaben umgehen.',
    'Use all four tools, save, decode back and handle invalid input.',
  ],
  question: ['Wie kodiere und dekodiere ich Text als Base64 oder URL-Bestandteil?', 'How do I encode and decode text as Base64 or a URL component?'],
  keywords: 'base64 url encoding codieren kodieren dekodieren decodieren percent prozent fehler invalid unicode utf8',
  steps: [
    s(
      'overview',
      ['Kodierung von Textzeichen praktisch ausprobieren', 'Practice encoding text characters'],
      [
        'Das frische Beispiel enthält Café & OGC und einen Zeilenumbruch. Wir wandeln es vollständig um, speichern und stellen es wieder her. Alle Aktionen bleiben im Lernprojekt.',
        'The fresh example contains Café & OGC and a line break. We will convert it completely, save and restore it. All actions stay within the learning project.',
      ],
      row(),
      { continue: false },
    ),
    s('open', ['Öffne README.md', 'Open README.md'], ['Klicke README.md im Dateibaum.', 'Click README.md in the tree.'], row(), {
      completion: element(`${viewer} ${editor}`),
    }),
    s(
      'scope',
      ['Ohne Auswahl wird das ganze Dokument verarbeitet', 'No selection means the whole document'],
      [
        'Ein Textcursor ohne Markierung bedeutet bei diesen Werkzeugen: das gesamte Dokument verarbeiten. Eine markierte Auswahl begrenzt die Aktion; dafür gibt es eine eigene Lektion.',
        'With a cursor and no highlighted range, these tools process the whole document. A highlighted selection limits the action and has its own lesson.',
      ],
      editor,
      { prepare: p() },
    ),
    ...operations.flatMap(operationSteps),
    ...errorSteps('bad-base64', 'invalid-base64', 'base64-decode', BASE64_DECODE_ERROR),
    ...errorSteps('bad-url', 'invalid-url', 'url-decode', URL_DECODE_ERROR),
    s(
      'close',
      ['Schließe die Textdatei', 'Close the text file'],
      [
        'Klicke das X des Datei-Viewers. Der ursprüngliche Text ist vollständig wiederhergestellt.',
        'Click the file viewer’s X. The original text has been fully restored.',
      ],
      c('close-file'),
      { prepare: p(), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Umwandlung, Speichern und Fehler unterscheiden', 'Distinguish conversion, saving and errors'],
      [
        'Du hast alle vier Kodierungswerkzeuge verwendet und ihre Ergebnisse gespeichert. Fehlversuche haben den Text erhalten. Die nächste Lektion begrenzt dieselben Werkzeuge auf eine Auswahl.',
        'You used all four codec tools and saved their results. Failed attempts preserved the text. The next lesson limits the same tools to a selection.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'README.md', content: toolContent('codec-base') }] } },
    ),
  ].flatMap(withTextViewSteps({ open: 'README.md' })),
};
