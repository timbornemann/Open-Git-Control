const assert = require('node:assert/strict');
const examples = require('../src/tutorial/fixtures/merge-conflicts.json');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const control = (name) => '[data-tutorial="conflict-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyMultiple({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions;
  const used = (name) => actions.some((action) => action.click === control(name));
  const deletion = chapter.id === 'conflicts-deletion';
  const continued = used('continue'),
    resolved = used('mark') || used('delete'),
    readmeResolved = used('save-resolved');
  const opened = actions.some((action) => action.click?.startsWith(control('open')));
  const previous = actions.filter((action) => action.click === control('previous')).length;
  const next = actions.filter((action) => action.click === control('next')).length;
  const version = actions.filter((action) => action.waitValue?.selector === control('content')).at(-1)?.waitValue.value.version;
  await waitFor(tutorial, query('[data-branch-name="main"][data-branch-head=true]'));
  if (continued || !opened || resolved) {
    const head = continued ? 6 : 4;
    await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
    const rows = await run(
      'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),row=>({hash:row.dataset.commitHash,parents:row.dataset.commitParents,refs:row.querySelector(".commit-refs")?.textContent||""}))',
    );
    assert.equal(rows.length, continued ? 6 : 5);
    assert.equal(rows.find((row) => row.refs.includes('feature/begruessung'))?.hash, hash(5));
    if (continued) assert.equal(rows.find((row) => row.hash === hash(6)).parents, hash(4) + ' ' + hash(5));
  }
  if (!continued) {
    const count = resolved ? 0 : readmeResolved ? 1 : 2;
    await waitFor(tutorial, query(control('section') + '[data-conflict-files="' + count + '"][data-conflict-operation=true]'));
    if (resolved) {
      await waitFor(tutorial, '!' + query(control('editor')));
      await waitFor(tutorial, query('[data-tutorial=staged-files] .staging-file-row[aria-label="README.md"]'));
      const staged = await run(
        'Array.from(document.querySelectorAll("[data-tutorial=staged-files] .staging-file-row"),node=>node.getAttribute("aria-label")).sort()',
      );
      assert.deepEqual(staged, deletion ? ['LICENSE', 'README.md'] : ['README.md']);
    } else if (opened) {
      const path = readmeResolved || (previous >= 3 && next < 2) ? 'LICENSE' : 'README.md';
      const blocks = path === 'LICENSE' || version === 'mixed' ? 0 : version ? 1 : 2;
      const dirty = path === 'README.md' && (version === 'mixed' || Boolean(version && !used('save')));
      await waitFor(
        tutorial,
        query(
          control('editor') + '[data-conflict-path=' + JSON.stringify(path) + '][data-conflict-blocks="' + blocks + '"][data-conflict-dirty="' + dirty + '"]',
        ),
      );
      const actual = await run(query(control('content')) + '.value');
      if (path === 'LICENSE') {
        assert.equal(actual, examples['license-current'][languageIndex]);
        assert.equal(await run(query(control('next')) + '.disabled'), readmeResolved);
      } else if (version) assert.equal(actual, examples[version][languageIndex]);
      else {
        assert.equal(actual.split('<<<<<<< HEAD').length - 1, 2);
        for (const side of ['current', 'incoming']) for (const line of [2, 9]) assert.ok(actual.includes(examples[side][languageIndex].split('\n')[line]));
      }
      const block = !blocks ? 0 : !version && next === 1 && previous === 0 ? 2 : 1;
      await waitFor(
        tutorial,
        query(control('position') + '[data-conflict-file-index="' + (path === 'LICENSE' ? 1 : 2) + '"][data-conflict-block-index="' + block + '"]'),
      );
      assert.equal(await run(query(control('mark')) + '.disabled'), blocks > 0);
    }
  }
  if (await run('Boolean(' + query('[data-dialog-action=confirm]') + ')'))
    assert.deepEqual(await run('Array.from(document.querySelectorAll(".dialog-context-list dd"),node=>node.textContent)'), ['README.md', 'LICENSE']);
  if (!deletion && continued && ['read-diff', 'text'].includes(step.id))
    for (const [kind, version] of [
      ['del', 'current'],
      ['add', 'incoming'],
    ])
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(examples[version][languageIndex].split('\n')[2]) +
          ')',
      );
  if (!deletion && continued && step.id === 'contents')
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .cm-content .cm-line"),node=>node.textContent).join("\\n") === ' +
        JSON.stringify(examples.mixed[languageIndex]),
    );
  if (!deletion && continued && ['greeting-origin', 'closing-origin', 'file-history'].includes(step.id)) {
    await waitFor(tutorial, query('.file-viewer [data-blame-line="3"][data-blame-hash="' + hash(5) + '"]'));
    await waitFor(tutorial, query('.file-viewer [data-blame-line="10"][data-blame-hash="' + hash(4) + '"]'));
  }
  if (!deletion && continued && ['source-history', 'current-history', 'close-file'].includes(step.id)) {
    const selector = '.file-viewer[data-tab="history"] [data-history-hash]';
    await waitFor(tutorial, 'document.querySelectorAll(' + JSON.stringify(selector) + ').length === 5');
    assert.deepEqual(
      await run('Array.from(document.querySelectorAll(' + JSON.stringify(selector) + '),node=>node.dataset.historyHash)'),
      [5, 4, 3, 2, 1].map(hash),
    );
  }
  if (continued && (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(6) + '"]') + ')')))
    assert.deepEqual(
      await run('Array.from(document.querySelectorAll("[data-commit-file]"),node=>node.dataset.commitFile).sort()'),
      deletion ? ['LICENSE', 'README.md'] : ['README.md'],
    );
  if (deletion && ['read-staged', 'close-staged', 'read-diff', 'close-file'].includes(step.id)) {
    for (const text of ['MIT License', 'Copyright (c) 2026 OGC-Lernprojekt', examples['license-current'][languageIndex].trimEnd().split('\n').at(-1)])
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".file-viewer .del .diff-code"),node=>node.textContent).includes(' + JSON.stringify(text) + ')',
        'Actual deleted license contents',
      );
    assert.equal(await run('document.querySelectorAll(".file-viewer .add .diff-code").length'), 0);
  }
  if (deletion && step.id === 'absence') {
    await waitFor(tutorial, query('[data-tutorial="open-files"][aria-pressed=true]'));
    await waitFor(tutorial, query('[data-file-path="README.md"]'));
    assert.equal(await run('Boolean(' + query('[data-file-path="LICENSE"]') + ')'), false);
  }
};
