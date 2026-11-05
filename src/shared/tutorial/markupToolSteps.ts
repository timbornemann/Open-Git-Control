import type { MarkupExample, TutorialStep, TutorialText } from './types';
import {
  markupStep as s,
  markupRecipe as p,
  markupContent as content,
  markupViewer as viewer,
  markupPath as path,
  markupValue as value,
  markupSaved as saved,
  markupState as state,
  markupMenu as menu,
  markupFailure as failure,
  markupDiscard as discard,
  type MarkupKind,
  c,
  row,
  tab,
  editor,
  element,
  tool,
  dialog,
  confirmDialog,
} from './markupLessonHelpers';

export type MarkupLessonCopy = {
  kind: MarkupKind;
  source: MarkupExample;
  formatted: MarkupExample;
  minified: MarkupExample;
  invalid: MarkupExample;
  overview: TutorialText;
  structure: TutorialText;
  format: TutorialText;
  preserved: TutorialText;
  minify: TutorialText;
  comments: TutorialText;
  whitespace: TutorialText;
  invalidInput: TutorialText;
  error: TutorialText;
};
export function markupToolSteps(copy: MarkupLessonCopy): readonly TutorialStep[] {
  const { kind, source, formatted, minified, invalid } = copy;
  const file = path(kind),
    frame = viewer(kind);
  const recipe = (version: MarkupExample, options: Parameters<typeof p>[2] = {}) => p(kind, version, options);
  return [
    s('tree', [`${kind.toUpperCase()} gezielt bearbeiten`, `Edit ${kind.toUpperCase()} deliberately`], copy.overview, c('open-files')),
    s('open', [`Öffne ${file}`, `Open ${file}`], [`Klicke ${file} im Dateibaum.`, `Click ${file} in the file tree.`], row(file), {
      completion: element(frame + '[data-tab="text"]'),
    }),
    s('structure', ['Lies die Struktur vor der Änderung', 'Read the structure before changing it'], copy.structure, editor, { prepare: recipe(source) }),
    s('format-purpose', ['Formatieren macht die Struktur sichtbar', 'Formatting makes structure visible'], copy.format, editor, { prepare: recipe(source) }),
    ...menu(kind, 'format', source),
    s(
      'format',
      ['Formatiere das Dokument', 'Format the document'],
      [
        'Klicke Formatieren. Das tatsächliche Ergebnis erscheint im Editor und bleibt zunächst ungespeichert.',
        'Click Format. The actual result appears in the editor and initially remains unsaved.',
      ],
      tool('markup-format'),
      { prepare: recipe(source, { group: true }), completion: value(formatted) },
    ),
    s('formatted', ['Prüfe den neuen Aufbau', 'Inspect the new layout'], copy.format, editor, { prepare: recipe(source, { draft: formatted }) }),
    s('preserved', ['Kontrolliere die erhaltenen Inhalte', 'Check the preserved content'], copy.preserved, editor, {
      prepare: recipe(source, { draft: formatted }),
    }),
    s(
      'save-formatted',
      ['Speichere die formatierte Fassung', 'Save the formatted version'],
      [
        'Klicke Arbeitsdatei speichern. Nur die Arbeitsdatei übernimmt den Entwurf; der Index behält die Ausgangsfassung.',
        'Click Save working file. Only the working file takes the draft; the index retains the original version.',
      ],
      c('save-file'),
      { prepare: recipe(source, { draft: formatted }), completion: saved(kind, formatted) },
    ),
    s(
      'open-diff',
      ['Öffne den Diff', 'Open Diff'],
      [
        'Klicke Diff im Datei-Viewer, um die gespeicherten Änderungen gegenüber dem Index zu prüfen.',
        'Click Diff in the file viewer to check saved changes against the index.',
      ],
      tab('diff'),
      { prepare: recipe(formatted), completion: element(frame + '[data-tab="diff"] .file-viewer-diff') },
    ),
    s(
      'read-diff',
      ['Einrückung ist ebenfalls eine Git-Änderung', 'Indentation is also a Git change'],
      [
        'Entfernte und hinzugefügte Zeilen zeigen die neue Darstellung. Ein lesbarerer Quelltext kann einen großen Diff erzeugen, obwohl die fachlichen Inhalte erhalten bleiben. Prüfe ihn vor dem Staging.',
        'Removed and added lines show the new representation. More readable source can produce a large diff even when its content is preserved. Review it before staging.',
      ],
      frame + ' .file-viewer-diff',
      { prepare: recipe(formatted, { tab: 'diff' }) },
    ),
    s(
      'text',
      ['Kehre zur Textansicht zurück', 'Return to Text'],
      ['Klicke Text, um das nächste Werkzeug zu verwenden.', 'Click Text to use the next tool.'],
      tab('text'),
      { prepare: recipe(formatted, { tab: 'diff' }), completion: element(frame + '[data-tab="text"] ' + editor) },
    ),
    s('minify-purpose', ['Minifizieren verändert die Darstellung erneut', 'Minifying changes representation again'], copy.minify, editor, {
      prepare: recipe(formatted),
    }),
    ...menu(kind, 'minify', formatted),
    s(
      'minify',
      ['Minifiziere die formatierte Fassung', 'Minify the formatted version'],
      ['Klicke Minifizieren. Prüfe das Ergebnis vor dem Speichern.', 'Click Minify. Check the result before saving.'],
      tool('markup-minify'),
      { prepare: recipe(formatted, { group: true }), completion: value(minified) },
    ),
    s('comments', ['Prüfe den Kommentar', 'Inspect the comment'], copy.comments, editor, { prepare: recipe(formatted, { draft: minified }) }),
    s('whitespace', ['Prüfe empfindliche Textstellen', 'Check whitespace-sensitive content'], copy.whitespace, editor, {
      prepare: recipe(formatted, { draft: minified }),
    }),
    s(
      'save-minified',
      ['Speichere die minifizierte Fassung', 'Save the minified version'],
      kind === 'xml'
        ? [
            'Klicke Arbeitsdatei speichern. Dieses XML-Ergebnis entspricht wieder exakt dem Ausgangstext; die Git-Änderung verschwindet.',
            'Click Save working file. This XML result exactly matches the original text again, so the Git change disappears.',
          ]
        : [
            'Klicke Arbeitsdatei speichern. Der entfernte Kommentar und die geänderte Schreibweise bleiben als Git-Änderung sichtbar.',
            'Click Save working file. The removed comment and changed spelling remain visible as a Git change.',
          ],
      c('save-file'),
      { prepare: recipe(formatted, { draft: minified }), completion: saved(kind, minified) },
    ),
    ...(kind === 'html'
      ? [
          s(
            'preview',
            ['Prüfe die Seite in der Vorschau', 'Check the page in Preview'],
            [
              'Klicke Vorschau. Überschrift, Absatz und der mehrzeilige pre-Bereich sollen weiterhin lesbar erscheinen.',
              'Click Preview. The heading, paragraph and multiline pre block should still render readably.',
            ],
            tab('preview'),
            { prepare: recipe(minified), completion: element(frame + '[data-tab="preview"] iframe') },
          ),
          s(
            'preview-result',
            ['Quelltext und sichtbare Seite vergleichen', 'Compare source and rendered page'],
            [
              'Der Kommentar war im Quelltext vorhanden, wurde aber nie als Seitentext angezeigt. Hello world & team. bleibt erhalten, ebenso die Zeilen im pre-Bereich. Die Seite wird lokal und isoliert dargestellt.',
              'The comment existed in the source but was never shown as page text. Hello world & team. remains, as do the lines in the pre block. The page renders locally and in isolation.',
            ],
            frame + ' iframe',
            { prepare: recipe(minified, { tab: 'preview' }) },
          ),
          s('back-text', ['Kehre zum Quelltext zurück', 'Return to source text'], ['Klicke Text.', 'Click Text.'], tab('text'), {
            prepare: recipe(minified, { tab: 'preview' }),
            completion: element(frame + '[data-tab="text"] ' + editor),
          }),
        ]
      : []),
    s(
      'error-purpose',
      ['Einen unvollständigen Entwurf ausprobieren', 'Try an incomplete draft'],
      [
        'Die Werkzeuge benötigen verarbeitbaren Quelltext. Wir beschädigen nur den ungespeicherten Entwurf und prüfen, dass beide Fehlversuche die gespeicherte Datei erhalten.',
        'The tools require parseable source. We will break only the unsaved draft and check that both failed attempts preserve the saved file.',
      ],
      editor,
      { prepare: recipe(minified) },
    ),
    s('invalid', ['Erzeuge den Fehler im Editor', 'Create the error in the editor'], copy.invalidInput, editor, {
      prepare: recipe(minified),
      completion: value(invalid),
    }),
    ...menu(kind, 'format-error', minified, invalid),
    s(
      'format-error',
      ['Versuche das Formatieren', 'Attempt formatting'],
      [
        'Klicke Formatieren. Der Fehler wird gemeldet; der Entwurf darf nicht durch ein unvollständiges Ergebnis ersetzt werden.',
        'Click Format. An error is reported; the draft must not be replaced by an incomplete result.',
      ],
      tool('markup-format'),
      { prepare: recipe(minified, { draft: invalid, group: true }), completion: failure(kind, 'markup-format', minified) },
    ),
    s('read-error', ['Lies die Fehlermeldung', 'Read the error message'], copy.error, editor, { prepare: recipe(minified, { draft: invalid }) }),
    ...menu(kind, 'minify-error', minified, invalid),
    s(
      'minify-error',
      ['Versuche das Minifizieren', 'Attempt minifying'],
      [
        'Klicke Minifizieren. Auch dieses Werkzeug erhält den Entwurf und die gespeicherte Fassung, wenn es den Text nicht verarbeiten kann.',
        'Click Minify. This tool also preserves both the draft and saved version when it cannot process the text.',
      ],
      tool('markup-minify'),
      { prepare: recipe(minified, { draft: invalid, group: true }), completion: failure(kind, 'markup-minify', minified) },
    ),
    s(
      'request-close',
      ['Verlasse den fehlerhaften Entwurf', 'Leave the invalid draft'],
      [
        'Klicke das X des Datei-Viewers. Die App fragt wegen der ungespeicherten Eingabe nach einer Entscheidung.',
        'Click the file viewer’s X. The app asks for a decision because the input is unsaved.',
      ],
      c('close-file'),
      { prepare: recipe(minified, { draft: invalid }), completion: element(dialog) },
    ),
    s(
      'close-dialog',
      ['Verwirf nur die ungespeicherte Eingabe', 'Discard only the unsaved input'],
      [
        'Entwurf verwerfen behält die gespeicherte minifizierte Fassung. Speichern und fortfahren würde den beschädigten Text übernehmen. Wähle für dieses Beispiel Entwurf verwerfen.',
        'Discard draft retains the saved minified version. Save and continue would write the broken text. For this example, choose Discard draft.',
      ],
      dialog,
      { prepare: discard(kind, minified) },
    ),
    s(
      'discard',
      ['Verwirf den Entwurf', 'Discard the draft'],
      [
        'Klicke Entwurf verwerfen. Der Viewer schließt; Arbeitsdatei und Index behalten ihre zuvor gespeicherten Inhalte.',
        'Click Discard draft. The viewer closes; the working file and index retain their previously saved contents.',
      ],
      confirmDialog,
      { prepare: discard(kind, minified), completion: { kind: 'all', conditions: [{ kind: 'absent', selector: frame }, state(kind, minified)] } },
    ),
    s(
      'reopen',
      ['Öffne die gespeicherte Fassung erneut', 'Reopen the saved version'],
      [
        `Klicke ${file}. Der unvollständige Entwurf soll verschwunden sein und die gespeicherte Fassung wieder erscheinen.`,
        `Click ${file}. The incomplete draft should be gone and the saved version should appear again.`,
      ],
      row(file),
      { prepare: { edits: [{ path: file, content: content(minified) }] }, completion: { kind: 'all', conditions: [element(frame), value(minified)] } },
    ),
    s(
      'close',
      [`Schließe ${file}`, `Close ${file}`],
      ['Klicke das X des Datei-Viewers. Jetzt ist kein Entwurf mehr offen.', 'Click the file viewer’s X. No unsaved draft remains now.'],
      c('close-file'),
      { prepare: recipe(minified), completion: { kind: 'absent', selector: frame } },
    ),
    s(
      'finish',
      [`${kind.toUpperCase()} vor dem Commit prüfen`, `Review ${kind.toUpperCase()} before committing`],
      [
        'Du hast beide Markup-Werkzeuge verwendet, Entwürfe und Diffs geprüft, gespeichert und fehlerhaften Text ohne Veränderung der gespeicherten Datei verworfen. Prüfe auch im eigenen Projekt immer das konkrete Ergebnis.',
        'You used both markup tools, reviewed drafts and diffs, saved, and discarded invalid text without changing the saved file. Always review the actual result in your own project too.',
      ],
      c('open-files'),
      { prepare: { edits: [{ path: file, content: content(minified) }] } },
    ),
  ];
}
