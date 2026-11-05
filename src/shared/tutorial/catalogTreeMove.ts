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
  treeContextClosed,
  treeAll,
  c,
  row,
  element,
  p,
  state,
  paths,
} from './treeLessonHelpers';
const noPaste = '.working-tree-context-menu:not(:has([data-tree-action="paste"]))';
export const TUTORIAL_TREE_MOVE: TutorialChapter = {
  id: 'tree-move',
  section: 'repo',
  title: ['Dateien mit Cut und Paste verschieben', 'Move files with Cut and Paste'],
  description: [
    'Ausschneiden zunächst ohne Änderung vormerken, in einen anderen Ordner einfügen und Quelle sowie Index kontrollieren.',
    'Mark a cut without changing files yet, paste into another folder and check the source and index.',
  ],
  question: ['Wie verschiebe ich eine Datei in einen anderen Ordner?', 'How do I move a file into another folder?'],
  keywords: 'move verschieben cut paste ausschneiden einfügen zwischenablage source quelle index',
  steps: [
    s(
      'overview',
      ['Verschieben entfernt die Quelle erst beim Einfügen', 'Moving removes the source only when pasting'],
      [
        'Wir verschieben practice/note.md nach archive/note.md. Anders als Copy soll Cut die ursprüngliche Arbeitsdatei nach dem erfolgreichen Einfügen entfernen. Die gespeicherten Git-Stände bleiben vorerst erhalten.',
        'We will move practice/note.md to archive/note.md. Unlike Copy, Cut should remove the original working file after a successful paste. Saved Git versions are preserved for now.',
      ],
      row('practice'),
      { continue: false },
    ),
    s(
      'expand',
      ['Öffne practice', 'Expand practice'],
      ['Klicke practice, damit note.md sichtbar wird.', 'Click practice to reveal note.md.'],
      row('practice'),
      { completion: element(row(paths.note)) },
    ),
    treeContextStep('source-menu', paths.note, 'base', 'cut'),
    s(
      'cut-purpose',
      ['Cut merkt sich eine Verschiebeabsicht', 'Cut records an intention to move'],
      [
        'Cut löscht die Datei noch nicht. Die Anwendung merkt sich Quelle und Aktion. Erst Paste führt die Verschiebung zum ausgewählten Ziel aus.',
        'Cut does not delete the file yet. The app remembers the source and action. Paste performs the move to the selected destination.',
      ],
      a('cut'),
      { prepare: treeContext('base', paths.note, 'cut') },
    ),
    s(
      'cut',
      ['Wähle Cut', 'Choose Cut'],
      [
        'Klicke Cut für note.md. Das Menü schließt sich; practice/note.md soll weiterhin unverändert vorhanden sein.',
        'Click Cut for note.md. The menu closes; practice/note.md should still be present and unchanged.',
      ],
      a('cut'),
      { prepare: treeContext('base', paths.note, 'cut'), completion: treeAll(treeContextClosed, state('base')) },
    ),
    s(
      'destination-menu',
      ['Wähle archive als Ziel', 'Choose archive as the destination'],
      [
        'Öffne das Kontextmenü von archive. Paste verwendet den Ordner des geöffneten Menüs als Ziel.',
        'Open archive’s context menu. Paste uses the folder of the open menu as its destination.',
      ],
      row('archive'),
      { prepare: treeHolding('base', paths.note, true), gesture: 'contextmenu', completion: element(a('paste')) },
    ),
    s(
      'paste',
      ['Führe die Verschiebung aus', 'Perform the move'],
      [
        'Klicke Paste. archive/note.md soll mit dem Originalinhalt entstehen und practice/note.md aus dem Arbeitsordner verschwinden. other.md und keep.txt bleiben erhalten.',
        'Click Paste. archive/note.md should be created with the original contents and practice/note.md should disappear from the worktree. other.md and keep.txt are preserved.',
      ],
      a('paste'),
      { prepare: treeClipboard('base', 'archive', paths.note, true), completion: treeAll(treeContextClosed, state('moved')) },
    ),
    s(
      'source-index',
      ['Verschieben im Arbeitsordner ändert den Index noch nicht', 'Moving in the worktree does not change the index yet'],
      [
        'Die Arbeitsdatei hat einen anderen Pfad. Im Index und im letzten Commit ist noch practice/note.md gespeichert. Das spätere Vormerken muss deshalb die alte und die neue Seite berücksichtigen.',
        'The working file has a different path. The index and last commit still store practice/note.md. Staging later must therefore account for both the old and new sides.',
      ],
      row('archive'),
      { prepare: p('moved') },
    ),
    s(
      'cleared-menu',
      ['Prüfe die abgeschlossene Verschiebeabsicht', 'Check that the pending move was cleared'],
      [
        'Öffne das Kontextmenü von archive erneut. Nach dem erfolgreichen Verschieben soll dort kein Paste mehr für die verbrauchte Cut-Quelle angeboten werden.',
        'Open archive’s context menu again. After the successful move, Paste should no longer be offered for the consumed Cut source.',
      ],
      row('archive'),
      { prepare: p('moved'), gesture: 'contextmenu', completion: element(noPaste) },
    ),
    s(
      'cleared',
      ['Cut wird nach Erfolg verbraucht', 'Cut is consumed after success'],
      [
        'Paste fehlt jetzt. Für ein weiteres Verschieben würdest du erneut eine Quelle ausschneiden. Copy bleibt dagegen für mehrere Einfügevorgänge verfügbar.',
        'Paste is absent now. To move another entry you would cut a source again. Copy, by contrast, remains available for repeated pastes.',
      ],
      '.working-tree-context-menu__header',
      { prepare: treeContext('moved', 'archive', 'create-file') },
    ),
    s(
      'close-menu',
      ['Schließe das Menü und öffne archive', 'Close the menu and expand archive'],
      [
        'Klicke den Ordner archive außerhalb des Menüs. Das Menü schließt sich und du kannst die verschobene Datei auswählen.',
        'Click the archive folder outside the menu. The menu closes and you can select the moved file.',
      ],
      row('archive'),
      { prepare: treeContext('moved', 'archive', 'create-file'), completion: treeContextClosed },
    ),
    s(
      'open-result',
      ['Öffne die verschobene Datei', 'Open the moved file'],
      [
        'Öffne archive/note.md. Falls archive noch geschlossen ist, klappe den Ordner zuerst auf.',
        'Open archive/note.md. If archive is still collapsed, expand it first.',
      ],
      row(paths.copy),
      { prepare: treePrepare('moved', [{ expand: row('archive') }]), completion: element(treeViewer(paths.copy)) },
    ),
    s(
      'contents',
      ['Der Inhalt blieb beim Verschieben erhalten', 'Moving preserved the contents'],
      [
        'Die Datei zeigt weiterhin Übungsnotiz und Original. Nur ihr Arbeitspfad hat sich geändert. Speichern ist nicht erforderlich, weil kein Editorentwurf entstanden ist.',
        'The file still shows Practice note and Original. Only its worktree path changed. Saving is unnecessary because no editor draft was created.',
      ],
      c('file-editor'),
      { prepare: treeFile('moved', paths.copy) },
    ),
    s('close', ['Schließe die Datei', 'Close the file'], ['Schließe den Datei-Viewer mit X.', 'Close the file viewer with X.'], c('close-file'), {
      prepare: treeFile('moved', paths.copy),
      completion: { kind: 'absent', selector: treeViewer(paths.copy) },
    }),
    s(
      'open-staging',
      ['Prüfe beide Seiten der Pfadänderung', 'Check both sides of the path change'],
      [
        'Wechsle zur Staging Area. Der alte Pfad fehlt und der neue Pfad ist noch unversioniert. Vormerken ist weiterhin eine eigene Aktion.',
        'Switch to Staging Area. The old path is missing and the new path is still untracked. Staging remains a separate action.',
      ],
      c('open-staging'),
      { prepare: p('moved'), completion: element(`${c('open-staging')}[aria-pressed="true"]`) },
    ),
    s(
      'finish',
      ['Eine Verschiebung gehört als zusammengehörige Änderung geprüft', 'Review a move as a related set of changes'],
      [
        'Du hast Cut zunächst ohne Dateiveränderung verwendet und die Verschiebung mit Paste abgeschlossen. Git kann zusammengehörige Löschung und neue Datei als Umbenennung erkennen; das hängt von Vergleich und Inhalt ab.',
        'You used Cut without initially changing a file, then completed the move with Paste. Git can recognize the related deletion and new file as a rename, depending on the comparison and contents.',
      ],
      c('staging'),
      { openView: undefined, inspector: 'staging', prepare: p('moved') },
    ),
  ],
};
