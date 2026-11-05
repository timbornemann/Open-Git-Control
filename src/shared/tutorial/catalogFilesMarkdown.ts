import type { TutorialChapter } from './types';
import { formatStep as s, formatRecipe as recipe, formatViewer, formatValue, formatSaved, c, row, tab, editor, element } from './formatLessonHelpers';
const p = (options: Parameters<typeof recipe>[1] = {}) => recipe('markdown', options);
const viewer = formatViewer('markdown');
export const TUTORIAL_FILES_MARKDOWN: TutorialChapter = {
  id: 'formats-markdown',
  section: 'repo',
  title: ['Markdown lesen und Vorschau prüfen', 'Read Markdown and inspect Preview'],
  description: [
    'Überschriften, Listen, Code und Tabellen verstehen; einen Entwurf vor dem Speichern ansehen.',
    'Understand headings, lists, code and tables; preview a draft before saving.',
  ],
  question: ['Wie prüfe ich eine Markdown-Datei in der Vorschau?', 'How do I preview a Markdown file?'],
  keywords: 'markdown vorschau preview dokumentation überschrift heading code tabelle',
  steps: [
    s(
      'overview',
      ['Markdown verbindet Text und Formatierung', 'Markdown combines text and formatting'],
      [
        'Wir öffnen eine Projektanleitung, lesen Überschrift, Liste, Code und Tabelle und ändern anschließend eine Überschrift. Vorschau und gespeicherte Datei werden dabei getrennt geprüft.',
        'We will open a project guide, read its heading, list, code and table, then edit a heading. We will distinguish preview from the saved file.',
      ],
      row('docs'),
      { continue: false },
    ),
    s(
      'expand',
      ['Öffne den Ordner docs', 'Expand the docs folder'],
      [
        'Klicke docs im Projektbaum. Darin liegt guide.md, eine normale Textdatei mit Markdown-Formatierung.',
        'Click docs in the tree. It contains guide.md, a regular text file with Markdown formatting.',
      ],
      row('docs'),
      { completion: element(row('docs/guide.md')) },
    ),
    s(
      'open',
      ['Öffne guide.md', 'Open guide.md'],
      [
        'Klicke guide.md. Die Textansicht zeigt die tatsächlichen Zeichen der Datei, einschließlich #, Sternen und senkrechten Strichen.',
        'Click guide.md. Text shows the actual characters in the file, including #, asterisks and vertical bars.',
      ],
      row('docs/guide.md'),
      { prepare: { click: [row('docs')] }, completion: element(`${viewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'syntax',
      ['Lies die Markdown-Zeichen', 'Read the Markdown syntax'],
      [
        'Ein # kennzeichnet die Hauptüberschrift, ## eine Zwischenüberschrift. Bindestriche beginnen Listeneinträge; doppelte Sterne markieren fett gedruckten Text. Diese Zeichen gehören zur Datei.',
        'One # starts the main heading; ## starts a subheading. Dashes begin list entries, and double asterisks mark bold text. These characters are part of the file.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'preview-purpose',
      ['Vorschau rendert denselben Inhalt', 'Preview renders the same content'],
      [
        'Die Registerkarte Vorschau stellt Markdown formatiert dar. Sie verändert den Text nicht und ist kein Speichern. Wechsle im nächsten Schritt dorthin.',
        'Preview displays formatted Markdown. It neither changes nor saves the text. Switch to that view in the next step.',
      ],
      tab('preview'),
      { prepare: p() },
    ),
    s(
      'open-preview',
      ['Öffne die Vorschau', 'Open Preview'],
      [
        'Klicke Vorschau. Warte, bis die formatierte Anleitung erscheint. Statt Markdown-Zeichen siehst du jetzt Überschriften, Liste und Tabelle.',
        'Click Preview. Wait for the formatted guide to appear. Headings, a list and a table replace the Markdown syntax.',
      ],
      tab('preview'),
      { prepare: p(), completion: element('.markdown-preview-content h1') },
    ),
    s(
      'heading',
      ['Überschriften gliedern die Anleitung', 'Headings structure the guide'],
      [
        'Die große Überschrift stammt aus der Zeile mit #, die kleinere aus ##. Die Vorschau hilft dir, die Lesbarkeit deiner Dokumentation vor dem Commit zu prüfen.',
        'The large heading comes from #, the smaller one from ##. Preview helps you check documentation readability before committing.',
      ],
      '.markdown-preview-content h1',
      { prepare: p({ tab: 'preview' }) },
    ),
    s(
      'emphasis',
      ['Liste und Hervorhebung erkennen', 'Recognize lists and emphasis'],
      [
        'Die beiden Bindestrich-Zeilen erscheinen als Liste. Änderungen ist fett dargestellt, weil das Wort im Quelltext von doppelten Sternen umgeben ist.',
        'The two dashed lines appear as a list. The word changes is bold because the source surrounds it with double asterisks.',
      ],
      '.markdown-preview-content strong',
      { prepare: p({ tab: 'preview' }) },
    ),
    s(
      'code',
      ['Codeblöcke behalten ihre Struktur', 'Code blocks keep their structure'],
      [
        'Drei Backticks begrenzen den Codeblock. git status wird als Beispielbefehl angezeigt. Eine Markdown-Vorschau führt diesen Befehl nicht aus.',
        'Three backticks delimit the code block. git status is displayed as an example command. A Markdown preview does not execute that command.',
      ],
      '.markdown-preview-content pre',
      { prepare: p({ tab: 'preview' }) },
    ),
    s(
      'table',
      ['Eine Markdown-Tabelle lesen', 'Read a Markdown table'],
      [
        'Senkrechte Striche trennen Tabellenzellen; die Strichzeile trennt den Kopf vom Inhalt. Hier ordnet die Tabelle dem Bereich Staging seine Aufgabe zu.',
        'Vertical bars separate cells, and the dashed row separates the header from the contents. Here the table maps Staging to its task.',
      ],
      '.markdown-preview-content table',
      { prepare: p({ tab: 'preview' }) },
    ),
    s(
      'back-text',
      ['Kehre zum Quelltext zurück', 'Return to source text'],
      [
        'Klicke Text. Bearbeitet wird die Markdown-Datei im Editor; die formatierte Vorschau ist eine Darstellung dieses Texts.',
        'Click Text. You edit the Markdown file in the editor; the formatted preview is a rendering of that text.',
      ],
      tab('text'),
      { prepare: p({ tab: 'preview' }), completion: element(`${viewer}[data-tab="text"] ${editor}`) },
    ),
    s(
      'edit-purpose',
      ['Ändere nur die erste Überschrift', 'Change only the first heading'],
      [
        'Ergänze im nächsten Schritt Unser vor Projektleitfaden. Das # und alle übrigen Zeilen bleiben erhalten. So lässt sich die Wirkung einer kleinen Textänderung erkennen.',
        'In the next step add Our before Project guide, using lowercase project. Keep # and all other lines. This makes the effect of one small edit easy to see.',
      ],
      editor,
      { prepare: p() },
    ),
    s(
      'edit',
      ['Schreibe Unser Projektleitfaden', 'Write Our project guide'],
      [
        'Ersetze die erste Zeile durch # Unser Projektleitfaden. Die restliche Anleitung bleibt gleich. Speichere noch nicht.',
        'Replace the first line with # Our project guide. Keep the rest of the guide unchanged. Do not save yet.',
      ],
      editor,
      { prepare: p(), completion: formatValue('markdown-edited') },
    ),
    s(
      'draft',
      ['Der Stern gehört zum Editorentwurf', 'The asterisk belongs to the editor draft'],
      [
        'Die geänderte Überschrift existiert bisher im Editor. Der Stern zeigt den ungespeicherten Zustand. Im Arbeitsordner und Index steht weiterhin die ursprüngliche Anleitung.',
        'The edited heading exists only in the editor so far. The asterisk marks the unsaved state. The worktree and index still contain the original guide.',
      ],
      '.file-viewer-title',
      { prepare: p({ draft: 'markdown-edited' }) },
    ),
    s(
      'preview-draft',
      ['Prüfe den Entwurf in der Vorschau', 'Preview the draft'],
      [
        'Klicke Vorschau. Auch ohne vorheriges Speichern soll die Überschrift jetzt Unser Projektleitfaden lauten.',
        'Click Preview. Even before saving, the heading should now read Our project guide.',
      ],
      tab('preview'),
      {
        prepare: p({ draft: 'markdown-edited' }),
        completion: { kind: 'text', selector: '.markdown-preview-content h1', value: ['Unser Projektleitfaden', 'Our project guide'] },
      },
    ),
    s(
      'live-preview',
      ['Vorschau ist noch kein Speichern', 'Preview still does not save'],
      [
        'Die neue Überschrift wird bereits dargestellt; der Stern bleibt sichtbar. Du kannst Text und Vorschau wechseln, um einen Entwurf zu prüfen, bevor du ihn speicherst.',
        'The new heading is already rendered, and the asterisk remains. Switch between Text and Preview to check a draft before saving.',
      ],
      '.markdown-preview-content h1',
      { prepare: p({ draft: 'markdown-edited', tab: 'preview' }) },
    ),
    s(
      'save',
      ['Speichere die Anleitung', 'Save the guide'],
      [
        'Klicke Arbeitsdatei speichern. Der Stern soll verschwinden. Die Datei ist danach geändert, aber noch nicht für einen Commit vorgemerkt.',
        'Click Save working file. The asterisk should disappear. The file is now modified, but remains unstaged.',
      ],
      c('save-file'),
      { prepare: p({ draft: 'markdown-edited', tab: 'preview' }), completion: formatSaved('markdown', 'markdown-edited') },
    ),
    s(
      'close',
      ['Schließe die Vorschau', 'Close the preview'],
      [
        'Klicke das X des Datei-Viewers. Die gespeicherte Anleitung bleibt im Lernprojekt vorhanden.',
        'Click the file viewer’s X. The saved guide remains in the learning project.',
      ],
      c('close-file'),
      { prepare: p({ saved: 'markdown-edited', tab: 'preview' }), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Markdown prüfen, dann speichern', 'Check Markdown, then save'],
      [
        'Du hast Syntax und Darstellung verglichen, einen ungespeicherten Entwurf betrachtet und die Arbeitsdatei gespeichert. HTML und CSV haben eigene Vorschaulektionen.',
        'You compared syntax and rendering, previewed an unsaved draft and saved the working file. HTML and CSV have their own preview lessons.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'docs/guide.md', content: { example: 'file-formats', version: 'markdown-edited' } }] } },
    ),
  ],
};
