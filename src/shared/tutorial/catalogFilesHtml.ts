import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import { formatStep as s, formatRecipe as recipe, formatViewer, formatValue, formatSaved, c, row, tab, editor, element } from './formatLessonHelpers';
const p = (options: Parameters<typeof recipe>[1] = {}) => recipe('html', options);
const viewer = formatViewer('html');
export const TUTORIAL_FILES_HTML: TutorialChapter = {
  id: 'formats-html',
  section: 'repo',
  title: ['HTML mit lokalen Dateien in der Vorschau prüfen', 'Preview HTML with local files'],
  description: [
    'HTML-Struktur, lokale CSS-Datei, isolierte Vorschau, Entwurf und genauer Diff.',
    'HTML structure, local CSS, isolated preview, drafts and exact diffs.',
  ],
  question: ['Wie zeige ich eine HTML-Seite in der Vorschau an?', 'How do I preview an HTML page?'],
  keywords: 'html css vorschau preview web seite sandbox dateiquelle source',
  steps: [
    s(
      'overview',
      ['HTML als lokale Seite prüfen', 'Inspect HTML as a local page'],
      [
        'Wir öffnen eine kleine HTML-Seite mit einer lokalen CSS-Datei, untersuchen die Vorschau und ändern ihre Überschrift. Dafür wird weder ein Webserver noch eine Internetverbindung benötigt.',
        'We will open a small HTML page with local CSS, inspect its preview and edit its heading. No web server or Internet connection is needed.',
      ],
      row('site'),
      { continue: false },
    ),
    s(
      'expand',
      ['Öffne den Ordner site', 'Expand the site folder'],
      [
        'Klicke site. index.html enthält die Seite; style.css enthält ihre Farben und Abstände. Beide Dateien gehören zum Beispielrepository.',
        'Click site. index.html contains the page, and style.css defines its colors and spacing. Both files belong to the sample repository.',
      ],
      row('site'),
      { completion: element(row('site/index.html')) },
    ),
    s(
      'open',
      ['Öffne index.html', 'Open index.html'],
      [
        'Klicke index.html im Projektbaum. Die Textansicht zeigt das HTML-Dokument mit head und body.',
        'Click index.html in the tree. Text shows the HTML document with head and body.',
      ],
      row('site/index.html'),
      { prepare: { click: [row('site')] }, completion: element(`${viewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'source',
      ['HTML-Text ist die bearbeitete Quelle', 'HTML text is the edited source'],
      [
        'head enthält Metadaten und den CSS-Verweis. body enthält die sichtbare Überschrift h1 und den Absatz p. Änderungen im Editor werden später als Arbeitsdatei gespeichert.',
        'head contains metadata and the CSS reference. body contains the visible h1 heading and p paragraph. Editor changes can later be saved to the working file.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'assets',
      ['Lokale Dateien gehören zur Vorschau', 'Local files contribute to the preview'],
      [
        'Der Verweis href="style.css" lädt die CSS-Datei aus demselben Beispielordner. Die Vorschau verwendet die gewählte Dateiquelle. In dieser Übung kommt alles aus festen Beispieldaten.',
        'The href="style.css" reference loads CSS from the same sample folder. Preview uses the selected file source. Here every asset comes from fixed sample data.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'preview-purpose',
      ['Vorschau öffnet die gerenderte Seite', 'Preview opens the rendered page'],
      [
        'Die Registerkarte Vorschau stellt die Seite im Datei-Viewer dar. So prüfst du Struktur und Gestaltung, ohne den Projektordner in einem externen Browser zu öffnen.',
        'Preview renders the page inside the file viewer. It lets you check structure and styling without opening the project folder in an external browser.',
      ],
      tab('preview'),
      { prepare: p() },
    ),
    s(
      'open-preview',
      ['Öffne die HTML-Vorschau', 'Open the HTML preview'],
      [
        'Klicke Vorschau. Die Seite soll eine blaue Überschrift auf hellblauem Hintergrund anzeigen.',
        'Click Preview. The page should display a blue heading on a light-blue background.',
      ],
      tab('preview'),
      { prepare: p(), completion: element('.working-file-viewer__html-frame[src^="ogc-html-preview:"]') },
    ),
    s(
      'rendered',
      ['Inhalt und Gestaltung zusammen prüfen', 'Check content and styling together'],
      [
        'Du siehst Hallo Lernprojekt und einen Absatz. Hintergrund, Schrift und Abstände stammen aus style.css. Die Darstellung ist eine Vorschau; keine Datei wird dadurch gespeichert.',
        'You see Hello learning project and a paragraph. The background, font and spacing come from style.css. Rendering is a preview and does not save a file.',
      ],
      '.working-file-viewer__html-frame',
      { prepare: p({ tab: 'preview' }) },
    ),
    s(
      'isolation',
      ['Die Seite läuft in einer isolierten Vorschau', 'The page runs in an isolated preview'],
      [
        'Die HTML-Seite hat keinen Zugriff auf App-Daten und kann hier keine Netzwerkverbindungen öffnen. Die normale Anwendung und dein persönlicher Arbeitsbereich bleiben getrennt von dieser Übung.',
        'The HTML page cannot access app data or open network connections here. The normal application and your personal workspace stay separate from this exercise.',
      ],
      '.working-file-viewer__html-frame',
      { prepare: p({ tab: 'preview' }) },
    ),
    s(
      'back-text',
      ['Wechsle wieder zu Text', 'Switch back to Text'],
      [
        'Klicke Text, um den HTML-Quelltext zu bearbeiten. Die Vorschau selbst ist keine Quelltextbearbeitung.',
        'Click Text to edit the HTML source. The preview itself is not a source editor.',
      ],
      tab('text'),
      { prepare: p({ tab: 'preview' }), completion: element(`${viewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'edit-purpose',
      ['Bearbeite den Inhalt von h1', 'Edit the contents of h1'],
      [
        'Ersetze im nächsten Schritt Hallo Lernprojekt durch Willkommen in unserem Projekt. Die öffnenden und schließenden h1-Tags sowie alle anderen Zeilen bleiben erhalten.',
        'Next replace Hello learning project with Welcome to our project. Keep the opening and closing h1 tags and all other lines.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'edit',
      ['Ändere die Seitenüberschrift', 'Change the page heading'],
      [
        'Schreibe innerhalb von h1 Willkommen in unserem Projekt. Speichere noch nicht; zunächst prüfen wir den Entwurf in der Vorschau.',
        'Write Welcome to our project inside h1. Do not save yet; first we will inspect the draft in Preview.',
      ],
      editor,
      { prepare: p(), completion: formatValue('html-edited') },
    ),
    s(
      'draft',
      ['Der HTML-Entwurf ist noch ungespeichert', 'The HTML draft is still unsaved'],
      [
        'Der Stern zeigt deine Bearbeitung. Die lokale CSS-Datei bleibt unverändert. Auch eine HTML-Vorschau kann den aktuellen Editorentwurf verwenden.',
        'The asterisk marks your edit. The local CSS file is unchanged. An HTML preview can also use the current editor draft.',
      ],
      '.file-viewer-title',
      { prepare: p({ draft: 'html-edited' }) },
    ),
    s(
      'preview-draft',
      ['Öffne die Vorschau des Entwurfs', 'Open the draft preview'],
      [
        'Klicke Vorschau. Die Überschrift soll jetzt Willkommen in unserem Projekt anzeigen; das Aussehen aus style.css bleibt erhalten.',
        'Click Preview. The heading should now display Welcome to our project while retaining the styling from style.css.',
      ],
      tab('preview'),
      { prepare: p({ draft: 'html-edited' }), completion: element('.working-file-viewer__html-frame[src^="ogc-html-preview:"]') },
    ),
    s(
      'draft-result',
      ['Geänderter Text mit derselben Gestaltung', 'Changed text with the same styling'],
      [
        'Prüfe die neue Überschrift und den weiterhin hellblauen Hintergrund. Der Stern bleibt bis zum Speichern sichtbar; ein Ansichtwechsel übernimmt den Entwurf noch nicht in Git.',
        'Check the new heading and the remaining light-blue background. The asterisk stays until saving; switching views does not stage the draft.',
      ],
      '.working-file-viewer__html-frame',
      { prepare: p({ draft: 'html-edited', tab: 'preview' }) },
    ),
    s(
      'save',
      ['Speichere index.html', 'Save index.html'],
      [
        'Klicke Arbeitsdatei speichern. Dadurch wird nur index.html geändert. style.css und der Git-Index behalten ihren bisherigen Inhalt.',
        'Click Save working file. This changes only index.html. style.css and the Git index keep their previous contents.',
      ],
      c('save-file'),
      { prepare: p({ draft: 'html-edited', tab: 'preview' }), completion: formatSaved('html', 'html-edited') },
    ),
    s(
      'diff-purpose',
      ['Diff prüft die gespeicherte Änderung', 'Diff checks the saved change'],
      [
        'Nach der visuellen Prüfung kontrollieren wir den genauen Textunterschied. Der Diff der Arbeitsdatei vergleicht ihren gespeicherten Inhalt mit dem Index.',
        'After checking the rendering, we will inspect the exact text change. A working-file diff compares its saved contents with the index.',
      ],
      tab('diff'),
      { prepare: p({ saved: 'html-edited', tab: 'preview' }) },
    ),
    s(
      'open-diff',
      ['Öffne den HTML-Diff', 'Open the HTML diff'],
      [
        'Klicke Diff. Du solltest die alte h1-Zeile entfernt und die neue h1-Zeile hinzugefügt sehen.',
        'Click Diff. You should see the old h1 line removed and the new h1 line added.',
      ],
      tab('diff'),
      { prepare: p({ saved: 'html-edited', tab: 'preview' }), completion: element(`${viewer}[data-tab="diff"] .diff-content-scroll`) },
    ),
    s(
      'diff-result',
      ['Die Änderung bleibt auf eine Zeile begrenzt', 'The change stays limited to one line'],
      [
        'Rot und Grün zeigen die ersetzte Überschrift. Die HTML-Tags und der CSS-Verweis sind unverändert. So ergänzen sich visuelle Vorschau und Git-Diff.',
        'Red and green show the replaced heading. The HTML tags and CSS reference are unchanged. Visual preview and Git diff complement each other.',
      ],
      '.diff-content-scroll',
      { prepare: p({ saved: 'html-edited', tab: 'diff' }) },
    ),
    s(
      'close',
      ['Schließe die HTML-Datei', 'Close the HTML file'],
      [
        'Klicke das X des Datei-Viewers. Die gespeicherte Änderung bleibt im Arbeitsordner des Lernprojekts.',
        'Click the file viewer’s X. The saved change remains in the learning project’s worktree.',
      ],
      c('close-file'),
      { prepare: p({ saved: 'html-edited', tab: 'diff' }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Quelltext, Vorschau und Diff ergänzen sich', 'Source, Preview and Diff complement each other'],
      [
        'Du hast eine HTML-Seite mit lokalem CSS geprüft, einen Entwurf in der Vorschau betrachtet und die gespeicherte Änderung im Diff kontrolliert. Die nächste Dateilektion behandelt CSV-Tabellen.',
        'You inspected an HTML page with local CSS, previewed a draft and checked its saved change in Diff. The next file lesson covers CSV tables.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'site/index.html', content: { example: 'file-formats', version: 'html-edited' } }] } },
    ),
  ].flatMap(withTextViewSteps({ open: 'site/index.html' })),
};
