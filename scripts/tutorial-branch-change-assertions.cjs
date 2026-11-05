const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const notes = require('../src/tutorial/fixtures/tree-files.json').note;
const { practiceCommitHash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyBranchChange({ step, run, waitFor, tutorial, languageIndex }) {
  const restored = Boolean(await run(query('[data-tutorial=branch-change-result][data-branch-change-restored=true]')));
  const current = restored ? 'feature/begruessung' : step.prepare.branches.current;
  await waitFor(tutorial, query('[data-tutorial=branches] [data-branch-name=' + JSON.stringify(current) + '][data-branch-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === 4');
  const names = await run('Array.from(document.querySelectorAll("[data-tutorial=branches] .branch-row-local"),node=>node.dataset.branchName).sort()');
  assert.deepEqual(names, ['feature/begruessung', 'main']);
  const head = await run(
    'Array.from(document.querySelectorAll(".commit-refs")).find(node=>node.textContent.includes("HEAD ->"))?.closest(".commit-row")?.dataset.commitHash',
  );
  assert.equal(head, practiceCommitHash(4), 'Carrying uncommitted work creates no commit or merge.');
  for (const [group, paths] of [
    ['staged', ['README.md']],
    ['unstaged', ['README.md']],
    ['untracked', ['notes.txt']],
  ]) {
    const actual =
      'Array.from(document.querySelectorAll(' +
      JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') +
      '),node=>node.getAttribute("aria-label")).sort()';
    await waitFor(tutorial, 'JSON.stringify(' + actual + ') === ' + JSON.stringify(JSON.stringify(paths)), 'Preserved ' + group + ' file list');
  }
  if (await run('Boolean(' + query('[data-tutorial=branch-change-name]') + ')')) {
    const field = '[data-tutorial=branch-change-name]';
    const name = await run(query(field) + '.value');
    const fill = step.prepare.actions.find((action) => action.fill?.selector === field);
    if (fill) assert.equal(name, fill.fill.value[languageIndex]);
    assert.equal(await run(query('[data-dialog-action=confirm]') + '.disabled'), !name.trim());
  }
  const versions = {
    'staged-diff': ['latest', 'index'],
    'working-diff': ['index', 'work'],
    'staged-content': ['latest', 'index'],
    'working-content': ['index', 'work'],
  }[step.id];
  if (versions) {
    const scope = step.id.endsWith('-diff') ? '.branch-change-preview' : '.file-viewer';
    for (const [kind, version] of [
      ['del', versions[0]],
      ['add', versions[1]],
    ]) {
      const text = readme[version][languageIndex].split('\n')[2];
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify(scope + ' .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(text) +
          ')',
        'Actual ' + kind + ' version: ' + step.id,
      );
    }
  }
  if (step.id === 'new-content') {
    for (const line of notes[languageIndex].split('\n').filter(Boolean))
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".branch-change-preview .add .diff-code"),node=>node.textContent).includes(' + JSON.stringify(line) + ')',
      );
  }
};
