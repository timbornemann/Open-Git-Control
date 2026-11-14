const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { recoveryConfirm, inspectRecoveryName: name } = require('../dist-electron/src/shared/tutorial/recoveryInspectLessonHelpers.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const field = (value) => '[data-tutorial="recovery-' + value + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyInspectRecovery({ step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions,
    inspected = actions.some((action) => action.click === recoveryConfirm);
  const created = actions.some((action) => action.click === field('create-branch'));
  const count = created ? 7 : inspected ? 6 : 5;
  if (await run('Boolean(document.querySelector(".commit-row[data-commit-hash]"))')) {
    const head = inspected ? 4 : 2;
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,refs:node.querySelector(".commit-refs")?.textContent||""}))',
    );
    assert.deepEqual(
      rows.map((row) => row.hash),
      (inspected ? [4, 3, 2, 1] : [2, 1]).map(hash),
    );
    const main = rows.find((row) => row.hash === hash(2));
    for (const ref of ['main', 'origin/main', 'tag: v1.0.0']) assert.ok(main.refs.includes(ref));
    if (inspected) {
      assert.ok(rows[0].refs.includes(created ? 'HEAD -> ' + name : 'HEAD'));
      if (!created) assert.ok(!rows[0].refs.includes('HEAD ->'), 'Inspection leaves HEAD detached until a branch is created.');
    }
  }
  if (await run('Boolean(' + query(field('search')) + ')')) {
    await waitFor(tutorial, query(field('list') + '[data-entry-count="' + count + '"][aria-busy="false"]'));
    assert.equal(await run('document.querySelectorAll("[data-recovery-kind=backup]").length'), 0);
    const selected = await run(query(field('detail')) + '.dataset.recoveryHash');
    assert.ok([hash(2), hash(4)].includes(selected));
    const filled = actions.filter((action) => action.fill?.selector === field('branch-name'));
    const expected = filled.length ? filled.at(-1).fill.value[languageIndex] : 'recovery-' + selected.slice(0, 7);
    await waitFor(tutorial, query(field('branch-name')) + '.value === ' + JSON.stringify(expected));
  }
  if (await run('Boolean(document.querySelector(".dialog-modal"))')) {
    const context = await run('document.querySelector(".dialog-modal .dialog-context-list").textContent');
    assert.ok(context.includes(hash(4).slice(0, 7)), 'Confirmation names the selected saved commit.');
    assert.equal(await run('document.querySelector(".dialog-modal [data-dialog-irreversible]").dataset.dialogIrreversible'), 'false');
  }
  if (['files', 'close-file'].includes(step.id)) {
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' + JSON.stringify(readme.latest[languageIndex]),
    );
    assert.equal(await run('document.querySelectorAll(".file-viewer[data-dirty=true]").length'), 0);
  }
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
