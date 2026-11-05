const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
const { COMMIT_TITLE, COMMIT_DESCRIPTION } = require('../dist-electron/src/shared/tutorial/lessonExamples.js');

/** Exercise the overview and the actual controls of the first detailed lessons. */
module.exports = async function verifyCurriculum({ getTutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent, languageIndex = 0 }) {
  const run = (code) => getTutorial().executeJavaScript(code);
  async function setValue(selector, value) {
    await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await run(`(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      const prototype = control.tagName === 'SELECT' ? HTMLSelectElement.prototype : control.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
    })()`);
  }
  const overview = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'basics');
  await launch({ chapterId: 'basics' });
  assert.deepEqual(
    await run('Array.from(document.querySelectorAll(".activity-bar [data-tutorial^=nav-]")).map(button => button.dataset.tutorial.slice(4)).sort()'),
    overview.steps
      .filter((step) => step.action)
      .map((step) => step.action.slice(9))
      .sort(),
    'The overview visits every actual activity-bar area.',
  );
  await run('new Promise(resolve => setTimeout(resolve, 1200))');
  assert.equal(await run('document.querySelector(".tutorial-coach").dataset.step'), 'orientation');
  pressKey('Right');
  await stepReady('workspace');
  pressKey('Left');
  await stepReady('orientation');
  await next();
  for (const step of overview.steps.slice(1)) {
    await stepReady(step.id);
    await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(step.target)})`);
    if (step.action) await click(`[data-tutorial="nav-${step.action.slice(9)}"]`);
    else {
      assert.equal(await run('document.querySelector("[data-tutorial=primary]").dataset.tutorialRoute'), step.area === 'repo' ? 'graph' : step.area);
      await next();
    }
  }
  await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
  assert.ok(
    (await run('document.querySelector(".tutorial-chapter-chooser").innerText')).includes(
      languageIndex === 0 ? 'Übersicht abgeschlossen' : 'Overview complete',
    ),
  );
  await click('[data-tutorial="finish-learning"]');
  const closed = getTutorial();
  for (let attempt = 0; !closed.isDestroyed() && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(closed.isDestroyed(), 'Users can finish after the overview.');
  assert.equal(await parent.webContents.executeJavaScript('window.unsavedTutorialTestDraft'), 'my unfinished draft');
  await launch({ chapterId: 'basics', stepId: 'help' });
  await next();
  await click('[data-tutorial="continue-learning"]');

  for (const chapterId of ['changes', 'commit']) {
    const chapter = TUTORIAL_CHAPTERS.find((item) => item.id === chapterId);
    for (const step of chapter.steps) {
      await stepReady(step.id);
      await waitFor(getTutorial(), `document.querySelector('.tutorial-coach-progress')?.innerText.startsWith(${JSON.stringify(chapter.title[languageIndex])})`);
      await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(step.target)})`);
      if (chapterId === 'commit' && step.id === 'overview') await setValue('[data-tutorial="commit-description"]', 'A draft entered before the lesson');
      if (chapterId === 'commit' && step.id === 'type') {
        assert.equal(
          await run('document.querySelector("[data-tutorial=commit-description]").value'),
          'A draft entered before the lesson',
          'Forward steps retain actual user input.',
        );
      }
      if (!step.action && !step.completion) {
        await next();
        continue;
      }
      if (step.completion?.kind === 'value') {
        if (step.id === 'signoff') await click(step.completion.selector);
        else await setValue(step.completion.selector, step.completion.value[languageIndex]);
      } else if (chapterId === 'changes') {
        const actions = {
          'open-diff': '[data-tutorial="unstaged-files"] .staging-file-row[aria-label="README.md"]',
          split: '[data-tutorial="diff-split"]:not(:disabled)',
          unified: '[data-tutorial="diff-unified"]:not(:disabled)',
          'close-diff': '[data-tutorial="close-file"]',
          stage: '[data-tutorial="unstaged-files"] .staging-file-row[aria-label="README.md"] .staging-actions button:first-child',
          unstage: '[data-tutorial="staged-files"] .staging-file-row[aria-label="README.md"] .staging-actions button:first-child',
        };
        assert.ok(actions[step.id], 'A native exercise driver is required for ' + step.id);
        if (step.id === 'close-diff') {
          await run('document.querySelector("#tutorial-step-title").focus()');
          pressKey('Right');
          await run('new Promise(resolve => setTimeout(resolve, 150))');
          assert.equal(await run('document.querySelector(".tutorial-coach").dataset.step'), 'close-diff', 'Arrow keys cannot skip unfinished exercises.');
        }
        await click(actions[step.id]);
      } else if (step.id === 'commit') {
        assert.ok((await run('document.querySelector(".staging-commit-preview").innerText')).includes(COMMIT_TITLE[languageIndex]));
        assert.equal(await run('document.querySelector("[data-tutorial=commit-description]").value'), COMMIT_DESCRIPTION[languageIndex]);
        assert.equal(await run('document.querySelector("[data-tutorial=commit-signoff] input").checked'), true);
        await click('.staging-commit-btn:not(:disabled)');
      } else throw new Error('Uncovered native commit exercise: ' + step.id);
      const nextStep = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (nextStep) await stepReady(nextStep.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    if (chapterId === 'changes') await click('[data-tutorial="continue-learning"]');
  }
  await close();
  console.log('Native overview choice, detailed diff/staging, all commit fields and retained inputs passed.');
};
