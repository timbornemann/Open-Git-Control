import type { TutorialChapter } from './types';
import {
  treeStep as s,
  treeAction as a,
  treeContext,
  treeContextStep,
  treeClipboard,
  treeHolding,
  treePrepare,
  treeFile,
  treeViewer,
  treeClosed,
  treeContextClosed,
  treeAll,
  c,
  row,
  element,
  p,
  state,
  paths,
  dialog,
  confirmDialog,
  cancelDialog,
} from './treeLessonHelpers';
const both = `${dialog} [data-dialog-action="secondary"]`;
export const TUTORIAL_TREE_COPY: TutorialChapter = {
  id: 'tree-copy',
  section: 'repo',
  title: ['Dateien kopieren und beide Fassungen behalten', 'Copy files and keep both versions'],
  description: [
    'Copy und Paste am Projektbaum üben, Quell- und Zielordner unterscheiden und eine Kollision mit Keep both lösen.',
    'Practice Copy and Paste in the tree, distinguish source and destination and resolve a collision with Keep both.',
  ],
  question: ['Wie kopiere ich eine Datei und behalte beide Fassungen?', 'How do I copy a file and keep both versions?'],
  keywords: 'copy paste kopieren einfügen clipboard zwischenablage keep both beide behalten kollison archive',
  steps: [
    s(
      'overview',
      ['Kopieren erhält die Quelldatei', 'Copying preserves the source file'],
      [
        'Wir kopieren practice/note.md nach archive. Danach probieren wir denselben Namen erneut aus, brechen die Kollision ab und erstellen schließlich eine zweite, getrennt benannte Kopie.',
        'We will copy practice/note.md to archive. Then we try the same name again, cancel the collision and finally create another copy with a separate name.',
      ],
      row('practice'),
      { continue: false },
    ),
    s(
      'expand',
      ['Öffne den Quellordner practice', 'Expand the source folder practice'],
      ['Klicke practice, damit du note.md auswählen kannst.', 'Click practice so you can choose note.md.'],
      row('practice'),
      { completion: element(row(paths.note)) },
    ),
    treeContextStep('source-menu', paths.note, 'base', 'copy'),
    s(
      'copy-purpose',
      ['Copy merkt sich die Quelle', 'Copy remembers the source'],
      [
        'Copy im Datei-Kontextmenü kopiert einen Dateieintrag. Es ist eine andere Zwischenablage als Kopieren von markiertem Editor-Text. Der Zielordner wird erst beim Einfügen bestimmt.',
        'Copy in the file context menu copies a file entry. This clipboard is separate from copying selected editor text. The destination folder is chosen when pasting.',
      ],
      a('copy'),
      { prepare: treeContext('base', paths.note, 'copy') },
    ),
    s(
      'copy',
      ['Wähle Copy für note.md', 'Choose Copy for note.md'],
      [
        'Klicke Copy. Das Menü schließt sich. Die Quelle bleibt unverändert und es entsteht noch keine weitere Datei.',
        'Click Copy. The menu closes. The source is unchanged and no additional file is created yet.',
      ],
      a('copy'),
      { prepare: treeContext('base', paths.note, 'copy'), completion: treeAll(treeContextClosed, state('base')) },
    ),
    s(
      'destination-menu',
      ['Öffne die Aktionen des Zielordners archive', 'Open actions for the destination archive'],
      [
        'Öffne das Kontextmenü von archive. Paste wird angeboten, weil ein Dateieintrag zum Kopieren vorgemerkt ist.',
        'Open archive’s context menu. Paste is available because a file entry has been selected for copying.',
      ],
      row('archive'),
      { prepare: treeHolding('base'), gesture: 'contextmenu', completion: element(a('paste')) },
    ),
    s(
      'paste',
      ['Füge note.md in archive ein', 'Paste note.md into archive'],
      [
        'Klicke Paste. archive/note.md soll zusätzlich entstehen. practice/note.md und archive/keep.txt bleiben erhalten.',
        'Click Paste. archive/note.md should be added. practice/note.md and archive/keep.txt are preserved.',
      ],
      a('paste'),
      { prepare: treeClipboard('base', 'archive'), completion: treeAll(treeContextClosed, state('copied')) },
    ),
    s(
      'expand-destination',
      ['Öffne archive', 'Expand archive'],
      [
        'Klicke archive. Darunter sollen keep.txt und die neue note.md sichtbar werden.',
        'Click archive. keep.txt and the new note.md should appear beneath it.',
      ],
      row('archive'),
      { prepare: p('copied'), completion: element(row(paths.copy)) },
    ),
    s(
      'first-result',
      ['Die Kopie ist eine eigene neue Datei', 'The copy is a separate new file'],
      [
        'archive/note.md enthält dieselben Bytes wie die Quelle. Sie ist aber ein eigener, noch unversionierter Pfad. Copy bleibt zum erneuten Einfügen verfügbar.',
        'archive/note.md contains the same bytes as the source. It is a separate, still untracked path. Copy remains available for another paste.',
      ],
      row(paths.copy),
      { prepare: treePrepare('copied', [{ expand: row('archive') }]) },
    ),
    s(
      'repeat-menu',
      ['Öffne archive erneut per Kontextmenü', 'Open archive’s context menu again'],
      [
        'Öffne erneut das Kontextmenü von archive. Die Kopierquelle bleibt practice/note.md.',
        'Open archive’s context menu again. The copy source remains practice/note.md.',
      ],
      row('archive'),
      { prepare: treeHolding('copied'), gesture: 'contextmenu', completion: element(a('paste')) },
    ),
    s(
      'repeat-paste',
      ['Versuche denselben Namen erneut', 'Try the same name again'],
      [
        'Klicke Paste. Weil archive/note.md bereits existiert, soll zuerst eine Entscheidung erscheinen. Noch wird keine Datei ersetzt.',
        'Click Paste. Since archive/note.md already exists, a decision should appear first. No file is replaced yet.',
      ],
      a('paste'),
      { prepare: treeClipboard('copied', 'archive'), completion: element(confirmDialog) },
    ),
    s(
      'collision',
      ['Der Dialog zeigt den betroffenen Zielpfad', 'The dialog identifies the affected destination'],
      [
        'Der Zielpfad ist archive/note.md. Replace überschreibt diesen Eintrag. Keep both erzeugt einen freien Kopienamen. Abbrechen führt keine Dateioperation aus.',
        'The destination is archive/note.md. Replace overwrites that entry. Keep both generates an available copy name. Cancel performs no file operation.',
      ],
      dialog,
      { prepare: treeClipboard('copied', 'archive', paths.note, false, true) },
    ),
    s(
      'cancel',
      ['Brich das erneute Einfügen ab', 'Cancel pasting again'],
      [
        'Klicke Abbrechen. Es soll bei genau einer Kopie bleiben, und die vorhandene Zieldatei soll ihren Inhalt behalten.',
        'Click Cancel. There should still be exactly one copy and the existing destination file should keep its contents.',
      ],
      cancelDialog,
      { prepare: treeClipboard('copied', 'archive', paths.note, false, true), completion: treeClosed('copied') },
    ),
    s(
      'both-menu',
      ['Öffne die Zielaktionen noch einmal', 'Open destination actions once more'],
      [
        'Öffne das Kontextmenü von archive erneut. Wir lösen die gleiche Kollision jetzt durch einen zusätzlichen Namen.',
        'Open archive’s context menu again. This time we resolve the same collision with an additional name.',
      ],
      row('archive'),
      { prepare: treeHolding('copied'), gesture: 'contextmenu', completion: element(a('paste')) },
    ),
    s(
      'both-paste',
      ['Öffne den Kollisionsdialog erneut', 'Open the collision dialog again'],
      [
        'Klicke Paste. Prüfe, dass der Dialog weiterhin archive/note.md als Ziel nennt.',
        'Click Paste. Check that the dialog still identifies archive/note.md as its destination.',
      ],
      a('paste'),
      { prepare: treeClipboard('copied', 'archive'), completion: element(both) },
    ),
    s(
      'both-purpose',
      ['Keep both erhält das bestehende Ziel', 'Keep both preserves the existing destination'],
      [
        'Keep both erstellt eine separat benannte Datei. Bei diesem frischen Beispiel ist note (copy).md frei. Die vorhandene note.md wird weder umbenannt noch überschrieben.',
        'Keep both creates a separately named file. In this fresh example, note (copy).md is available. The existing note.md is neither renamed nor overwritten.',
      ],
      both,
      { prepare: treeClipboard('copied', 'archive', paths.note, false, true) },
    ),
    s(
      'keep-both',
      ['Behalte beide Zieldateien', 'Keep both destination files'],
      [
        'Klicke Keep both. archive soll nun note.md und note (copy).md zusätzlich zu keep.txt enthalten. Beide Kopien sollen den Originalinhalt haben.',
        'Click Keep both. archive should now contain note.md and note (copy).md alongside keep.txt. Both copies must contain the original contents.',
      ],
      both,
      { prepare: treeClipboard('copied', 'archive', paths.note, false, true), completion: treeClosed('kept-both') },
    ),
    s(
      'open-copy',
      ['Öffne die zusätzliche Kopie', 'Open the additional copy'],
      [
        'Klicke archive/note (copy).md. Wir lesen ihren Inhalt im normalen Datei-Viewer.',
        'Click archive/note (copy).md. We will read its contents in the normal file viewer.',
      ],
      row(paths.both),
      { prepare: treePrepare('kept-both', [{ expand: row('archive') }]), completion: element(treeViewer(paths.both)) },
    ),
    s(
      'read-copy',
      ['Auch die zusätzliche Kopie enthält das Original', 'The additional copy contains the original too'],
      [
        'Die Überschrift lautet Übungsnotiz und darunter steht Original. Das Kopieren hat weder die Quelle verändert noch einen Commit erstellt.',
        'The heading is Practice note and the following text says Original. Copying changed neither the source nor the commit history.',
      ],
      c('file-editor'),
      { prepare: treeFile('kept-both', paths.both) },
    ),
    s(
      'close',
      ['Schließe die Kopie', 'Close the copy'],
      ['Schließe den Datei-Viewer mit X. Beide Kopien bleiben erhalten.', 'Close the file viewer with X. Both copies are preserved.'],
      c('close-file'),
      { prepare: treeFile('kept-both', paths.both), completion: { kind: 'absent', selector: treeViewer(paths.both) } },
    ),
    s(
      'open-staging',
      ['Prüfe die zwei neuen Pfade', 'Check the two new paths'],
      [
        'Wechsle zur Staging Area. archive/note.md und archive/note (copy).md sind neu; die Quelle ist unverändert.',
        'Switch to Staging Area. archive/note.md and archive/note (copy).md are new; the source is unchanged.',
      ],
      c('open-staging'),
      { prepare: p('kept-both'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'finish',
      ['Kopieren und Ersetzen haben verschiedene Folgen', 'Copying and replacing have different effects'],
      [
        'Du hast eine Kopie angelegt, eine Kollision abgebrochen und Keep both verwendet. Die nächste Lektion übt Replace mit sichtbar unterschiedlichen Inhalten.',
        'You created a copy, canceled a collision and used Keep both. The next lesson practices Replace with visibly different contents.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: p('kept-both') },
    ),
  ],
};
