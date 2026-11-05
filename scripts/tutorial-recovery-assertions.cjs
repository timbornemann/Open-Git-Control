const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { recoveryName } = require('../dist-electron/src/shared/tutorial/recoveryLessonHelpers.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const field = (name) => '[data-tutorial="recovery-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyRecovery({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  if (chapter.id === 'recovery-message') return require('./tutorial-message-recovery-assertions.cjs')({ step, run, waitFor, tutorial, languageIndex });
  if (chapter.id === 'recovery-inspect') return require('./tutorial-inspect-recovery-assertions.cjs')({ step, run, waitFor, tutorial, languageIndex });
  if (chapter.id === 'recovery-reset') return require('./tutorial-reset-recovery-assertions.cjs')({ step, run, waitFor, tutorial, languageIndex });
  const actions = step.prepare.actions,
    created = actions.some((action) => action.click === field('create-branch'));
  const graph = await run('Boolean(document.querySelector(".commit-row[data-commit-hash]"))');
  if (graph) {
    const head = created ? 4 : 2;
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,refs:node.querySelector(".commit-refs")?.textContent||""}))',
    );
    assert.deepEqual(
      rows.map((row) => row.hash),
      (created ? [4, 3, 2, 1] : [2, 1]).map(hash),
    );
    const preserved = rows.find((row) => row.hash === hash(2)).refs;
    for (const ref of ['main', 'origin/main', 'tag: v1.0.0']) assert.ok(preserved.includes(ref));
    if (created) assert.ok(rows[0].refs.includes('HEAD -> ' + recoveryName));
  }
  if (await run('Boolean(' + query(field('search')) + ')')) {
    const text = await run(query(field('search')) + '.value');
    const expected = !text ? (created ? 6 : 5) : text === 'feat:' ? 2 : text === hash(4).slice(0, 7) ? (created ? 2 : 1) : 0;
    await waitFor(tutorial, query(field('list') + '[data-entry-count="' + expected + '"][aria-busy="false"]'));
    const points = await run(
      'Array.from(document.querySelectorAll("[data-recovery-hash][data-recovery-kind]"),node=>({hash:node.dataset.recoveryHash,kind:node.dataset.recoveryKind}))',
    );
    assert.equal(points.length, expected);
    assert.ok(
      points.every((point) => [1, 2, 3, 4].map(hash).includes(point.hash)),
      'Every recovery point names an actual saved object.',
    );
    if (expected) {
      const selected = await run(query(field('detail')) + '.dataset.recoveryHash');
      assert.ok([hash(2), hash(4)].includes(selected));
      const names = actions.filter((action) => action.fill?.selector === field('branch-name'));
      const name = names.length ? names.at(-1).fill.value[languageIndex] : 'recovery-' + selected.slice(0, 7);
      await waitFor(tutorial, query(field('branch-name')) + '.value === ' + JSON.stringify(name));
      assert.equal(await run(query(field('create-branch')) + '.disabled'), !name || name.includes(' '));
      if (await run(query(field('git-details')) + '.open')) {
        assert.equal(await run(query(field('full-hash')) + '.textContent'), selected);
        assert.ok((await run(query(field('reference')) + '.textContent')).startsWith('HEAD@{'));
      }
    }
  }
  if (['diff', 'close-file'].includes(step.id))
    for (const [kind, version] of [
      ['del', 'description'],
      ['add', 'latest'],
    ])
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(readme[version][languageIndex].split('\n')[2]) +
          ')',
      );
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
