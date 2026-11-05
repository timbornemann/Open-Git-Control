const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { messageRecoveryName: name } = require('../dist-electron/src/shared/tutorial/messageRecoveryLessonHelpers.js');
const examples = require('../dist-electron/src/shared/tutorial/rewordLessonExamples.js');
const field = (value) => '[data-tutorial="recovery-' + value + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyMessageRecovery({ step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions,
    created = actions.some((action) => action.click === field('create-branch'));
  if (await run('Boolean(document.querySelector(".commit-row[data-commit-hash]"))')) {
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(created ? 4 : 6) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
    );
    assert.deepEqual(rows.map((row) => row.hash).sort(), (created ? [1, 2, 3, 4, 5, 6] : [1, 2, 5, 6]).map(hash).sort());
    const rewritten = rows.find((row) => row.hash === hash(5));
    assert.equal(rewritten.parents, hash(2));
    assert.equal(rewritten.subject, examples.REWORD_TITLE[languageIndex]);
    assert.equal(rows.find((row) => row.hash === hash(6)).parents, hash(5));
    assert.ok(rows.find((row) => row.hash === hash(6)).refs.includes('main'));
    if (created) {
      const original = rows.find((row) => row.hash === hash(4));
      assert.equal(original.parents, hash(3));
      assert.ok(original.refs.includes('HEAD -> ' + name));
      assert.equal(rows.find((row) => row.hash === hash(3)).subject, examples.REWORD_ORIGINAL_TITLE[languageIndex]);
    }
  }
  if (await run('Boolean(' + query(field('source')) + ')')) {
    const source = await run(query(field('source')) + '.value'),
      text = await run(query(field('search')) + '.value');
    const expected = text ? 0 : source === 'backup' ? 1 : source === 'history' ? (created ? 6 : 5) : created ? 7 : 6;
    await waitFor(tutorial, query(field('list') + '[data-entry-count="' + expected + '"][aria-busy="false"]'));
    const backups = await run(
      'Array.from(document.querySelectorAll("[data-recovery-kind=backup]"),node=>({hash:node.dataset.recoveryHash,ref:node.dataset.recoverySelector}))',
    );
    assert.equal(backups.length, source === 'history' || text ? 0 : 1);
    if (backups.length) {
      assert.equal(backups[0].hash, hash(4));
      assert.ok(backups[0].ref.startsWith('refs/ogc/commit-reword/'));
    }
    if (expected) {
      const selected = await run(query(field('detail')) + '.dataset.recoveryHash');
      assert.ok([hash(4), hash(6)].includes(selected));
      if (source === 'backup') assert.equal(selected, hash(4));
      const filled = actions.filter((action) => action.fill?.selector === field('branch-name'));
      const expectedName = filled.length ? filled.at(-1).fill.value[languageIndex] : 'recovery-' + selected.slice(0, 7);
      await waitFor(tutorial, query(field('branch-name')) + '.value === ' + JSON.stringify(expectedName));
      if (source === 'backup' && (await run(query(field('git-details')) + '.open'))) {
        assert.equal(await run(query(field('full-hash')) + '.textContent'), hash(4));
        assert.ok((await run(query(field('reference')) + '.textContent')).startsWith('refs/ogc/commit-reword/'));
      }
    }
  }
  for (const [number, description] of [
    [5, examples.REWORD_DESCRIPTION],
    [3, examples.REWORD_ORIGINAL_DESCRIPTION],
  ])
    if (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(number) + '"]') + ')'))
      await waitFor(tutorial, query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(description[languageIndex]));
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
