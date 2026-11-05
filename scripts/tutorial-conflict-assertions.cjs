const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { conflictChoiceContent } = require('../dist-electron/src/shared/tutorial/conflictLessonHelpers.js');
const control = (name) => '[data-tutorial="conflict-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyConflict({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  if (step.prepare.branches.fixture === 'diverged-conflicts')
    return require('./tutorial-conflict-multiple-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  const actions = step.prepare.actions;
  const used = (name) => actions.some((action) => action.click === control(name));
  const continued = used('continue'),
    resolved = used('mark') || used('save-resolved'),
    saved = used('save'),
    aborted = used('abort') && actions.some((action) => action.click === '[data-dialog-action="confirm"]'),
    restored = used('reload') || used('discard-draft');
  const selection = actions.find((action) => /conflict-(take-|all-)/.test(action.click || ''))?.click.match(/conflict-(?:take-)?([^\"]+)/)?.[1];
  const fill = actions.find((action) => action.fill?.selector === control('content'))?.fill.value;
  const choice = selection || (Array.isArray(fill) && fill[0].includes('<<<<<<<') ? 'incomplete' : fill ? 'manual' : 'theirs');
  const chosen = !restored && Boolean(selection || fill);
  const content = conflictChoiceContent(choice);
  const expectedText = Array.isArray(content) ? content[languageIndex] : readme[content.version][languageIndex];
  const opened = actions.some((action) => action.click?.startsWith(control('open')));
  await waitFor(tutorial, query('[data-branch-name="main"][data-branch-head=true]'));
  if (continued || aborted || !opened) {
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(continued ? 6 : 4) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),row=>({hash:row.dataset.commitHash,parents:row.dataset.commitParents,refs:row.querySelector(".commit-refs")?.textContent||""}))',
    );
    assert.equal(rows.length, continued ? 6 : 5);
    assert.equal(rows.find((row) => row.refs.includes('feature/begruessung'))?.hash, hash(5));
    assert.equal(rows.find((row) => row.refs.includes('HEAD -> main'))?.hash, hash(continued ? 6 : 4));
    if (continued) assert.equal(rows.find((row) => row.hash === hash(6)).parents, hash(4) + ' ' + hash(5));
  }
  if (aborted) await waitFor(tutorial, '!' + query(control('section')));
  if (!continued && !aborted) {
    await waitFor(tutorial, query(control('section') + '[data-conflict-files="' + (resolved ? 0 : 1) + '"][data-conflict-operation=true]'));
    if (resolved) {
      await waitFor(tutorial, query('[data-tutorial=staged-files] .staging-file-row[aria-label="README.md"]'));
      await waitFor(tutorial, '!' + query(control('editor')));
    } else if (opened) {
      await waitFor(tutorial, query(control('editor') + '[data-conflict-blocks="' + (chosen ? 0 : 1) + '"][data-conflict-dirty="' + (chosen && !saved) + '"]'));
      const text = await run(query(control('content')) + '.value');
      if (chosen) {
        assert.equal(text, expectedText);
        assert.equal(await run(query(control('mark')) + '.disabled'), choice === 'incomplete');
      } else {
        assert.ok(text.includes('<<<<<<< HEAD'));
        assert.ok(text.includes('>>>>>>> feature/begruessung'));
        assert.equal(await run(query(control('mark')) + '.disabled'), true);
        assert.ok((await run(query(control('ours')) + '.innerText')).includes(readme.latest[languageIndex].split('\n')[2]));
        assert.ok((await run(query(control('theirs')) + '.innerText')).includes(readme.work[languageIndex].split('\n')[2]));
      }
    }
  }
  if (aborted && step.id === 'contents')
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .cm-content .cm-line"),node=>node.textContent).join("\\n") === ' +
        JSON.stringify(readme.latest[languageIndex]),
      'Aborting restores the actual saved main contents',
    );
  if (continued && ['read-diff', 'close-diff'].includes(step.id)) {
    const lines =
      choice === 'both'
        ? [['add', readme.work[languageIndex].split('\n')[2]]]
        : [
            ['del', readme.latest[languageIndex].split('\n')[2]],
            ['add', expectedText.split('\n')[2]],
          ];
    for (const [kind, text] of lines)
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(text) +
          ')',
        'The saved conflict resolution contains the actual ' + kind + ' line',
      );
    if (choice === 'both')
      assert.equal(
        await run(
          'Array.from(document.querySelectorAll(".file-viewer .del .diff-code"),node=>node.textContent).includes(' +
            JSON.stringify(readme.latest[languageIndex].split('\n')[2]) +
            ')',
        ),
        false,
      );
  }
};
