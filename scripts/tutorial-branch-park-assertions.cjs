const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const notes = require('../src/tutorial/fixtures/tree-files.json').note;
const { practiceCommitHash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyPark({ step, run, waitFor, tutorial, languageIndex }) {
  const waits = step.prepare.actions.map((action) => action.waitFor || '');
  const parked = waits.some((selector) => selector.includes('data-branch-change-switched'));
  const returned = waits.some((selector) => selector.includes('data-branch-change-mode="restore"'));
  const restored = waits.some((selector) => selector.includes('branch-change-restored="true"'));
  const current = returned ? 'main' : parked ? 'feature/begruessung' : 'main';
  const clean = parked && !restored;
  await waitFor(tutorial, query('[data-tutorial=branches] [data-branch-name=' + JSON.stringify(current) + '][data-branch-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === ' + (clean ? 7 : 4));
  const names = await run('Array.from(document.querySelectorAll("[data-tutorial=branches] .branch-row-local"),node=>node.dataset.branchName).sort()');
  assert.deepEqual(names, ['feature/begruessung', 'main']);
  const head = await run(
    'Array.from(document.querySelectorAll(".commit-refs")).find(node=>node.textContent.includes("HEAD ->"))?.closest(".commit-row")?.dataset.commitHash',
  );
  assert.equal(head, practiceCommitHash(4), 'Parking and restoration do not commit uncommitted work on either branch.');
  for (const [group, paths] of [
    ['staged', clean ? [] : ['README.md']],
    ['unstaged', clean ? [] : ['README.md']],
    ['untracked', clean ? [] : ['notes.txt']],
  ]) {
    const actual =
      'Array.from(document.querySelectorAll(' +
      JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') +
      '),node=>node.getAttribute("aria-label")).sort()';
    await waitFor(tutorial, 'JSON.stringify(' + actual + ') === ' + JSON.stringify(JSON.stringify(paths)), 'Actual ' + group + ' state: ' + step.id);
  }
  // A guided stash operation refreshes its list after the outcome is closed.
  // Until then the modal owns the interaction; the fresh tree/graph above
  // already prove restoration, and subsequent steps verify the refreshed list.
  const outcome = await run('Boolean(' + query('[data-tutorial=branch-change-result][data-branch-change-restored=true]') + ')');
  if (!outcome && (await run('Boolean(' + query('[data-tutorial=stash-panel-toggle][aria-expanded=true]') + ')'))) {
    await waitFor(tutorial, 'document.querySelectorAll("[data-stash-name]").length === ' + (clean ? 1 : 0));
    if (clean) {
      const entry = '[data-stash-name="stash@{0}"]';
      assert.ok((await run(query(entry + ' .stash-entry-subject') + '.textContent')).includes(languageIndex ? 'Work for later' : 'Arbeit für später'));
      assert.equal(await run(query(entry + ' .stash-entry-branch') + '.textContent'), '(main)');
      assert.equal(await run(query(entry + ' [data-stash-action=branch]') + '.disabled'), true);
      const files = await run(
        'Array.from(document.querySelectorAll("[data-stash-path]"),node=>({path:node.dataset.stashPath,disabled:node.querySelector("button").disabled}))',
      );
      files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      if (files.length)
        assert.deepEqual(files, [
          { path: 'README.md', disabled: true },
          { path: 'notes.txt', disabled: true },
        ]);
    }
  }
  const versions = { 'saved-index': ['latest', 'index'], 'saved-work': ['index', 'work'] }[step.id];
  if (versions)
    for (const [kind, version] of [
      ['del', versions[0]],
      ['add', versions[1]],
    ])
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.branch-change-preview .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(readme[version][languageIndex].split('\n')[2]) +
          ')',
        'Saved ' + kind + ' version: ' + step.id,
      );
  if (step.id === 'saved-new')
    for (const line of notes[languageIndex].split('\n').filter(Boolean))
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".branch-change-preview .add .diff-code"),node=>node.textContent).includes(' + JSON.stringify(line) + ')',
      );
};
