import type { TutorialChapter } from './types';
import {
  tagStep as s,
  tagRecipe,
  tagPanel as panel,
  tagControl as c,
  tagRow as row,
  tagName as name,
  tagDeleteDialog as dialog,
  tagConfirm,
  tagCancel,
  element,
} from './tagLessonHelpers';
import { branchControl } from './branchLessonHelpers';
import { graphRow, commitPanel } from './historyLessonHelpers';
const seed = (options: Parameters<typeof tagRecipe>[0] = {}) => tagRecipe({ created: true, message: true, ...options });
export const TUTORIAL_TAGS_DELETE: TutorialChapter = {
  id: 'tags-delete',
  section: 'repo',
  title: ['Lokalen Tag gezielt löschen und den Commit behalten', 'Delete a local tag while preserving its commit'],
  description: [
    'Prüfe die lokale Löschbestätigung, brich zuerst ab und entferne dann nur die vorbereitete Markierung. Kontrolliere Commit, Branch und den anderen Tag.',
    'Review the local deletion confirmation, cancel first, then remove only the prepared marker. Check the commit, branch and other tag.',
  ],
  question: ['Wie lösche ich einen lokalen Tag und was bleibt dabei erhalten?', 'How do I delete a local tag and what is preserved?'],
  keywords: 'tag tags löschen delete lokal abbrechen cancel bestätigung commit bleibt remote server version markierung',
  steps: [
    s(
      'overview',
      ['Wir entfernen eine Markierung, nicht ihren Commit', 'We remove a marker, not its commit'],
      [
        'v1.1.0 wurde für diese Übung als annotierter Tag am vierten Commit vorbereitet. v1.0.0 zeigt weiterhin auf den zweiten. Wir löschen ausschließlich den neuen lokalen Tag.',
        'For this exercise v1.1.0 is prepared as an annotated tag at the fourth commit. v1.0.0 still points to the second. We will delete only the new local tag.',
      ],
      branchControl('sidebar-toggle'),
      { continue: false, prepare: seed({ sidebarCollapsed: true }) },
    ),
    s(
      'sidebar',
      ['Öffne die Git-Seitenleiste', 'Open the Git sidebar'],
      ['Öffne oben links die Git-Karten.', 'Open the Git cards at the upper left.'],
      branchControl('sidebar-toggle'),
      { prepare: seed({ sidebarCollapsed: true }), completion: element(panel) },
    ),
    s(
      'target',
      ['Prüfe die richtige Tag-Karte', 'Check the correct tag card'],
      [
        'v1.1.0 ist das Löschziel. v1.0.0 soll erhalten bleiben. Achte beim kleinen X darauf, zu welchem Namen es gehört.',
        'v1.1.0 is the deletion target. v1.0.0 should be retained. Check which name the small X belongs to.',
      ],
      row(name),
      { prepare: seed() },
    ),
    s(
      'open',
      ['Öffne die Löschbestätigung mit Enter', 'Open the deletion confirmation with Enter'],
      [
        'Fokussiere das X von v1.1.0 und drücke Enter. Dadurch soll nur die Löschbestätigung geöffnet werden.',
        'Focus v1.1.0’s X and press Enter. This should open only the deletion confirmation.',
      ],
      row(name) + ' ' + c('delete'),
      { prepare: seed(), gesture: 'enter', completion: element(dialog) },
    ),
    s(
      'name',
      ['Die Bestätigung muss v1.1.0 nennen', 'The confirmation must identify v1.1.0'],
      [
        'Prüfe den konkreten Namen im Kontext der Bestätigung. Die Auswahl eines Löschknopfs allein hat noch nichts entfernt.',
        'Check the exact name in the confirmation context. Selecting the delete button alone has removed nothing.',
      ],
      dialog + ' .dialog-context-list',
      { prepare: seed({ deleting: true }) },
    ),
    s(
      'scope',
      ['Diese Aktion entfernt nur die lokale Referenz', 'This action removes only the local reference'],
      [
        'Ein bereits veröffentlichter Tag bliebe auf dem Server, bis er dort ausdrücklich entfernt wird. Der vorbereitete neue Tag wurde in dieser Übung nicht veröffentlicht. Diese Aktion löscht auch keinen Commit oder Release.',
        'A previously published tag would remain on the server until explicitly deleted there. The new sample tag has not been published in this exercise. This action also deletes no commit or release.',
      ],
      dialog + ' .dialog-impact',
      { prepare: seed({ deleting: true }) },
    ),
    s(
      'cancel',
      ['Brich den ersten Löschversuch ab', 'Cancel the first deletion attempt'],
      ['Wähle Abbrechen. Beide lokalen Tag-Namen sollen erhalten bleiben.', 'Choose Cancel. Both local tag names should be retained.'],
      tagCancel,
      {
        prepare: seed({ deleting: true }),
        completion: { kind: 'all', conditions: [{ kind: 'absent', selector: dialog }, element(row(name)), element(row('v1.0.0'))] },
      },
    ),
    s(
      'kept',
      ['Der abgebrochene Tag ist weiterhin vorhanden', 'The cancelled tag still exists'],
      [
        'v1.1.0 steht weiterhin am vierten Commit. Abbrechen hat keine vorgemerkte Löschaktion hinterlassen.',
        'v1.1.0 still points to the fourth commit. Cancelling left no pending deletion.',
      ],
      row(name),
      { prepare: seed() },
    ),
    s(
      'retry',
      ['Fordere die Löschung erneut an', 'Request deletion again'],
      ['Klicke noch einmal das X von v1.1.0.', 'Click v1.1.0’s X again.'],
      row(name) + ' ' + c('delete'),
      { prepare: seed(), completion: element(dialog) },
    ),
    s(
      'review',
      ['Prüfe Name und lokalen Umfang erneut', 'Review the name and local scope again'],
      [
        'Der frühere Abbruch war keine Freigabe. Diese Bestätigung betrifft wieder ausschließlich den lokalen Tag v1.1.0.',
        'The earlier cancellation was not authorization. This confirmation again concerns only the local v1.1.0 tag.',
      ],
      dialog,
      { prepare: seed({ deleting: true }) },
    ),
    s(
      'delete',
      ['Entferne jetzt die lokale Übungsmarkierung', 'Now remove the local practice marker'],
      [
        'Bestätige Tag löschen. Der neue Tag soll verschwinden, während der alte Tag und HEAD erhalten bleiben.',
        'Confirm Delete tag. The new tag should disappear while the old tag and HEAD are retained.',
      ],
      tagConfirm,
      {
        prepare: seed({ deleting: true }),
        completion: {
          kind: 'all',
          conditions: [
            { kind: 'absent', selector: row(name) },
            { kind: 'absent', selector: dialog },
            element(row('v1.0.0')),
            element(graphRow(4) + '[data-commit-head="true"]'),
          ],
        },
      },
    ),
    s(
      'removed',
      ['Nur v1.1.0 wurde aus der Karte entfernt', 'Only v1.1.0 was removed from the card'],
      [
        'Die lokale Tag-Liste enthält weiterhin v1.0.0. Es wurde kein anderer Name mitgelöscht.',
        'The local tag list still contains v1.0.0. No other name was deleted.',
      ],
      panel,
      { prepare: seed({ deleted: true }) },
    ),
    s(
      'commit',
      ['main und sein Commit sind erhalten', 'main and its commit are preserved'],
      [
        'Der vierte Commit bleibt HEAD von main. Nur seine zusätzliche Tag-Beschriftung fehlt. Index und Arbeitsdateien sind unverändert.',
        'The fourth commit remains main’s HEAD. Only its additional tag label is absent. The index and working files are unchanged.',
      ],
      graphRow(4),
      { prepare: seed({ deleted: true }) },
    ),
    s(
      'old',
      ['Öffne den erhaltenen alten Tag', 'Open the retained old tag'],
      ['Klicke v1.0.0, um seinen unveränderten Ziel-Commit zu prüfen.', 'Click v1.0.0 to inspect its unchanged target commit.'],
      row('v1.0.0'),
      { prepare: seed({ deleted: true }), completion: element(commitPanel(2)) },
    ),
    s(
      'old-commit',
      ['Der alte Tag zeigt weiterhin auf denselben Commit', 'The old tag still points to the same commit'],
      [
        'v1.0.0 führt weiterhin zum zweiten Commit. Die Löschung einer anderen Markierung hat diesen Stand nicht verändert.',
        'v1.0.0 still leads to the second commit. Deleting another marker did not change that revision.',
      ],
      commitPanel(2),
      { prepare: seed({ deleted: true, selected: 'old' }) },
    ),
    s(
      'finish',
      ['Lokale Tag-Löschung und Commit-Löschung sind verschieden', 'Local tag deletion differs from deleting a commit'],
      [
        'Du hast das Ziel geprüft, zuerst abgebrochen und dann nur die lokale Markierung entfernt. Der aktive Branch, seine Dateien und der andere Tag sind erhalten. Weiter beendet die Lektion.',
        'You checked the target, cancelled first and then removed only the local marker. The active branch, its files and the other tag are preserved. Next finishes the lesson.',
      ],
      panel,
      { prepare: seed({ deleted: true }) },
    ),
  ],
};
