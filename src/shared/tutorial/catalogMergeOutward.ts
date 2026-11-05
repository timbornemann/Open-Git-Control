import type { TutorialChapter } from './types';
import { branchRow } from './branchLessonHelpers';
import { graphRow } from './historyLessonHelpers';
import {
  mergeStep as s,
  mergeRecipe,
  mergeControl as c,
  mergeMore,
  mergeOpen,
  mergeSource,
  mergeHead,
  mergeDialog,
  mergeContext,
  mergeConfirm,
  element,
  value,
} from './mergeLessonHelpers';
const seed = (options: Parameters<typeof mergeRecipe>[0] = {}) => mergeRecipe({ current: mergeSource, ...options });
const outward = (stage: 'menu' | 'review' | 'result', selected = true) =>
  seed({ stage, outward: true, selected, mode: stage === 'menu' ? 'default' : 'ffOnly' });
export const TUTORIAL_MERGE_OUTWARD: TutorialChapter = {
  id: 'merge-outward',
  section: 'repo',
  title: ['Aktuellen Branch in ein anderes lokales Ziel übernehmen', 'Merge the current branch into another local target'],
  description: [
    'Beginne auf dem neueren Beispielbranch, prüfe die automatische Zielumschaltung und führe den Fast-forward in main aus.',
    'Start on the newer sample branch, review the automatic target switch and fast-forward main.',
  ],
  question: ['Wie führe ich meinen aktuellen Branch in einen anderen Branch zusammen?', 'How do I merge my current branch into another branch?'],
  keywords: 'merge outward aktuell weitergeben anderer zielbranch lokal automatisch wechseln',
  steps: [
    s(
      'overview',
      ['Diesmal beginnt die Übung auf der Quelle', 'This time the exercise starts on the source'],
      [
        'feature/begruessung ist aktiv und einen Commit neuer als main. Du musst für diese Richtung nicht selbst vorab zum Ziel wechseln: Die Aktion führt den Wechsel nach der Bestätigung aus.',
        'feature/begruessung is active and one commit newer than main. For this direction you do not need to switch to the target yourself beforehand: the action switches after confirmation.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'current',
      ['Der aktive Beispielbranch liefert die Änderungen', 'The active sample branch provides changes'],
      [
        'HEAD steht auf feature/begruessung am neueren Commit. Dieser Branch bleibt durch die Weitergabe unverändert.',
        'HEAD points to feature/begruessung on the newer commit. Providing its changes leaves this branch unchanged.',
      ],
      mergeHead(4),
      { prepare: seed() },
    ),
    s(
      'target',
      ['main soll den neueren Stand erhalten', 'main should receive the newer revision'],
      [
        'Der lokale Zielbranch steht hier noch am älteren Commit. Nach dem Vorgang soll main aktiv am Quellenstand stehen.',
        'The local target still points to the older commit here. After the action, main should be active on the source revision.',
      ],
      graphRow(3),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne weitere Aktionen', 'Open more actions'],
      ['Öffne das Dreipunktmenü in der oberen Leiste.', 'Open the three-dot menu in the top bar.'],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s(
      'open',
      ['Öffne Zusammenführen', 'Open Merge'],
      [
        'Öffne die Auswahl. Ihre voreingestellte Richtung übernimmt noch in den aktuellen Branch.',
        'Open the picker. Its initial direction still takes changes into the current branch.',
      ],
      mergeOpen,
      { prepare: seed({ stage: 'more' }), completion: element(c('source')) },
    ),
    s(
      'outward',
      ['Wähle Aktuellen Branch weitergeben', 'Choose Current into another'],
      [
        'Wähle die zweite Richtung. Dein aktiver Beispielbranch wird dadurch zur Quelle; das Auswahlfeld fragt jetzt nach einem anderen lokalen Ziel.',
        'Choose the second direction. Your active sample branch becomes the source; the selector now asks for another local target.',
      ],
      c('outward'),
      { prepare: seed({ stage: 'menu' }), completion: element(c('outward') + '[aria-pressed="true"]') },
    ),
    s(
      'requirements',
      ['Die offene Arbeit muss vor dem Wechsel gesichert sein', 'Save open work before switching'],
      [
        'Diese Übung beginnt sauber. Bei eigener offener Arbeit musst du vor dieser Aktion committen oder stashen. Die App prüft Quelle und Ziel vor der Ausführung erneut.',
        'This exercise starts clean. With your own open work, commit or stash before this action. The app rechecks source and target before performing it.',
      ],
      c('outward'),
      { prepare: outward('menu', false) },
    ),
    s(
      'choose-target',
      ['Wähle main als lokales Ziel', 'Choose main as the local target'],
      [
        'Wähle main. In dieser Richtung werden andere lokale Branches angeboten; ein Remote-Verweis wird nicht direkt ausgecheckt.',
        'Choose main. This direction offers other local branches; it does not directly check out a remote-tracking reference.',
      ],
      c('source'),
      { prepare: outward('menu', false), completion: value(c('source'), 'main') },
    ),
    s(
      'flow',
      ['Prüfe feature/begruessung nach main', 'Check feature/begruessung into main'],
      [
        'Der Pfeil zeigt vom aktiven neueren Branch zum älteren main. main wird den Stand erhalten und anschließend aktiv bleiben.',
        'The arrow runs from the active newer branch to the older main. main will receive the revision and stay active afterwards.',
      ],
      c('flow'),
      { prepare: outward('menu') },
    ),
    s(
      'mode',
      ['Wähle Nur Branch nachziehen (Fast-forward)', 'Choose Only advance the branch (fast-forward)'],
      [
        'Wähle Nur Branch nachziehen (Fast-forward). main kann hier entlang der vorhandenen Geschichte vorgezogen werden.',
        'Choose Only advance the branch (fast-forward). main can advance along the existing history here.',
      ],
      c('mode'),
      { prepare: outward('menu'), completion: value(c('mode'), 'ffOnly') },
    ),
    s(
      'review',
      ['Öffne die Prüfung des automatischen Wechsels', 'Review the automatic switch'],
      [
        'Klicke Weiter · Merge prüfen. Das öffnet die Bestätigung; feature/begruessung bleibt bis zur Ausführung aktiv.',
        'Click Continue · review merge. This opens confirmation; feature/begruessung stays active until execution.',
      ],
      c('review'),
      { prepare: seed({ stage: 'menu', outward: true, selected: true, mode: 'ffOnly' }), completion: element(mergeDialog) },
    ),
    s(
      'review-source',
      ['Die Quelle ist dein bisheriger aktiver Branch', 'The source is your previously active branch'],
      [
        'Von muss feature/begruessung zeigen. Die App hat dessen Commit-Stand für diese Prüfung erfasst.',
        'From must show feature/begruessung. The app has captured its commit revision for this review.',
      ],
      mergeContext(1),
      { prepare: outward('review') },
    ),
    s(
      'review-target',
      ['Das Ziel wird nach dem Wechsel aktiv bleiben', 'The target will stay active after switching'],
      [
        'Nach muss main zeigen. Bei einem Konflikt würdest du ebenfalls auf diesem Ziel bleiben und ihn dort lösen oder den Merge abbrechen.',
        'Into must show main. With a conflict you would also remain on this target to resolve it or abort the merge.',
      ],
      mergeContext(2),
      { prepare: outward('review') },
    ),
    s(
      'confirm',
      ['Wechsle automatisch zum Ziel und führe zusammen', 'Automatically switch to the target and merge'],
      [
        'Bestätige Wechseln und zusammenführen. Die App soll main aktivieren und an den bestehenden neueren Commit vorziehen.',
        'Confirm Switch and merge. The app should activate main and advance it to the existing newer commit.',
      ],
      mergeConfirm,
      { prepare: outward('review'), completion: { kind: 'all', conditions: [element(branchRow('main', true)), element(mergeHead(4))] } },
    ),
    s(
      'active-target',
      ['main ist jetzt der aktive Zielbranch', 'main is now the active target branch'],
      [
        'HEAD gehört nun zu main. Es ist kein zusätzlicher Commit entstanden, weil der Zielstand per Fast-forward übernommen wurde.',
        'HEAD now belongs to main. No additional commit was created because the target advanced by fast-forward.',
      ],
      mergeHead(4),
      { prepare: outward('result') },
    ),
    s(
      'source-kept',
      ['Der bisherige aktive Branch bleibt erhalten', 'The previously active branch is retained'],
      [
        'feature/begruessung steht unverändert am selben neueren Commit. Er ist jetzt inaktiv; beide Branch-Namen zeigen auf denselben Stand.',
        'feature/begruessung remains unchanged on the same newer commit. It is now inactive; both branch names point to the same revision.',
      ],
      branchRow(mergeSource, false),
      { prepare: outward('result') },
    ),
    s(
      'finish',
      ['Die Richtung umfasst auch den bewussten Branchwechsel', 'The direction also includes a deliberate branch switch'],
      [
        'Du hast Quelle und lokales Ziel geprüft, den automatischen Wechsel bestätigt und das Ergebnis kontrolliert. Die Dateien folgen main am neuen Stand, offene Änderungen fehlen und es wurde nichts hochgeladen.',
        'You reviewed the source and local target, confirmed the automatic switch and checked the result. The files follow main at its new revision, there are no open changes and nothing was uploaded.',
      ],
      '[data-tutorial="graph"]',
      { prepare: outward('result') },
    ),
  ],
};
