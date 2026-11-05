import type { TutorialChapter } from './types';
import { encodingStep as s, toolRecipe, toolContent, savedTool, tool, toolGroup, c, row, viewer, editor, element } from './toolLessonHelpers';
const p = (options: Parameters<typeof toolRecipe>[1] = {}) => toolRecipe('encoding', options);
const crlf = (options: Parameters<typeof toolRecipe>[1] = {}) => toolRecipe('encoding-crlf', options);
export const TUTORIAL_EDITOR_LINE_ENDINGS: TutorialChapter = {
  id: 'editor-line-endings',
  section: 'repo',
  title: ['LF, CRLF und unsichtbare Zeichen', 'LF, CRLF and invisible characters'],
  description: [
    'Zeilenenden als Entwurf ändern, speichern, neu erkennen und Leerzeichenmarkierungen bedienen.',
    'Change line endings in a draft, save, detect them again and toggle whitespace markers.',
  ],
  question: ['Wie ändere ich Zeilenenden und zeige Leerzeichen an?', 'How do I change line endings and show whitespace?'],
  keywords: 'lf crlf zeilenenden line endings leerzeichen whitespace tabulator unsichtbare zeichen',
  steps: [
    s(
      'overview',
      ['Zeilenenden sind gespeicherte Zeichen', 'Line endings are stored characters'],
      [
        'LF verwendet ein Byte pro Zeilenumbruch; CRLF verwendet zwei. Der Editor kann beide ähnlich darstellen. Wir wechseln die Zeilenenden, speichern und lesen sie erneut ein.',
        'LF uses one byte per line ending; CRLF uses two. The editor may display both similarly. We will change, save and reopen line endings.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne die Beispieldatei', 'Open the sample file'],
      [
        'Klicke README.md. Die Datei enthält Café und eine eingerückte Zeile mit einem Tabulator. Sie beginnt mit UTF-8 und LF.',
        'Click README.md. The file contains Café and an indented line with a tab. It starts as UTF-8 with LF.',
      ],
      row(),
      { completion: element(`${viewer} ${editor}`) },
    ),
    s(
      'status',
      ['Lies LF und die Inhaltsgröße', 'Read LF and the content size'],
      [
        'Unten steht LF. Die Bytezahl berücksichtigt die Zeilenenden. Wenn wir beide Umbrüche auf CRLF ändern, steigt sie um zwei Bytes, obwohl die Zeilen gleich aussehen.',
        'The status bar shows LF. Byte size includes line endings. Changing both endings to CRLF increases it by two bytes even though the lines look the same.',
      ],
      '.working-file-viewer__status',
      { prepare: p() },
    ),
    s(
      'crlf-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      [
        'Klicke Werkzeuge im Datei-Viewer. Zeilenenden werden in derselben Gruppe wie die Kodierung eingestellt.',
        'Click Tools in the file viewer. Line endings are configured in the same group as encoding.',
      ],
      c('file-tools'),
      { prepare: p(), completion: element(toolGroup('encoding')) },
    ),
    s(
      'crlf-group',
      ['Öffne die Kodierungsgruppe', 'Open the encoding group'],
      [
        'Klicke Encoding und Zeilenenden. Die Auswahl enthält LF, CRLF und die Anzeige unsichtbarer Zeichen.',
        'Click Encoding and line endings. The choices include LF, CRLF and the display of invisible characters.',
      ],
      toolGroup('encoding'),
      { prepare: p({ menu: true }), completion: element(tool('crlf')) },
    ),
    s(
      'crlf-choose',
      ['Wähle CRLF', 'Select CRLF'],
      [
        'Klicke Zeilenenden: CRLF. Die Statusleiste soll CRLF anzeigen; der Stern macht die ungespeicherte Formatänderung sichtbar.',
        'Click Line endings: CRLF. The status bar should show CRLF, and the asterisk marks the unsaved format change.',
      ],
      tool('crlf'),
      { prepare: p({ group: 'encoding' }), completion: element(`${viewer}[data-line-ending="crlf"][data-dirty="true"]`) },
    ),
    s(
      'crlf-draft',
      ['Gleiche Zeilen, andere gespeicherte Umbrüche', 'Same lines, different stored endings'],
      [
        'Die Textzeilen bleiben gleich. Bisher wurde nur das Zielformat des Entwurfs geändert; in der Arbeitsdatei stehen noch LF-Umbrüche.',
        'The text lines stay the same. Only the draft’s target format changed so far; the working file still contains LF endings.',
      ],
      '.working-file-viewer__status',
      { prepare: p({ choose: 'crlf' }) },
    ),
    s(
      'crlf-save',
      ['Speichere die CRLF-Fassung', 'Save the CRLF version'],
      [
        'Klicke Arbeitsdatei speichern. Alle Zeilenenden werden als CRLF geschrieben. Der Index bleibt bei UTF-8 mit LF.',
        'Click Save working file. All line endings are written as CRLF. The index remains UTF-8 with LF.',
      ],
      c('save-file'),
      { prepare: p({ choose: 'crlf' }), completion: savedTool('encoding-crlf', 'utf8', 'crlf') },
    ),
    s(
      'close-crlf',
      ['Schließe die gespeicherte Fassung', 'Close the saved version'],
      [
        'Klicke das X. Wir lesen danach die Datei neu ein, damit die erkannte Zeilenendeneinstellung geprüft wird.',
        'Click X. We will reread the file to check the detected line endings.',
      ],
      c('close-file'),
      { prepare: crlf(), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'reopen-crlf',
      ['Öffne README.md erneut', 'Reopen README.md'],
      [
        'Klicke README.md. Die Statusleiste soll weiterhin CRLF anzeigen. Die Einstellung stammt jetzt aus den gespeicherten Dateibytes.',
        'Click README.md. The status bar should still show CRLF, now detected from the saved file bytes.',
      ],
      row(),
      {
        prepare: { edits: [{ path: 'README.md', content: toolContent('encoding-crlf') }] },
        completion: element(`${viewer}[data-line-ending="crlf"] ${editor}`),
      },
    ),
    s(
      'lf-purpose',
      ['Zurück zu den ursprünglichen Bytes', 'Return to the original bytes'],
      [
        'Wir stellen jetzt LF wieder her. Da Text und Kodierung unverändert sind, soll die Datei nach dem Speichern wieder genau dem Index entsprechen.',
        'We will restore LF. Because the text and encoding are unchanged, saving should make the file match the index again.',
      ],
      c('file-tools'),
      { prepare: crlf() },
    ),
    s('lf-menu', ['Öffne Werkzeuge erneut', 'Open Tools again'], ['Klicke Werkzeuge.', 'Click Tools.'], c('file-tools'), {
      prepare: crlf(),
      completion: element(toolGroup('encoding')),
    }),
    s(
      'lf-group',
      ['Öffne Encoding und Zeilenenden', 'Open Encoding and line endings'],
      ['Klicke die Kodierungsgruppe. CRLF ist aktuell ausgewählt.', 'Click the encoding group. CRLF is currently selected.'],
      toolGroup('encoding'),
      { prepare: crlf({ menu: true }), completion: element(tool('lf')) },
    ),
    s(
      'lf-choose',
      ['Wähle LF', 'Select LF'],
      ['Klicke Zeilenenden: LF. Die neue Auswahl bleibt bis zum Speichern ein Entwurf.', 'Click Line endings: LF. The new choice stays a draft until saving.'],
      tool('lf'),
      { prepare: crlf({ group: 'encoding' }), completion: element(`${viewer}[data-line-ending="lf"][data-dirty="true"]`) },
    ),
    s(
      'lf-save',
      ['Speichere wieder mit LF', 'Save with LF again'],
      [
        'Klicke Arbeitsdatei speichern. Die ursprünglichen LF-Bytes werden wiederhergestellt; in Git entsteht dadurch keine verbleibende Änderung.',
        'Click Save working file. The original LF bytes are restored, leaving no remaining Git change.',
      ],
      c('save-file'),
      {
        prepare: crlf({ choose: 'lf' }),
        completion: { kind: 'all', conditions: [savedTool('encoding', 'utf8', 'lf'), { kind: 'working-tree', staged: [], unstaged: [], untracked: [] }] },
      },
    ),
    s(
      'whitespace-purpose',
      ['Leerzeichen und Tabulatoren sichtbar machen', 'Make spaces and tabs visible'],
      [
        'Die zweite Zeile beginnt mit zwei Leerzeichen und enthält einen Tabulator zwischen OGC und Tutor. Ihre sichtbaren Markierungen helfen beim Prüfen von Einrückungen, ohne Text zu ändern.',
        'The second line starts with two spaces and contains a tab between OGC and Tutor. Visible markers help inspect indentation without changing the text.',
      ],
      c('file-tools'),
      { prepare: p() },
    ),
    s(
      'whitespace-menu',
      ['Öffne die Werkzeuge', 'Open Tools'],
      [
        'Klicke Werkzeuge. Die Anzeige ist eine Ansichtsoption und braucht kein Speichern.',
        'Click Tools. Displaying markers is a view option and requires no save.',
      ],
      c('file-tools'),
      { prepare: p(), completion: element(toolGroup('encoding')) },
    ),
    s(
      'whitespace-group',
      ['Öffne die Kodierungsgruppe', 'Open the encoding group'],
      [
        'Klicke Encoding und Zeilenenden. Unten findest du Unsichtbare Zeichen anzeigen.',
        'Click Encoding and line endings. Show invisible characters is near the bottom.',
      ],
      toolGroup('encoding'),
      { prepare: p({ menu: true }), completion: element(tool('whitespace')) },
    ),
    s(
      'show-whitespace',
      ['Zeige die unsichtbaren Zeichen', 'Show invisible characters'],
      [
        'Klicke Unsichtbare Zeichen anzeigen. Im Editor sollen Punkte für Leerzeichen und eine Markierung für den Tabulator erscheinen.',
        'Click Show invisible characters. The editor should display dots for spaces and a marker for the tab.',
      ],
      tool('whitespace'),
      { prepare: p({ group: 'encoding' }), completion: element(`${viewer}[data-whitespace="true"][data-dirty="false"]`) },
    ),
    s(
      'whitespace-result',
      ['Die Markierungen gehören zur Ansicht', 'The markers belong to the view'],
      [
        'Die Zeichen im Text bleiben gleich. Der Stern erscheint nicht und Speichern bleibt gesperrt. Git bekommt durch die sichtbaren Markierungen keine Änderung.',
        'The text characters remain the same. No asterisk appears and Save stays disabled. Showing markers does not create a Git change.',
      ],
      editor,
      { prepare: p({ whitespace: true }) },
    ),
    s(
      'hide-menu',
      ['Öffne Werkzeuge noch einmal', 'Open Tools once more'],
      ['Wir schalten die Markierungen zum Abschluss wieder aus. Klicke Werkzeuge.', 'We will switch the markers off again. Click Tools.'],
      c('file-tools'),
      { prepare: p({ whitespace: true }), completion: element(toolGroup('encoding')) },
    ),
    s(
      'hide-group',
      ['Öffne Encoding und Zeilenenden', 'Open Encoding and line endings'],
      [
        'Klicke die Kodierungsgruppe. Der Haken bei Unsichtbare Zeichen zeigt, dass die Markierungen aktiv sind.',
        'Click the encoding group. A check mark shows that invisible-character markers are enabled.',
      ],
      toolGroup('encoding'),
      { prepare: p({ whitespace: true, menu: true }), completion: element(tool('whitespace')) },
    ),
    s(
      'hide-whitespace',
      ['Blende die Markierungen aus', 'Hide the markers'],
      [
        'Klicke Unsichtbare Zeichen anzeigen erneut. Nur die Darstellung ändert sich zurück; die Datei bleibt unverändert.',
        'Click Show invisible characters again. Only the display returns to its previous state; the file remains unchanged.',
      ],
      tool('whitespace'),
      { prepare: p({ whitespace: true, group: 'encoding' }), completion: element(`${viewer}[data-whitespace="false"][data-dirty="false"]`) },
    ),
    s('close', ['Schließe die Datei', 'Close the file'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p(),
      completion: { kind: 'absent', selector: viewer },
    }),
    s(
      'finish',
      ['Format und Anzeige unterscheiden', 'Distinguish format from display'],
      [
        'Du hast CRLF gespeichert und erneut erkannt, LF wiederhergestellt und Leerzeichen sichtbar gemacht. Zeilenenden verändern gespeicherte Bytes; die Markierungen verändern nur die Ansicht.',
        'You saved and reopened CRLF, restored LF and displayed whitespace. Line endings change stored bytes, while markers change only the view.',
      ],
      c('open-files'),
      {},
    ),
  ],
};
