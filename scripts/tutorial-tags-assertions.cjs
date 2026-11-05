const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const { tagConfirm, tagControl: c, tagMessage } = require('../dist-electron/src/shared/tutorial/tagLessonHelpers.js');
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyTags({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions;
  const created = actions.some((action) => action.click === tagConfirm);
  const deleted = created && actions.filter((action) => action.click === tagConfirm).length === 2;
  const filter = actions.filter((action) => action.fill?.selector === c('filter')).at(-1)?.fill.value[languageIndex] || '';
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(4) + '"][data-commit-head=true]'));
  assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4, 'Tagging creates no additional commit.');
  const refs = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  assert.ok(refs.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  assert.equal(refs.find((row) => row.hash === hash(4)).refs.includes('tag: v1.1.0'), created && !deleted);
  const expanded = await run('Boolean(' + query('[data-tutorial=tags] .repo-card-toggle[aria-expanded=true]') + ')');
  const expected = (created && !deleted ? ['v1.0.0', 'v1.1.0'] : ['v1.0.0']).filter((name) => name.includes(filter.toLowerCase()));
  assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-tag-name]"),node=>node.dataset.tagName).sort()'), expanded ? expected : []);
  assert.equal(await run('document.querySelectorAll(".tag-card--conflict").length'), 0);
  if (await run('Boolean(' + query('[data-dialog-field=name] input') + ')')) {
    const name = actions.filter((action) => action.fill?.selector === '[data-dialog-field="name"] input').at(-1)?.fill.value[languageIndex] || '';
    assert.equal(await run(query('[data-dialog-field=name] input') + '.value'), name);
    const annotated = actions.some((action) => action.fill?.selector === '[data-dialog-field="message"] input');
    assert.equal(await run(query('[data-dialog-field=message] input') + '.value'), annotated ? tagMessage[languageIndex] : '');
    assert.equal(await run(query('[role=dialog] .dialog-context-list dd') + '.textContent'), 'main');
  } else if (await run('Boolean(' + query('[data-dialog-action=confirm]') + ')')) {
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[role=dialog] .dialog-context-list dd"),node=>node.textContent)'), ['v1.1.0']);
    assert.equal(await run('Boolean(' + query('.commit-details-panel') + ')'), false, 'Opening the delete button does not also select its containing tag.');
  }
  const selectedOld = actions.some((action) => action.click?.includes('[data-tag-name="v1.0.0"]') && !action.click.includes('tag-delete'));
  const selectedNew = actions.some((action) => action.click?.includes('[data-tag-name="v1.1.0"]') && !action.click.includes('tag-delete'));
  if (selectedOld || selectedNew) await waitFor(tutorial, query('.commit-details-panel[data-commit-hash="' + hash(selectedOld ? 2 : 4) + '"]'));
  if (chapter.id === 'tags-navigation' && ['contents', 'close-file'].includes(step.id))
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .cm-content .cm-line"),node=>node.textContent).join("\\n") === ' +
        JSON.stringify(readme.app[languageIndex]),
    );
  if (['tags-lightweight', 'tags-annotated'].includes(chapter.id) && ['diff', 'close-file'].includes(step.id))
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .add .diff-code"),node=>node.textContent).includes(' +
        JSON.stringify(readme.latest[languageIndex].split('\n')[2]) +
        ')',
    );
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(
      await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'),
      0,
      'Tag operations preserve the clean index and working tree.',
    );
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
