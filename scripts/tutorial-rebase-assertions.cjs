const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { rebaseTodo, rebaseResultNumber, REBASE_REWORD_TITLE, REBASE_LICENSE_TITLE } = require('../dist-electron/src/shared/tutorial/rebaseLessonExamples.js');
const { rebaseField, rebaseConfirm, rebaseCancel, rebaseContext } = require('../dist-electron/src/shared/tutorial/rebaseLessonHelpers.js');
const { REWORD_ORIGINAL_TITLE, REWORD_ORIGINAL_DESCRIPTION } = require('../dist-electron/src/shared/tutorial/rewordLessonExamples.js');
const { AMEND_ORIGINAL_SUBJECT, AMEND_ORIGINAL_DESCRIPTION } = require('../dist-electron/src/shared/tutorial/amendLessonExamples.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyRebase({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  if (require('./tutorial-rebase-guard-assertions.cjs').isGuard(chapter.id))
    return require('./tutorial-rebase-guard-assertions.cjs').verify({ chapter, step, run, waitFor, tutorial, languageIndex });
  if (require('./tutorial-rebase-pause-assertions.cjs').isPause(chapter.id))
    return require('./tutorial-rebase-pause-assertions.cjs').verify({ chapter, step, run, waitFor, tutorial, languageIndex });
  const mode = chapter.id.slice('rebase-'.length),
    actions = step.prepare.actions;
  const applied = actions.some((action) => action.click === rebaseConfirm);
  const head = applied ? rebaseResultNumber(mode) : 4;
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,author:node.querySelector(".commit-author")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  const numbers = !applied || mode === 'review' ? [1, 2, 3, 4] : mode === 'drop' ? [1, 2, 3] : mode === 'squash' || mode === 'fixup' ? [1, 2, 5] : [1, 2, 5, 6];
  assert.deepEqual(rows.map((row) => row.hash).sort(), numbers.map(hash).sort(), 'Only reachable resulting commits belong in the normal graph.');
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  assert.ok(rows.find((row) => row.hash === hash(1)).refs.includes('feature/begruessung'));
  assert.ok(rows.find((row) => row.hash === hash(head)).refs.includes('main'));
  const firstTitle = mode === 'reorder' ? REBASE_LICENSE_TITLE[languageIndex] : REWORD_ORIGINAL_TITLE[languageIndex];
  const titles = new Map([
    [hash(3), firstTitle],
    [hash(4), AMEND_ORIGINAL_SUBJECT[languageIndex]],
  ]);
  const bodies = new Map([
    [
      hash(3),
      mode === 'reorder'
        ? languageIndex === 0
          ? 'Die Lizenz erhält einen unabhängigen Übungshinweis.'
          : 'The license receives an independent practice note.'
        : REWORD_ORIGINAL_DESCRIPTION[languageIndex],
    ],
    [hash(4), AMEND_ORIGINAL_DESCRIPTION[languageIndex]],
  ]);
  if (applied && numbers.includes(5)) {
    titles.set(hash(5), mode === 'reorder' ? AMEND_ORIGINAL_SUBJECT[languageIndex] : mode === 'reword' ? REBASE_REWORD_TITLE[languageIndex] : firstTitle);
    bodies.set(
      hash(5),
      mode === 'reorder'
        ? AMEND_ORIGINAL_DESCRIPTION[languageIndex]
        : mode === 'squash'
          ? bodies.get(hash(3)) + '\n\n' + AMEND_ORIGINAL_SUBJECT[languageIndex] + '\n\n' + AMEND_ORIGINAL_DESCRIPTION[languageIndex]
          : bodies.get(hash(3)),
    );
    assert.equal(rows.find((row) => row.hash === hash(5)).parents, hash(2));
    assert.equal(rows.find((row) => row.hash === hash(5)).author, 'Alex Beispiel');
  }
  if (applied && numbers.includes(6)) {
    titles.set(hash(6), mode === 'reorder' ? firstTitle : AMEND_ORIGINAL_SUBJECT[languageIndex]);
    bodies.set(hash(6), mode === 'reorder' ? bodies.get(hash(3)) : AMEND_ORIGINAL_DESCRIPTION[languageIndex]);
    assert.equal(rows.find((row) => row.hash === hash(6)).parents, hash(5));
    assert.equal(rows.find((row) => row.hash === hash(6)).author, mode === 'reorder' ? 'Sam Beispiel' : 'Alex Beispiel');
  }
  for (const row of rows) if (titles.has(row.hash)) assert.equal(row.subject, titles.get(row.hash));
  const panelHash = await run('document.querySelector(".commit-details-panel")?.dataset.commitHash');
  if (bodies.has(panelHash))
    await waitFor(tutorial, query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(bodies.get(panelHash)));
  if (await run('Boolean(' + query(rebaseField) + ')')) {
    assert.equal(await run(query(rebaseContext(1)) + '.textContent'), hash(2).slice(0, 8));
    assert.equal(await run(query(rebaseContext(2)) + '.textContent'), '2');
    const fill = actions.find((action) => action.fill?.selector === rebaseField);
    const expected = fill ? fill.fill.value[languageIndex] : rebaseTodo(mode, true)[languageIndex];
    assert.equal(await run(query(rebaseField) + '.value'), expected);
    assert.equal(await run(query(rebaseConfirm) + '.disabled'), !expected.trim());
    if (step.id === 'order') {
      const title = await run('document.querySelector("#tutorial-step-title").textContent');
      await run(query(rebaseField) + '.focus()');
      for (const keyCode of ['Right', 'Left']) {
        tutorial.sendInputEvent({ type: 'keyDown', keyCode });
        tutorial.sendInputEvent({ type: 'keyUp', keyCode });
      }
      assert.equal(
        await run('document.querySelector("#tutorial-step-title").textContent'),
        title,
        'Arrow keys in the todo field must edit the field rather than navigate the lesson.',
      );
    }
  }
  if (actions.some((action) => action.click === rebaseCancel)) assert.equal(applied, false);
  if (['source-diff', 'close-source', 'result-diff', 'close-result'].includes(step.id)) {
    const source = ['source-diff', 'close-source'].includes(step.id);
    const expected =
      mode === 'reorder'
        ? languageIndex === 0
          ? 'Projekthinweis: Dieses Lernprojekt dient zum sicheren Üben.'
          : 'Project note: This learning project is for safe practice.'
        : readme[!source && ['review', 'squash', 'fixup'].includes(mode) ? 'latest' : 'description'][languageIndex].split('\n')[2];
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .add .diff-code"),node=>node.textContent).includes(' + JSON.stringify(expected) + ')',
    );
    if (mode === 'reorder') assert.equal(await run('document.querySelectorAll(".file-viewer .del .diff-code").length'), 0);
    else {
      const removed = readme[!source && mode === 'review' ? 'description' : 'app'][languageIndex].split('\n')[2];
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".file-viewer .del .diff-code"),node=>node.textContent).includes(' + JSON.stringify(removed) + ')',
      );
    }
  }
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'), 0);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
