const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const {
  REBASE_GUARD_MESSAGES,
  rebaseGuardHead,
  rebaseGuardTarget,
  rebaseGuardFailure,
  rebaseGuardDismiss,
} = require('../dist-electron/src/shared/tutorial/rebaseGuardLessonHelpers.js');
const { rebaseMenu, rebaseField } = require('../dist-electron/src/shared/tutorial/rebaseLessonHelpers.js');
const ids = ['rebase-root', 'rebase-off-head', 'rebase-merge-guard'];
const kindOf = (id) => (id === 'rebase-merge-guard' ? 'merge' : id.slice('rebase-'.length));
module.exports.isGuard = (id) => ids.includes(id);
module.exports.verifyFeedback = async ({ chapter, step, run, languageIndex }) => {
  const rejected = step.prepare.actions.some((action) => action.click === rebaseMenu);
  const dismissed = step.prepare.actions.some((action) => action.click === rebaseGuardDismiss);
  const errors = await run('Array.from(document.querySelectorAll(".action-toast.error"),node=>node.textContent)');
  assert.equal(errors.length, rejected && !dismissed ? 1 : 0);
  for (const error of errors) assert.ok(error.includes(REBASE_GUARD_MESSAGES[kindOf(chapter.id)][languageIndex]));
};
module.exports.verify = async ({ chapter, step, run, waitFor, tutorial, languageIndex }) => {
  const kind = kindOf(chapter.id),
    head = rebaseGuardHead(kind),
    selected = rebaseGuardTarget(kind);
  const selector = '.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]';
  await waitFor(tutorial, 'document.querySelector(' + JSON.stringify(selector) + ')');
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  const expected = kind === 'root' ? [1, 2, 3, 4] : kind === 'off-head' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
  assert.deepEqual(rows.map((row) => row.hash).sort(), expected.map(hash).sort());
  assert.ok(rows.find((row) => row.hash === hash(head)).refs.includes('main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  if (kind === 'root') assert.equal(rows.find((row) => row.hash === hash(selected)).parents, '');
  if (kind === 'off-head') {
    assert.equal(rows.find((row) => row.hash === hash(selected)).parents, hash(3));
    assert.ok(rows.find((row) => row.hash === hash(selected)).refs.includes('feature/begruessung'));
    assert.equal(rows.find((row) => row.hash === hash(head)).parents, hash(3));
  }
  if (kind === 'merge') assert.equal(rows.find((row) => row.hash === hash(selected)).parents, hash(4) + ' ' + hash(5));
  assert.equal(await run('Boolean(document.querySelector(' + JSON.stringify(rebaseField) + '))'), false, 'A refused range must never open the todo editor.');
  assert.equal(await run('Boolean(document.querySelector("[data-tutorial=rebase-actions], [data-tutorial=cherry-pick-actions]"))'), false);
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'), 0);
  await module.exports.verifyFeedback({ chapter, step, run, languageIndex });
};
