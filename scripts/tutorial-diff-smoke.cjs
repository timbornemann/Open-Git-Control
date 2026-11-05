const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');

module.exports = async function verifyDiff({ getTutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent }) {
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  async function visibleControl(selector) {
    await waitFor(
      getTutorial(),
      `(()=>{
      const target=document.querySelector(${JSON.stringify(selector)});if(!target)return false;
      const rect=target.getBoundingClientRect(),area=document.querySelector('.tutorial-workspace').getBoundingClientRect();
      const clip=target.closest('.diff-content-scroll')?.getBoundingClientRect()||area;
      return rect.width>0&&rect.height>0&&rect.top>=Math.max(clip.top,area.top)-1&&rect.bottom<=Math.min(clip.bottom,area.bottom)+1;
    })()`,
      'The actual diff control is visible: ' + selector,
    );
  }
  for (const chapter of TUTORIAL_CHAPTERS.filter((entry) => entry.id.startsWith('diff-'))) {
    await launch({ chapterId: chapter.id });
    for (const step of chapter.steps) {
      console.log('Diff lesson:', chapter.id, step.id);
      await stepReady(step.id);
      if (!step.action && !step.completion) {
        await next();
        continue;
      }
      await visibleControl(step.target);
      if (step.id === 'range-select')
        await run(`document.querySelector(${JSON.stringify(step.target)}).dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,shiftKey:true}))`);
      else await click(`${step.target}:not(:disabled)`);
      const following = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (following) await stepReady(following.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  await launch({ chapterId: 'diff-hunks', stepId: 'stage-first' });
  await click('[data-hunk="hunk-2"] [data-tutorial="stage-hunk"]');
  await run('new Promise(resolve=>setTimeout(resolve,150))');
  assert.equal(await run('document.querySelector(".tutorial-coach").dataset.step'), 'stage-first');
  assert.equal(await run('document.querySelector(".tutorial-coach .primary").disabled'), true, 'Staging the other hunk does not complete the exercise.');
  pressKey('Left');
  await stepReady('scope');
  await run('document.querySelector("#tutorial-step-title").focus()');
  pressKey('Right');
  await stepReady('stage-first');
  await click('.tutorial-coach .tutorial-link');
  await stepReady('close-working');
  await click('[data-tutorial="close-file"]');
  await stepReady('split-state');
  assert.ok(await run('Boolean(document.querySelector(\'[data-tutorial="staged-files"] [aria-label="README.md"]\'))'));
  assert.ok(await run('Boolean(document.querySelector(\'[data-tutorial="unstaged-files"] [aria-label="README.md"]\'))'));
  await close();
  parent.setBounds(original);
  console.log('Native hunk navigation, partial stage/unstage, confirmed discard, line pairs, Shift ranges, Back and Skip passed.');
};
