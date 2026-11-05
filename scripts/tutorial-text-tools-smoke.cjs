const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
const examples = { ...require('../src/tutorial/fixtures/editor-tools.json'), ...require('../src/tutorial/fixtures/text-tools.json') };
const structuredExamples = require('../src/tutorial/fixtures/structured-files.json');
const markupExamples = require('../src/tutorial/fixtures/markup-files.json');
const treeExamples = require('../src/tutorial/fixtures/tree-files.json');
const searchExamples = require('../src/tutorial/fixtures/search-files.json');
const historyExamples = require('../src/tutorial/fixtures/history-readme.json');
module.exports = async function verifyTextTools({
  getTutorial,
  launch,
  close,
  click,
  next,
  stepReady,
  waitFor,
  pressKey,
  parent,
  languageIndex = 0,
  family,
  chapterIds,
}) {
  const branchFamily = family === 'branches' || family.startsWith('branches-');
  const replayFamily = family === 'cherry-pick' || family.startsWith('cherry-pick-') || family === 'revert' || family === 'merge-revert';
  const resetFamily = family.startsWith('reset-');
  const rebaseFamily = family.startsWith('rebase-');
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  const ruleOf = (rule, kind, selector) =>
    rule?.kind === 'all' || rule?.kind === 'any'
      ? rule.conditions.map((entry) => ruleOf(entry, kind, selector)).find(Boolean)
      : rule?.kind === kind && (!selector || rule.selector === selector)
        ? rule
        : null;
  function key(keyCode, modifiers = [], character) {
    getTutorial().sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (character) getTutorial().sendInputEvent({ type: 'char', keyCode: character, modifiers });
    getTutorial().sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }
  async function fill(selector, value) {
    if (selector.includes('file-editor')) {
      await waitFor(getTutorial(), 'document.querySelector(".cm-content[contenteditable=true]")');
      await run('document.querySelector(".cm-content").focus()');
      key('A', ['control']);
      await getTutorial().insertText(value);
    } else
      await run(
        `(()=>{const field=document.querySelector(${JSON.stringify(selector)});const prototype=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:field instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`,
      );
  }
  async function select(from, to) {
    await waitFor(getTutorial(), 'document.querySelector(".cm-content[contenteditable=true]")');
    await run('document.querySelector(".cm-content").focus()');
    key('Home', ['control']);
    for (let index = 0; index < from; index++) key('Right');
    for (let index = from; index < to; index++) key('Right', ['shift']);
    await waitFor(getTutorial(), `document.querySelector('.file-viewer[data-selection-from="${from}"][data-selection-to="${to}"]')`);
  }
  async function markupPreview() {
    for (let attempt = 0; attempt < 100; attempt++) {
      const frame = getTutorial().mainFrame.frames.find((entry) => entry.url.startsWith('ogc-html-preview:'));
      if (frame) {
        const result = await frame.executeJavaScript(
          `({heading:document.querySelector('h1')?.textContent, paragraph:document.querySelector('p')?.textContent, pre:document.querySelector('pre')?.textContent, host:typeof window.tutorialHost, api:typeof window.electronAPI})`,
        );
        if (result.heading === 'OGC') {
          assert.equal(result.paragraph, 'Hello world & team.');
          assert.equal(result.pre, 'line 1\n  line 2');
          assert.equal(result.host, 'undefined');
          assert.equal(result.api, 'undefined');
          return;
        }
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 50);
      });
    }
    throw new Error('The minified HTML did not render its preserved text in the isolated preview.');
  }
  for (const chapter of TUTORIAL_CHAPTERS.filter((entry) => (chapterIds ? chapterIds.includes(entry.id) : entry.id.startsWith(family + '-')))) {
    await launch({ chapterId: chapter.id });
    for (const step of chapter.steps) {
      console.log('Text tool lesson:', chapter.id, step.id);
      await stepReady(step.id);
      if (family === 'history' || family.startsWith('history-'))
        await require('./tutorial-history-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (branchFamily) await require('./tutorial-branches-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family.startsWith('stash-'))
        await require('./tutorial-stash-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family.startsWith('merge-'))
        await require('./tutorial-merge-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family.startsWith('tags-')) await require('./tutorial-tags-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family.startsWith('submodules-'))
        await require('./tutorial-submodule-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family.startsWith('amend-'))
        await require('./tutorial-amend-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (rebaseFamily) await require('./tutorial-rebase-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family === 'reword' || family.startsWith('reword-'))
        await require('./tutorial-reword-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family === 'cherry-pick' || family === 'revert')
        await require('./tutorial-replay-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family.startsWith('cherry-pick-'))
        await require('./tutorial-cherry-conflict-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (resetFamily) await require('./tutorial-reset-mode-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family === 'recovery' || family.startsWith('recovery-'))
        await require('./tutorial-recovery-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (family === 'conflicts' || family.startsWith('conflicts-'))
        await require('./tutorial-conflict-assertions.cjs')({ chapter, step, run, waitFor, tutorial: getTutorial(), languageIndex });
      if (chapter.id === 'json-schema' && step.id === 'contract') await require('./tutorial-schema-layout.cjs')(parent, getTutorial(), waitFor);
      if ((family === 'markup' || family.startsWith('search-')) && step.id === 'read-diff')
        await waitFor(
          getTutorial(),
          'document.querySelector(".file-viewer-diff .add .diff-code") && document.querySelector(".file-viewer-diff .del .diff-code")',
          'Real added and removed markup lines',
        );
      if (chapter.id === 'markup-html' && step.id === 'preview-result') await markupPreview();
      if (
        family.startsWith('search-') &&
        ((chapter.id === 'search-names' && step.id === 'contents') || (chapter.id === 'search-content' && step.id === 'saved-source') || step.id === 'read')
      ) {
        const version = chapter.id === 'search-one' ? 'guide-one' : chapter.id === 'search-all' ? 'guide-all' : 'guide';
        await waitFor(
          getTutorial(),
          'Array.from(document.querySelectorAll(".cm-content .cm-line"),line=>line.textContent).join("\\n") === ' +
            JSON.stringify(searchExamples[version][languageIndex]),
          'The actual saved search result uses the lesson language.',
        );
      }
      if (chapter.id === 'tree-copy' && step.id === 'copy-purpose') {
        await run('document.querySelector("[data-tree-action=copy]").focus()');
        key('End');
        await waitFor(
          getTutorial(),
          `(()=>{const item=document.activeElement,menu=item?.closest('[role=menu]');if(item?.dataset.treeAction!=='delete'||!menu)return false;const r=item.getBoundingClientRect(),m=menu.getBoundingClientRect();return r.top>=m.top&&r.bottom<=m.bottom;})()`,
          'Keyboard focus scrolls the last file action into the compact menu.',
        );
        key('Right');
        assert.equal(await run('document.querySelector(".tutorial-coach").dataset.step'), step.id, 'Menu arrow keys do not navigate the tutorial.');
        key('Home');
      }
      if (chapter.id === 'markup-html' && step.id === 'minify') {
        assert.equal(await run('typeof process'), 'undefined', 'HTML minification runs without a Node process global.');
        assert.equal(await run('typeof require'), 'undefined', 'HTML minification runs without native module access.');
      }
      await waitFor(
        getTutorial(),
        `(()=>{const node=Array.from(document.querySelectorAll(${JSON.stringify(step.target)})).find(node=>node.getClientRects().length);if(!node)return false;const r=node.getBoundingClientRect(),w=document.querySelector('.tutorial-workspace').getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>w.top&&r.top<w.bottom&&r.right>w.left&&r.left<w.right;})()`,
        'Visible explanation target: ' + step.target,
      );
      assert.equal(
        await run(`Boolean(document.querySelector('.dialog-modal')&&!document.querySelector(${JSON.stringify(step.target)})?.closest('.dialog-modal'))`),
        false,
        'No unexpected dialog: ' + step.id,
      );
      if (!step.action && !step.completion) {
        await next();
        continue;
      }
      await waitFor(
        getTutorial(),
        `(()=>{const node=Array.from(document.querySelectorAll(${JSON.stringify(step.target)})).find(node=>node.getClientRects().length);if(!node)return false;const r=node.getBoundingClientRect(),w=document.querySelector('.tutorial-workspace').getBoundingClientRect(),p=node.closest('.dialog-content,[role=menu]')?.getBoundingClientRect()||w;
    return r.width>0&&r.height>0&&r.top>=Math.max(w.top,p.top)-1&&r.bottom<=Math.min(w.bottom,p.bottom)+1&&r.left>=w.left-1&&r.right<=w.right+1;})()`,
        'Visible text action: ' + step.target,
      );
      const selection = ruleOf(step.completion, 'selection');
      // A retained disclosure or an earlier natural action may already satisfy
      // the exercise. Do not toggle a correct state back while it auto-advances.
      if (step.completion && (await run('Boolean(document.querySelector(".tutorial-status.completed"))'))) {
        const following = chapter.steps[chapter.steps.indexOf(step) + 1];
        if (following) await stepReady(following.id);
        continue;
      }
      let value = ruleOf(step.completion, 'value', step.target);
      if (!value && branchFamily) value = ruleOf(step.completion, 'value');
      if (!value && (family.startsWith('conflicts') || rebaseFamily) && step.target === '[data-tutorial="conflict-manual"]')
        value = ruleOf(step.completion, 'value');
      if (!value && ruleOf(step.completion, 'value') && (await run(`document.querySelector(${JSON.stringify(step.target)}) instanceof HTMLSelectElement`)))
        value = { ...ruleOf(step.completion, 'value'), selector: step.target };
      if (family.startsWith('recovery') && step.id.startsWith('find')) {
        const visible = await run('Array.from(document.querySelectorAll("[data-tutorial=open-recovery]")).some(node=>node.getClientRects().length)');
        if (!visible) await click('[data-tutorial=commit-search-more]');
        await run('Array.from(document.querySelectorAll("[data-tutorial=open-recovery]")).find(node=>node.getClientRects().length).click()');
      } else if (step.gesture === 'contextmenu') {
        if (
          step.id === 'folder-menu' ||
          step.id === 'source-menu' ||
          branchFamily ||
          replayFamily ||
          resetFamily ||
          rebaseFamily ||
          family === 'reword' ||
          family.startsWith('reword-')
        ) {
          await run('document.querySelector(' + JSON.stringify(step.target) + ').focus()');
          key('F10', ['shift']);
        } else
          await run(
            `(()=>{const node=document.querySelector(${JSON.stringify(step.target)}),r=node.getBoundingClientRect();node.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+15,clientY:r.top+r.height/2}));})()`,
          );
      } else if (step.gesture === 'enter' || step.gesture === 'space' || step.gesture === 'escape') {
        await run('document.querySelector(' + JSON.stringify(step.target) + ').focus()');
        const nativeEnter = step.gesture === 'enter' && (await run('document.activeElement?.matches("summary, button")'));
        key(step.gesture === 'enter' ? 'Enter' : step.gesture === 'space' ? 'Space' : 'Escape', [], nativeEnter ? '\r' : undefined);
      } else if (chapter.id === 'branches-manage' && step.id === 'confirm-rename') {
        if (await run('Boolean(document.querySelector("[data-dialog-action=confirm]"))')) await click('[data-dialog-action=confirm]');
        else await waitFor(getTutorial(), 'document.querySelector(".tutorial-status.completed")');
      } else if (branchFamily && ['create', 'invalid-submit'].includes(step.id)) {
        if (await run('Boolean(document.querySelector("[data-tutorial=branch-name]"))')) {
          await run('document.querySelector("[data-tutorial=branch-name]").focus()');
          key('Enter');
        }
      } else if (selection) await select(selection.from, selection.to);
      else if (value) {
        const text = Array.isArray(value.value)
          ? value.value[languageIndex]
          : (value.value.example === 'structured-files'
              ? structuredExamples
              : value.value.example === 'markup-files'
                ? markupExamples
                : value.value.example === 'tree-files'
                  ? treeExamples
                  : value.value.example === 'search-files'
                    ? searchExamples
                    : value.value.example === 'history-readme'
                      ? historyExamples
                      : examples)[value.value.version][languageIndex];
        await fill(value.selector, value.comparison === 'json' ? JSON.stringify(JSON.parse(text)) : text);
        if (chapter.id === 'branches-manage' && step.id === 'new-name') {
          await waitFor(getTutorial(), 'document.querySelector(".tutorial-status.completed")');
          await run('document.querySelector("[data-dialog-field=newName] input").focus()');
          key('Enter');
          await waitFor(getTutorial(), 'document.querySelector(' + JSON.stringify('[data-branch-name="feature/kapitel"]') + ')');
        }
        if (branchFamily && step.id === 'correct-name') {
          await waitFor(getTutorial(), 'document.querySelector(".tutorial-status.completed")');
          await run('document.querySelector("[data-tutorial=branch-name]").focus()');
          key('Enter');
          await waitFor(getTutorial(), 'document.querySelector("[data-dialog-action=cancel]")');
        }
        if (
          (chapter.id === 'history-forensic-lines' && step.id === 'greeting-end') ||
          (['history-forensic-string', 'history-forensic-regex'].includes(chapter.id) && step.id === 'query')
        ) {
          await waitFor(getTutorial(), 'document.querySelector(".tutorial-status.completed")');
          await run(`document.querySelector(${JSON.stringify(step.target)}).focus()`);
          key('Enter');
          const count = chapter.id === 'history-forensic-lines' ? 3 : 2;
          await waitFor(
            getTutorial(),
            `document.querySelector('.forensic-search-panel[data-search-count="${count}"][data-search-loading="false"]')`,
            'Enter searches the actual completed input before automatic progression.',
          );
        }
      } else await click(`${step.target}:not(:disabled)`);
      const following = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (following) await stepReady(following.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  if (family === 'recovery') {
    await launch({ chapterId: 'recovery', stepId: 'find' });
    await stepReady('find');
    // Use a genuinely narrow native viewport rather than inferring its
    // width from panels that may become overlays at responsive breakpoints.
    parent.setSize(640, 680);
    assert.equal(parent.getSize()[0], 640);
    await waitFor(
      getTutorial(),
      'document.querySelector("[data-tutorial=commit-search-more]")?.getClientRects().length && !document.querySelector("[data-tutorial=open-recovery]")?.getClientRects().length',
    );
    await click('[data-tutorial="commit-search-more"]');
    await waitFor(getTutorial(), 'document.querySelector(".commit-search-toolbar__more-menu [data-tutorial=open-recovery]")?.getClientRects().length');
    assert.equal(
      await run('document.querySelector(".tutorial-coach").dataset.step'),
      'find',
      'Opening the compact menu alone does not complete recovery navigation.',
    );
    await click('.commit-search-toolbar__more-menu [data-tutorial="open-recovery"]');
    await stepReady('history');
    assert.equal(await run('document.querySelectorAll(".action-toast.error").length'), 0);
    await close();
    parent.setSize(900, 640);
  }
  if (
    family.startsWith('tree-') ||
    family.startsWith('search-') ||
    family === 'history' ||
    family.startsWith('history-') ||
    branchFamily ||
    replayFamily ||
    resetFamily ||
    rebaseFamily ||
    family.startsWith('stash-') ||
    family.startsWith('merge-') ||
    family.startsWith('tags-') ||
    family.startsWith('amend-') ||
    family === 'reword' ||
    family.startsWith('reword-') ||
    family === 'recovery' ||
    family.startsWith('recovery-') ||
    family === 'conflicts' ||
    family.startsWith('conflicts-')
  ) {
    const checkpoints = {
      'tree-create': 'create-file',
      'tree-rename': 'rename-file',
      'tree-copy': 'keep-both',
      'tree-replace': 'replace',
      'tree-move': 'paste',
      'tree-delete': 'delete-folder',
      'search-names': 'capital',
      'search-content': 'literal',
      'search-one': 'replace',
      'search-all': 'replace-all',
      history: 'text',
      'history-files': 'next-version',
      'history-blame': 'save',
      'history-sources': 'back',
      'history-search': 'wrap',
      'history-forensic-string': 'run-lowercase',
      'history-forensic-lines': 'run-invalid',
      'history-forensic-regex': 'run-invalid',
      branches: 'create',
      'branches-switch': 'keyboard-main',
      'branches-manage': 'confirm-rename',
      'branches-unmerged': 'confirm-force',
      'branches-cleanup': 'delete',
      'branches-cleanup-protection': 'save',
      'branches-cleanup-unmerged': 'delete',
      'branches-carry-review': 'refresh',
      'branches-carry': 'carry',
      'branches-park': 'park',
      'branches-park-restore': 'restore',
      'stash-file': 'save',
      'stash-all': 'save',
      'stash-files': 'apply-new',
      'stash-branch': 'create',
      'merge-review': 'review',
      'merge-fast-forward': 'confirm',
      'merge-commit': 'confirm',
      'merge-squash': 'confirm',
      'merge-outward': 'confirm',
      'merge-diverged': 'confirm',
      'merge-ff-guard': 'attempt',
      'merge-squash-diverged': 'confirm',
      'merge-revert': 'confirm',
      'tags-navigation': 'select',
      'tags-lightweight': 'create',
      'tags-annotated': 'create',
      'tags-delete': 'delete',
      'amend-message': 'commit',
      'amend-files': 'commit',
      reword: 'apply',
      'cherry-pick': 'apply',
      'cherry-pick-conflict': 'mark',
      'cherry-pick-abort': 'confirm',
      revert: 'apply',
      'reset-soft': 'guard-confirm',
      'reset-mixed': 'guard-confirm',
      'reset-hard': 'guard-confirm',
      'reword-protected': 'cancel',
      'reword-referenced': 'cancel',
      'rebase-review': 'apply',
      'rebase-reword': 'apply',
      'rebase-squash': 'apply',
      'rebase-fixup': 'apply',
      'rebase-drop': 'apply',
      'rebase-reorder': 'apply',
      'rebase-edit': 'pause-continue',
      'rebase-staged': 'pause-continue',
      'rebase-conflict': 'pause-continue',
      'rebase-abort': 'abort-confirm',
      'rebase-root': 'attempt',
      'rebase-off-head': 'attempt',
      'rebase-merge-guard': 'attempt',
      recovery: 'restore',
      'recovery-message': 'restore',
      'recovery-inspect': 'confirm',
      'recovery-reset': 'confirm',
      conflicts: 'mark-resolved',
      'conflicts-choices': 'save-resolved',
      'conflicts-manual': 'mark',
      'conflicts-abort': 'confirm',
      'conflicts-multiple': 'save-readme',
      'conflicts-deletion': 'delete',
    };
    const review = branchFamily
      ? TUTORIAL_CHAPTERS.filter((entry) => (chapterIds ? chapterIds.includes(entry.id) : entry.id === family))
      : [TUTORIAL_CHAPTERS.find((entry) => entry.id === family)];
    for (const chapter of review) {
      const stepId = checkpoints[chapter.id];
      const previous = chapter.steps[chapter.steps.findIndex((step) => step.id === stepId) - 1];
      await launch({ chapterId: chapter.id, stepId });
      await run('document.querySelector("#tutorial-step-title").focus()');
      pressKey('Left');
      await stepReady(previous.id);
      await click('.tutorial-coach .tutorial-link');
      await stepReady(stepId);
      await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(chapter.steps.find((step) => step.id === stepId).target)})`);
      if (require('./tutorial-rebase-pause-assertions.cjs').isPause(chapter.id))
        await require('./tutorial-rebase-pause-assertions.cjs').verifyFeedback({ chapter, step: chapter.steps.find((entry) => entry.id === stepId), run });
      else if (require('./tutorial-rebase-guard-assertions.cjs').isGuard(chapter.id))
        await require('./tutorial-rebase-guard-assertions.cjs').verifyFeedback({
          chapter,
          step: chapter.steps.find((entry) => entry.id === stepId),
          run,
          languageIndex,
        });
      else
        assert.equal(
          await run('document.querySelectorAll(".action-toast.error").length'),
          0,
          'Back/skip restores the expected exercise without destructive replay.',
        );
      await close();
    }
  }
  if (family === 'codecs') {
    await launch({ chapterId: 'codecs-selection', stepId: 'base64-encode-select' });
    await select(7, 10);
    assert.equal(await run('document.querySelector(".tutorial-coach .primary").disabled'), true, 'A partial word cannot complete the selection exercise.');
    await select(7, 11);
    await stepReady('base64-encode-menu');
    await run('document.querySelector("#tutorial-step-title").focus()');
    pressKey('Left');
    await stepReady('base64-encode-select');
    await click('.tutorial-coach .tutorial-link');
    await stepReady('base64-encode-menu');
    await waitFor(getTutorial(), 'document.querySelector(' + JSON.stringify('.file-viewer[data-selection-from="7"][data-selection-to="11"]') + ')');
    await close();
  }
  if (family === 'json-errors') {
    await launch({ chapterId: 'json-errors', stepId: 'copy' });
    await run('document.querySelector("#tutorial-step-title").focus()');
    pressKey('Left');
    await stepReady('retry-group');
    await waitFor(getTutorial(), 'document.querySelector(\'.file-viewer[data-selection-from="15"][data-selection-to="18"]\')');
    await click('.tutorial-coach .tutorial-link');
    await stepReady('copy');
    await waitFor(getTutorial(), 'document.querySelector(\'.file-viewer[data-selection-from="15"][data-selection-to="18"]\')');
    await close();
  }
  if (family === 'markup') {
    await launch({ chapterId: 'markup-html', stepId: 'minify-error' });
    await run('document.querySelector("#tutorial-step-title").focus()');
    pressKey('Left');
    await stepReady('minify-error-group');
    await waitFor(
      getTutorial(),
      'document.querySelector(\'.file-viewer[data-dirty="true"] .cm-content\')?.textContent === ' +
        JSON.stringify(markupExamples['html-invalid'][languageIndex]),
    );
    await click('.tutorial-coach .tutorial-link');
    await stepReady('minify-error');
    await waitFor(
      getTutorial(),
      'document.querySelector(\'.file-viewer[data-dirty="true"] .cm-content\')?.textContent === ' +
        JSON.stringify(markupExamples['html-invalid'][languageIndex]),
    );
    await close();
  }
  parent.setBounds(original);
  console.log('Native ' + family + ' controls, state changes, dialog decisions and save checks passed.');
};
