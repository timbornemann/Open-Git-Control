import type { TutorialChapter } from './types';
import { branchStep, branchControl as c, branchRow as row, branchElement as element } from './branchLessonHelpers';
import { carryButton as button, carryFile as file } from './branchCarryHelpers';
import { branchParkRecipe as seed, restoreView, restoreResult, stashEntry as entry, stashAction as action } from './branchParkHelpers';
import { graphRow } from './historyLessonHelpers';
const s: typeof branchStep = (id, title, description, target, extra) => branchStep(id, title, description, target, { inspector: 'staging', ...extra });
const preview = '.branch-change-preview';
const selected = (group: 'staged' | 'unstaged' | 'new') => element(file(group) + '[aria-pressed="true"]');
export const TUTORIAL_BRANCHES_PARK_RESTORE: TutorialChapter = {
  id: 'branches-park-restore',
  section: 'repo',
  title: ['Zur geparkten Arbeit zurückkehren und sie wiederherstellen', 'Return to parked work and restore it'],
  description: [
    'Erlebe das Rückkehrangebot, lies die gespeicherten Versionen, wähle Später und öffne die Wiederherstellung erneut über Stashes.',
    'Encounter the return offer, read the saved versions, choose Later and reopen restoration through Stashes.',
  ],
  question: ['Wie stelle ich geparkte Änderungen mit ihrem Staging-Zustand wieder her?', 'How do I restore parked changes with their staged state?'],
  keywords: 'branch park restore wiederherstellen rückkehr stash später anwenden index neue dateien sicherung prüfen',
  steps: [
    s(
      'overview',
      ['Die Sicherung liegt bereit, der Zielbranch ist sauber', 'The backup is ready and the target branch is clean'],
      [
        'Diese Lektion beginnt frisch nach einem vorbereiteten Parkvorgang. feature/begruessung ist sauber; die teilweise gestagte README und notes.txt liegen in „Arbeit für später“. Wir kehren zunächst zum ursprünglichen main zurück.',
        'This lesson starts freshly after a prepared parking operation. feature/begruessung is clean; the partially staged README and notes.txt are saved in “Work for later”. We will first return to the original main branch.',
      ],
      c('staging'),
      { continue: false, prepare: seed('parked') },
    ),
    s(
      'return',
      ['Wechsle zum ursprünglichen main zurück', 'Switch back to the original main branch'],
      [
        'Klicke main. Weil der aktuelle Arbeitsstand sauber ist, kann der Wechsel direkt erfolgen. Anschließend soll die App die zu main gehörende geparkte Arbeit zur Prüfung anbieten.',
        'Click main. The current working state is clean, so the switch can proceed directly. The app should then offer the parked work belonging to main for review.',
      ],
      row('main'),
      { prepare: seed('parked'), completion: element(restoreView) },
    ),
    s(
      'offer',
      ['Die Rückkehr öffnet eine eigene Wiederherstellungsprüfung', 'Returning opens a separate restoration review'],
      [
        'main ist jetzt aktiv. Der Dialog zeigt die gespeicherten Änderungen und bietet Wiederherstellen oder Später an. Das Rückkehrangebot allein hat noch keine Datei zurückgeschrieben.',
        'main is now active. The dialog shows the saved changes and offers Restore or Later. The return offer alone has not written back any file.',
      ],
      restoreView,
      { prepare: seed('offer') },
    ),
    s(
      'sources',
      ['Die Gruppen lesen jetzt die Sicherung', 'The groups now read the backup'],
      [
        'Der aktuelle Arbeitsstand ist noch sauber. Trotzdem zeigt die Prüfung README als gestagt und ungestagt sowie notes.txt als neu. Diese Angaben und ihre Vorschauen stammen aus der gespeicherten Arbeit.',
        'The current working state is still clean. Yet the review shows README as staged and unstaged, with notes.txt as new. Those entries and previews come from the saved work.',
      ],
      restoreView,
      { prepare: seed('offer') },
    ),
    s(
      'open-index',
      ['Öffne die gespeicherte Indexfassung', 'Open the saved index version'],
      [
        'Wähle README unter Gestagt. Prüfe damit, welche Fassung wieder in den Index gelangen soll.',
        'Choose README under Staged. This lets you check which version should return to the index.',
      ],
      file('staged'),
      { prepare: seed('offer'), completion: selected('staged') },
    ),
    s(
      'saved-index',
      ['Die Staging-Begrüßung wurde getrennt gesichert', 'The staging greeting was saved separately'],
      [
        'Die Vorschau ersetzt die Welt-Begrüßung durch Staging. Diese Fassung unterscheidet sich von der zusätzlich bearbeiteten Arbeitsdatei; die Wiederherstellung soll genau diese Trennung erhalten.',
        'The preview replaces the world greeting with staging. This version differs from the further working edit; restoration should preserve that exact distinction.',
      ],
      preview,
      { prepare: seed('offer', { preview: 'staged' }) },
    ),
    s(
      'open-work',
      ['Öffne die zusätzlich gesicherte Bearbeitung', 'Open the additionally saved working edit'],
      [
        'Wähle README unter Ungestagt. Dieser Vergleich liest die gesicherte Indexfassung gegen die gesicherte Arbeitsdatei.',
        'Choose README under Unstaged. This compares the saved index version against the saved working file.',
      ],
      file('unstaged'),
      { prepare: seed('offer', { preview: 'staged' }), completion: selected('unstaged') },
    ),
    s(
      'saved-work',
      ['Auch die Team-Begrüßung ist erhalten', 'The team greeting has survived too'],
      [
        'Staging wird durch Team ersetzt. Diese weitere Bearbeitung soll nach dem Wiederherstellen weiterhin ungestagt bleiben und nicht automatisch in den Index gelangen.',
        'Staging is replaced by team. After restoration this further edit should remain unstaged and should not automatically enter the index.',
      ],
      preview,
      { prepare: seed('offer', { preview: 'unstaged' }) },
    ),
    s(
      'open-new',
      ['Lies die gesicherte neue Datei', 'Read the saved new file'],
      [
        'Wähle notes.txt im dritten Bereich. Wir lesen damit den Inhalt, der beim Parken aus dem Arbeitsordner entfernt und für später gesichert wurde.',
        'Choose notes.txt in the third group. This reads the contents removed from the working directory and saved for later when parking.',
      ],
      file('new'),
      { prepare: seed('offer', { preview: 'unstaged' }), completion: selected('new') },
    ),
    s(
      'saved-new',
      ['notes.txt liegt tatsächlich in der Sicherung', 'notes.txt is actually stored in the backup'],
      [
        'Die hinzugefügten Zeilen zeigen die gespeicherte Übungsnotiz. Die Vorschau stammt nicht aus einer inzwischen neu angelegten Datei des aktuellen Arbeitsordners.',
        'The added lines show the saved practice note. This preview does not come from a newly created file in the current working directory.',
      ],
      preview,
      { prepare: seed('offer', { preview: 'new' }) },
    ),
    s(
      'later',
      ['Verschiebe die Wiederherstellung zunächst', 'Defer restoration for now'],
      [
        'Wähle Später. Dadurch schließen wir nur das Angebot. Die Sicherung bleibt für einen späteren bewussten Einstieg erhalten.',
        'Choose Later. This closes only the offer. The backup remains available for a later deliberate entry.',
      ],
      button('cancel'),
      { prepare: seed('offer', { preview: 'new' }), completion: { kind: 'absent', selector: '[role="dialog"]' } },
    ),
    s(
      'still-saved',
      ['main bleibt sauber und die Arbeit bleibt gesichert', 'main stays clean and the work stays saved'],
      [
        'Es sind weiterhin keine offenen Änderungen zurückgeschrieben. Später bedeutet nicht Löschen. Wir öffnen die geparkte Arbeit nun über den dauerhaft verfügbaren Stash-Bereich.',
        'No uncommitted changes have been written back yet. Later does not mean Delete. We will now open the parked work through the persistent stash area.',
      ],
      c('staging'),
      { prepare: seed('later') },
    ),
    s(
      'open-stashes',
      ['Öffne die Stash-Liste manuell', 'Open the stash list manually'],
      [
        'Klappe Stashes auf. Die benannte Sicherung soll auch nach dem geschlossenen Rückkehrangebot weiterhin erreichbar sein.',
        'Expand Stashes. The named backup should remain accessible after closing the return offer.',
      ],
      c('stash-panel-toggle'),
      { prepare: seed('later'), completion: element(entry) },
    ),
    s(
      'guided-entry',
      ['Wähle die Sicherung des geführten Branchwechsels', 'Identify the guided branch-switch backup'],
      [
        'Dieser Eintrag gehört zur vorbereiteten Branchwechsel-Sicherung. Anwenden führt deshalb erneut in die geführte Prüfung. Nach einer bestätigten erfolgreichen Wiederherstellung wird genau diese zugeordnete Sicherung entfernt.',
        'This entry belongs to the prepared branch-switch backup. Apply therefore returns to the guided review. After confirmed successful restoration, exactly this assigned backup is removed.',
      ],
      entry,
      { prepare: seed('later', { stashes: true }) },
    ),
    s(
      'apply',
      ['Öffne die Prüfung über Anwenden', 'Open the review through Apply'],
      [
        'Wähle Anwenden am Eintrag „Arbeit für später“. Es soll erneut die Wiederherstellungsprüfung erscheinen; das Anklicken allein bestätigt sie noch nicht.',
        'Choose Apply on “Work for later”. The restoration review should reappear; clicking alone does not confirm it yet.',
      ],
      action('apply'),
      { prepare: seed('later', { stashes: true }), completion: element(restoreView) },
    ),
    s(
      'review-again',
      ['Prüfe vor der endgültigen Wiederherstellung', 'Review before the final restoration'],
      [
        'Die drei gespeicherten Quellen sind wieder vorhanden. main ist der aktuelle saubere Arbeitsstand. Wir bestätigen jetzt ihre gemeinsame Wiederherstellung einschließlich Index und neuer Datei.',
        'The three saved sources are present again. main is the current clean working state. We will now confirm restoring them together, including the index and new file.',
      ],
      restoreView,
      { prepare: seed('manual-offer') },
    ),
    s(
      'restore',
      ['Bestätige Wiederherstellen', 'Confirm Restore'],
      [
        'Wähle Wiederherstellen. Dieser Schritt ist erst erfolgreich, wenn die vorgemerkte README-Fassung, ihre weitere Bearbeitung und notes.txt wieder am aktiven main vorhanden sind.',
        'Choose Restore. This step succeeds only once the staged README version, its further working edit and notes.txt are present again on the active main branch.',
      ],
      button('confirm'),
      {
        prepare: seed('manual-offer'),
        completion: {
          kind: 'all',
          conditions: [
            element(restoreResult),
            element(row('main', true)),
            {
              kind: 'working-tree',
              staged: ['README.md'],
              unstaged: ['README.md'],
              untracked: ['notes.txt'],
              content: [
                { path: 'README.md', source: 'index', value: { example: 'history-readme', version: 'index' } },
                { path: 'README.md', source: 'worktree', value: { example: 'history-readme', version: 'work' } },
                { path: 'notes.txt', source: 'worktree', value: { example: 'tree-files', version: 'note' } },
              ],
            },
          ],
        },
      },
    ),
    s(
      'restored',
      ['Das Ergebnis bestätigt den Staging-Zustand', 'The outcome confirms the staged state'],
      [
        'Der Dialog meldet die Wiederherstellung von Änderungen und Staging-Zustand. Der Branch wurde bei diesem Wiederherstellungsschritt nicht noch einmal gewechselt.',
        'The dialog reports restoration of changes and staged state. This restoration step did not switch the branch again.',
      ],
      restoreResult,
      { prepare: seed('restore-result') },
    ),
    s(
      'close',
      ['Schließe das erfolgreiche Ergebnis', 'Close the successful outcome'],
      [
        'Wähle Schließen. Wir kontrollieren danach die Dateibereiche und den entfernten Sicherungseintrag.',
        'Choose Close. We will then inspect the file sections and the removed backup entry.',
      ],
      button('cancel'),
      { prepare: seed('restore-result'), completion: { kind: 'absent', selector: '[role="dialog"]' } },
    ),
    s(
      'index',
      ['README ist wieder teilweise vorgemerkt', 'README is partially staged again'],
      [
        'README steht wieder unter Vorgemerkt. Ihre vorgemerkte Fassung enthält weiterhin die Staging-Begrüßung; die zusätzliche Team-Begrüßung bleibt im Arbeitsordner.',
        'README appears in Staged again. Its staged version still contains the staging greeting; the additional team greeting remains in the working directory.',
      ],
      c('staged-files'),
      { prepare: seed('restored') },
    ),
    s(
      'work',
      ['Der weitere Unterschied bleibt ungestagt', 'The further difference remains unstaged'],
      [
        'Dieselbe Datei steht auch unter Änderungen. Die Wiederherstellung hat nicht alle offenen Inhalte pauschal gestagt. Die Trennung von Index und Arbeitsdatei besteht weiter.',
        'The same file also appears in Changes. Restoration did not stage all uncommitted contents indiscriminately. The distinction between index and working file remains.',
      ],
      c('unstaged-files'),
      { prepare: seed('restored') },
    ),
    s(
      'new',
      ['notes.txt ist wieder neu und unvorgemerkt', 'notes.txt is new and unstaged again'],
      [
        'Die Notiz ist wieder im Arbeitsordner vorhanden, aber noch keinem Commit oder Indexeintrag zugeordnet. Die gespeicherte neue Datei wurde mit ihrem ursprünglichen Zustand zurückgebracht.',
        'The note is back in the working directory but is still in neither a commit nor the index. The saved new file returned in its original state.',
      ],
      c('untracked-files'),
      { prepare: seed('restored') },
    ),
    s(
      'show-backups',
      ['Kontrolliere die Stash-Liste nach dem Erfolg', 'Inspect the stash list after success'],
      [
        'Klappe Stashes auf, falls die Liste geschlossen ist. Die erfolgreich wiederhergestellte geführte Sicherung soll dort nicht mehr erscheinen.',
        'Expand Stashes if the list is closed. The successfully restored guided backup should no longer appear there.',
      ],
      c('stash-panel-toggle'),
      { prepare: seed('restored'), completion: element(c('stashes') + ' .empty-state') },
    ),
    s(
      'backup-removed',
      ['Die zugeordnete Sicherung ist nach bestätigtem Erfolg entfernt', 'The assigned backup is removed after verified success'],
      [
        'Die Liste ist leer. Entfernt wurde nur diese erfolgreich wiederhergestellte Sicherung. Bei einem abgewiesenen oder fehlgeschlagenen Versuch muss gesicherte Arbeit dagegen erhalten bleiben.',
        'The list is empty. Only this successfully restored backup was removed. Saved work must remain after a refused or failed attempt.',
      ],
      c('stashes') + ' .empty-state',
      { prepare: seed('restored', { stashes: true }) },
    ),
    s(
      'history',
      ['Die normale Historie enthält wieder die vier erreichbaren Commits', 'Normal history again contains the four reachable commits'],
      [
        'Der Stash-Verweis ist entfernt, sodass seine zusätzlichen Sicherungsobjekte nicht mehr zur sichtbaren Gesamthistorie gehören. main und feature/begruessung bleiben unverändert an ihrem gespeicherten Stand; die zurückgebrachte Arbeit ist weiterhin offen.',
        'The stash reference is removed, so its additional backup objects no longer belong to visible all history. main and feature/begruessung remain at their saved revision; the restored work is still uncommitted.',
      ],
      graphRow(4),
      { prepare: seed('restored') },
    ),
    s(
      'finish',
      ['Du kannst Rückkehr und Wiederherstellung bewusst steuern', 'You can deliberately control returning and restoration'],
      [
        'Du hast das Rückkehrangebot geprüft, Später gewählt, die Sicherung manuell wiedergefunden und ihre drei Dateizustände wiederhergestellt. Weiter beendet diese Lektion mit weiterhin offenen, getrennten Fassungen im Lernprojekt.',
        'You inspected the return offer, chose Later, found the backup manually and restored its three file states. Next completes this lesson with the separate versions still uncommitted in the learning project.',
      ],
      c('staging'),
      { prepare: seed('restored') },
    ),
  ],
};
