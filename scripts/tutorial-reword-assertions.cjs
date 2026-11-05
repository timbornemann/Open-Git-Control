const assert = require('node:assert/strict');
const { practiceCommitHash: hash } = require('../dist-electron/src/shared/tutorial/exampleGitIds.js');
const examples = require('../dist-electron/src/shared/tutorial/rewordLessonExamples.js');
const readme = require('../src/tutorial/fixtures/history-readme.json');
const field = (name) => '[data-tutorial="reword-' + name + '"]';
const query = (selector) => 'document.querySelector(' + JSON.stringify(selector) + ')';
module.exports = async function verifyReword({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const actions = step.prepare.actions,
    guard = chapter.id === 'reword-protected' ? 'published' : chapter.id === 'reword-referenced' ? 'referenced' : null;
  const replaced = actions.some((action) => action.click?.includes('[data-dialog-action="confirm"]') && action.click?.includes('reword-title'));
  const head = replaced ? 6 : 4;
  await waitFor(tutorial, query('.commit-row[data-commit-hash="' + hash(head) + '"][data-commit-head=true]'));
  const rows = await run(
    'Array.from(document.querySelectorAll(".commit-row[data-commit-hash]"),node=>({hash:node.dataset.commitHash,parents:node.dataset.commitParents,subject:node.querySelector(".commit-subject")?.textContent,refs:node.querySelector(".commit-refs")?.textContent||""}))',
  );
  assert.equal(rows.length, 4, 'Message editing keeps four reachable commits.');
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('origin/main'));
  assert.ok(rows.find((row) => row.hash === hash(2)).refs.includes('tag: v1.0.0'));
  assert.ok(rows.find((row) => row.hash === hash(1)).refs.includes('feature/begruessung'));
  if (guard === 'referenced') assert.ok(rows.find((row) => row.hash === hash(4)).refs.includes('tag: vor-nachrichtenkorrektur'));
  if (replaced) {
    assert.deepEqual(
      rows.map((row) => row.hash),
      [6, 5, 2, 1].map(hash),
    );
    assert.equal(rows[0].parents, hash(5));
    assert.equal(rows[1].parents, hash(2));
    assert.equal(rows[1].subject, examples.REWORD_TITLE[languageIndex]);
    assert.equal(rows[0].subject, languageIndex === 0 ? 'feat: Begrüßung ergänzen' : 'feat: update greeting');
  }
  if (await run('Boolean(' + query(field('title')) + ')')) {
    const modal = '.dialog-modal:has(' + field('title') + ')';
    if (guard) await waitFor(tutorial, query(field('block') + '[data-block-reason="' + guard + '"]'));
    else await waitFor(tutorial, query(field('following')) + '?.textContent === "1"');
    const filled = new Map(
      actions
        .filter((action) => action.fill?.selector.startsWith('[data-tutorial="reword-'))
        .map((action) => [action.fill.selector, action.fill.value[languageIndex]]),
    );
    const originals =
      guard === 'published'
        ? [
            languageIndex === 0 ? 'feat: App anlegen' : 'feat: add app',
            languageIndex === 0 ? 'Anwendung und Paketkonfiguration ergänzen.' : 'Add the application and package configuration.',
          ]
        : [examples.REWORD_ORIGINAL_TITLE[languageIndex], examples.REWORD_ORIGINAL_DESCRIPTION[languageIndex]];
    for (const [index, name] of ['title', 'description'].entries()) {
      assert.equal(await run(query(field(name)) + '.value'), filled.get(field(name)) ?? originals[index]);
      assert.equal(await run(query(field(name)) + '.disabled'), Boolean(guard));
    }
    assert.equal(await run(query(field('commit')) + '.textContent'), hash(guard === 'published' ? 2 : 3).slice(0, 12));
    assert.equal(await run(query(modal + ' [data-dialog-action="confirm"]') + '.disabled'), Boolean(guard) || !filled.size);
    if (guard) assert.equal(await run(query(field('following')) + '.textContent'), '—');
    else assert.equal(await run(query(field('branch')) + '.textContent'), 'main');
  }
  if (replaced && (await run('Boolean(' + query('.commit-details-panel[data-commit-hash="' + hash(5) + '"]') + ')')))
    await waitFor(
      tutorial,
      query('.commit-details-description > div:last-child') + '?.textContent === ' + JSON.stringify(examples.REWORD_DESCRIPTION[languageIndex]),
    );
  if (['diff', 'close-file'].includes(step.id)) {
    for (const [kind, version] of [
      ['del', 'app'],
      ['add', 'description'],
    ]) {
      const expected = readme[version][languageIndex].split('\n')[2];
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer .' + kind + ' .diff-code') +
          '),node=>node.textContent).includes(' +
          JSON.stringify(expected) +
          ')',
      );
    }
  }
  for (const group of ['staged', 'unstaged', 'untracked'])
    assert.equal(await run('document.querySelectorAll(' + JSON.stringify('[data-tutorial="' + group + '-files"] .staging-file-row') + ').length'), 0);
  assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
};
