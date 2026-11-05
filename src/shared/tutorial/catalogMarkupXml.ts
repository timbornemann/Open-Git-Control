import type { TutorialChapter } from './types';
import { markupToolSteps } from './markupToolSteps';
export const TUTORIAL_MARKUP_XML: TutorialChapter = {
  id: 'markup-xml',
  section: 'repo',
  title: ['XML formatieren und minifizieren', 'Format and minify XML'],
  description: [
    'Deklaration, Elemente, Attribute, Escaping, CDATA, Kommentare, Diff und fehlerhafte Schließtags.',
    'Declaration, elements, attributes, escaping, CDATA, comments, diff and invalid closing tags.',
  ],
  question: ['Wie formatiere oder minifiziere ich XML?', 'How do I format or minify XML?'],
  keywords: 'xml markup formatieren minifizieren deklaration element attribut cdata escaping kommentar fehler schließtag',
  steps: markupToolSteps({
    kind: 'xml',
    source: 'xml-source',
    formatted: 'xml-formatted',
    minified: 'xml-source',
    invalid: 'xml-invalid',
    overview: [
      'project.xml ist ein kleines strukturiertes Dokument. Wir untersuchen Elemente, Attribute und besondere Textbereiche, formatieren und minifizieren es und üben einen fehlerhaften Schließtag.',
      'project.xml is a small structured document. We will inspect elements, attributes and special text regions, format and minify it, then practise an invalid closing tag.',
    ],
    structure: [
      'Die XML-Deklaration nennt Version und UTF-8. project ist das Wurzelelement und trägt das Attribut name. item enthält Text; empty ist ein leeres Element. Anders als HTML benötigt dieses XML korrekt zusammenpassende Tags.',
      'The XML declaration states the version and UTF-8. project is the root element with a name attribute. item contains text, and empty is an empty element. This XML requires correctly matching tags.',
    ],
    format: [
      'Formatieren setzt die Deklaration und Kindelemente auf eigene Zeilen und rückt sie ein. Die Attribute, der Kommentar und der Text in item bleiben erhalten. Das leere Element behält seine kompakte Schreibweise.',
      'Format puts the declaration and child elements on separate indented lines. Attributes, the comment and item text are retained. The empty element keeps its compact spelling.',
    ],
    preserved: [
      '&amp; stellt im item-Text ein kaufmännisches Und dar. CDATA begrenzt den Text a < b && c > d, dessen Zeichen dort nicht als Elemente gelesen werden. Prüfe beide Stellen nach der Formatierung.',
      '&amp; represents an ampersand in item text. CDATA encloses a < b && c > d so its characters are not read as elements. Check both regions after formatting.',
    ],
    minify: [
      'XML-Minifizieren entfernt hier den eingefügten Formatierungsraum. Kommentare und CDATA bleiben bei diesem Werkzeug erhalten. Das Ergebnis entspricht in diesem Beispiel wieder dem ursprünglichen kompakten XML.',
      'XML minification removes the formatting whitespace added here. This tool retains comments and CDATA. In this example, the result matches the original compact XML again.',
    ],
    comments: [
      'Der Kommentar project note bleibt auch nach dem Minifizieren erhalten. Das unterscheidet dieses XML-Werkzeug von der HTML-Minifizierung. Prüfe das konkrete Ergebnis für das jeweilige Dateiformat.',
      'The project note comment remains after minifying. This differs from HTML minification. Check the actual result for the file format you are using.',
    ],
    whitespace: [
      'Café &amp; tea und der vollständige CDATA-Text bleiben erhalten. Nur die Formatierung zwischen diesen Elementen wurde entfernt. Fachlich bedeutenden Leerraum in eigenen XML-Dateien solltest du im Diff gesondert prüfen.',
      'Café &amp; tea and the complete CDATA text are preserved. Only formatting between these elements was removed. Review meaningful whitespace in your own XML files separately in the diff.',
    ],
    invalidInput: [
      'Ersetze den Editorinhalt durch <project><item>OGC</project>. Vor dem Schließen von project fehlt </item>. Speichere diesen Entwurf nicht.',
      'Replace the editor with <project><item>OGC</project>. The </item> tag is missing before project closes. Do not save this draft.',
    ],
    error: [
      'Failed to parse XML zeigt, dass die Tag-Struktur nicht verarbeitet werden konnte. Formatieren fügt hier keinen geratenen Schließtag ein. Für diesen Versuch bleiben Editorentwurf und gespeicherte Datei getrennt erhalten.',
      'Failed to parse XML means the tag structure could not be processed. Formatting does not guess a missing closing tag here. The editor draft and saved file remain separately preserved.',
    ],
  }),
};
