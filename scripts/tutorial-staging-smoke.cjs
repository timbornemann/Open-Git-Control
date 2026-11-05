const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
module.exports = async function verifyStaging({ getTutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent, languageIndex = 0 }) {
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  async function setValue(selector, value) {
    await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(selector)})`);
    await run(
      `(()=>{const field=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  }
  for (const chapter of TUTORIAL_CHAPTERS.filter((entry) => entry.id.startsWith('staging-'))) {
    await launch({ chapterId: chapter.id });
    for (const step of chapter.steps) {
      console.log('Staging lesson:', chapter.id, step.id);
      await stepReady(step.id);
      if (step.completion?.kind === 'element' && step.completion.selector === '.staging-context-menu') {
        await run(
          `(()=>{const row=document.querySelector(${JSON.stringify(step.target)});row.focus();row.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}));})()`,
        );
      } else if (step.completion?.kind === 'value') await setValue(step.completion.selector, step.completion.value[languageIndex]);
      else if (step.completion) {
        if (step.id === 'repeat-rule')
          assert.equal(
            await run('document.querySelector(".tutorial-coach .primary").disabled'),
            true,
            'An unchanged state alone cannot complete the duplicate-rule exercise.',
          );
        await click(`${step.target}:not(:disabled)`);
      } else if (!step.action && !step.completion) {
        if (step.id === 'review') assert.equal(await run('document.querySelectorAll("[data-tutorial=staged-files] .staging-file-row").length'), 5);
        if (chapter.id === 'staging-discard' && step.id === 'scope') {
          await run('document.querySelector(".dialog-modal [data-dialog-action=cancel]").focus()');
          pressKey('Tab');
          await waitFor(getTutorial(), 'document.activeElement?.dataset.dialogAction === "confirm"');
          pressKey('Tab');
          await waitFor(getTutorial(), 'Boolean(document.activeElement?.closest(".tutorial-banner"))');
          pressKey('Tab');
          await waitFor(getTutorial(), 'Boolean(document.activeElement?.closest(".tutorial-coach"))');
          pressKey('Right');
          await stepReady('cancel');
        } else await next();
        continue;
      } else throw new Error('Missing native staging driver: ' + step.id);
      const following = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (following) await stepReady(following.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  await launch({ chapterId: 'staging-scope', stepId: 'whole-explained' });
  pressKey('Left');
  await stepReady('unstage-selected');
  await waitFor(getTutorial(), `document.querySelector(${JSON.stringify('[data-tutorial=staged-files] [aria-label="README.md"]')})`);
  await click('.tutorial-coach .tutorial-link');
  await stepReady('whole-explained');
  await waitFor(getTutorial(), `document.querySelector(${JSON.stringify('[data-tutorial=unstaged-files] [aria-label="README.md"]')})`);
  assert.equal(await run('document.querySelector("[data-tutorial=staging-search]").value'), 'README');
  await close();
  await launch({ chapterId: 'staging-ignore-folders', stepId: 'ignore-folder' });
  await click('[data-tutorial="ignore-parent"]');
  await run('new Promise(resolve => setTimeout(resolve, 150))');
  assert.equal(await run('document.querySelector(".tutorial-coach").dataset.step'), 'ignore-folder');
  assert.equal(await run('document.querySelector(".tutorial-coach .primary").disabled'), true, 'A wider rule must not complete a narrower folder exercise.');
  pressKey('Left');
  await stepReady('folder-scope');
  await run('document.querySelector("#tutorial-step-title").focus()');
  pressKey('Right');
  await stepReady('ignore-folder');
  await click('[data-tutorial="ignore-folder"]');
  await stepReady('folder-result');
  pressKey('Left');
  await stepReady('ignore-folder');
  await click('.tutorial-coach .tutorial-link');
  await stepReady('folder-result');
  assert.ok(
    await run('Boolean(document.querySelector(\'[data-tutorial="untracked-files"] [aria-label="docs/ideas.md"]\'))'),
    'Skipping restores the narrower rule and preserves the sibling file.',
  );
  await close();
  parent.setBounds(original);
  console.log('Native staging scope, discard, delete, ignore rules, keyboard, Back and Skip passed.');
};
