const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { practiceCommitHash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyBranch({ step, run, waitFor, tutorial, languageIndex }) {
  const restored = step.prepare.actions.some((action) => action.waitFor?.includes('data-branch-name="feature/saved-work"'));
  const current = restored ? 'feature/saved-work' : 'feature/begruessung';
  await waitFor(tutorial, query('[data-branch-name=' + JSON.stringify(current) + '][data-branch-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === ' + (restored ? 4 : 7));
  const head = await run(
    'Array.from(document.querySelectorAll(".commit-refs")).find(node=>node.textContent.includes("HEAD ->"))?.closest(".commit-row")?.dataset.commitHash',
  );
  assert.equal(head, practiceCommitHash(restored ? 3 : 4), 'A stash branch begins at its saved base, not at the previously active newer commit.');
  const names = await run('Array.from(document.querySelectorAll("[data-tutorial=branches] .branch-row-local"),node=>node.dataset.branchName).sort()');
  assert.deepEqual(names, restored ? ['feature/begruessung', 'feature/saved-work', 'main'] : ['feature/begruessung', 'main']);
  for (const [group, paths] of [
    ['staged', restored ? ['README.md'] : []],
    ['unstaged', restored ? ['README.md'] : []],
    ['untracked', restored ? ['notes.txt'] : []],
  ]) {
    const actual =
      'Array.from(document.querySelectorAll(' +
      JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') +
      '),node=>node.getAttribute("aria-label")).sort()';
    await waitFor(tutorial, 'JSON.stringify(' + actual + ') === ' + JSON.stringify(JSON.stringify(paths)), 'Stash branch ' + group + ' state: ' + step.id);
  }
  await waitFor(tutorial, 'document.querySelectorAll("[data-stash-name]").length === ' + (restored ? 0 : 1));
  if (await run('Boolean(' + query('[data-dialog-field=branchName] input') + ')')) {
    const value = await run(query('[data-dialog-field=branchName] input') + '.value');
    assert.equal(await run(query('[data-dialog-action=confirm]') + '.disabled'), !value.trim());
  }
  const versions = ['index-content', 'close-index'].includes(step.id)
    ? ['description', 'index']
    : ['work-content', 'close-work'].includes(step.id)
      ? ['index', 'work']
      : null;
  if (versions)
    for (const [kind, version] of [
      ['del', versions[0]],
      ['add', versions[1]],
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
