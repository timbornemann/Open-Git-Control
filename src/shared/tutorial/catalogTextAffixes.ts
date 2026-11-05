import type { TutorialChapter, TutorialCompletion, ToolExample } from './types';
import {
  textStep as s,
  textRecipe as p,
  textSaved,
  affixDialog,
  compactDialog,
  affixField,
  toolValue,
  toolContent,
  tool,
  toolGroup,
  c,
  row,
  viewer,
  editor,
  element,
  dialog,
  cancelDialog,
  confirmDialog,
} from './textLessonHelpers';
const closedWith = (version: ToolExample): TutorialCompletion => ({ kind: 'all', conditions: [toolValue(version), { kind: 'absent', selector: dialog }] });
export const TUTORIAL_TEXT_AFFIXES: TutorialChapter = {
  id: 'text-affixes',
  section: 'repo',
  title: ['Präfix, Suffix und einzeiligen Text erstellen', 'Add prefixes, suffixes and compact text'],
  description: [
    'Dialogfelder einzeln verwenden, Änderungen abbrechen oder anwenden, Komprimierung bestätigen und speichern.',
    'Use each dialog field, cancel or apply changes, confirm compaction and save.',
  ],
  question: ['Wie ergänze ich Präfixe und Suffixe pro Zeile?', 'How do I add prefixes and suffixes to each line?'],
  keywords: 'präfix prefix suffix komprimieren compact zeilen lines dialog abbrechen anwenden',
  steps: [
    s(
      'overview',
      ['Jede Zeile mit einem Rahmen versehen', 'Add a prefix and suffix to every line'],
      [
        'Wir ergänzen vor alpha und beta ein > und dahinter ein !. Beide Eingaben werden im Dialog einzeln erklärt. Danach verbinden wir die Zeilen zu einem einzigen Text.',
        'We will add > before alpha and beta and ! after them, explaining each dialog field individually. Then we will join the lines into one text.',
      ],
      row(),
      { continue: false },
    ),
    s(
      'open',
      ['Öffne die Textliste', 'Open the text list'],
      [
        'Klicke README.md. Die Liste enthält zwei Zeilen; die Datei ist zunächst unverändert.',
        'Click README.md. The list contains two lines, and the file starts unchanged.',
      ],
      row(),
      { completion: element(`${viewer} ${editor}`) },
    ),
    s(
      'purpose',
      ['Präfix und Suffix gelten für jede Zeile', 'Prefix and suffix apply to every line'],
      [
        'Ein Präfix steht am Anfang, ein Suffix am Ende jeder Zeile. Leerzeichen in den Feldern gehören zum Ergebnis. Die Werkzeuge verändern zuerst den Editorentwurf.',
        'A prefix is placed at the start and a suffix at the end of every line. Spaces in the fields are part of the result. The tools initially change the editor draft.',
      ],
      c('file-tools'),
      { prepare: p() },
    ),
    s('menu', ['Öffne Werkzeuge', 'Open Tools'], ['Klicke Werkzeuge oben im Datei-Viewer.', 'Click Tools at the top of the file viewer.'], c('file-tools'), {
      prepare: p(),
      completion: element(toolGroup('lines')),
    }),
    s(
      'group',
      ['Öffne Zeilen bearbeiten', 'Open Edit lines'],
      ['Klicke Zeilen bearbeiten. Hier befinden sich Präfix/Suffix und Komprimieren.', 'Click Edit lines. This group contains prefix/suffix and compaction.'],
      toolGroup('lines'),
      { prepare: p('affix-base', { menu: true }), completion: element(tool('affixes')) },
    ),
    s(
      'request',
      ['Öffne Präfix/Suffix ergänzen', 'Open Add prefix/suffix'],
      [
        'Klicke Präfix/Suffix ergänzen. Es öffnet sich ein Dialog; noch wird kein Text geändert.',
        'Click Add prefix/suffix. A dialog opens without changing the text yet.',
      ],
      tool('affixes'),
      { prepare: p('affix-base', { group: 'lines' }), completion: element(dialog) },
    ),
    s(
      'dialog',
      ['Datei, Felder und Auswirkungen lesen', 'Read the file, fields and effects'],
      [
        'Der Dialog nennt README.md als Ziel. Präfix und Suffix sind getrennte Felder. Die Änderung bleibt bis zum Speichern im Editor. Wir schließen den Dialog zunächst ohne Übernahme.',
        'The dialog names README.md as the target. Prefix and Suffix are separate fields. Changes remain in the editor until saved. First we will close the dialog without applying them.',
      ],
      dialog,
      { prepare: affixDialog() },
    ),
    s(
      'cancel',
      ['Brich den Dialog ab', 'Cancel the dialog'],
      [
        'Klicke Abbrechen. Die Datei und der Editorinhalt sollen unverändert alpha und beta enthalten.',
        'Click Cancel. Both the file and editor should still contain the unchanged alpha and beta.',
      ],
      cancelDialog,
      { prepare: affixDialog(), completion: closedWith('affix-base') },
    ),
    s(
      'menu-again',
      ['Öffne Werkzeuge erneut', 'Open Tools again'],
      ['Klicke Werkzeuge, um den Dialog nun auszufüllen.', 'Click Tools to fill in the dialog this time.'],
      c('file-tools'),
      { prepare: p(), completion: element(toolGroup('lines')) },
    ),
    s('group-again', ['Wechsle zu Zeilen bearbeiten', 'Go to Edit lines'], ['Klicke Zeilen bearbeiten.', 'Click Edit lines.'], toolGroup('lines'), {
      prepare: p('affix-base', { menu: true }),
      completion: element(tool('affixes')),
    }),
    s(
      'request-again',
      ['Öffne den Präfix-/Suffix-Dialog', 'Open the prefix/suffix dialog'],
      [
        'Klicke Präfix/Suffix ergänzen. Abbrechen hat die vorherige Dialogeingabe nicht auf den Text angewendet.',
        'Click Add prefix/suffix. Cancel did not apply the previous dialog input to the text.',
      ],
      tool('affixes'),
      { prepare: p('affix-base', { group: 'lines' }), completion: element(dialog) },
    ),
    s(
      'prefix-purpose',
      ['Das Präfix steht vor jedem Eintrag', 'The prefix goes before every entry'],
      [
        'Wir verwenden > und ein folgendes Leerzeichen. Das Leerzeichen trennt das Zeichen später vom Wort. Gib im nächsten Schritt beide Zeichen ein.',
        'We will use > followed by one space. The space separates the symbol from the word. Enter both characters in the next step.',
      ],
      affixField('prefix'),
      { prepare: affixDialog() },
    ),
    s(
      'prefix',
      ['Gib > und ein Leerzeichen ein', 'Enter > followed by a space'],
      [
        'Trage im Feld Präfix ein > mit genau einem anschließenden Leerzeichen ein. Noch nicht Anwenden klicken.',
        'In Prefix enter > followed by exactly one space. Do not click Apply yet.',
      ],
      affixField('prefix'),
      { prepare: affixDialog(), completion: { kind: 'value', selector: affixField('prefix'), value: ['> ', '> '] } },
    ),
    s(
      'suffix-purpose',
      ['Das Suffix steht nach jedem Eintrag', 'The suffix goes after every entry'],
      [
        'Wir verwenden ein Leerzeichen und danach !. Dadurch steht am Ende jeder Zeile ein abgetrenntes Ausrufezeichen.',
        'We will use one space followed by !. This places a separated exclamation mark at the end of every line.',
      ],
      affixField('suffix'),
      { prepare: affixDialog('affix-base', '> ') },
    ),
    s(
      'suffix',
      ['Gib ein Leerzeichen und ! ein', 'Enter a space followed by !'],
      [
        'Trage im Feld Suffix genau ein Leerzeichen und danach ! ein. Das Präfix bleibt > mit folgendem Leerzeichen.',
        'In Suffix enter exactly one space followed by !. Keep the prefix as > followed by a space.',
      ],
      affixField('suffix'),
      { prepare: affixDialog('affix-base', '> '), completion: { kind: 'value', selector: affixField('suffix'), value: [' !', ' !'] } },
    ),
    s(
      'apply-purpose',
      ['Anwenden erstellt einen Entwurf', 'Apply creates a draft'],
      [
        'Prüfe beide Felder: vor jeder Zeile > und Leerzeichen, danach Leerzeichen und !. Anwenden verändert den Editor; die gespeicherte Arbeitsdatei bleibt noch gleich.',
        'Check both fields: > and a space before each line, a space and ! after it. Apply changes the editor while the saved working file stays unchanged.',
      ],
      confirmDialog,
      { prepare: affixDialog('affix-base', '> ', ' !') },
    ),
    s(
      'apply',
      ['Wende Präfix und Suffix an', 'Apply the prefix and suffix'],
      [
        'Klicke Anwenden. Der Dialog soll schließen; die beiden Zeilen sollen jetzt > alpha ! und > beta ! lauten.',
        'Click Apply. The dialog should close, leaving the two lines > alpha ! and > beta !.',
      ],
      confirmDialog,
      { prepare: affixDialog('affix-base', '> ', ' !'), completion: closedWith('affixed') },
    ),
    s(
      'draft',
      ['Das Ergebnis prüfen', 'Inspect the result'],
      [
        'Beide Zeilen sind verändert und der Stern kennzeichnet den Entwurf. Diese Aktion hat die ursprünglichen Wörter und ihre Reihenfolge erhalten.',
        'Both lines changed, and the asterisk marks the draft. This action preserved the original words and their order.',
      ],
      editor,
      { prepare: p('affix-base', { draft: 'affixed' }) },
    ),
    s(
      'save-affixes',
      ['Speichere die ergänzten Zeilen', 'Save the prefixed lines'],
      [
        'Klicke Arbeitsdatei speichern. Der Index behält die ursprüngliche Liste ohne Präfix und Suffix.',
        'Click Save working file. The index retains the original list without prefix and suffix.',
      ],
      c('save-file'),
      { prepare: p('affix-base', { draft: 'affixed' }), completion: textSaved('affixed') },
    ),
    s(
      'compact-purpose',
      ['Komprimieren verbindet die Zeilen', 'Compaction joins the lines'],
      [
        'Auf eine Zeile komprimieren entfernt äußere Leerzeichen und Leerzeilen und verbindet die übrigen Zeilen mit Leerzeichen. Für Quellcode kann das die Bedeutung ändern; deshalb erscheint eine Bestätigung.',
        'Compact to one line trims and removes blank lines, joining the remaining lines with spaces. This can change the meaning of source code, so it requires confirmation.',
      ],
      c('file-tools'),
      { prepare: p('affixed') },
    ),
    s('compact-menu', ['Öffne Werkzeuge', 'Open Tools'], ['Klicke Werkzeuge.', 'Click Tools.'], c('file-tools'), {
      prepare: p('affixed'),
      completion: element(toolGroup('lines')),
    }),
    s('compact-group', ['Öffne Zeilen bearbeiten', 'Open Edit lines'], ['Klicke Zeilen bearbeiten.', 'Click Edit lines.'], toolGroup('lines'), {
      prepare: p('affixed', { menu: true }),
      completion: element(tool('compact')),
    }),
    s(
      'compact-request',
      ['Fordere die Komprimierung an', 'Request compaction'],
      ['Klicke Auf eine Zeile komprimieren. Lies die Rückfrage, bevor du entscheidest.', 'Click Compact to one line. Read the confirmation before deciding.'],
      tool('compact'),
      { prepare: p('affixed', { group: 'lines' }), completion: element(dialog) },
    ),
    s(
      'compact-impact',
      ['Eine Bestätigung schreibt noch keine Datei', 'A confirmation still does not save a file'],
      [
        'Die Rückfrage beschreibt die Auswirkungen. Wir üben zunächst Abbrechen: Die beiden Zeilen sollen getrennt bleiben.',
        'The confirmation describes the effects. First we will practice Cancel: the two lines should remain separate.',
      ],
      dialog,
      { prepare: compactDialog() },
    ),
    s(
      'compact-cancel',
      ['Brich die Komprimierung ab', 'Cancel compaction'],
      [
        'Klicke Abbrechen. Der Text bleibt unverändert und gespeichert; es entsteht kein neuer Entwurf.',
        'Click Cancel. The saved text stays unchanged, with no new draft.',
      ],
      cancelDialog,
      { prepare: compactDialog(), completion: closedWith('affixed') },
    ),
    s('compact-menu-again', ['Öffne Werkzeuge erneut', 'Open Tools again'], ['Klicke Werkzeuge.', 'Click Tools.'], c('file-tools'), {
      prepare: p('affixed'),
      completion: element(toolGroup('lines')),
    }),
    s('compact-group-again', ['Wechsle zu Zeilen bearbeiten', 'Go to Edit lines'], ['Klicke Zeilen bearbeiten.', 'Click Edit lines.'], toolGroup('lines'), {
      prepare: p('affixed', { menu: true }),
      completion: element(tool('compact')),
    }),
    s(
      'compact-request-again',
      ['Öffne die Rückfrage noch einmal', 'Open the confirmation again'],
      [
        'Klicke Auf eine Zeile komprimieren. Diesmal übernehmen wir das Ergebnis in den Editor.',
        'Click Compact to one line. This time we will apply the result to the editor.',
      ],
      tool('compact'),
      { prepare: p('affixed', { group: 'lines' }), completion: element(dialog) },
    ),
    s(
      'compact-apply',
      ['Bestätige Komprimieren', 'Confirm Compact'],
      [
        'Klicke Komprimieren. Der Editor soll jetzt > alpha ! > beta ! in genau einer Zeile enthalten.',
        'Click Compact. The editor should now contain > alpha ! > beta ! on exactly one line.',
      ],
      confirmDialog,
      { prepare: compactDialog(), completion: closedWith('compacted') },
    ),
    s(
      'compact-result',
      ['Einzeilig, aber noch ungespeichert', 'One line, but still unsaved'],
      [
        'Die Zeilenumbrüche wurden im Entwurf durch Leerzeichen ersetzt. Der Stern bleibt sichtbar, bis du das Ergebnis speicherst.',
        'Line breaks were replaced with spaces in the draft. The asterisk remains until you save the result.',
      ],
      editor,
      { prepare: p('affixed', { draft: 'compacted' }) },
    ),
    s(
      'save-compact',
      ['Speichere den einzeiligen Text', 'Save the single-line text'],
      [
        'Klicke Arbeitsdatei speichern. Der Index bleibt beim ursprünglichen Beispiel; dort ist noch keine der beiden Aktionen vorgemerkt.',
        'Click Save working file. The index remains at the original example, with neither action staged.',
      ],
      c('save-file'),
      { prepare: p('affixed', { draft: 'compacted' }), completion: textSaved('compacted') },
    ),
    s('close', ['Schließe die Datei', 'Close the file'], ['Klicke das X des Datei-Viewers.', 'Click the file viewer’s X.'], c('close-file'), {
      prepare: p('compacted'),
      completion: { kind: 'absent', selector: viewer },
    }),
    s(
      'finish',
      ['Dialog, Entwurf und Datei unterscheiden', 'Distinguish dialog, draft and file'],
      [
        'Du hast beide Eingabefelder verwendet, Abbrechen und Anwenden geübt und die Komprimierung bewusst bestätigt. Erst Speichern hat die Ergebnisse in die Arbeitsdatei übernommen.',
        'You used both input fields, practiced Cancel and Apply, and deliberately confirmed compaction. Only Save wrote the results to the working file.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: 'README.md', content: toolContent('compacted') }] } },
    ),
  ],
};
