const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
const EDITOR_CONTENT = require('../src/tutorial/fixtures/editor-readme.json');

module.exports = async function verifyFiles({ getTutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent, languageIndex = 0 }) {
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  function shortcut(key) {
    getTutorial().sendInputEvent({ type: 'keyDown', keyCode: key, modifiers: ['control'] });
    getTutorial().sendInputEvent({ type: 'keyUp', keyCode: key, modifiers: ['control'] });
  }
  async function edit(value) {
    await waitFor(getTutorial(), 'document.querySelector(".cm-content[contenteditable=true]")');
    await run('document.querySelector(".cm-content[contenteditable=true]").focus()');
    shortcut('A');
    await getTutorial().insertText(value);
  }
  async function visibleControl(selector) {
    await waitFor(
      getTutorial(),
      `(()=>{const target=document.querySelector(${JSON.stringify(selector)});if(!target)return false;
      const rect=target.getBoundingClientRect(),area=document.querySelector('.tutorial-workspace').getBoundingClientRect();
      return rect.width>0&&rect.height>0&&rect.top>=area.top-1&&rect.bottom<=area.bottom+1;})()`,
      'The file control is visible: ' + selector,
    );
  }
  for (const chapter of TUTORIAL_CHAPTERS.filter((entry) => entry.id.startsWith('files-'))) {
    await launch({ chapterId: chapter.id });
    for (const step of chapter.steps) {
      console.log('File lesson:', chapter.id, step.id);
      await stepReady(step.id);
      assert.equal(
        await run(`Boolean(document.querySelector('.dialog-modal')&&!document.querySelector(${JSON.stringify(step.target)})?.closest('.dialog-modal'))`),
        false,
        'No unexpected modal may block ' + chapter.id + '/' + step.id,
      );
      if (!step.action && !step.completion) {
        await next();
        continue;
      }
      await visibleControl(step.target);
      if (step.completion?.kind === 'value') {
        const value = step.completion.value;
        await edit(Array.isArray(value) ? value[languageIndex] : EDITOR_CONTENT[value.version][languageIndex]);
      } else if (step.id === 'save-shortcut') {
        await run('document.querySelector(".cm-content").focus()');
        shortcut('S');
      } else await click(`${step.target}:not(:disabled)`);
      const following = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (following) await stepReady(following.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  await launch({ chapterId: 'files-edit', stepId: 'edit' });
  await edit('Wrong contents\n');
  await run('new Promise(resolve=>setTimeout(resolve,150))');
  assert.equal(await run('document.querySelector(".tutorial-coach .primary").disabled'), true, 'A wrong draft does not complete the exercise.');
  await run('document.querySelector("#tutorial-step-title").focus()');
  pressKey('Left');
  await stepReady('edit-purpose');
  pressKey('Right');
  await stepReady('edit');
  await click('.tutorial-coach .tutorial-link');
  await stepReady('unsaved');
  assert.equal(await run('document.querySelector(".file-viewer").dataset.dirty'), 'true');
  await waitFor(
    getTutorial(),
    'document.querySelector(".cm-content")?.innerText.includes(' + JSON.stringify(languageIndex === 0 ? 'Bearbeitet' : 'Edited') + ')',
    'Skipping restores the prepared editor text after layout settles.',
  );
  await close();
  parent.setBounds(original);
  console.log('Native file tree, editor typing, save button, Ctrl+S, draft decisions, index isolation, Back and Skip passed.');
};
