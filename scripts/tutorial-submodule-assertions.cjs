const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const examples = require('../dist-electron/src/shared/tutorial/submoduleLessonExamples.js');
module.exports = async function verifySubmodules({ step, run, waitFor, tutorial, languageIndex }) {
  const updated = step.prepare.actions.some((action) => action.click === '[data-tutorial="submodule-update"]');
  const state = step.prepare.submodules;
  const expectedState = updated ? 'clean' : state === 'uninitialized' ? 'uninitialized' : state === 'different-commit' ? 'dirty' : 'clean';
  const different = expectedState === 'dirty';
  await waitFor(tutorial, 'document.querySelector(' + JSON.stringify('.commit-row[data-commit-hash="' + hash(4) + '"][data-commit-head=true]') + ')');
  assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4, 'Submodule actions create no parent commit.');
  const row = '[data-submodule-path="packages/design"]';
  if (await run('Boolean(document.querySelector(' + JSON.stringify(row) + '))')) {
    assert.equal(await run('document.querySelector(' + JSON.stringify(row) + ').dataset.submoduleState'), expectedState);
    assert.equal(
      await run('document.querySelector(' + JSON.stringify(row + ' [data-submodule-field=commit]') + ').textContent'),
      different ? examples.SUBMODULE_OTHER : examples.SUBMODULE_RECORDED,
    );
    const label = {
      clean: ['Zielcommit ausgecheckt', 'Recorded commit checked out'],
      uninitialized: ['Nicht initialisiert', 'Not initialized'],
      dirty: ['Anderer Commit ausgecheckt', 'Different commit checked out'],
    }[expectedState][languageIndex];
    assert.ok((await run('document.querySelector(' + JSON.stringify(row + ' [data-submodule-field=state]') + ').textContent')).startsWith(label));
    assert.equal(
      await run('document.querySelector("[data-tutorial=submodule-open]").getAttribute("aria-label")'),
      ['Submodulordner im Dateimanager öffnen', 'Open submodule folder in file manager'][languageIndex],
    );
  }
  const viewer = '.file-viewer[data-path=".gitmodules"][data-tab="text"]';
  if (await run('Boolean(document.querySelector(' + JSON.stringify(viewer) + '))')) {
    const expected = examples.submoduleConfiguration(state === 'changed-url' ? examples.SUBMODULE_NEW_URL : examples.SUBMODULE_ORIGINAL_URL).trimEnd();
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(' +
        JSON.stringify(viewer + ' .cm-content .cm-line') +
        '),node=>node.textContent).join("\\n").trimEnd() === ' +
        JSON.stringify(expected),
    );
  }
  assert.equal(
    await run('document.querySelectorAll("[data-tutorial=staged-files] .staging-file-row").length'),
    0,
    'Submodule maintenance preserves the parent index.',
  );
  assert.equal(
    await run('document.querySelectorAll("[data-tutorial=untracked-files] .staging-file-row").length'),
    0,
    'Child files do not become untracked parent files.',
  );
  assert.equal(await run('document.querySelectorAll("[data-tutorial=unstaged-files] .staging-file-row").length'), different ? 1 : 0);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
