const assert = require('node:assert/strict');
const { TUTORIAL_CHAPTERS } = require('../dist-electron/src/shared/tutorial/catalog.js');
const chapters = [
  'repositories',
  'repository-open',
  'repository-init',
  'repository-clone',
  'repository-manage',
  'repository-appearance',
  'repository-shortcuts',
];
const c = (name) => `[data-tutorial="repo-${name}"]`;
const row = (name = 'OGC-Lernprojekt') => `.local-repositories-view__row[data-repository-activity-path="/tutorial/${name}"]`;
const menu = (name) => `${row(name)} ${c('menu')}`;
const picker = '.tutorial-directory-picker';
const choice = `${picker} .tutorial-directory-choice`;
const confirm = `${picker} .dialog-btn-primary`;
const icon = '.repository-icon-dialog';
module.exports = async function verifyRepositories({ getTutorial, launch, close, click, next, stepReady, waitFor, parent, languageIndex = 0 }) {
  const original = parent.getBounds();
  parent.setSize(900, 640);
  const run = (code) => getTutorial().executeJavaScript(code);
  async function setValue(selector, value) {
    await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).disabled`);
    await run(`(() => { const input = document.querySelector(${JSON.stringify(selector)});
      const prototype = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true})); })()`);
  }
  async function selectFolder() {
    await click(choice);
    await click(`${confirm}:not(:disabled)`);
  }
  for (const chapterId of chapters) {
    const chapter = TUTORIAL_CHAPTERS.find((entry) => entry.id === chapterId);
    await launch({ chapterId });
    for (const step of chapter.steps) {
      console.log('Repository lesson:', chapterId, step.id);
      await stepReady(step.id);
      await waitFor(getTutorial(), `document.querySelector(${JSON.stringify(step.target)})`);
      if (step.completion?.kind === 'value') {
        if (step.id === 'readme') await click(step.completion.selector);
        else await setValue(step.completion.selector, step.completion.value[languageIndex]);
      } else if (!step.action && !step.completion) {
        if (['menu', 'modes', 'progress', 'options'].includes(step.id)) {
          assert.equal(
            await run(
              `(() => {const button=document.querySelector('.tutorial-banner button'); const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2));})()`,
            ),
            true,
            'End introduction remains reachable above dialogs and menus.',
          );
        }
        if (chapterId === 'repository-init' && step.id === 'finish') {
          await waitFor(getTutorial(), 'document.querySelectorAll("[data-tutorial=untracked-files] .staging-file-row").length === 3');
        }
        if (chapterId === 'repository-clone' && step.id === 'progress') {
          await waitFor(
            getTutorial(),
            'document.querySelector(".git-transfer-header-state.complete") && document.querySelector(".git-transfer-modal")?.innerText.includes("100%")',
          );
        }
        await next();
        continue;
      } else if (chapterId === 'repositories') {
        if (step.id === 'pin') {
          await click(`${row('Notizbuch')} ${c('pin')}`);
          await run('new Promise(resolve => setTimeout(resolve,1100))');
          assert.equal(await run('document.querySelector(".tutorial-coach").dataset.step'), 'pin', 'Pinning the wrong project must not complete the exercise.');
          await click(`${row('Notizbuch')} ${c('pin')}`);
        }
        const selectors = {
          pin: `${row()} ${c('pin')}`,
          'pinned-only': c('pinned-filter'),
          'all-again': c('pinned-filter'),
          switch: `${row('Notizbuch')} .local-repositories-view__row-main`,
          switched: '[data-tutorial="nav-localRepos"]',
        };
        assert.ok(selectors[step.id], step.id);
        await click(selectors[step.id]);
      } else if (chapterId === 'repository-shortcuts') {
        if (step.id.startsWith('open-')) {
          await click(menu());
          await click(c(`action-${step.id.slice(5)}`));
        } else if (step.id.startsWith('return-')) await click('[data-tutorial="nav-localRepos"]');
        else throw new Error(step.id);
      } else if (chapterId === 'repository-open') {
        if (['open-picker', 'open-again'].includes(step.id)) await click(c('add'));
        else if (step.id === 'cancel') await click(`${picker} .dialog-btn-secondary`);
        else if (step.id === 'select') await click(choice);
        else if (step.id === 'confirm') await click(`${confirm}:not(:disabled)`);
        else throw new Error(step.id);
      } else if (chapterId === 'repository-init') {
        if (step.id === 'open') {
          await click(c('add'));
          await selectFolder();
        } else if (step.id === 'initialize') await click('.dialog-btn-primary:not(:disabled)');
        else throw new Error(step.id);
      } else if (chapterId === 'repository-clone') {
        if (step.id === 'open') await click(c('clone'));
        else if (step.id === 'destination') await click('.dialog-btn-primary:not(:disabled)');
        else if (step.id === 'choose-parent') await click(choice);
        else if (step.id === 'clone') await click(`${confirm}:not(:disabled)`);
        else if (step.id === 'close') await click('.git-transfer-close-button');
        else throw new Error(step.id);
      } else if (chapterId === 'repository-manage') {
        if (step.id === 'open') await click(menu());
        else {
          if (step.id !== 'copy') await click(menu(step.id === 'remove' ? 'Notizbuch' : undefined));
          await click(c(`action-${step.id === 'unpin' ? 'pin' : step.id}`));
        }
      } else if (chapterId === 'repository-appearance') {
        if (['open', 'reopen'].includes(step.id)) {
          await click(menu());
          await click(c('action-icon'));
        } else if (step.id === 'cancel') await click(`${icon} footer button:first-child`);
        else if (['auto', 'initials'].includes(step.id)) await click(`${c(`icon-${step.id}`)} input`);
        else if (step.id === 'candidate') await click('.repository-icon-candidate[title="assets/ogc.svg"]');
        else await click(c(`icon-${step.id}`));
      }
      const nextStep = chapter.steps[chapter.steps.indexOf(step) + 1];
      if (nextStep) await stepReady(nextStep.id);
    }
    await waitFor(getTutorial(), 'document.querySelector(".tutorial-chapter-chooser")');
    await close();
  }
  // Direct FAQ entries restore both conditional fields and portaled dialogs,
  // including at the application's smaller supported window size.
  parent.setSize(900, 640);
  for (const request of [
    { chapterId: 'repository-init', stepId: 'initialize' },
    { chapterId: 'repository-clone', stepId: 'progress' },
    { chapterId: 'repository-appearance', stepId: 'save' },
  ]) {
    await launch(request);
    await waitFor(
      getTutorial(),
      'document.querySelector(".tutorial-coach .primary:not(:disabled)") || document.querySelector(".tutorial-coach .tutorial-status:not(.completed)")',
    );
    const selector = request.chapterId === 'repository-init' ? '.dialog-modal' : request.chapterId === 'repository-clone' ? '.git-transfer-modal' : icon;
    await waitFor(
      getTutorial(),
      `(() => {const dialog=document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); const area=document.querySelector('.tutorial-workspace').getBoundingClientRect();return dialog&&dialog.top>=area.top&&dialog.bottom<=area.bottom;})()`,
    );
    if (request.chapterId === 'repository-init') {
      const description = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'repository-init').steps.find((step) => step.id === 'description').completion
        .value[languageIndex];
      await waitFor(getTutorial(), 'document.querySelector("[data-dialog-field=programDescription] input")?.value === ' + JSON.stringify(description));
      assert.equal(await run('document.querySelector(".dialog-btn-primary").disabled'), false);
    }
    await close();
  }
  parent.setBounds(original);
  console.log('Native catalog, folder picker, initialization, clone, context actions, logos and small-window restoration passed.');
};
