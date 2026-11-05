import type { TutorialChapter, TutorialText, ToolExample } from './types';
import {
  selectionStep as s,
  textRecipe,
  exactSelection,
  selectRule,
  toolValue,
  toolContent,
  textSaved,
  tool,
  toolGroup,
  c,
  row,
  viewer,
  editor,
  element,
} from './textLessonHelpers';
const p = (saved: ToolExample = 'selection-base', options: Parameters<typeof textRecipe>[1] = {}) => textRecipe(saved, options);
type Operation = { id: string; before: ToolExample; after: ToolExample; end: number; selected: string; title: TutorialText; description: TutorialText };
const operations: Operation[] = [
  {
    id: 'base64-encode',
    before: 'selection-base',
    after: 'selection-base64',
    end: 11,
    selected: 'Café',
    title: ['Nur Café als Base64 kodieren', 'Encode only Café as Base64'],
    description: [
      'Nur das markierte Wort soll zu Q2Fmw6k= werden. Die Wörter davor und danach sowie die Leerzeichen und der abschließende Zeilenumbruch bleiben erhalten.',
      'Only the selected word should become Q2Fmw6k=. The words before and after it, the spaces and the final line break must stay unchanged.',
    ],
  },
  {
    id: 'base64-decode',
    before: 'selection-base64',
    after: 'selection-base',
    end: 15,
    selected: 'Q2Fmw6k=',
    title: ['Nur die Base64-Zeichenfolge dekodieren', 'Decode only the Base64 sequence'],
    description: [
      'Die vollständige Zeichenfolge Q2Fmw6k= einschließlich = wird wieder zu Café. Eine unvollständige oder zu große Auswahl würde einen anderen Text verarbeiten.',
      'The complete Q2Fmw6k= sequence, including =, becomes Café again. An incomplete or oversized selection would process different text.',
    ],
  },
  {
    id: 'url-encode',
    before: 'selection-base',
    after: 'selection-url',
    end: 11,
    selected: 'Café',
    title: ['Nur Café URL-kodieren', 'URL-encode only Café'],
    description: [
      'Das markierte Café soll zu Caf%C3%A9 werden. Die Leerzeichen außerhalb der Auswahl bleiben echte Leerzeichen und werden nicht zu %20.',
      'The selected Café should become Caf%C3%A9. Spaces outside the selection remain actual spaces rather than becoming %20.',
    ],
  },
  {
    id: 'url-decode',
    before: 'selection-url',
    after: 'selection-base',
    end: 16,
    selected: 'Caf%C3%A9',
    title: ['Nur die Prozentfolge dekodieren', 'Decode only the percent sequence'],
    description: [
      'Die vollständige Auswahl Caf%C3%A9 wird wieder zu Café. Beide Prozentzeichen und alle Zeichen der Folge müssen zur Auswahl gehören.',
      'The complete Caf%C3%A9 selection becomes Café again. Both percent signs and every character of the sequence must be selected.',
    ],
  },
];
function operationSteps(operation: Operation) {
  const selection = exactSelection(7, operation.end);
  return [
    s(operation.id + '-purpose', operation.title, operation.description, editor, { prepare: p(operation.before) }),
    s(
      operation.id + '-select',
      ['Markiere nur ' + operation.selected, 'Select only ' + operation.selected],
      [
        `Markiere genau ${operation.selected}, ohne die angrenzenden Leerzeichen oder Wörter. Ziehe mit der Maus über alle Zeichen oder verwende Umschalt und die Pfeiltasten.`,
        `Select exactly ${operation.selected}, excluding the surrounding spaces and words. Drag across every character or use Shift with the arrow keys.`,
      ],
      editor,
      { prepare: p(operation.before), completion: selectRule(operation.before, 7, operation.end) },
    ),
    s(
      operation.id + '-menu',
      ['Öffne Werkzeuge mit aktiver Auswahl', 'Open Tools with the selection active'],
      ['Klicke Werkzeuge. Die Textauswahl soll für die folgende Aktion erhalten bleiben.', 'Click Tools. Keep the text selection for the next action.'],
      c('file-tools'),
      { prepare: p(operation.before, { selection }), completion: element(toolGroup('codecs')) },
    ),
    s(
      operation.id + '-scope',
      ['Die Gruppe zeigt den Auswahlbezug', 'The group shows the selection scope'],
      [
        'Unter Base64 und URL-Encoding steht Aktuelle Auswahl verarbeiten. Diese Beschreibung hilft zu prüfen, ob eine Markierung aktiv ist oder das ganze Dokument verwendet würde.',
        'The Base64 and URL encoding description says Process current selection. This helps check whether a selection is active or the whole document would be used.',
      ],
      toolGroup('codecs'),
      { prepare: p(operation.before, { selection, menu: true }) },
    ),
    s(
      operation.id + '-group',
      ['Öffne Base64 und URL-Encoding', 'Open Base64 and URL encoding'],
      [
        'Klicke die Gruppe. Die folgende Aktion verwendet ausschließlich den ausgewählten Bereich.',
        'Click the group. The next action uses only the selected range.',
      ],
      toolGroup('codecs'),
      { prepare: p(operation.before, { selection, menu: true }), completion: element(tool(operation.id)) },
    ),
    s(
      operation.id + '-apply',
      operation.title,
      [operation.description[0] + ' Klicke das hervorgehobene Werkzeug.', operation.description[1] + ' Click the highlighted tool.'],
      tool(operation.id),
      { prepare: p(operation.before, { selection, group: 'codecs' }), completion: toolValue(operation.after) },
    ),
    s(
      operation.id + '-result',
      ['Text außerhalb der Auswahl bleibt erhalten', 'Text outside the selection is preserved'],
      [
        'Prüfe die Wörter und Leerzeichen vor und nach der umgewandelten Folge. Geändert wurde nur ein Abschnitt im Editorentwurf. Speichern schreibt anschließend die vollständige Datei mit dieser Änderung.',
        'Check the words and spaces before and after the converted sequence. Only part of the editor draft changed. Saving then writes the complete file containing this change.',
      ],
      editor,
      { prepare: p(operation.before, { draft: operation.after }) },
    ),
    s(
      operation.id + '-save',
      ['Speichere die bearbeitete Datei', 'Save the edited file'],
      [
        'Klicke Arbeitsdatei speichern. Der Index behält das ursprüngliche Beispiel. Nach dem vollständigen Zurückdekodieren soll die Arbeitsdatei wieder dem Index entsprechen.',
        'Click Save working file. The index retains the original example. After fully decoding back, the working file should match the index again.',
      ],
      c('save-file'),
      { prepare: p(operation.before, { draft: operation.after }), completion: textSaved(operation.after, 'selection-base') },
    ),
  ];
}
export const TUTORIAL_CODECS_SELECTION: TutorialChapter = {
  id: 'codecs-selection',
  section: 'repo',
  title: ['Base64 und URL-Encoding auf eine Auswahl begrenzen', 'Limit Base64 and URL encoding to a selection'],
  description: [
    'Text gezielt markieren, den Menüumfang prüfen und alle vier Werkzeuge ohne Änderung des umgebenden Texts verwenden.',
    'Select text precisely, check the menu scope and use all four tools without changing surrounding text.',
  ],
  question: ['Wie kodiere ich nur den markierten Text?', 'How do I encode only the selected text?'],
  keywords: 'auswahl selection markieren base64 url encoding maus shift umschalt pfeiltasten range',
  steps: [
    s(
      'overview',
      ['Eine Auswahl begrenzt die Textaktion', 'A selection limits the text action'],
      [
        'Im Beispiel steht Café zwischen zwei anderen Wörtern. Wir kodieren und dekodieren nur dieses Wort. Die Übung prüft sowohl den markierten Bereich als auch den gesamten resultierenden Text.',
        'The example places Café between two other words. We will encode and decode only this word. The exercise checks both the selected range and the entire resulting text.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne README.md', 'Open README.md'],
      [
        'Klicke README.md. Der Text vor und nach Café gehört zum Beispiel und soll erhalten bleiben.',
        'Click README.md. The text before and after Café is part of the example and must be preserved.',
      ],
      row(),
      { completion: element(`${viewer} ${editor}`) },
    ),
    ...operations.flatMap(operationSteps),
    s(
      'close',
      ['Schließe die wiederhergestellte Datei', 'Close the restored file'],
      ['Klicke das X. Der ursprüngliche Text ist gespeichert und vollständig wiederhergestellt.', 'Click X. The original text is saved and fully restored.'],
      c('close-file'),
      { prepare: p(), completion: { kind: 'absent', selector: viewer } },
    ),
    s(
      'finish',
      ['Auswahl und vollständige Datei unterscheiden', 'Distinguish the selection from the full file'],
      [
        'Du hast alle vier Werkzeuge an einer Auswahl verwendet. Der umgebende Text blieb erhalten. Ohne Markierung verarbeiten diese Werkzeuge dagegen das ganze Dokument.',
        'You used all four tools on a selection while retaining the surrounding text. Without a selection these tools process the whole document.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'README.md', content: toolContent('selection-base') }] } },
    ),
  ],
};
