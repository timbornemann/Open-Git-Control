const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const {
  REBASE_LICENSE_EDIT,
  REBASE_EDIT_TITLE,
  REBASE_EDIT_DESCRIPTION,
  REBASE_ABORT_DRAFT,
  rebasePauseTodo,
} = require('../dist-electron/src/shared/tutorial/rebasePauseExamples.js');
const { REBASE_LICENSE_TITLE, rebaseTodo } = require('../dist-electron/src/shared/tutorial/rebaseLessonExamples.js');
const { REWORD_ORIGINAL_TITLE, REWORD_ORIGINAL_DESCRIPTION } = require('../dist-electron/src/shared/tutorial/rewordLessonExamples.js');
const { AMEND_ORIGINAL_SUBJECT, AMEND_ORIGINAL_DESCRIPTION } = require('../dist-electron/src/shared/tutorial/amendLessonExamples.js');
const { rebaseField, rebaseConfirm } = require('../dist-electron/src/shared/tutorial/rebaseLessonHelpers.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const control = (name) => '[data-tutorial="rebase-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
const pauseKinds = ['edit', 'staged', 'conflict', 'abort'];
module.exports.isPause = (id) => pauseKinds.includes(id.slice('rebase-'.length)) && id.startsWith('rebase-');
module.exports.verifyFeedback = async ({ chapter, step, run }) => {
  const started = step.prepare.actions.some((action) => action.click === rebaseConfirm);
  const dismissed = step.prepare.actions.some((action) => action.click === '.action-toast.error .toast-action-btn-close');
  const expected = started && !dismissed && ['rebase-conflict', 'rebase-abort'].includes(chapter.id);
  const errors = await run('Array.from(document.querySelectorAll(".action-toast.error"),node=>node.textContent)');
  assert.ok(errors.length <= (expected ? 1 : 0), 'Only the deliberate initial rebase conflict may report an error.');
  for (const error of errors) assert.ok(error.includes('The practice rebase stopped at a conflict.'), 'Unexpected operation failure: ' + error);
};
module.exports.verify = async function verifyPause({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const kind = chapter.id.slice('rebase-'.length),
    conflict = ['conflict', 'abort'].includes(kind),
    actions = step.prepare.actions;
  const started = actions.some((action) => action.click === rebaseConfirm),
    continued = actions.some((action) => action.click === control('continue'));
  const aborted = actions.some((action) => action.click === '.dialog-modal [data-dialog-action="confirm"]');
  const amended = actions.some((action) => action.click === '.staging-commit-btn');
  const pending = started && !continued && !aborted,
    head = continued ? (conflict ? 5 : 6) : aborted ? 4 : amended ? 5 : started ? (conflict ? 2 : 3) : 4;
  const originalTitle = conflict ? REWORD_ORIGINAL_TITLE[languageIndex] : REBASE_LICENSE_TITLE[languageIndex];
  const originalBody = conflict
    ? REWORD_ORIGINAL_DESCRIPTION[languageIndex]
    : languageIndex === 0
      ? 'Die Lizenz erhält einen unabhängigen Übungshinweis.'
      : 'The license receives an independent practice note.';
  const title = kind === 'edit' ? REBASE_EDIT_TITLE[languageIndex] : conflict ? AMEND_ORIGINAL_SUBJECT[languageIndex] : originalTitle;
  const body = kind === 'edit' ? REBASE_EDIT_DESCRIPTION[languageIndex] : conflict ? AMEND_ORIGINAL_DESCRIPTION[languageIndex] : originalBody;
  const conflictView = await run('document.querySelector("[data-tutorial=primary]")?.dataset.tutorialRoute === "conflict"');
  if (conflictView) {
    assert.ok(conflict && pending, 'Only a pending conflict opens this view.');
    await waitFor(tutorial, query(control('actions')));
    assert.equal(await run('Boolean(document.querySelector("[data-tutorial=cherry-pick-actions], [data-tutorial=conflict-continue]"))'), false);
  } else {
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,author:node.querySelector(".commit-author")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
    );
    const expected = continued ? (conflict ? [1, 2, 5] : [1, 2, 5, 6]) : amended ? [1, 2, 3, 4, 5] : [1, 2, 3, 4];
    assert.deepEqual(rows.map((row) => row.hash).sort(), expected.map(hash).sort());
    if (expected.includes(3)) assert.equal(rows.find((row) => row.hash === hash(3)).subject, originalTitle);
    if (expected.includes(4)) assert.equal(rows.find((row) => row.hash === hash(4)).subject, AMEND_ORIGINAL_SUBJECT[languageIndex]);
    if (expected.includes(5)) {
      const created = rows.find((row) => row.hash === hash(5));
      assert.equal(created.parents, hash(2));
      assert.equal(created.subject, title);
      assert.equal(created.author, conflict ? 'Alex Beispiel' : 'Sam Beispiel');
    }
    if (expected.includes(6)) {
      const descendant = rows.find((row) => row.hash === hash(6));
      assert.equal(descendant.parents, hash(5));
      assert.equal(descendant.subject, AMEND_ORIGINAL_SUBJECT[languageIndex]);
      assert.equal(descendant.author, 'Alex Beispiel');
    }
    assert.ok(rows.find((row) => row.hash === hash(continued ? head : 4)).refs.includes('main'));
    assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
    assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
    assert.ok(rows.find((row) => row.hash === hash(1)).refs.includes('feature/begruessung'));
  }
  const panel = await run('document.querySelector(".commit-details-panel")?.dataset.commitHash');
  const selectedBody =
    panel === hash(5) ? body : panel === hash(3) ? originalBody : panel === hash(4) || panel === hash(6) ? AMEND_ORIGINAL_DESCRIPTION[languageIndex] : null;
  if (selectedBody) await waitFor(tutorial, query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(selectedBody));
  if (await run('Boolean(' + query(rebaseField) + ')')) {
    const fill = actions.find((action) => action.fill?.selector === rebaseField);
    assert.equal(
      await run(query(rebaseField) + '.value'),
      fill ? rebasePauseTodo(kind)[languageIndex] : rebaseTodo(conflict ? 'review' : 'reorder', true)[languageIndex],
    );
  }
  if (pending && actions.some((action) => action.click === '[data-tutorial="open-staging"]')) await waitFor(tutorial, query(control('actions')));
  if (!pending && started) await waitFor(tutorial, '!' + query(control('actions')));
  if (await run('Boolean(document.querySelector("[data-tutorial=conflict-editor]"))')) {
    const chosen = actions.some(
      (action) => action.click === '[data-tutorial="conflict-take-theirs"]' || action.fill?.selector === '[data-tutorial="conflict-content"]',
    );
    const text = chosen ? (kind === 'abort' ? REBASE_ABORT_DRAFT[languageIndex] : readme.latest[languageIndex]) : null;
    if (text) assert.equal(await run('document.querySelector("[data-tutorial=conflict-content]").value'), text);
    if (!chosen) {
      assert.ok((await run('document.querySelector("[data-tutorial=conflict-ours]").textContent')).includes(readme.app[languageIndex].split('\n')[2]));
      assert.ok((await run('document.querySelector("[data-tutorial=conflict-theirs]").textContent')).includes(readme.latest[languageIndex].split('\n')[2]));
    }
  }
  if (await run('Boolean(document.querySelector(".file-viewer[data-path=LICENSE][data-tab=text]"))')) {
    const edited = actions.some((action) => action.fill?.selector === '[data-tutorial="file-editor"]');
    if (edited)
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' +
          JSON.stringify(REBASE_LICENSE_EDIT[languageIndex]),
      );
  }
  if (['pause-result-diff', 'pause-close-result'].includes(step.id)) {
    const addition = conflict
      ? readme.latest[languageIndex].split('\n')[2]
      : languageIndex === 0
        ? 'Edit-Übung: Hinweis präzisiert.'
        : 'Edit practice: clarified the note.';
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .add .diff-code"),node=>node.textContent).includes(' + JSON.stringify(addition) + ')',
    );
  }
  if (['abort-text', 'abort-work', 'abort-close'].includes(step.id))
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' + JSON.stringify(readme.latest[languageIndex]),
    );
  if (actions.some((action) => action.click === control('abort')) && (await run('Boolean(document.querySelector(".dialog-modal"))')))
    assert.equal(await run('document.querySelector(".dialog-context-list dd").textContent'), 'git rebase --abort');
  await module.exports.verifyFeedback({ chapter, step, run });
};
