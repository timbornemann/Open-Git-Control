const assert = require('node:assert/strict');
const examples = require('../src/tutorial/fixtures/history-readme.json');
const hash = (number) => (Math.imul(number, 0x9e3779b1) >>> 0).toString(16).padStart(8, '0') + number.toString(16).padStart(32, '0');
module.exports = async function verifyHistoryStep({ chapter, step, run, waitFor, tutorial, languageIndex }) {
  const version =
    chapter.id === 'history' && step.id === 'read-only'
      ? 'latest'
      : (chapter.id === 'history-files' && step.id === 'old-source') || (chapter.id === 'history-blame' && step.id === 'close-origin')
        ? 'initial'
        : chapter.id === 'history-files' && step.id === 'close-old'
          ? 'app'
          : chapter.id === 'history-sources' && step.id === 'working-source'
            ? 'work'
            : chapter.id === 'history-sources' && step.id === 'index-blame'
              ? 'index'
              : null;
  if (version)
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer .cm-content .cm-line"),line=>line.textContent).join("\\n") === ' +
        JSON.stringify(examples[version][languageIndex]),
      'The historical editor contains the actual localized saved revision.',
    );
  if (chapter.id === 'history' && step.id === 'removed')
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer-diff .del .diff-code"),node=>node.textContent).join("\\n").includes(' +
        JSON.stringify(languageIndex ? 'Project overview' : 'Projektübersicht') +
        ')',
      'The commit diff removes the actual parent content.',
    );
  if (chapter.id === 'history' && step.id === 'added')
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".file-viewer-diff .add .diff-code"),node=>node.textContent).join("\\n").includes(' +
        JSON.stringify(languageIndex ? 'Greeting: Hello world!' : 'Begrüßung: Hallo Welt!') +
        ')',
      'The commit diff adds the actual selected revision.',
    );
  if (chapter.id === 'history' && step.id === 'changed-files')
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-commit-file]"),node=>node.dataset.commitFile).sort()'), [
      'README.md',
      'src/app.ts',
    ]);
  if (chapter.id === 'history' && step.id === 'root-files')
    assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-commit-file]"),node=>node.dataset.fileStatus)'), ['A', 'A']);
  const expected =
    chapter.id === 'history-files'
      ? { entries: [4, 3, 2, 1], 'history-scope': [1], omitted: [4, 2], 'close-license': [1] }[step.id]
      : chapter.id === 'history-blame' && step.id === 'close-file'
        ? [4, 3, 2, 1]
        : null;
  if (expected)
    assert.deepEqual(await run('Array.from(document.querySelectorAll(".file-viewer [data-history-hash]"),node=>node.dataset.historyHash)'), expected.map(hash));
  if (chapter.id === 'history-files' && step.id === 'future-history') {
    assert.deepEqual(await run('Array.from(document.querySelectorAll(".commit-file-details [data-history-hash]"),node=>node.dataset.historyHash)'), [
      hash(4),
      hash(3),
      hash(2),
      hash(1),
    ]);
    assert.equal(await run('document.querySelector(".commit-file-details [aria-current=true]")?.dataset.historyHash'), hash(1));
  }
  if (chapter.id === 'history-blame' && step.id === 'new-lines')
    assert.deepEqual(await run('Array.from(document.querySelectorAll(".file-viewer [data-blame-hash]"),node=>node.dataset.blameHash)'), [
      hash(1),
      hash(2),
      hash(4),
      hash(4),
    ]);
  if (chapter.id === 'history-blame' && step.id === 'uncommitted') {
    assert.equal(await run('document.querySelector(".file-viewer [data-blame-line=\\"3\\"] button").disabled'), true);
    assert.equal(
      await run('document.querySelector(".file-viewer [data-blame-line=\\"3\\"] button").textContent'),
      languageIndex ? 'Not committed yet' : 'Noch nicht committet',
    );
  }
  if (chapter.id === 'history-sources') {
    const version = { 'working-content': 'work', 'index-content': 'index', detailed: 'latest' }[step.id];
    if (version) {
      assert.equal(
        await run('document.querySelector(".file-viewer [data-blame-line=\\"3\\"] .file-blame-line__content").textContent'),
        examples[version][languageIndex].split('\n')[2],
      );
      assert.equal(
        await run('document.querySelector(".file-viewer [data-blame-line=\\"3\\"]").dataset.blameHash'),
        version === 'latest' ? hash(4) : '0'.repeat(40),
      );
    }
    if (step.id === 'author') {
      assert.equal(await run('document.querySelector(".commit-file-details [data-blame-line=\\"1\\"] .file-blame-line__author").textContent'), 'Sam Beispiel');
      assert.equal(await run('document.querySelector(".commit-file-details [data-blame-line=\\"3\\"] .file-blame-line__author").textContent'), 'Alex Beispiel');
    }
  }
  if (chapter.id === 'history-search') {
    if (step.id === 'matches') assert.equal(await run('document.querySelector(".commit-search-meta__count").getBoundingClientRect().width > 0'), true);
    const matches = { matches: [4, 2], empty: [], 'message-result': [3], 'hash-result': [3], 'tag-result': [2] }[step.id];
    if (matches)
      assert.deepEqual(
        await run('Array.from(document.querySelectorAll(".commit-row[data-search-match=true]"),node=>node.dataset.commitHash)'),
        matches.map(hash),
      );
    if (step.id === 'empty') {
      assert.equal(await run('document.querySelector("[data-tutorial=commit-search-next]").disabled'), true);
      assert.equal(await run('document.querySelector("[data-tutorial=commit-search-previous]").disabled'), true);
      assert.equal(await run('document.querySelectorAll(".commit-row[data-commit-hash]").length'), 4);
    }
    if (step.id === 'open-inspector') {
      assert.equal(await run('document.querySelectorAll(".commit-row[data-search-match=true]").length'), 0);
      assert.equal(await run('document.querySelector("[data-tutorial=commit-search-results]")'), null);
    }
  }
  if (chapter.id === 'history-forensic-string') {
    const matches = { results: [4, 3], 'no-matches': [], 'heading-result': [1], 'same-count': [2] }[step.id];
    if (matches)
      assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-forensic-hash]"),node=>node.dataset.forensicHash)'), matches.map(hash));
    if (step.id === 'removed-text')
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".file-viewer-diff .del .diff-code"),node=>node.textContent).join("\\n").includes(' +
          JSON.stringify(languageIndex ? 'Project overview' : 'Projektübersicht') +
          ')',
        'The forensic match removes the actual searched content.',
      );
    if (step.id === 'close-source')
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".file-viewer-diff .add .diff-code"),node=>node.textContent).join("\\n").includes(\'export const greeting = "Hallo";\')',
        'The selected forensic commit adds the actual source file.',
      );
  }
  if (chapter.id === 'history-forensic-lines') {
    const matches = { 'heading-result': [1], 'earlier-versions': [4, 3, 2], 'reversed-start': [4, 3, 2, 1], fraction: [4, 2], return: [4, 2] }[step.id];
    if (matches)
      assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-forensic-hash]"),node=>node.dataset.forensicHash)'), matches.map(hash));
    if (step.id === 'historical-content')
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(".file-viewer-diff .add .diff-code"),node=>node.textContent).join("\\n").includes(' +
          JSON.stringify(languageIndex ? 'Project overview' : 'Projektübersicht') +
          ')',
        'The historical range leads to the actual earlier description.',
      );
  }
  if (chapter.id === 'history-forensic-regex') {
    const matches = {
      'changed-lines': [4, 2],
      'count-difference': [4, 2],
      'anchor-result': [4, 2],
      'removed-result': [4, 2],
      empty: [],
      optional: [4, 2],
      'character-class': [4],
    }[step.id];
    if (matches)
      assert.deepEqual(await run('Array.from(document.querySelectorAll("[data-forensic-hash]"),node=>node.dataset.forensicHash)'), matches.map(hash));
    if (step.id === 'before' || step.id === 'after') {
      const kind = step.id === 'before' ? 'del' : 'add',
        text = step.id === 'before' ? 'export const greeting = "Hallo";' : 'export const greeting = "Hallo Welt!";';
      await waitFor(
        tutorial,
        'Array.from(document.querySelectorAll(' +
          JSON.stringify('.file-viewer-diff .' + kind + ' .diff-code') +
          '),node=>node.textContent).join("\\n").includes(' +
          JSON.stringify(text) +
          ')',
        'The actual regex match has the expected removed/added source line.',
      );
    }
  }
};
