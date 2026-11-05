const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { practiceCommitHash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyStash({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  if (chapter.id === 'stash-files') return require('./tutorial-stash-files-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  if (chapter.id === 'stash-branch') return require('./tutorial-stash-branch-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  const clicks = step.prepare.actions.map((action) => action.click || '');
  const saved = clicks.some((selector) => selector.includes('data-dialog-action="confirm"'));
  const applied = clicks.some((selector) => selector.includes('data-stash-action="apply"'));
  const popped = clicks.some((selector) => selector.includes('data-stash-action="pop"'));
  const dropped = clicks.some((selector) => selector.includes('data-stash-action="confirm-drop"'));
  const fileOnly = chapter.id === 'stash-file';
  const exists = saved && !popped && !dropped;
  const work = !saved || applied || popped;
  await waitFor(tutorial, query('[data-branch-name=main][data-branch-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === ' + (4 + (exists ? (fileOnly ? 2 : 3) : 0)));
  const head = await run(
    'Array.from(document.querySelectorAll(".commit-refs")).find(node=>node.textContent.includes("HEAD ->"))?.closest(".commit-row")?.dataset.commitHash',
  );
  assert.equal(head, practiceCommitHash(4), 'Ordinary stash operations do not create a commit on the active branch.');
  for (const [group, paths] of [
    ['staged', saved ? [] : ['README.md']],
    ['unstaged', work ? ['README.md'] : []],
    ['untracked', fileOnly || work ? ['notes.txt'] : []],
  ]) {
    const actual =
      'Array.from(document.querySelectorAll(' +
      JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') +
      '),node=>node.getAttribute("aria-label")).sort()';
    await waitFor(tutorial, 'JSON.stringify(' + actual + ') === ' + JSON.stringify(JSON.stringify(paths)), 'Actual stash ' + group + ' state: ' + step.id);
  }
  if (await run('Boolean(' + query('[data-tutorial=stash-panel-toggle][aria-expanded=true]') + ')')) {
    await waitFor(tutorial, 'document.querySelectorAll("[data-stash-name]").length === ' + (exists ? 1 : 0));
    if (exists && !(await run('Boolean(' + query('[data-stash-action=confirm-drop]') + ')'))) {
      const entry = '[data-stash-name="stash@{0}"]';
      assert.ok(
        (await run(query(entry + ' .stash-entry-subject') + '.textContent')).includes(
          fileOnly ? ['README für später', 'README for later'][languageIndex] : ['Arbeitspaket', 'Work bundle'][languageIndex],
        ),
      );
      assert.equal(await run(query(entry + ' [data-stash-action=branch]') + '.disabled'), false);
      const files = await run(
        'Array.from(document.querySelectorAll("[data-stash-path]"),node=>({path:node.dataset.stashPath,disabled:node.querySelector("button").disabled})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)',
      );
      if (files.length)
        assert.deepEqual(
          files,
          (fileOnly ? ['README.md'] : ['README.md', 'notes.txt']).map((path) => ({ path, disabled: false })),
        );
    }
  }
  if (['read-diff', 'close-diff'].includes(step.id))
    for (const [kind, version] of [
      ['del', 'latest'],
      ['add', 'work'],
    ])
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(readme[version][languageIndex].split('\n')[2]) +
          ')',
      );
};
