const assert = require('node:assert/strict');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const examples = require('../dist-electron/src/shared/tutorial/amendLessonExamples.js');
const field = (name) => '[data-tutorial="commit-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyAmend({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions,
    files = chapter.id === 'amend-files';
  const replaced = actions.some((action) => action.click === '.staging-commit-btn');
  const amending = !replaced && actions.some((action) => action.click === field('amend'));
  const message = (files ? examples.AMEND_FILE_MESSAGE : examples.AMEND_MESSAGE_ONLY)[languageIndex];
  const description = (files ? examples.AMEND_FILE_DESCRIPTION : examples.AMEND_DESCRIPTION_ONLY)[languageIndex];
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(replaced ? 5 : 4) + '"][data-commit-head=true]'));
  assert.equal(
    await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'),
    4,
    'Amend replaces one commit rather than appending a fifth reachable commit.',
  );
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  assert.ok(rows.find((row) => row.hash === hash(3)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(3)).refs.includes('feature/begruessung'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  if (replaced) {
    assert.equal(
      rows.some((row) => row.hash === hash(4)),
      false,
    );
    const current = rows.find((row) => row.hash === hash(5));
    assert.equal(current.parents, hash(3));
    assert.equal(current.subject, (files ? 'fix' : 'feat') + '(lernen): ' + message);
    assert.ok(current.refs.includes('HEAD -> main'));
  }
  const filled = new Map(
    actions
      .filter((action) => action.fill?.selector?.startsWith('[data-tutorial="commit-'))
      .map((action) => [action.fill.selector, action.fill.value[languageIndex]]),
  );
  for (const [name, fallback] of [
    ['type', amending ? 'feat' : ''],
    ['prefix', ''],
    ['message', amending ? examples.AMEND_ORIGINAL_MESSAGE[languageIndex] : ''],
    ['description', amending ? examples.AMEND_ORIGINAL_DESCRIPTION[languageIndex] : ''],
  ]) {
    if (await run('Boolean(' + query(field(name)) + ')'))
      assert.equal(await run(query(field(name)) + '.value'), replaced ? '' : (filled.get(field(name)) ?? fallback));
  }
  if (await run('Boolean(' + query(field('amend') + ' input') + ')')) assert.equal(await run(query(field('amend') + ' input') + '.checked'), amending);
  for (const group of ['staged', 'unstaged', 'untracked']) {
    const selector = '[data-tutorial="' + group + '-files"] .staging-file-row';
    const expected = group === 'staged' && files && !replaced ? ['README.md'] : [];
    await waitFor(
      tutorial,
      'JSON.stringify(Array.from(document.querySelectorAll(' +
        JSON.stringify(selector) +
        '),node=>node.getAttribute("aria-label")).sort()) === ' +
        JSON.stringify(JSON.stringify(expected)),
    );
  }
  if (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(5) + '"]') + ')')) {
    await waitFor(tutorial, query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(description));
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-commit-file]"),node=>node.dataset.commitFile).sort()'), [
      'README.md',
      'src/app.ts',
    ]);
  }
  if (['staged-diff', 'close-staged', 'result-diff', 'close-result'].includes(step.id)) {
    const staged = ['staged-diff', 'close-staged'].includes(step.id);
    const before = (staged ? readme.latest : readme.description)[languageIndex].split('\n')[2];
    const after = (files ? examples.AMEND_CONTENT : readme.latest)[languageIndex].split('\n')[2];
    for (const [kind, text] of [
      ['del', before],
      ['add', after],
    ])
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(text) +
          ')',
      );
  }
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
