const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyReplay({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const picked = chapter.id === 'cherry-pick',
    source = picked ? 2 : 4;
  const applied = step.prepare.actions.some((action) => action.click === '[data-tutorial="graph-' + chapter.id + '"]');
  const head = applied ? 5 : picked ? 1 : 4;
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,author:node.querySelector(".commit-author")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  const expected = picked ? [1, 2] : [1, 2, 3, 4];
  if (applied) expected.push(5);
  assert.deepEqual(rows.map((row) => row.hash).sort(), expected.map(hash).sort(), 'Only saved reachable commits appear in the graph.');
  const originalTitle = picked
    ? languageIndex === 0
      ? 'feat: App anlegen'
      : 'feat: add app'
    : languageIndex === 0
      ? 'feat: Begrüßung ergänzen'
      : 'feat: update greeting';
  assert.equal(rows.find((row) => row.hash === hash(source)).subject, originalTitle);
  assert.ok(rows.find((row) => row.hash === hash(picked ? 1 : 2)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  assert.ok(rows.find((row) => row.hash === hash(picked ? 2 : 1)).refs.includes('feature/begruessung'));
  assert.ok(rows.find((row) => row.hash === hash(head)).refs.includes('main'));
  if (applied) {
    const created = rows.find((row) => row.hash === hash(5));
    assert.equal(created.parents, hash(picked ? 1 : 4), 'Replay has one parent at the previous HEAD.');
    assert.equal(created.subject, picked ? originalTitle : 'Revert "' + originalTitle + '"');
    assert.equal(created.author, picked ? 'Sam Beispiel' : 'Alex Beispiel');
    const panel = '.commit-details-panel[data-commit-hash="' + hash(5) + '"]';
    if (await run('Boolean(' + query(panel) + ')')) {
      const body = picked
        ? languageIndex === 0
          ? 'Anwendung und Paketkonfiguration ergänzen.'
          : 'Add the application and package configuration.'
        : 'This reverts commit ' + hash(4) + '.';
      await waitFor(tutorial, query(panel + ' .commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(body));
    }
  }
  if (['source-diff', 'close-source', 'result-diff', 'close-result'].includes(step.id)) {
    const result = ['result-diff', 'close-result'].includes(step.id);
    const versions = picked ? ['initial', 'app'] : result ? ['latest', 'description'] : ['description', 'latest'];
    for (const [index, kind] of (picked ? ['add'] : ['del', 'add']).entries()) {
      const expectedLine = readme[picked ? 'app' : versions[index]][languageIndex].split('\n')[2];
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(expectedLine) +
          ')',
      );
    }
    if (picked) assert.equal(await run('document.querySelectorAll(".file-viewer .del .diff-code").length'), 0);
  }
  if (step.id === 'work-text' || step.id === 'close-work') {
    const expectedText = readme[picked ? 'app' : 'description'][languageIndex];
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' + JSON.stringify(expectedText),
    );
  }
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'), 0);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
