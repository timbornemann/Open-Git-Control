const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { resetGuardDialog, resetGuardConfirm, resetGuardCancel } = require('../dist-electron/src/shared/tutorial/resetLessonHelpers.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyResetMode({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const mode = chapter.id.slice('reset-'.length),
    actions = step.prepare.actions;
  const used = (selector) => actions.some((action) => action.click === selector);
  const applied = used(resetGuardConfirm(mode)),
    head = applied ? 3 : 4;
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  assert.deepEqual(rows.map((row) => row.hash).sort(), [1, 2, 3, 4].map(hash).sort(), 'Reset adds no objects and the other branch retains the former HEAD.');
  assert.ok(rows.find((row) => row.hash === hash(4)).refs.includes('feature/begruessung'));
  assert.ok(rows.find((row) => row.hash === hash(head)).refs.includes('HEAD -> main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  if (await run('Boolean(' + query('[data-tutorial="staging"]') + ')')) {
    const groups = applied
      ? {
          staged: mode === 'soft' ? ['README.md', 'src/app.ts'] : [],
          unstaged: mode === 'hard' ? [] : mode === 'soft' ? ['README.md'] : ['README.md', 'src/app.ts'],
          untracked: ['notes.txt'],
        }
      : { staged: ['README.md'], unstaged: ['README.md'], untracked: ['notes.txt'] };
    for (const [group, names] of Object.entries(groups)) {
      const selector = '[data-tutorial="' + group + '-files"] .staging-file-row';
      await waitFor(
        tutorial,
        'JSON.stringify(Array.from(document.querySelectorAll(' +
          JSON.stringify(selector) +
          '),node=>node.getAttribute("aria-label")).sort()) === ' +
          JSON.stringify(JSON.stringify(names.slice().sort())),
        'The ' + group + ' list matches the ' + mode + ' reset state.',
      );
    }
  }
  let versions;
  if (['index-before', 'close-index'].includes(step.id)) versions = ['latest', 'index'];
  else if (['work-before', 'close-work'].includes(step.id)) versions = ['index', 'work'];
  else if (['diff-staged-result', 'close-staged-result'].includes(step.id)) versions = ['description', 'index'];
  else if (['diff-unstaged-result', 'close-unstaged-result'].includes(step.id)) versions = [mode === 'soft' ? 'index' : 'description', 'work'];
  if (versions)
    for (const [index, kind] of ['del', 'add'].entries())
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(readme[versions[index]][languageIndex].split('\n')[2]) +
          ')',
      );
  if (['text', 'contents', 'close-file'].includes(step.id))
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".cm-content .cm-line"),node=>node.textContent).join("\\n") === ' +
        JSON.stringify(readme[mode === 'hard' ? 'description' : 'work'][languageIndex]),
    );
  const guarded = actions.some((action) => action.waitFor === resetGuardDialog(mode));
  if (guarded && !applied && !used(resetGuardCancel(mode))) {
    await waitFor(tutorial, query(resetGuardDialog(mode)));
    assert.equal(await run(query('.dialog-context-list dd:nth-of-type(1)') + '.textContent'), 'git reset --' + mode + ' ' + hash(3));
  }
  if (used('[data-tutorial="graph-reset-' + mode + '"]') && !guarded && !used('[data-dialog-action="cancel"]')) {
    await waitFor(tutorial, query('.dialog-context-list dd:nth-of-type(1)') + '?.textContent.startsWith(' + JSON.stringify(hash(3).slice(0, 7)) + ')');
    assert.equal(await run(query('.dialog-context-list dd:nth-of-type(2)') + '.textContent'), '--' + mode);
  }
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
