const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { mergeLicenseNote } = require('../dist-electron/src/shared/tutorial/mergeExamples.js');
const { mergeFailure, mergeFailureClose } = require('../dist-electron/src/shared/tutorial/mergeGuardHelpers.js');
const { squashDivergedMessage, squashDivergedDescription } = require('../dist-electron/src/shared/tutorial/mergeSquashDivergedHelpers.js');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyMerge({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  if (chapter.id === 'merge-revert') return require('./tutorial-merge-revert-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  const actions = step.prepare.actions;
  const diverged = step.prepare.branches.fixture === 'diverged-license';
  const beforeMain = diverged ? 4 : 3,
    beforeSource = diverged ? 5 : 4,
    newCommit = diverged ? 6 : 5;
  const modeIndex = actions.findLastIndex((action) => action.fill?.selector === '[data-tutorial="merge-mode"]');
  const mode = actions[modeIndex]?.fill.value[0] || 'default';
  const result = actions.findLastIndex((action) => action.click === '[data-dialog-action="confirm"]') > modeIndex && !(diverged && mode === 'ffOnly');
  const committed = actions.some((action) => action.click === '.staging-commit-btn');
  const outward = actions.some((action) => action.click === '[data-tutorial="merge-outward"]');
  const current = result && outward ? 'main' : step.prepare.branches.current;
  const automaticCommit = result && mode !== 'squash' && (mode === 'noFf' || diverged);
  const head = committed || automaticCommit ? newCommit : result && mode !== 'squash' ? 4 : current === 'main' ? beforeMain : beforeSource;
  const main = committed || automaticCommit ? newCommit : result && mode !== 'squash' ? 4 : beforeMain;
  await waitFor(tutorial, query('[data-branch-name=' + JSON.stringify(current) + '][data-branch-head=true]'));
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
  await waitFor(tutorial, 'document.querySelectorAll(".commit-row[data-commit-hash]").length === ' + (head === newCommit ? newCommit : beforeSource));
  const references = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"), row=>({hash:row.dataset.commitHash,parents:row.dataset.commitParents,subject:row.querySelector(".commit-subject")?.textContent,refs:row.querySelector(".commit-refs")?.textContent||""}))',
  );
  const sourceRow = references.find((row) => row.refs.includes('feature/begruessung'));
  assert.ok(references.find((row) => row.hash === hash(main))?.refs.includes('main'), 'The target reference follows the actual merge result.');
  assert.equal(sourceRow?.hash, hash(beforeSource), 'The source reference is preserved.');
  assert.ok(references.find((row) => row.hash === hash(head))?.refs.includes('HEAD -> ' + current));
  if (head === newCommit)
    assert.equal(references.find((row) => row.hash === hash(newCommit)).parents, committed ? hash(beforeMain) : hash(beforeMain) + ' ' + hash(beforeSource));
  if (committed)
    assert.equal(
      references.find((row) => row.hash === hash(newCommit)).subject,
      chapter.id === 'merge-squash-diverged'
        ? 'docs(lernen): ' + squashDivergedMessage[languageIndex]
        : ['feat(lernen): Begrüßung übernehmen', 'feat(lernen): combine the greeting'][languageIndex],
    );
  if (await run('Boolean(' + query('[data-tutorial=staging]') + ')')) {
    const staged = result && mode === 'squash' && !committed ? (diverged ? ['LICENSE'] : ['README.md', 'src/app.ts']) : [];
    for (const [group, paths] of [
      ['staged', staged],
      ['unstaged', []],
      ['untracked', []],
    ])
      await waitFor(
        tutorial,
        'JSON.stringify(Array.from(document.querySelectorAll(' +
          JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') +
          '), node=>node.getAttribute("aria-label")).sort()) === ' +
          JSON.stringify(JSON.stringify(paths)),
        'Actual merge ' + group + ' state: ' + chapter.id + '/' + step.id,
      );
  }
  if (await run('Boolean(' + query('[data-dialog-action=confirm]') + ')')) {
    const values = await run('Array.from(document.querySelectorAll(".dialog-context-list dd"),node=>node.textContent)');
    assert.deepEqual(
      values.slice(0, 2),
      outward ? [step.prepare.branches.current, step.prepare.branches.current === 'main' ? 'feature/begruessung' : 'main'] : ['feature/begruessung', 'main'],
    );
    const labels = {
      default: ['Normal zusammenführen (Standard)', 'Merge normally (default)'],
      noFf: ['Mit Merge-Commit', 'Create a merge commit'],
      squash: ['Für einen Commit bündeln (Squash)', 'Combine for one commit (squash)'],
      ffOnly: ['Nur Branch nachziehen (Fast-forward)', 'Only advance the branch (fast-forward)'],
    };
    assert.equal(values[2], labels[mode][languageIndex], 'The confirmation retains the chosen behavior.');
    assert.equal(result, false, 'Review itself must not write Git state.');
  }
  if (['merge-fast-forward', 'merge-diverged', 'merge-squash-diverged'].includes(chapter.id) && step.id === 'contents')
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .cm-content .cm-line"),node=>node.textContent).join("\\n") === ' +
        JSON.stringify(readme.latest[languageIndex]),
    );
  if (diverged && (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(6) + '"]') + ')')))
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-commit-file]"),node=>node.dataset.commitFile).sort()'), ['LICENSE']);
  if (diverged && ['read-diff', 'close-diff', 'read-staged', 'close-staged'].includes(step.id)) {
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .add .diff-code"),node=>node.textContent).includes(' +
        JSON.stringify(mergeLicenseNote[languageIndex].trim()) +
        ')',
      'The actual merged license note is present',
    );
    assert.equal(await run('document.querySelectorAll(".file-viewer .del .diff-code").length'), 0);
  }
  const errors = module.exports.expectedErrors(step);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), errors);
  if (errors) {
    const text = await run(query(mergeFailure + ' .toast-msg') + '.textContent');
    assert.ok(text.includes('Not possible to fast-forward'), 'The original diagnostic is retained.');
    assert.ok(text.includes(['nicht nur vorziehen', 'advancing alone'][languageIndex]), 'The refusal has an appropriate localized explanation.');
    assert.ok(!/Serverstand|server history|before pushing|erneuten Push/.test(text), 'A local refusal does not prescribe a remote push workflow.');
  }
  if (chapter.id === 'merge-squash-diverged' && (await run('Boolean(' + query('.commit-details-panel') + ')')))
    await waitFor(
      tutorial,
      query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(squashDivergedDescription[languageIndex]),
    );
  if (['merge-commit', 'merge-squash'].includes(chapter.id) && ['read-diff', 'close-diff'].includes(step.id))
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
};
module.exports.expectedErrors = (step) => {
  const actions = step.prepare?.actions || [];
  return actions.some((action) => action.waitFor === mergeFailure) && !actions.some((action) => action.click === mergeFailureClose) ? 1 : 0;
};
