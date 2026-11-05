import type { TutorialStep, TutorialText } from './types';
import { rebaseStep as s, rebaseRecipe as recipe } from './rebaseLessonHelpers';
import { rebaseResultNumber, type RebaseLessonMode } from './rebaseLessonExamples';
import { graphRow, commitPanel, commitFile, historyViewer } from './historyLessonHelpers';
import { fileControl, fileTab } from './fileLessonHelpers';
import { mergeHead, element } from './mergeLessonHelpers';
const headText: Record<RebaseLessonMode, TutorialText> = {
  review: [
    'Beide pick-Zeilen blieben unverändert. In diesem Beispiel verwendet Git die bestehenden Commits weiter: main und HEAD stehen noch auf demselben vierten Hash.',
    'Both pick lines stayed unchanged. In this example Git reuses the existing commits: main and HEAD still point to the same fourth hash.',
  ],
  reword: [
    'main steht auf einem neuen sechsten Commit. Der umbenannte ältere Commit erhielt Hash 5, sein Nachfolger Hash 6, weil dessen Vorgänger sich geändert hat.',
    'main points to a new sixth commit. The renamed older commit received hash 5 and its descendant hash 6 because that descendant’s parent changed.',
  ],
  squash: [
    'Aus zwei lokalen Commits wurde einer mit Hash 5. Er baut direkt auf der unveränderten Basis 2 auf und enthält die Dateiänderungen beider ursprünglichen Commits.',
    'The two local commits became one with hash 5. It builds directly on unchanged base 2 and contains both original commits’ file changes.',
  ],
  fixup: [
    'Der neue Commit 5 enthält beide Änderungen und baut auf Basis 2 auf. Anders als squash hat fixup die zweite Commit-Nachricht verworfen.',
    'New commit 5 contains both changes and builds on base 2. Unlike squash, fixup discarded the second commit message.',
  ],
  drop: [
    'main und HEAD stehen nun auf dem bestehenden dritten Commit. Die vierte Begrüßungsänderung wurde ausgelassen; die ursprünglichen Objekte sind dadurch nicht sofort dauerhaft gelöscht.',
    'main and HEAD now point to the existing third commit. The fourth greeting change was omitted; this does not immediately delete the original objects permanently.',
  ],
  reorder: [
    'main steht auf Commit 6 mit dem Lizenzhinweis. Davor liegt der neu geschriebene Begrüßungscommit 5. Beide brauchen neue Hashes, weil sie andere Vorgänger erhalten haben.',
    'main points to commit 6 with the license note. Before it is rewritten greeting commit 5. Both need new hashes because their parents changed.',
  ],
};
const bodyText: Record<RebaseLessonMode, TutorialText> = {
  review: [
    'Die Beschreibung des vierten Commits ist dieselbe wie vor dem Start. Unveränderte pick-Zeilen bearbeiten keine Nachricht.',
    'The fourth commit’s description is the same as before starting. Unchanged pick lines do not edit any message.',
  ],
  reword: [
    'Die alte Beschreibung des dritten Commits ist vollständig erhalten. Im Todo wurde ausschließlich der vollständige Titel hinter reword ersetzt, nicht die Beschreibung.',
    'The third commit’s original description is completely preserved. Only the complete subject after reword was replaced in the todo, not the description.',
  ],
  squash: [
    'Die Beschreibung enthält zuerst die Beschreibung des dritten Commits und danach Titel und Beschreibung des vierten. Diese App übernimmt die von Git vorbereitete kombinierte Nachricht ohne zusätzlichen Editor.',
    'The description contains the third commit’s body followed by the fourth commit’s subject and body. This app accepts Git’s prepared combined message without an additional editor.',
  ],
  fixup: [
    'Hier steht nur die bisherige Beschreibung des dritten Commits. Die Nachricht des vierten fehlt bewusst; seine Dateiänderungen sind trotzdem im Ergebnis enthalten.',
    'Only the third commit’s original description appears here. The fourth commit’s message is deliberately absent; its file changes are still included.',
  ],
  drop: [
    'Die Beschreibung gehört weiterhin zum dritten Dokumentationscommit. drop erstellt keine Gegenänderung und keinen neuen Revert-Commit, sondern lässt einen Patch aus der neuen Kette aus.',
    'The description still belongs to the third documentation commit. drop creates no inverse change or new revert commit; it omits a patch from the new chain.',
  ],
  reorder: [
    'Diese Beschreibung gehört zum Lizenzhinweis von Sam. Der neueste Graph-Eintrag muss nach einem Rebase nicht das neueste Autordatum haben: Die ursprünglichen Autoren und Autordaten bleiben erhalten.',
    'This description belongs to Sam’s license note. After a rebase the top graph entry need not have the newest author date: original authors and author dates are preserved.',
  ],
};
export function rebaseResultSteps(mode: RebaseLessonMode): TutorialStep[] {
  const head = rebaseResultNumber(mode),
    selected = mode === 'reword' ? 5 : head,
    path = mode === 'reorder' ? 'LICENSE' : 'README.md';
  const steps: TutorialStep[] = [
    s('result-head', ['Prüfe den bestätigten HEAD', 'Check the confirmed HEAD'], headText[mode], mergeHead(head), { prepare: recipe(mode, 'result') }),
    s(
      'result-chain',
      ['Prüfe die neue lokale Kette', 'Inspect the resulting local chain'],
      [
        ['squash', 'fixup', 'drop'].includes(mode)
          ? 'Über der Basis bleibt hier nur ein lokaler Commit. Die frühere Commit-Anzahl im Dialog beschrieb den ursprünglichen Bereich, nicht die Anzahl des Ergebnisses.'
          : 'Zwischen Basis und HEAD liegen weiterhin zwei lokale Commits. Prüfe die Reihenfolge und ihre Hashes; die Graph-Linien stellen die tatsächlichen Vorgänger dar.',
        ['squash', 'fixup', 'drop'].includes(mode)
          ? 'Only one local commit remains above the base here. The earlier dialog count described the original range, not the result count.'
          : 'Two local commits still lie between the base and HEAD. Check their order and hashes; graph lines represent their actual parents.',
      ],
      '[data-tutorial="graph"]',
      { prepare: recipe(mode, 'result') },
    ),
    s(
      'result-refs',
      ['Andere Referenzen bleiben am bisherigen Ziel', 'Other references keep their previous targets'],
      [
        'origin/main und v1.0.0 stehen weiterhin auf Basis 2. Der andere lokale Branch bleibt ebenfalls unverändert. Dieser lokale Rebase hat weder einen Push noch einen Kontozugriff ausgeführt.',
        'origin/main and v1.0.0 still point to base 2. The other local branch is also unchanged. This local rebase performed neither a push nor an account operation.',
      ],
      graphRow(2) + ' .commit-refs',
      { prepare: recipe(mode, 'result') },
    ),
    s(
      'result-select',
      ['Wähle den betroffenen Ergebniscommit', 'Select the affected result commit'],
      [
        mode === 'reword'
          ? 'Klicke den neu geschriebenen älteren Commit 5. Er enthält den korrigierten Titel; HEAD 6 ist weiterhin ein eigener Nachfolger.'
          : 'Klicke den Ergebniscommit, um seine gespeicherte Beschreibung und seine tatsächliche Dateiänderung zu lesen.',
        mode === 'reword'
          ? 'Click rewritten older commit 5. It contains the corrected subject; HEAD 6 is still a separate descendant.'
          : 'Click the result commit to read its saved description and actual file change.',
      ],
      graphRow(selected),
      { prepare: recipe(mode, 'result'), completion: element(commitPanel(selected)) },
    ),
    s(
      'result-title',
      ['Vergleiche den gespeicherten Titel', 'Compare the saved subject'],
      [
        mode === 'reword'
          ? 'Der Graph zeigt nun den bewusst eingegebenen docs-Titel. Dieser Titel ist gespeichert; die alte Nachricht wurde nicht nur vorübergehend im Formular überdeckt.'
          : 'Lies den Titel dieses Commits. squash und fixup behalten hier den ersten Titel; drop und unveränderte pick-Zeilen behalten den Titel des übernommenen Originalcommits.',
        mode === 'reword'
          ? 'The graph now shows the docs subject you entered. This subject is saved; the old message was not merely hidden temporarily by the form.'
          : 'Read this commit’s subject. squash and fixup keep the first subject here; drop and unchanged pick lines keep the reused original commit’s subject.',
      ],
      graphRow(selected) + ' .commit-subject',
      { prepare: recipe(mode, 'commit') },
    ),
    s('result-description', ['Lies die resultierende Beschreibung', 'Read the resulting description'], bodyText[mode], '.commit-details-description', {
      prepare: recipe(mode, 'commit'),
    }),
    s(
      'result-author',
      ['Der ursprüngliche Autor bleibt erhalten', 'The original author is retained'],
      [
        mode === 'reorder'
          ? 'Der Lizenzhinweis stammt weiterhin von Sam, obwohl er jetzt auf der Begrüßung von Alex aufbaut. Das Umordnen schreibt seine Urheberschaft nicht um.'
          : 'Ein Rebase bewahrt hier Autor und Autordatum des übernommenen ersten Commits. Ein neuer Hash bedeutet nicht, dass du dadurch der ursprüngliche Autor seiner Änderungen geworden bist.',
        mode === 'reorder'
          ? 'The license note is still authored by Sam even though it now builds on Alex’s greeting. Reordering does not change its authorship.'
          : 'Here rebase retains the reused first commit’s author and author date. A new hash does not mean that you became the original author of its changes.',
      ],
      graphRow(selected) + ' .commit-author',
      { prepare: recipe(mode, 'commit') },
    ),
    s(
      'result-file',
      ['Öffne die gespeicherte Ergebnisänderung', 'Open the saved result change'],
      [
        mode === 'reorder'
          ? 'Klicke LICENSE. Der oberste Commit muss jetzt nur den Projekthinweis gegenüber seinem neuen Begrüßungs-Vorgänger ergänzen.'
          : 'Klicke README.md. Der Vergleich bezieht sich auf den tatsächlichen Vorgänger des Ergebniscommits und zeigt seine gespeicherte Änderung.',
        mode === 'reorder'
          ? 'Click LICENSE. The top commit must now add only the project note relative to its new greeting parent.'
          : 'Click README.md. The comparison uses the result commit’s actual parent and shows its saved change.',
      ],
      commitPanel(selected) + ' ' + commitFile(path),
      { prepare: recipe(mode, 'commit'), completion: element(historyViewer(selected, path)) },
    ),
    s(
      'result-tab',
      ['Wähle die Diff-Ansicht', 'Select the Diff view'],
      [
        'Klicke Diff, um Ergänzungen und Löschungen gegen den neuen Vorgänger ausdrücklich zu prüfen. Die Textansicht zeigt dagegen die vollständige gespeicherte Datei.',
        'Click Diff to explicitly inspect additions and removals against the new parent. The Text view instead shows the complete saved file.',
      ],
      fileTab('diff'),
      { prepare: recipe(mode, 'result-diff'), completion: element(historyViewer(selected, path) + '[data-tab="diff"]') },
    ),
    s(
      'result-diff',
      ['Prüfe den Inhalt des neuen Commits', 'Inspect the new commit’s contents'],
      [
        mode === 'reorder'
          ? 'Die grüne Zeile ist der Lizenzhinweis. Die Begrüßung gehört schon zu seinem neuen Vorgänger und erscheint deshalb nicht als Teil dieses Patches.'
          : mode === 'review'
            ? 'Der vierte Commit ersetzt den Dokumentationsstand durch Begrüßung und Status. Unveränderte pick-Zeilen haben weder diesen Patch noch seinen Vorgänger geändert.'
            : ['squash', 'fixup'].includes(mode)
              ? 'Dieser Diff enthält die gemeinsame README-Wirkung gegenüber Basis 2. Dass fixup eine Nachricht verworfen hat, hat keine der darin enthaltenen Dateiänderungen entfernt.'
              : 'Die Dokumentationsänderung bleibt als eigener Patch erhalten. Eine Umbenennung ändert keinen Dateiinhalt; beim Weglassen des vierten Commits fehlt nur dessen spätere Begrüßungsänderung.',
        mode === 'reorder'
          ? 'The green line is the license note. The greeting is already part of its new parent, so it does not appear as part of this patch.'
          : mode === 'review'
            ? 'The fourth commit replaces the documentation contents with a greeting and status. Unchanged pick lines changed neither this patch nor its parent.'
            : ['squash', 'fixup'].includes(mode)
              ? 'This diff contains the combined README effect relative to base 2. Discarding a message with fixup did not remove any included file change.'
              : 'The documentation change remains a separate patch. Renaming changes no file content; omitting the fourth commit removes only its later greeting change.',
      ],
      '.file-viewer-diff',
      { prepare: recipe(mode, 'result-diff') },
    ),
    s(
      'close-result',
      ['Schließe den Ergebnis-Diff', 'Close the result diff'],
      [
        'Schließe den Dateibetrachter. Die gespeicherte Ergebnisänderung bleibt im Commit erhalten.',
        'Close the file viewer. The saved result change remains in the commit.',
      ],
      fileControl('close-file'),
      { prepare: recipe(mode, 'result-diff'), completion: { kind: 'absent', selector: '.file-viewer' } },
    ),
  ];
  if (mode === 'reword' || mode === 'reorder') {
    const following = mode === 'reword' ? 6 : 5;
    steps.push(
      s(
        'following',
        ['Prüfe auch den anderen neu geschriebenen Commit', 'Inspect the other rewritten commit too'],
        [
          mode === 'reword'
            ? 'Klicke den neuen HEAD 6. Sein Titel und seine eigene Dateiänderung blieben erhalten; neu ist sein Vorgänger 5.'
            : 'Klicke Commit 5 direkt über der Basis. Die Begrüßung wird jetzt vor dem Lizenzhinweis angewendet.',
          mode === 'reword'
            ? 'Click new HEAD 6. Its subject and its own file change stayed the same; its new parent is 5.'
            : 'Click commit 5 directly above the base. The greeting is now applied before the license note.',
        ],
        graphRow(following),
        { prepare: recipe(mode, 'result'), completion: element(commitPanel(following)) },
      ),
      s(
        'following-description',
        ['Die eigene Nachricht bleibt beim Commit', 'The commit keeps its own message'],
        [
          'Die Beschreibung gehört weiterhin zur Begrüßungsänderung. Beim Umordnen oder Ändern eines Vorgängers wandern Nachrichten nicht versehentlich zum anderen Patch.',
          'The description still belongs to the greeting change. Reordering or changing a parent does not accidentally transfer messages to the other patch.',
        ],
        '.commit-details-description',
        { prepare: recipe(mode, 'following') },
      ),
    );
  }
  steps.push(
    s(
      'complete',
      ['Diese Rebase-Variante ist abgeschlossen', 'This rebase variant is complete'],
      [
        'Du hast Bereich, Todo, Abbrechen und Ergebnis geprüft. Weitere Rebase-Varianten lassen sich als eigene Lektionen mit frischen Beispieldaten starten; Zurück und Direkteinstiege rekonstruieren diesen Ablauf unabhängig.',
        'You have checked the range, todo, cancellation and result. Other rebase variants can be started as separate lessons with fresh sample data; Back and direct entries independently reconstruct this flow.',
      ],
      mergeHead(head),
      { prepare: recipe(mode, 'result') },
    ),
  );
  return steps;
}
