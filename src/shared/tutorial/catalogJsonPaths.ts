import type { TutorialChapter } from './types';
import {
  jsonStep as s,
  jsonRecipe as p,
  jsonRow,
  jsonViewer,
  jsonSelection,
  jsonSelectionRule,
  jsonCopied,
  c,
  editor,
  tool,
  toolGroup,
  element,
} from './structuredLessonHelpers';
const name = jsonSelection(15, 18),
  active = jsonSelection(46, 50),
  root = jsonSelection(0, 0);
export const TUTORIAL_JSON_PATHS: TutorialChapter = {
  id: 'json-paths',
  section: 'repo',
  title: ['JSON-Pfade an Cursor und Auswahl kopieren', 'Copy JSON paths at the cursor or selection'],
  description: [
    'Werte in einem Objekt und einer Liste markieren, den jeweiligen Pfad kopieren und den Dokumentanfang untersuchen.',
    'Select values in an object and a list, copy their paths and inspect the document root.',
  ],
  question: ['Wie kopiere ich den JSON-Pfad eines Werts?', 'How do I copy a value’s JSON path?'],
  keywords: 'json path pfad cursor auswahl selection liste array nullbasiert index name active',
  steps: [
    s(
      'overview',
      ['Ein Pfad beschreibt eine Stelle im Dokument', 'A path identifies a place in the document'],
      [
        'Wir suchen zwei Werte in config.json und kopieren ihre JSON-Pfade. Die Aktion liest die Stelle am Cursor beziehungsweise am Anfang einer Auswahl und verändert den Text nicht.',
        'We will locate two values in config.json and copy their JSON paths. The action reads the cursor position or selection start without changing text.',
      ],
      jsonRow,
      { continue: false },
    ),
    s(
      'open',
      ['Öffne config.json', 'Open config.json'],
      [
        'Klicke config.json. Das Beispiel ist für diese Lektion wieder in seiner ursprünglichen einzeiligen Fassung.',
        'Click config.json. This lesson starts with the original single-line version again.',
      ],
      jsonRow,
      { completion: element(`${jsonViewer} ${editor}`) },
    ),
    s(
      'select-name',
      ['Markiere OGC ohne Anführungszeichen', 'Select OGC without quotation marks'],
      [
        'Markiere genau die drei Buchstaben OGC. Du kannst doppelklicken oder mit Maus beziehungsweise Umschalt und Pfeiltasten markieren.',
        'Select exactly the three letters OGC. Double-click or select with the mouse or Shift and arrow keys.',
      ],
      editor,
      { prepare: p(), completion: jsonSelectionRule(15, 18) },
    ),
    s(
      'name-menu',
      ['Öffne Werkzeuge', 'Open Tools'],
      ['Klicke Werkzeuge; die Stelle im Editor bleibt für die Pfadaktion erhalten.', 'Click Tools; the editor position remains available for the path action.'],
      c('file-tools'),
      { prepare: p('base', { selection: name }), completion: element(toolGroup('json')) },
    ),
    s(
      'name-group',
      ['Öffne JSON', 'Open JSON'],
      ['Klicke JSON. Dort findest du Pfad an Auswahl kopieren.', 'Click JSON, then locate Copy path at selection.'],
      toolGroup('json'),
      { prepare: p('base', { selection: name, menu: true }), completion: element(tool('json-path')) },
    ),
    s(
      'copy-name',
      ['Kopiere den Pfad von OGC', 'Copy the path of OGC'],
      [
        'Klicke Pfad an Auswahl kopieren. Die Rückmeldung soll $.name nennen: OGC ist der Wert des Feldes name am obersten Objekt. Die Übung hält die Kopie intern bereit.',
        'Click Copy path at selection. Feedback should name $.name: OGC is the value of name in the top-level object. Practice keeps the copy internally.',
      ],
      tool('json-path'),
      { prepare: p('base', { selection: name, group: true }), completion: jsonCopied('$.name') },
    ),
    s(
      'name-result',
      ['Dollarzeichen und Feldname lesen', 'Read the dollar sign and field name'],
      [
        '$ bezeichnet das gesamte JSON-Dokument. .name folgt von dort zum Feld name. Die Aktion hat den Pfad kopiert und keine JSON-Zeile geändert.',
        '$ identifies the entire JSON document. .name follows the field name from there. The action copied a path without changing a JSON line.',
      ],
      editor,
      { prepare: p('base', { selection: name }) },
    ),
    s(
      'select-active',
      ['Markiere true im Listeneintrag', 'Select true inside the list entry'],
      [
        'Markiere genau true beim Feld active. Der Wert gehört zu einem Objekt in der Liste items.',
        'Select exactly true at active. This value belongs to an object inside the items list.',
      ],
      editor,
      { prepare: p(), completion: jsonSelectionRule(46, 50) },
    ),
    s('active-menu', ['Öffne Werkzeuge erneut', 'Open Tools again'], ['Klicke Werkzeuge.', 'Click Tools.'], c('file-tools'), {
      prepare: p('base', { selection: active }),
      completion: element(toolGroup('json')),
    }),
    s('active-group', ['Öffne die JSON-Gruppe', 'Open the JSON group'], ['Klicke JSON.', 'Click JSON.'], toolGroup('json'), {
      prepare: p('base', { selection: active, menu: true }),
      completion: element(tool('json-path')),
    }),
    s(
      'copy-active',
      ['Kopiere den Pfad von true', 'Copy the path of true'],
      [
        'Klicke Pfad an Auswahl kopieren. Die Rückmeldung soll $.items[0].active lauten.',
        'Click Copy path at selection. Feedback should show $.items[0].active.',
      ],
      tool('json-path'),
      { prepare: p('base', { selection: active, group: true }), completion: jsonCopied('$.items[0].active') },
    ),
    s(
      'array-result',
      ['Eine Liste beginnt bei Index null', 'A list starts at index zero'],
      [
        '.items führt zur Liste; [0] bezeichnet ihren ersten Eintrag. .active benennt darin das Feld. Die eckigen Klammern unterscheiden den Listenindex vom Feldnamen.',
        '.items leads to the list; [0] identifies its first entry, and .active names the field inside it. Square brackets distinguish a list index from a field name.',
      ],
      editor,
      { prepare: p('base', { selection: active }) },
    ),
    s(
      'root-purpose',
      ['Ein Cursor reicht für die Pfadaktion', 'A cursor is enough for the path action'],
      [
        'Auch ohne markierten Bereich kann das Werkzeug einen Pfad ermitteln. Wir setzen den Cursor nun ganz an den Anfang, vor die erste geschweifte Klammer.',
        'The tool can determine a path without a selected range. Next place the cursor at the very start, before the first brace.',
      ],
      editor,
      { prepare: p('base', { selection: active }) },
    ),
    s(
      'root-cursor',
      ['Setze den Cursor vor die erste Klammer', 'Place the cursor before the first brace'],
      [
        'Klicke in den Text und bewege den Cursor ganz an den Dokumentanfang. Es soll kein Text mehr markiert sein.',
        'Click in the text and move the cursor to the very start of the document. Keep no text selected.',
      ],
      editor,
      { prepare: p('base', { selection: active }), completion: jsonSelectionRule(0, 0) },
    ),
    s('root-menu', ['Öffne Werkzeuge', 'Open Tools'], ['Klicke Werkzeuge.', 'Click Tools.'], c('file-tools'), {
      prepare: p('base', { selection: root }),
      completion: element(toolGroup('json')),
    }),
    s('root-group', ['Öffne JSON', 'Open JSON'], ['Klicke JSON.', 'Click JSON.'], toolGroup('json'), {
      prepare: p('base', { selection: root, menu: true }),
      completion: element(tool('json-path')),
    }),
    s(
      'copy-root',
      ['Kopiere den Dokumentpfad', 'Copy the document root path'],
      [
        'Klicke Pfad an Auswahl kopieren. Am Dokumentanfang lautet der Pfad $.',
        'Click Copy path at selection. At the beginning of the document the path is $.',
      ],
      tool('json-path'),
      { prepare: p('base', { selection: root, group: true }), completion: jsonCopied('$') },
    ),
    s(
      'close',
      ['Schließe die unveränderte Datei', 'Close the unchanged file'],
      ['Klicke das X. Da alle Pfadaktionen nur gelesen haben, ist kein Speichern nötig.', 'Click X. These path actions only read, so no save is needed.'],
      c('close-file'),
      { prepare: p(), completion: { kind: 'absent', selector: jsonViewer } },
    ),
    s(
      'finish',
      ['Pfade aus der Dokumentstruktur ableiten', 'Derive paths from the document structure'],
      [
        'Du hast einen einfachen Feldpfad, einen Pfad durch eine Liste und den Dokumentpfad kopiert. Dabei blieb die Beispieldatei unverändert.',
        'You copied a simple field path, a path through a list and the document root path, leaving the sample file unchanged.',
      ],
      c('open-files'),
    ),
  ],
};
