const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const {
  mergeRevertMenu,
  mergeRevertConfirm,
  mergeRevertCancel,
  mergeRevertDialog,
} = require('../dist-electron/src/shared/tutorial/mergeRevertLessonHelpers.js');
const { mergeLicenseNote } = require('../dist-electron/src/shared/tutorial/mergeExamples.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyMergeRevert({ step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions,
    used = (selector) => actions.some((action) => action.click === selector);
  const reverted = used(mergeRevertConfirm),
    head = reverted ? 7 : 6;
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  const expected = [1, 2, 3, 4, 5, 6];
  if (reverted) expected.push(7);
  assert.deepEqual(rows.map((row) => row.hash).sort(), expected.map(hash).sort());
  assert.equal(rows.find((row) => row.hash === hash(6)).parents, hash(4) + ' ' + hash(5));
  assert.ok(rows.find((row) => row.hash === hash(5)).refs.includes('feature/begruessung'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  if (reverted) {
    assert.equal(rows.find((row) => row.hash === hash(7)).parents, hash(6), 'The inverse is a single-parent descendant of the original merge.');
    assert.equal(rows.find((row) => row.hash === hash(7)).subject, 'Revert "' + rows.find((row) => row.hash === hash(6)).subject + '"');
    if (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(7) + '"]') + ')')) {
      const expectedBody = 'This reverts commit ' + hash(6) + ', reversing\nchanges made to ' + hash(4) + '.';
      await waitFor(tutorial, query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(expectedBody));
    }
  }
  if (used(mergeRevertMenu) && !reverted && !used(mergeRevertCancel)) {
    await waitFor(tutorial, query(mergeRevertDialog));
    assert.ok((await run(query(mergeRevertDialog + ' .dialog-context-list dd:nth-of-type(1)') + '.textContent')).startsWith(hash(6).slice(0, 7)));
    assert.equal(await run(query(mergeRevertDialog + ' .dialog-context-list dd:nth-of-type(2)') + '.textContent'), '1');
  }
  if (['source-diff', 'close-source', 'result-diff', 'close-result'].includes(step.id)) {
    const inverse = ['result-diff', 'close-result'].includes(step.id),
      kind = inverse ? 'del' : 'add';
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(' +
        JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
        '),node=>node.textContent).includes(' +
        JSON.stringify(mergeLicenseNote[languageIndex].trim()) +
        ')',
    );
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('.file-viewer .' + (inverse ? 'add' : 'del') + ' .diff-code') + ').length'), 0);
  }
  if (['license-text', 'close-license'].includes(step.id)) {
    await waitFor(tutorial, query('.file-viewer[data-path="LICENSE"][data-tab=text]'));
    const text = await run('Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n")');
    assert.ok(text.startsWith('MIT License\n\nCopyright (c) 2026 OGC-Lernprojekt\n'));
    assert.ok(!text.includes(mergeLicenseNote[languageIndex].trim()));
  }
  if (['readme-text', 'readme', 'close-readme'].includes(step.id))
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' + JSON.stringify(readme.latest[languageIndex]),
    );
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'), 0);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
