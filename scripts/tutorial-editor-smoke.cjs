const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
module.exports = async function verifyEditor({ getTutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent }) {
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  for (const chapter of TUTORIAL_CHAPTERS.filter((entry) => entry.id.startsWith('editor-'))) {
    await launch({ chapterId: chapter.id });
    for (const step of chapter.steps) {
      console.log('Editor lesson:', chapter.id, step.id);
      await stepReady(step.id);
      assert.equal(await run('Boolean(document.querySelector(".dialog-modal"))'), false, 'No unexpected navigation dialog: ' + step.id);
      if (step.id === 'whitespace-result') await waitFor(getTutorial(), 'document.querySelector(".cm-highlightSpace")');
      if (!step.action && !step.completion) {
        await next();
        continue;
      }
      await waitFor(
        getTutorial(),
        `(()=>{const el=document.querySelector(${JSON.stringify(step.target)});if(!el)return false;
      const r=el.getBoundingClientRect(),w=document.querySelector('.tutorial-workspace').getBoundingClientRect();
      const menu=el.closest('[role=menu]')?.getBoundingClientRect()||w;
      return r.width>0&&r.height>0&&r.top>=Math.max(w.top,menu.top)-1&&r.bottom<=Math.min(w.bottom,menu.bottom)+1&&r.left>=w.left-1&&r.right<=w.right+1;})()`,
        'Visible editor action: ' + step.target,
      );
      await click(`${step.target}:not(:disabled)`);
      if (step.id === 'reopen-bom') await waitFor(getTutorial(), 'document.querySelector(".file-viewer[data-encoding=utf8-bom]")');
      const following = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (following) await stepReady(following.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  await launch({ chapterId: 'editor-encoding', stepId: 'bom-saved' });
  await run('document.querySelector("#tutorial-step-title").focus()');
  pressKey('Left');
  await stepReady('bom-save');
  await waitFor(getTutorial(), 'document.querySelector(".file-viewer[data-encoding=utf8-bom][data-dirty=true]")');
  await click('.tutorial-coach .tutorial-link');
  await stepReady('bom-saved');
  await waitFor(getTutorial(), 'document.querySelector(".file-viewer[data-encoding=utf8-bom][data-dirty=false]")');
  await close();
  parent.setBounds(original);
  console.log('Native encoding, reopens, line endings, whitespace, line tools, Back and Skip passed.');
};
