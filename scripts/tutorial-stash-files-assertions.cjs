const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { practiceCommitHash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyFiles({ step, run, waitFor, tutorial, languageIndex }) {
  const clicks = step.prepare.actions.map((action) => action.click || '');
  const tracked = clicks.some((selector) => selector.includes('[data-stash-path="README.md"] button'));
  const both = clicks.some((selector) => selector.includes('[data-stash-path="notes.txt"] button'));
  const dropped = clicks.some((selector) => selector.includes('data-stash-action="confirm-drop"'));
  await waitFor(tutorial, query('[data-branch-name=main][data-branch-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === ' + (dropped ? 4 : 7));
  const head = await run(
    'Array.from(document.querySelectorAll(".commit-refs")).find(node=>node.textContent.includes("HEAD ->"))?.closest(".commit-row")?.dataset.commitHash',
  );
  assert.equal(head, practiceCommitHash(4));
  for (const [group, paths] of [
    ['staged', both ? ['README.md', 'notes.txt'] : tracked ? ['README.md'] : []],
    ['unstaged', []],
    ['untracked', []],
  ]) {
    const actual =
      'Array.from(document.querySelectorAll(' +
      JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') +
      '),node=>node.getAttribute("aria-label")).sort()';
    await waitFor(tutorial, 'JSON.stringify(' + actual + ') === ' + JSON.stringify(JSON.stringify(paths)), 'Restored file ' + group + ' state: ' + step.id);
  }
  await waitFor(tutorial, 'document.querySelectorAll("[data-stash-name]").length === ' + (dropped ? 0 : 1));
  const files = await run(
    'Array.from(document.querySelectorAll("[data-stash-path]"),node=>({path:node.dataset.stashPath,disabled:node.querySelector("button").disabled})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)',
  );
  if (files.length)
    assert.deepEqual(files, [
      { path: 'README.md', disabled: false },
      { path: 'notes.txt', disabled: false },
    ]);
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
