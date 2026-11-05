import type { TutorialChapter, TutorialCompletion } from './types';
import { mergeGuardRecipe as seed, mergeFailure, mergeFailureClose } from './mergeGuardHelpers';
import {
  mergeStep as s,
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
import { graphRow } from './historyLessonHelpers';
const untouched: TutorialCompletion = {
  kind: 'all',
  conditions: [element(mergeHead(4)), element(graphRow(5)), { kind: 'working-tree', staged: [], unstaged: [], untracked: [] }],
};
export const TUTORIAL_MERGE_GUARD: TutorialChapter = {
  id: 'merge-ff-guard',
  section: 'repo',
  title: ['Fast-forward abgelehnt: Zustand prüfen und bewusst fortfahren', 'Fast-forward refused: inspect the state and choose how to proceed'],
  description: [
    'Erlebe die Grenze von Fast-forward-only bei zwei eigenen Entwicklungslinien. Prüfe den erhaltenen Zustand und starte danach einen normalen Merge.',
    'Try the limit of fast-forward-only with two independent development lines. Check the preserved state, then start a normal merge.',
  ],
  question: ['Warum scheitert Fast-forward, obwohl meine Dateien keinen Konflikt haben?', 'Why does fast-forward fail even when my files have no conflict?'],
  keywords: 'merge fast forward ff only abgelehnt fehler diverged auseinanderentwickelt zustand unverändert erneut standard',
  steps: [
    s(
      'overview',
      ['Keine Textkonflikte bedeutet noch keinen Fast-forward', 'No text conflicts does not yet mean fast-forward'],
      [
        'main hat die README geändert, feature/begruessung einen Hinweis in LICENSE ergänzt. Beide Branches besitzen einen eigenen Commit. Die Dateien wären automatisch kombinierbar; das gewählte Verfahren darf trotzdem enger sein.',
        'main changed README and feature/begruessung added a note to LICENSE. Both branches have their own commit. The files could be combined automatically, but the chosen behavior can still be more restrictive.',
      ],
      '[data-tutorial="graph"]',
      { continue: false, prepare: seed() },
    ),
    s(
      'target',
      ['main steht am vierten Commit', 'main points to the fourth commit'],
      [
        'Merke dir den bisherigen Zielstand. Eine abgelehnte eingeschränkte Zusammenführung soll ihn erhalten.',
        'Note the current target revision. A refused restricted merge should preserve it.',
      ],
      mergeHead(4),
      { prepare: seed() },
    ),
    s(
      'source-before',
      ['Der Quellen-Commit liegt auf einer anderen Linie', 'The source commit is on a different line'],
      [
        'Der fünfte Commit enthält den Projekthinweis, aber nicht die README-Änderung von main. Einfaches Vorziehen würde deshalb nicht beide Linien verbinden.',
        'The fifth commit contains the project note but not main’s README change. Simply advancing the branch would therefore not join both lines.',
      ],
      graphRow(5),
      { prepare: seed() },
    ),
    s(
      'more',
      ['Öffne die weiteren Aktionen', 'Open more actions'],
      ['Öffne das Dreipunktmenü der oberen Leiste.', 'Open the top bar’s three-dot menu.'],
      mergeMore,
      { prepare: seed(), completion: element(mergeOpen) },
    ),
    s('open', ['Öffne Zusammenführen', 'Open Merge'], ['Öffne das Formular für Quelle und Verfahren.', 'Open the source and behavior form.'], mergeOpen, {
      prepare: seed('more'),
      completion: element(c('source')),
    }),
    s(
      'source',
      ['Wähle feature/begruessung', 'Choose feature/begruessung'],
      ['Lass In aktuellen Branch ausgewählt. main soll das Ziel bleiben.', 'Keep Into current branch selected. main should remain the target.'],
      c('source'),
      { prepare: seed('menu', false, 'default'), completion: value(c('source'), mergeSource) },
    ),
    s(
      'mode',
      ['Erlaube diesmal ausschließlich Fast-forward', 'Allow only fast-forward this time'],
      [
        'Wähle Nur Branch nachziehen (Fast-forward). Diese Einschränkung darf keinen Merge-Commit als Ersatz erzeugen.',
        'Choose Only advance the branch (fast-forward). This restriction must not create a merge commit as a fallback.',
      ],
      c('mode'),
      { prepare: seed('menu', true, 'default'), completion: value(c('mode'), 'ffOnly') },
    ),
    s(
      'behavior',
      ['Das Verfahren prüft die Entwicklungslinien', 'The behavior checks the development lines'],
      [
        'Fast-forward benötigt eine gerade Fortsetzung des Ziel-Commits. Es geht hier um gespeicherte Historie, nicht um die Zahl offener Dateien oder Textkonflikte.',
        'Fast-forward needs a direct continuation of the target commit. This concerns saved history, not the number of open files or text conflicts.',
      ],
      c('behavior'),
      { prepare: seed('menu', true) },
    ),
    s(
      'review',
      ['Prüfe die eingeschränkte Zusammenführung', 'Review the restricted merge'],
      ['Öffne die abschließende Bestätigung.', 'Open the final confirmation.'],
      c('review'),
      { prepare: seed('menu', true), completion: element(mergeDialog) },
    ),
    s(
      'source-review',
      ['Die Quelle bleibt feature/begruessung', 'The source remains feature/begruessung'],
      ['Wir ändern die Quelle nicht, um die Einschränkung zu umgehen.', 'We do not change the source to bypass the restriction.'],
      mergeContext(1),
      { prepare: seed('review') },
    ),
    s(
      'target-review',
      ['Das Ziel bleibt main', 'The target remains main'],
      [
        'Die App soll den aktiven Branch nicht unbemerkt auf die Quellenlinie wechseln.',
        'The app should not silently move the active branch to the source line.',
      ],
      mergeContext(2),
      { prepare: seed('review') },
    ),
    s(
      'mode-review',
      ['Nur Branch nachziehen bleibt die bestätigte Auswahl', 'Only advance the branch remains the confirmed choice'],
      [
        'Das Verfahren ist verbindlich. Ein normaler Merge wäre eine neue, eigene Entscheidung.',
        'The behavior is binding. A normal merge would require a separate choice.',
      ],
      mergeContext(3),
      { prepare: seed('review') },
    ),
    s(
      'attempt',
      ['Probiere den eingeschränkten Merge aus', 'Try the restricted merge'],
      [
        'Bestätige Zusammenführen. In diesem vorbereiteten Fall muss Fast-forward abgelehnt werden und der Dateistand erhalten bleiben.',
        'Confirm Merge. In this prepared case fast-forward must be refused and the file state preserved.',
      ],
      mergeConfirm,
      {
        prepare: seed('review'),
        completion: {
          kind: 'all',
          conditions: [
            untouched,
            { kind: 'feedback', trigger: mergeConfirm, message: ['Not possible to fast-forward', 'Not possible to fast-forward'], error: true },
          ],
        },
      },
    ),
    s(
      'notice',
      ['Die Ablehnung ist das erwartete Ergebnis', 'The refusal is the expected result'],
      [
        'Die beiden Linien lassen sich nicht nur vorziehen. Die App hat keinen anderen Merge automatisch ausgeführt. Für diese lokalen Beispielbranches ist weder ein Upload noch eine Anmeldung nötig.',
        'The two lines cannot be combined by advancing alone. The app did not automatically run a different merge. These local sample branches need neither upload nor sign-in.',
      ],
      mergeFailure + ' .toast-msg',
      { prepare: seed('rejected') },
    ),
    s(
      'preserved-head',
      ['HEAD und main sind am alten Zielstand geblieben', 'HEAD and main remain at the old target revision'],
      [
        'Der vierte Commit bleibt aktiv, der fünfte Quellen-Commit ist ebenfalls erhalten. Eine Fehlermeldung bedeutet hier keine teilweise Zusammenführung.',
        'The fourth commit remains active and the fifth source commit is also preserved. Here the error does not mean that a partial merge occurred.',
      ],
      mergeHead(4),
      { prepare: seed('rejected') },
    ),
    s(
      'preserved-index',
      ['Der Index enthält keine vorbereiteten Merge-Änderungen', 'The index contains no prepared merge changes'],
      [
        'Arbeitsdateien und Index entsprechen weiterhin main. Es gibt weder vorgemerkte Änderungen noch einen offenen Konflikt-Merge zum Fortsetzen.',
        'Working files and the index still match main. There are neither staged changes nor an open conflicted merge to continue.',
      ],
      '[data-tutorial="staging"]',
      { prepare: seed('rejected') },
    ),
    s(
      'dismiss',
      ['Schließe die gelesene Meldung', 'Dismiss the message after reading it'],
      [
        'Schließe die Fehlermeldung. Das ändert die Dateien nicht und erteilt keine Freigabe für ein anderes Verfahren.',
        'Dismiss the error message. This neither changes files nor authorizes a different behavior.',
      ],
      mergeFailureClose,
      { prepare: seed('rejected'), completion: { kind: 'all', conditions: [untouched, { kind: 'absent', selector: mergeFailure }] } },
    ),
    s(
      'retry-more',
      ['Starte eine eigene neue Auswahl', 'Start a separate new selection'],
      ['Öffne die weiteren Repository-Aktionen erneut.', 'Open more repository actions again.'],
      mergeMore,
      { prepare: seed('dismissed'), completion: element(mergeOpen) },
    ),
    s(
      'retry-open',
      ['Öffne das Merge-Formular erneut', 'Open the merge form again'],
      [
        'Wähle Zusammenführen. Die neue Auswahl beginnt unabhängig von der abgelehnten Bestätigung.',
        'Choose Merge. The new selection starts independently of the refused confirmation.',
      ],
      mergeOpen,
      { prepare: seed('retry-more'), completion: element(c('source')) },
    ),
    s(
      'retry-source',
      ['Wähle dieselbe Quelle erneut', 'Choose the same source again'],
      [
        'Wähle feature/begruessung. Diesmal prüfen wir ausdrücklich das normale Verfahren.',
        'Choose feature/begruessung. This time we deliberately review the normal behavior.',
      ],
      c('source'),
      { prepare: seed('retry-menu'), completion: value(c('source'), mergeSource) },
    ),
    s(
      'retry-behavior',
      ['Normal zusammenführen darf beide Linien verbinden', 'Merge normally may join both lines'],
      [
        'Das frische Formular steht auf Normal zusammenführen (Standard). Bei diesen auseinanderentwickelten Branches darf es einen Commit mit zwei Vorgängern erzeugen. Prüfe das Verfahren vor dem Fortfahren.',
        'The fresh form uses Merge normally (default). For these diverged branches it may create a commit with two parents. Check the behavior before continuing.',
      ],
      c('mode'),
      { prepare: seed('retry-menu', true) },
    ),
    s(
      'retry-review',
      ['Prüfe Quelle, Ziel und das neue Verfahren', 'Review the source, target and new behavior'],
      [
        'Öffne eine neue Bestätigung für denselben Quellen-Branch und main mit dem normalen Verfahren.',
        'Open a new confirmation for the same source branch and main using normal behavior.',
      ],
      c('review'),
      { prepare: seed('retry-menu', true), completion: element(mergeDialog) },
    ),
    s(
      'retry-mode',
      ['Diese Bestätigung erlaubt jetzt einen normalen Merge', 'This confirmation now allows a normal merge'],
      [
        'Quelle und Ziel sind unverändert; das Verfahren ist jetzt bewusst Standard. Erst die folgende Bestätigung führt es aus.',
        'Source and target are unchanged; the behavior is now deliberately Default. Only the following confirmation runs it.',
      ],
      mergeContext(3),
      { prepare: seed('retry-review') },
    ),
    s(
      'confirm',
      ['Führe den normalen Merge aus', 'Run the normal merge'],
      [
        'Bestätige die neu geprüfte Zusammenführung. Die unabhängigen Änderungen lassen sich jetzt verbinden.',
        'Confirm the newly reviewed merge. The independent changes can now be combined.',
      ],
      mergeConfirm,
      { prepare: seed('retry-review'), completion: element(mergeHead(6)) },
    ),
    s(
      'parents',
      ['Der neue Commit verbindet beide Vorgänger', 'The new commit joins both parents'],
      [
        'Der sechste Commit hat den bisherigen main und den Quellen-Commit als Vorgänger. Das ist das bewusst gewählte Ergebnis der zweiten Aktion.',
        'The sixth commit has the old main and the source commit as parents. This is the deliberately chosen result of the second action.',
      ],
      mergeHead(6),
      { prepare: seed('merged') },
    ),
    s(
      'finish',
      ['Erst prüfen, dann das passende Verfahren wählen', 'Inspect first, then choose the appropriate behavior'],
      [
        'Du hast die Fast-forward-Ablehnung geprüft, den erhaltenen Zustand kontrolliert und anschließend einen eigenen normalen Merge bestätigt. Die Quelle bleibt erhalten und nichts wurde veröffentlicht. Weiter beendet die Lektion.',
        'You checked the fast-forward refusal, inspected the preserved state and then confirmed a separate normal merge. The source remains and nothing was published. Next finishes the lesson.',
      ],
      '[data-tutorial="graph"]',
      { prepare: seed('merged') },
    ),
  ],
};
