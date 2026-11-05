const assert = require('node:assert/strict');
const practice = '[data-branch-name="feature/lernen"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
const readme = require('../src/tutorial/fixtures/history-readme.json');
module.exports = async function verifyBranchStep({ chapter, step, run, waitFor, tutorial, languageIndex = 0 }) {
  if (chapter.id.startsWith('branches-park')) return require('./tutorial-branch-park-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  if (chapter.id.startsWith('branches-carry'))
    return require('./tutorial-branch-change-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  if (chapter.id.startsWith('branches-cleanup')) return require('./tutorial-cleanup-assertions.cjs')({ chapter, step, run, waitFor, tutorial, languageIndex });
  if (chapter.id === 'branches-unmerged') {
    const removed = !step.prepare.branches.heads.some((entry) => entry.name === 'feature/offene-arbeit');
    await waitFor(tutorial, query('[data-tutorial=branches] [data-branch-name=main][data-branch-head=true]'));
    const names = await run('Array.from(document.querySelectorAll("[data-tutorial=branches] .branch-row-local"),node=>node.dataset.branchName).sort()');
    assert.deepEqual(names, step.prepare.branches.heads.map((entry) => entry.name).sort());
    assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), removed ? 3 : 4);
    const refs = await run('Array.from(document.querySelectorAll(".commit-refs"),node=>node.textContent).join(" ")');
    assert.ok(refs.includes('HEAD -> main') && refs.includes('origin/main'));
    if (step.prepare.ready.includes('Force-delete'))
      assert.ok(await run(query('[role=dialog][aria-label=' + JSON.stringify(languageIndex ? 'Force-delete branch?' : 'Branch force-löschen?') + ']')));
    return;
  }
  if (chapter.id === 'branches-manage') {
    const current = step.prepare.branches.current;
    await waitFor(tutorial, query('[data-tutorial=branches] [data-branch-name=' + JSON.stringify(current) + '][data-branch-head=true]'));
    if (step.id !== 'confirm-rename') {
      const actual = await run('Array.from(document.querySelectorAll("[data-tutorial=branches] .branch-row-local"),node=>node.dataset.branchName).sort()');
      assert.deepEqual(actual, step.prepare.branches.heads.map((entry) => entry.name).sort());
    }
    if (step.id === 'invalid-explained' || step.id === 'cancel-rename') {
      assert.ok(await run('document.querySelector("[data-dialog-action=confirm]").disabled'));
      assert.equal(await run('document.querySelector("[data-dialog-action=cancel]").disabled'), false);
    }
    if (step.id === 'current-explained') assert.ok(await run('!document.querySelector("[data-branch-action=delete]")'));
    if (step.id === 'primary-protection') assert.ok(await run('document.querySelector("[data-branch-action=delete]").disabled'));
    assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4);
    return;
  }
  if (chapter.id === 'branches-switch') {
    const featureSteps = [
      'current-feature',
      'feature-reference',
      'retained-main',
      'older-tree',
      'open-older',
      'older-text',
      'close-older',
      'keyboard-main',
      'keyboard-state',
      'return-main',
    ];
    const branch = featureSteps.includes(step.id) ? 'feature/begruessung' : 'main';
    await waitFor(tutorial, query('[data-branch-name=' + JSON.stringify(branch) + '][data-branch-head=true]'));
    const version = step.id === 'older-text' ? 'description' : ['main-text', 'restored-text'].includes(step.id) ? 'latest' : undefined;
    if (version)
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".file-viewer .cm-content .cm-line"),line=>line.textContent).join("\\n") === ' +
          JSON.stringify(readme[version][languageIndex]),
        'The working README follows the actual checked-out example branch.',
      );
    assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4);
    return;
  }
  if (chapter.id !== 'branches') return;
  if (step.id === 'search-result') {
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-branch-name]"),node=>node.dataset.branchName)'), ['feature/begruessung']);
    assert.ok(await run('Array.from(document.querySelectorAll(".commit-refs"),node=>node.textContent).join(" ").includes("HEAD -> main")'));
  }
  if (step.id === 'empty') assert.equal(await run('document.querySelectorAll("[data-branch-name]").length'), 0);
  if (step.id === 'correct-name') {
    assert.ok(await run('Boolean(document.querySelector("[data-tutorial=branch-name]"))'));
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify(practice) + ').length'), 0);
  }
  if (step.id === 'local-created' || step.id === 'new-head') await waitFor(tutorial, query(practice + '[data-branch-head=true]'));
  if (step.id === 'same-commit') {
    const names = await run('Array.from(document.querySelectorAll(".commit-row .commit-refs"),node=>node.textContent)');
    assert.equal(names.filter((text) => text.includes('feature/lernen')).length, 1);
    assert.ok(names.some((text) => text.includes('feature/lernen') && text.includes('main')));
    assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4);
  }
  if (step.id === 'kept' || step.id === 'finish') {
    await waitFor(tutorial, query('[data-branch-name=main][data-branch-head=true]') + ' && ' + query(practice + '[data-branch-head=false]'));
    assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4);
  }
};
