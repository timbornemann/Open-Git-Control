const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
const CONTENT = require('../src/tutorial/fixtures/file-formats.json');

module.exports = async function verifyFormats({ getTutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent, languageIndex = 0 }) {
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  const text = (version) => CONTENT[version][languageIndex];
  const valueRule = (rule, target) =>
    rule?.kind === 'all'
      ? rule.conditions.map((entry) => valueRule(entry, target)).find(Boolean)
      : rule?.kind === 'value' && rule.selector === target
        ? rule
        : null;
  async function fill(selector, value) {
    if (selector.includes('file-editor')) {
      await waitFor(getTutorial(), 'document.querySelector(".cm-content[contenteditable=true]")');
      await run('document.querySelector(".cm-content").focus()');
      getTutorial().sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
      getTutorial().sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
      await getTutorial().insertText(value);
    } else
      await run(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});
      const proto=field instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(field,${JSON.stringify(value)});
      field.dispatchEvent(new Event(field instanceof HTMLSelectElement?'change':'input',{bubbles:true}));})()`);
  }
  async function frameHeading(expected) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const frame = getTutorial().mainFrame.frames.find((entry) => entry.url.startsWith('ogc-html-preview:'));
      if (frame) {
        const rendered = await frame.executeJavaScript(`({heading:document.querySelector('h1')?.textContent,
          color:getComputedStyle(document.body).backgroundColor,host:typeof window.tutorialHost,api:typeof window.electronAPI})`);
        if (rendered.heading === expected) {
          assert.equal(rendered.color, 'rgb(230, 242, 255)', 'Bundled relative CSS is rendered inside the private session.');
          assert.equal(rendered.host, 'undefined');
          assert.equal(rendered.api, 'undefined');
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('The isolated HTML preview did not render ' + expected);
  }
  for (const chapter of TUTORIAL_CHAPTERS.filter((entry) => entry.id.startsWith('formats-'))) {
    await launch({ chapterId: chapter.id });
    for (const step of chapter.steps) {
      console.log('Format lesson:', chapter.id, step.id);
      await stepReady(step.id);
      assert.equal(await run('Boolean(document.querySelector(".dialog-modal"))'), false, 'No navigation dialog may cover ' + chapter.id + '/' + step.id);
      if (chapter.id === 'formats-html' && ['rendered', 'draft-result'].includes(step.id)) {
        const expected = step.id === 'rendered' ? ['Hallo Lernprojekt', 'Hello learning project'] : ['Willkommen in unserem Projekt', 'Welcome to our project'];
        await frameHeading(expected[languageIndex]);
      }
      if (!step.action && !step.completion) {
        await next();
        continue;
      }
      await waitFor(
        getTutorial(),
        `(()=>{const el=document.querySelector(${JSON.stringify(step.target)});if(!el)return false;
        const r=el.getBoundingClientRect(),w=document.querySelector('.tutorial-workspace').getBoundingClientRect();
        return r.width>0&&r.height>0&&r.top>=w.top-1&&r.bottom<=w.bottom+1&&r.left>=w.left-1&&r.right<=w.right+1;})()`,
        'Visible format control: ' + step.target,
      );
      const rule = valueRule(step.completion, step.target);
      if (rule) await fill(rule.selector, Array.isArray(rule.value) ? rule.value[languageIndex] : text(rule.value.version));
      else await click(`${step.target}:not(:disabled)`);
      const following = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (following) await stepReady(following.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  await launch({ chapterId: 'formats-markdown', stepId: 'edit' });
  await fill('[data-tutorial="file-editor"]', 'Wrong guide\n');
  assert.equal(await run('document.querySelector(".tutorial-coach .primary").disabled'), true);
  await run('document.querySelector("#tutorial-step-title").focus()');
  pressKey('Left');
  await stepReady('edit-purpose');
  pressKey('Right');
  await stepReady('edit');
  await click('.tutorial-coach .tutorial-link');
  await stepReady('draft');
  await waitFor(getTutorial(), 'document.querySelector(".file-viewer[data-dirty=true]")');
  await close();
  parent.setBounds(original);
  console.log('Native Markdown, private HTML/CSS, CSV delimiter/cell/row/column, save and diff lessons passed.');
};
