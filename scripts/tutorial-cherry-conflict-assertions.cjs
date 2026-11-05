const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const field = (name) => '[data-tutorial="conflict-' + name + '"]';
const cp = (name) => '[data-tutorial="cherry-pick-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyCherryConflict({ step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions;
  const used = (selector) => actions.some((action) => action.click === selector);
  const started = used('[data-tutorial="graph-cherry-pick"]'),
    chosen = used(field('take-theirs')),
    saved = used(field('save'));
  const resolved = used(field('mark')),
    continued = used(cp('continue'));
  const aborted = used(cp('abort')) && used('[data-dialog-action="confirm"]');
  if (started && !continued && !aborted) {
    await waitFor(tutorial, query(field('section') + '[data-conflict-files="' + (resolved ? 0 : 1) + '"][data-conflict-operation=true]'));
    await waitFor(tutorial, query(cp('continue')));
    assert.equal(await run('Boolean(' + query(field('continue')) + ')'), false, 'Only the matching cherry-pick controls appear.');
    if (!resolved) {
      await waitFor(tutorial, query(field('editor') + '[data-conflict-dirty="' + (chosen && !saved) + '"][data-conflict-blocks="' + (chosen ? 0 : 1) + '"]'));
      const value = await run(query(field('content')) + '.value');
      if (chosen) assert.equal(value, readme.work[languageIndex]);
      else {
        assert.ok(value.includes('<<<<<<< HEAD'));
        assert.ok(value.includes('>>>>>>> ' + hash(5).slice(0, 7)));
        assert.ok((await run(query(field('ours')) + '.innerText')).includes(readme.latest[languageIndex].split('\n')[2]));
        assert.ok((await run(query(field('theirs')) + '.innerText')).includes(readme.work[languageIndex].split('\n')[2]));
      }
      assert.equal(await run(query(field('mark')) + '.disabled'), !chosen);
    } else {
      await waitFor(tutorial, query('[data-tutorial="staged-files"] .staging-file-row[aria-label="README.md"]'));
      assert.equal(await run('Boolean(' + query(field('editor')) + ')'), false);
    }
  }
  if (!started || continued || aborted || resolved) {
    const head = continued ? 6 : 4;
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,author:node.querySelector(".commit-author")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
    );
    const expected = [1, 2, 3, 4, 5];
    if (continued) expected.push(6);
    assert.deepEqual(rows.map((row) => row.hash).sort(), expected.map(hash).sort());
    assert.ok(rows.find((row) => row.hash === hash(5)).refs.includes('feature/begruessung'));
    assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
    assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
    if (continued) {
      assert.equal(rows.find((row) => row.hash === hash(6)).parents, hash(4), 'Continuing cherry-pick does not create a merge parent.');
      assert.equal(rows.find((row) => row.hash === hash(6)).author, 'Sam Beispiel');
      if (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(6) + '"]') + ')')) {
        const body = languageIndex === 0 ? 'Eine eigene Änderung seit der gemeinsamen Ausgangsbasis.' : 'An independent change since the common base.';
        await waitFor(tutorial, query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(body));
      }
    }
  }
  if (continued || aborted) await waitFor(tutorial, '!' + query(cp('continue')), 'The completed operation disappears after its status refresh.');
  if (continued && ['read-diff', 'close-diff'].includes(step.id)) {
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
  }
  if (aborted && ['text', 'contents', 'close-file'].includes(step.id))
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' + JSON.stringify(readme.latest[languageIndex]),
    );
  if (used(cp('abort')) && !used('[data-dialog-action="cancel"]') && !aborted)
    await waitFor(tutorial, query('.dialog-context-list dd') + '?.textContent === "git cherry-pick --abort"');
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
