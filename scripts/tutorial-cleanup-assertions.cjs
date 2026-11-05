const assert = require('node:assert/strict');
const { practiceCommitHash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { DEFAULT_CLEANUP_PROTECTION } = require('../dist-electron/src/shared/git/branchCleanupProtection.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyCleanup({ step, run, waitFor, tutorial }) {
  const results = await run('Array.from(document.querySelectorAll(".branch-cleanup-results li > strong"),node=>node.textContent)');
  const expected = step.prepare.branches.heads
    .map((head) => head.name)
    .filter((name) => !results.includes(name))
    .sort();
  const names = 'Array.from(document.querySelectorAll("[data-tutorial=branches] .branch-row-local"),node=>node.dataset.branchName).sort()';
  await waitFor(tutorial, 'JSON.stringify(' + names + ') === ' + JSON.stringify(JSON.stringify(expected)), 'Actual remaining local branch references');
  await waitFor(tutorial, query('[data-tutorial=branches] [data-branch-name=main][data-branch-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === ' + (expected.includes('feature/offene-arbeit') ? 4 : 3));
  const headHash = await run(
    'Array.from(document.querySelectorAll(".commit-refs")).find(node=>node.textContent.includes("HEAD -> main"))?.closest(".commit-row")?.dataset.commitHash',
  );
  assert.equal(headHash, practiceCommitHash(3), 'Cleanup and comparison never check out another commit.');
  if (await run('Boolean(document.querySelector(".branch-cleanup-targets"))')) {
    const targetFill = step.prepare.actions.find((action) => action.fill?.selector === '[data-cleanup-comparison="local"]');
    assert.equal(await run(query('[data-cleanup-comparison=local]') + '.value'), targetFill?.fill.value[0] || 'local-main');
    assert.ok(await run(query('[data-cleanup-name=main] input') + '.disabled'));
    for (const action of step.prepare.actions) {
      if (!action.fill?.selector.startsWith('[data-cleanup-kind=')) continue;
      assert.equal(await run(query(action.fill.selector) + '.checked'), action.fill.value[0] === 'true', 'The restored selection matches its recipe.');
    }
    const textarea = '.branch-cleanup-protection textarea';
    const draft = step.prepare.actions.find((action) => action.fill?.selector === textarea)?.fill.value[0];
    const patterns = [...new Set([...DEFAULT_CLEANUP_PROTECTION, ...(step.prepare.branches.protectedPatterns || [])])].join('\n');
    assert.equal(await run(query(textarea) + '.value'), draft === undefined ? patterns : draft);
    if (draft !== undefined && draft !== patterns) assert.ok(await run(query('[data-dialog-action=confirm]') + '.disabled'));
  }
  if (await run('Boolean(document.querySelector(".branch-cleanup-force-warning"))')) {
    const acknowledged = step.prepare.actions.some(
      (action) => action.fill?.selector === '.branch-cleanup-force-confirm input' && action.fill.value[0] === 'true',
    );
    assert.equal(await run(query('.branch-cleanup-force-confirm input') + '.checked'), acknowledged);
    assert.equal(await run(query('[data-dialog-action=confirm]') + '.disabled'), !acknowledged);
    assert.ok(expected.includes('feature/offene-arbeit'), 'Reviewing a force warning must not delete its reference.');
  }
  if (results.length) {
    assert.equal(await run('document.querySelectorAll(".branch-cleanup-outcome.deleted").length'), results.length);
    assert.equal(await run('document.querySelectorAll(".branch-cleanup-outcome.failed,.branch-cleanup-outcome.unknown").length'), 0);
  }
};
