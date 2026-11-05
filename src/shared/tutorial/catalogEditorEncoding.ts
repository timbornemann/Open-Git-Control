import type { TutorialChapter } from './types';
import type { TextFileEncodingDto } from '../ipc/contracts/git';
import { encodingStep as s, toolRecipe, toolContent, savedTool, tool, toolGroup, c, row, viewer, editor, element } from './toolLessonHelpers';
const p = (encoding: TextFileEncodingDto = 'utf8', options: Parameters<typeof toolRecipe>[1] = {}) => toolRecipe('encoding', { encoding, ...options });
export const TUTORIAL_EDITOR_ENCODING: TutorialChapter = {
  id: 'editor-encoding',
  section: 'repo',
  title: ['Dateikodierung verstehen und wechseln', 'Understand and change file encoding'],
  description: [
    'UTF-8, BOM und Latin-1 wählen, Entwurf und Datei unterscheiden, speichern und erneut öffnen.',
    'Select UTF-8, BOM and Latin-1, distinguish drafts from files, save and reopen.',
  ],
  question: ['Wie ändere ich die Kodierung einer Datei?', 'How do I change a file’s encoding?'],
  keywords: 'encoding kodierung utf-8 bom latin1 bytes größe dateiformat',
  steps: [
    s(
      'overview',
      ['Kodierung bestimmt die gespeicherten Bytes', 'Encoding determines the saved bytes'],
      [
        'Wir bearbeiten eine Datei mit Café, Leerzeichen und Tabulator. Der sichtbare Text bleibt bei Kodierungswechseln gleich; die gespeicherten Bytes und ihre Größe können sich ändern.',
        'We will use a file containing Café, spaces and a tab. Encoding changes can preserve the visible text while changing its saved bytes and size.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne README.md', 'Open README.md'],
      [
        'Klicke README.md im Dateibaum. Das Beispiel beginnt als UTF-8 mit LF-Zeilenenden.',
        'Click README.md in the tree. The example starts as UTF-8 with LF line endings.',
      ],
      row(),
      { completion: element(`${viewer} ${editor}`) },
    ),
    s(
      'status',
      ['Lies die Kodierung in der Statusleiste', 'Read the encoding in the status bar'],
      [
        'Unten steht UTF-8. Die Größe beschreibt die Bytes des aktuellen Editorinhalts einschließlich der gewählten Kodierung und Zeilenenden. Zeichenanzahl und Bytegröße können sich unterscheiden.',
        'The status bar shows UTF-8. Size describes the current editor contents in the selected encoding and line endings. Character count can differ from byte size.',
      ],
      '.working-file-viewer__status',
      { prepare: p() },
    ),
    s(
      'scope',
      ['Werkzeuge verändern zunächst den Entwurf', 'Tools initially change the draft'],
      [
        'Eine Ziel-Kodierung wird erst beim Speichern auf die Arbeitsdatei angewendet. Der Index und die bestehenden Commits bleiben dabei unverändert. Wir üben drei Kodierungswechsel einzeln.',
        'A target encoding reaches the working file only when you save. The index and existing commits remain unchanged. We will practice three encoding changes individually.',
      ],
      c('file-tools'),
      { prepare: p() },
    ),
    s(
      'bom-purpose',
      ['UTF-8 BOM kennenlernen', 'Understand UTF-8 BOM'],
      [
        'UTF-8 BOM ergänzt vor dem Text drei Kennungsbytes. Diese sind im normalen Editor nicht als Text sichtbar. Die Schriftzeichen bleiben gleich; die Bytegröße wächst um drei.',
        'UTF-8 BOM adds three identifying bytes before the text. The normal editor does not display them as text. The characters stay the same, while size grows by three bytes.',
      ],
      c('file-tools'),
      { prepare: p('utf8') },
    ),
    s(
      'bom-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      [
        'Klicke Werkzeuge in der Kopfzeile des Datei-Viewers. Die Gruppen ordnen Aktionen nach ihrem Zweck.',
        'Click Tools in the file viewer header. Groups organize actions by their purpose.',
      ],
      c('file-tools'),
      { prepare: p('utf8'), completion: element(toolGroup('encoding')) },
    ),
    s(
      'bom-group',
      ['Öffne Encoding und Zeilenenden', 'Open encoding and line endings'],
      [
        'Klicke die Gruppe Encoding und Zeilenenden. Ein Haken kennzeichnet die aktuelle Auswahl des Editors.',
        'Click the encoding and line endings group. A check mark identifies the editor’s current selection.',
      ],
      toolGroup('encoding'),
      { prepare: p('utf8', { menu: true }), completion: element(tool('utf8-bom')) },
    ),
    s(
      'bom-choose',
      ['Wähle UTF-8 BOM', 'Select UTF-8 BOM'],
      [
        'Klicke UTF-8 BOM. Die Statusleiste soll die neue Ziel-Kodierung zeigen. Der Stern kennzeichnet jetzt eine noch ungespeicherte Änderung.',
        'Click UTF-8 BOM. The status bar should show the new target encoding. The asterisk now marks an unsaved change.',
      ],
      tool('utf8-bom'),
      { prepare: p('utf8', { group: 'encoding' }), completion: element(`${viewer}[data-encoding="utf8-bom"][data-dirty="true"]`) },
    ),
    s(
      'bom-draft',
      ['Gleicher Text, andere Ziel-Kodierung', 'Same text, different target encoding'],
      [
        'Der Text wurde nicht umgeschrieben. Speichern wird trotzdem verfügbar, weil sich die Kodierung des Entwurfs geändert hat. Die Arbeitsdatei hat noch ihre vorherige Kodierung.',
        'The text was not rewritten. Save is still available because the draft’s encoding changed. The working file retains its previous encoding until saving.',
      ],
      '.working-file-viewer__status',
      { prepare: p('utf8', { choose: 'utf8-bom' }) },
    ),
    s(
      'bom-save',
      ['Speichere UTF-8 BOM', 'Save UTF-8 BOM'],
      [
        'Klicke Arbeitsdatei speichern. Der Stern soll verschwinden. Der Index bleibt in seiner ursprünglichen UTF-8-Kodierung.',
        'Click Save working file. The asterisk should disappear. The index keeps its original UTF-8 encoding.',
      ],
      c('save-file'),
      { prepare: p('utf8', { choose: 'utf8-bom' }), completion: savedTool('encoding', 'utf8-bom', 'lf') },
    ),
    s(
      'bom-saved',
      ['Die Kodierung ist jetzt gespeichert', 'The encoding is now saved'],
      [
        'Die Statusleiste und die gespeicherte Datei verwenden jetzt UTF-8 BOM. Vormerken und Committen wären zusätzliche Schritte. In dieser Lektion ändern wir nur die Arbeitsdatei.',
        'The status bar and saved file now use UTF-8 BOM. Staging and committing would be additional actions. This lesson changes only the working file.',
      ],
      '.working-file-viewer__status',
      { prepare: p('utf8-bom') },
    ),
    s(
      'close-bom',
      ['Schließe die gespeicherte Datei', 'Close the saved file'],
      [
        'Klicke das X des Datei-Viewers. Danach öffnen wir sie erneut, um die gespeicherte Kodierung einzulesen.',
        'Click the file viewer’s X. We will reopen it to read the saved encoding.',
      ],
      c('close-file'),
      { prepare: p('utf8-bom'), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'reopen-bom',
      ['Öffne die Datei erneut', 'Reopen the file'],
      [
        'Klicke README.md. Die Statusleiste soll weiterhin UTF-8 BOM anzeigen. Diese Angabe wird aus den gespeicherten Bytes erkannt.',
        'Click README.md. The status bar should still show UTF-8 BOM, detected from the saved bytes.',
      ],
      row(),
      {
        prepare: { edits: [{ path: 'README.md', content: toolContent('encoding'), encoding: 'utf8-bom' }] },
        completion: element(`${viewer}[data-encoding="utf8-bom"] ${editor}`),
      },
    ),
    s(
      'latin-purpose',
      ['Latin-1 kennenlernen', 'Understand Latin-1'],
      [
        'Latin-1 kann nur Zeichen bis U+00FF speichern; etwa Café ist darstellbar, ein Raketen-Emoji dagegen nicht. Ungeeignete Zeichen werden vor einer Umstellung abgewiesen.',
        'Latin-1 represents only characters up to U+00FF: Café is supported, but a rocket emoji is not. Unsupported characters are rejected before conversion.',
      ],
      c('file-tools'),
      { prepare: p('utf8-bom') },
    ),
    s(
      'latin-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      [
        'Klicke Werkzeuge in der Kopfzeile des Datei-Viewers. Die Gruppen ordnen Aktionen nach ihrem Zweck.',
        'Click Tools in the file viewer header. Groups organize actions by their purpose.',
      ],
      c('file-tools'),
      { prepare: p('utf8-bom'), completion: element(toolGroup('encoding')) },
    ),
    s(
      'latin-group',
      ['Öffne Encoding und Zeilenenden', 'Open encoding and line endings'],
      [
        'Klicke die Gruppe Encoding und Zeilenenden. Ein Haken kennzeichnet die aktuelle Auswahl des Editors.',
        'Click the encoding and line endings group. A check mark identifies the editor’s current selection.',
      ],
      toolGroup('encoding'),
      { prepare: p('utf8-bom', { menu: true }), completion: element(tool('latin1')) },
    ),
    s(
      'latin-choose',
      ['Wähle Latin-1', 'Select Latin-1'],
      [
        'Klicke Latin-1. Die Statusleiste soll die neue Ziel-Kodierung zeigen. Der Stern kennzeichnet jetzt eine noch ungespeicherte Änderung.',
        'Click Latin-1. The status bar should show the new target encoding. The asterisk now marks an unsaved change.',
      ],
      tool('latin1'),
      { prepare: p('utf8-bom', { group: 'encoding' }), completion: element(`${viewer}[data-encoding="latin1"][data-dirty="true"]`) },
    ),
    s(
      'latin-draft',
      ['Gleicher Text, andere Ziel-Kodierung', 'Same text, different target encoding'],
      [
        'Der Text wurde nicht umgeschrieben. Speichern wird trotzdem verfügbar, weil sich die Kodierung des Entwurfs geändert hat. Die Arbeitsdatei hat noch ihre vorherige Kodierung.',
        'The text was not rewritten. Save is still available because the draft’s encoding changed. The working file retains its previous encoding until saving.',
      ],
      '.working-file-viewer__status',
      { prepare: p('utf8-bom', { choose: 'latin1' }) },
    ),
    s(
      'latin-save',
      ['Speichere Latin-1', 'Save Latin-1'],
      [
        'Klicke Arbeitsdatei speichern. Der Stern soll verschwinden. Der Index bleibt in seiner ursprünglichen UTF-8-Kodierung.',
        'Click Save working file. The asterisk should disappear. The index keeps its original UTF-8 encoding.',
      ],
      c('save-file'),
      { prepare: p('utf8-bom', { choose: 'latin1' }), completion: savedTool('encoding', 'latin1', 'lf') },
    ),
    s(
      'latin-saved',
      ['Die Kodierung ist jetzt gespeichert', 'The encoding is now saved'],
      [
        'Die Statusleiste und die gespeicherte Datei verwenden jetzt Latin-1. Vormerken und Committen wären zusätzliche Schritte. In dieser Lektion ändern wir nur die Arbeitsdatei.',
        'The status bar and saved file now use Latin-1. Staging and committing would be additional actions. This lesson changes only the working file.',
      ],
      '.working-file-viewer__status',
      { prepare: p('latin1') },
    ),
    s(
      'utf8-purpose',
      ['UTF-8 kennenlernen', 'Understand UTF-8'],
      [
        'UTF-8 kann auch Zeichen außerhalb von Latin-1 darstellen. Wir kehren jetzt zur ursprünglichen Kodierung zurück. Gleicher Inhalt, gleiche Zeilenenden und gleiche Kodierung ergeben wieder die ursprünglichen Bytes.',
        'UTF-8 also supports characters outside Latin-1. We will return to the original encoding. The same content, line endings and encoding reproduce the original bytes.',
      ],
      c('file-tools'),
      { prepare: p('latin1') },
    ),
    s(
      'utf8-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      [
        'Klicke Werkzeuge in der Kopfzeile des Datei-Viewers. Die Gruppen ordnen Aktionen nach ihrem Zweck.',
        'Click Tools in the file viewer header. Groups organize actions by their purpose.',
      ],
      c('file-tools'),
      { prepare: p('latin1'), completion: element(toolGroup('encoding')) },
    ),
    s(
      'utf8-group',
      ['Öffne Encoding und Zeilenenden', 'Open encoding and line endings'],
      [
        'Klicke die Gruppe Encoding und Zeilenenden. Ein Haken kennzeichnet die aktuelle Auswahl des Editors.',
        'Click the encoding and line endings group. A check mark identifies the editor’s current selection.',
      ],
      toolGroup('encoding'),
      { prepare: p('latin1', { menu: true }), completion: element(tool('utf8')) },
    ),
    s(
      'utf8-choose',
      ['Wähle UTF-8', 'Select UTF-8'],
      [
        'Klicke UTF-8. Die Statusleiste soll die neue Ziel-Kodierung zeigen. Der Stern kennzeichnet jetzt eine noch ungespeicherte Änderung.',
        'Click UTF-8. The status bar should show the new target encoding. The asterisk now marks an unsaved change.',
      ],
      tool('utf8'),
      { prepare: p('latin1', { group: 'encoding' }), completion: element(`${viewer}[data-encoding="utf8"][data-dirty="true"]`) },
    ),
    s(
      'utf8-draft',
      ['Gleicher Text, andere Ziel-Kodierung', 'Same text, different target encoding'],
      [
        'Der Text wurde nicht umgeschrieben. Speichern wird trotzdem verfügbar, weil sich die Kodierung des Entwurfs geändert hat. Die Arbeitsdatei hat noch ihre vorherige Kodierung.',
        'The text was not rewritten. Save is still available because the draft’s encoding changed. The working file retains its previous encoding until saving.',
      ],
      '.working-file-viewer__status',
      { prepare: p('latin1', { choose: 'utf8' }) },
    ),
    s(
      'utf8-save',
      ['Speichere UTF-8', 'Save UTF-8'],
      [
        'Klicke Arbeitsdatei speichern. Der Stern soll verschwinden. Der Index bleibt in seiner ursprünglichen UTF-8-Kodierung.',
        'Click Save working file. The asterisk should disappear. The index keeps its original UTF-8 encoding.',
      ],
      c('save-file'),
      { prepare: p('latin1', { choose: 'utf8' }), completion: savedTool('encoding', 'utf8', 'lf') },
    ),
    s(
      'utf8-saved',
      ['Die Kodierung ist jetzt gespeichert', 'The encoding is now saved'],
      [
        'Die Statusleiste und die gespeicherte Datei verwenden jetzt UTF-8. Vormerken und Committen wären zusätzliche Schritte. In dieser Lektion ändern wir nur die Arbeitsdatei.',
        'The status bar and saved file now use UTF-8. Staging and committing would be additional actions. This lesson changes only the working file.',
      ],
      '.working-file-viewer__status',
      { prepare: p('utf8') },
    ),
    s(
      'close',
      ['Schließe die Datei', 'Close the file'],
      [
        'Klicke das X. Die Datei ist wieder als UTF-8 mit LF gespeichert; sie entspricht dem ursprünglichen Index.',
        'Click X. The file is saved as UTF-8 with LF again, matching the original index.',
      ],
      c('close-file'),
      { prepare: p(), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Kodierung ist Teil des Speicherformats', 'Encoding is part of the file format'],
      [
        'Du hast UTF-8 BOM gespeichert, erneut eingelesen, Latin-1 verwendet und UTF-8 wiederhergestellt. Die folgende Lektion behandelt Zeilenenden und die Anzeige unsichtbarer Zeichen.',
        'You saved and reopened UTF-8 BOM, used Latin-1 and restored UTF-8. The next lesson covers line endings and displaying invisible characters.',
      ],
      c('open-files'),
      {},
    ),
  ],
};
