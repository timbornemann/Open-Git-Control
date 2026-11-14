import { withTextViewSteps } from './fileTextViewSteps';
import type { TutorialChapter } from './types';
import { markupToolSteps } from './markupToolSteps';
export const TUTORIAL_MARKUP_HTML: TutorialChapter = {
  id: 'markup-html',
  section: 'repo',
  title: ['HTML formatieren und minifizieren', 'Format and minify HTML'],
  description: [
    'HTML-Struktur, Formatierung, Kommentare, empfindlicher Leerraum, Diff, Vorschau und Fehlerbehandlung.',
    'HTML structure, formatting, comments, whitespace-sensitive content, diff, preview and error handling.',
  ],
  question: ['Wie formatiere oder minifiziere ich HTML?', 'How do I format or minify HTML?'],
  keywords: 'html markup formatieren minifizieren kommentar pre whitespace leerzeichen fehler draft vorschau preview',
  steps: markupToolSteps({
    kind: 'html',
    source: 'html-source',
    formatted: 'html-formatted',
    minified: 'html-minified',
    invalid: 'html-invalid',
    overview: [
      'page.html enthält eine kleine vollständige Seite. Wir formatieren ihren Quelltext, prüfen den Diff, minifizieren und kontrollieren die Vorschau. Jede Änderung beginnt als Editorentwurf.',
      'page.html contains a small complete page. We will format its source, review the diff, minify and check Preview. Every change starts as an editor draft.',
    ],
    structure: [
      'DOCTYPE benennt HTML. head enthält Zeichensatz und Titel, body den sichtbaren Inhalt. main gruppiert Überschrift, Absatz und pre-Bereich. Ein Kommentar steht zwischen <!-- und -->.',
      'DOCTYPE identifies HTML. head contains the character set and title, and body holds visible content. main groups the heading, paragraph and pre block. A comment sits between <!-- and -->.',
    ],
    format: [
      'Formatieren gliedert head, body und main mit Einrückungen und Zeilenumbrüchen. Die Seite wird dadurch als Quelltext leichter lesbar. Der Kommentar bleibt erhalten; die meta-Schreibweise erhält hier einen abschließenden Schrägstrich.',
      'Format lays out head, body and main with indentation and line breaks, making the source easier to read. The comment remains, and this meta tag gains a trailing slash.',
    ],
    preserved: [
      'Prüfe Hello vor strong, world innerhalb von strong und &amp; team. danach. Der pre-Bereich enthält weiterhin zwei Textzeilen mit zwei führenden Leerzeichen in der zweiten. Sein Text wird nicht wie ein gewöhnlicher Absatz eingerückt.',
      'Check Hello before strong, world inside strong and &amp; team. after it. The pre block still has two text lines with two leading spaces on the second. Its text is not indented like an ordinary paragraph.',
    ],
    minify: [
      'HTML-Minifizieren entfernt entbehrliche Zwischenräume und hier auch Kommentare. Leerraum in normalen Absätzen und in pre wird unterschiedlich behandelt. Es ist keine allgemeine Aktion, um beliebigen Text sicher in eine Zeile umzuwandeln.',
      'HTML minification removes unnecessary spacing and, here, comments too. Whitespace in ordinary paragraphs and pre is handled differently. It is not a general way to safely turn arbitrary text into one line.',
    ],
    comments: [
      'Der Kommentar layout note ist entfernt. Die sichtbaren Seitenelemente bleiben erhalten. Diese Entfernung bleibt auch nach erneutem Formatieren bestehen; bewahre benötigte Kommentare vor dem Speichern.',
      'The layout note comment is removed, while visible page elements remain. Formatting again does not restore that comment, so preserve comments you need before saving.',
    ],
    whitespace: [
      'Der Absatz behält Abstände zwischen Hello, world und &amp; team. Der pre-Text bleibt mehrzeilig. Prüfe beim Minifizieren deshalb Text und Darstellung, statt nur die reduzierte Dateigröße zu beachten.',
      'The paragraph retains spaces between Hello, world and &amp; team. The pre text remains multiline. When minifying, check content and rendering as well as reduced file size.',
    ],
    invalidInput: [
      'Ersetze den gesamten Editorinhalt durch <div title="unterminated. Das öffnende Anführungszeichen erhält keinen Abschluss. Speichere diesen Entwurf nicht.',
      'Replace all editor content with <div title="unterminated. The opening quotation mark has no closing match. Do not save this draft.',
    ],
    error: [
      'Unexpected character EOF bedeutet hier, dass der Parser das Dateiende erreicht, bevor das Attribut abgeschlossen ist. Das ist ein Verarbeitungsfehler für dieses Beispiel; die Werkzeuge ersetzen keine umfassende HTML-Prüfung.',
      'Unexpected character EOF means the parser reached the end before the attribute was closed. This is a processing error for this example; the tools do not replace comprehensive HTML validation.',
    ],
  }).flatMap(withTextViewSteps({ open: 'page.html', reopen: 'page.html' })),
};
