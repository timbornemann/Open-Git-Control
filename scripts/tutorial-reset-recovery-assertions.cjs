const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { recoveryConfirm } = require('../dist-electron/src/shared/tutorial/recoveryInspectLessonHelpers.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const field = (value) => '[data-tutorial="recovery-' + value + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyResetRecovery({ step, run, waitFor, tutorial, languageIndex }) {
  const reset = step.prepare.actions.some((action) => action.click === recoveryConfirm),
    head = reset ? 4 : 2;
  if (await run('Boolean(document.querySelector(".commit-row[data-commit-hash]"))')) {
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,refs:node.querySelector(".commit-refs")?.textContent||""}))',
    );
    assert.deepEqual(
      rows.map((row) => row.hash),
      (reset ? [4, 3, 2, 1] : [2, 1]).map(hash),
    );
    assert.ok(rows[0].refs.includes('HEAD -> main'), 'Reset keeps main attached and moves that existing branch.');
    assert.ok(!rows.some((row) => row.refs.includes('recovery/')), 'Reset creates no additional branch.');
    const originalRemote = rows.find((row) => row.hash === hash(2));
    for (const ref of ['origin/main', 'tag: v1.0.0']) assert.ok(originalRemote.refs.includes(ref));
  }
  if (await run('Boolean(' + query(field('search')) + ')')) {
    await waitFor(tutorial, query(field('list') + '[data-entry-count="' + (reset ? 6 : 5) + '"][aria-busy="false"]'));
    assert.equal(await run('document.querySelectorAll("[data-recovery-kind=backup]").length'), 0);
    if (reset) assert.equal(await run('document.querySelector("[data-recovery-kind=reset]").dataset.recoveryHash'), hash(4));
  }
  if (await run('Boolean(document.querySelector(".dialog-modal"))')) {
    assert.ok((await run('document.querySelector(".dialog-modal .dialog-context-list").textContent')).includes(hash(4).slice(0, 7)));
    assert.ok((await run('document.querySelector(".dialog-modal .dialog-impact").textContent')).includes(languageIndex === 0 ? 'Ja' : 'Yes'));
  }
  if (['files', 'close-file'].includes(step.id)) {
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' + JSON.stringify(readme.latest[languageIndex]),
    );
    assert.equal(await run('document.querySelectorAll(".file-viewer[data-dirty=true]").length'), 0);
  }
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'), 0);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
