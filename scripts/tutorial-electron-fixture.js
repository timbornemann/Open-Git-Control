const { app, webContents, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.OGC_TUTORIAL_TEST_PROFILE;
app.disableHardwareAcceleration();
// Keep native layout tests painting when another desktop window covers them.
// WebContentsView otherwise retains stale viewport sizes (electron/electron#44590).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (!profile) throw new Error('A temporary tutorial test profile is required.');
app.setPath('userData', profile);
app.setPath('sessionData', path.join(profile, 'session'));
const root = path.join(__dirname, '..');
const fresh = process.env.OGC_TUTORIAL_TEST_FRESH === '1';
const group = process.env.OGC_TUTORIAL_TEST_GROUP || 'all';
const language = process.env.OGC_TUTORIAL_TEST_LANGUAGE === 'en' ? 'en' : 'de';
const languageIndex = language === 'de' ? 0 : 1;
const isolation = group === 'workspace-isolation' ? require('./tutorial-workspace-isolation.cjs') : null;
const workspace = (() => {
  try {
    return isolation?.prepare(profile);
  } catch (error) {
    fail(error);
  }
})();
if (fresh) {
  const { TutorialProgressStore } = require(path.join(root, 'dist-electron/electron/main-process/tutorialProgress.js'));
  assert.equal(new TutorialProgressStore(profile).snapshot().welcomeSeen, false, 'A genuinely fresh Electron profile is eligible for the welcome.');
}
const settings = JSON.stringify({
  language,
  autoUpdateEnabled: false,
  autoUpdateCheckEnabled: false,
  userNotesCheckEnabled: false,
  automaticMaintenanceEnabled: false,
});
fs.writeFileSync(path.join(profile, 'settings.json'), settings);
fs.writeFileSync(path.join(profile, 'repos.json'), JSON.stringify(workspace?.stored || { repos: [], activeRepo: null, sortBy: 'lastOpenedDesc' }));
const { TUTORIAL_CHAPTERS } = require(path.join(root, 'dist-electron/src/shared/tutorial/catalog.js'));
let parent;
let tutorial;
let verified = false;
const errors = [];
let regularIpcFromTutorial = 0;
let chapterCompletions = 0;
const originalHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) =>
  originalHandle(channel, (event, ...args) => {
    if (tutorial && event.sender.id === tutorial.id && !channel.startsWith('tutorial:')) regularIpcFromTutorial++;
    if (channel === 'tutorial:complete') chapterCompletions++;
    return listener(event, ...args);
  });
const timeout = setTimeout(() => fail(new Error('Tutorial smoke test timed out.')), 150_000);
timeout.unref();
function fail(error) {
  console.error(error);
  app.exit(1);
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
app.on('browser-window-created', (_event, win) => {
  parent = win;
  win.showInactive();
});
app.on('web-contents-created', (_event, contents) => {
  contents.setBackgroundThrottling(false);
  contents.on('console-message', (event) => {
    if (event.message.includes('Tutorial simulation has no handler')) console.log(event.message);
    if (event.level === 'error') {
      errors.push(event.message);
      console.error('Renderer:', event.message);
    }
  });
  contents.on('preload-error', (_event, preload, error) => console.error('Preload:', preload, error));
  contents.on('did-fail-load', (_event, code, description) => console.error('Document failed:', contents.id, code, description));
  contents.on('render-process-gone', (_event, details) => console.error('Renderer exited:', contents.id, details.reason));
});
async function waitFor(contents, expression, label = expression) {
  const started = Date.now();
  while (Date.now() - started < 12_000) {
    if (contents.isDestroyed()) throw new Error('Renderer closed while waiting for ' + label + '. Errors: ' + errors.join('\n'));
    if (
      await Promise.race([
        contents.executeJavaScript('Boolean(' + expression + ')'),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Renderer did not respond: ' + label)), 10_000)),
      ])
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const targetDiagnostics = await contents.executeJavaScript(`JSON.stringify({
    visibility: document.visibilityState,
    target: document.querySelector('[data-tutorial="nav-localRepos"]')?.getBoundingClientRect().toJSON(),
    selected: (()=>{const selector=document.querySelector('.tutorial-coach')?.dataset.target;const element=selector&&document.querySelector(selector);if(!element)return null;const ancestors=[];for(let p=element.parentElement;p&&p!==document.body;p=p.parentElement){const css=getComputedStyle(p);ancestors.push({class:p.className,rect:p.getBoundingClientRect().toJSON(),scrollTop:p.scrollTop,clientHeight:p.clientHeight,scrollHeight:p.scrollHeight,overflowY:css.overflowY,flex:css.flex,minHeight:css.minHeight});}return {selector,rect:element.getBoundingClientRect().toJSON(),display:getComputedStyle(element).display,ancestors};})(),
    workspace: document.querySelector('.tutorial-workspace')?.getBoundingClientRect().toJSON(),
    spotlight: document.querySelector('.tutorial-spotlight')?.outerHTML,
    surfaces: [...document.querySelectorAll('.tutorial-workspace [role="dialog"], .tutorial-workspace [role="menu"], .tutorial-workspace .topbar-dropdown, .tutorial-workspace .commit-search-toolbar__more-menu')]
      .map(element => ({ classes: element.className, rect: element.getBoundingClientRect().toJSON(), display: getComputedStyle(element).display }))
  })`);
  const nativeDiagnostics =
    parent && !parent.isDestroyed()
      ? {
          bounds: parent.getBounds(),
          contentBounds: parent.getContentBounds(),
          visible: parent.isVisible(),
          minimized: parent.isMinimized(),
          views: parent.contentView.children.map((view) => ({ bounds: view.getBounds() })),
        }
      : null;
  console.error('Native tutorial geometry:', JSON.stringify(nativeDiagnostics));
  throw new Error(
    'Timed out: ' +
      label +
      '\n' +
      targetDiagnostics +
      '\n' +
      (await contents.executeJavaScript('document.body.innerText.slice(-5000)')) +
      '\n' +
      errors.join('\n'),
  );
}
async function click(selector) {
  await waitFor(tutorial, 'document.querySelector(' + JSON.stringify(selector) + ')');
  await tutorial.executeJavaScript('document.querySelector(' + JSON.stringify(selector) + ').click()');
}
async function stepReady(id) {
  await waitFor(
    tutorial,
    'document.querySelector(".tutorial-coach:not([aria-busy=true])")?.dataset.step === ' +
      JSON.stringify(id) +
      ' && document.querySelector("[data-tutorial=primary]")',
  );
}
async function next() {
  await click('.tutorial-coach .tutorial-button.primary:not(:disabled)');
}
function visibleDialogField(selector) {
  return `(() => {const target=document.querySelector(${JSON.stringify(selector)});if(!target)return false;
    const control=target.matches('input,select,textarea')?target:target.querySelector('input,select,textarea')||target;
    const rect=control.getBoundingClientRect(),workspace=document.querySelector('.tutorial-workspace').getBoundingClientRect();
    const parent=target.closest('.dialog-content,[role=menu],.diff-content-scroll')?.getBoundingClientRect()||workspace;
    return rect.width>0&&rect.height>0&&rect.top>=Math.max(workspace.top,parent.top)-1&&rect.bottom<=Math.min(workspace.bottom,parent.bottom)+1;
  })()`;
}
function restoredEditorText(step) {
  const fields = [...(step.prepare?.fill || []), ...(step.prepare?.actions || []).filter((action) => action.fill).map((action) => action.fill)];
  const field = fields.find((entry) =>
    ['editor-readme', 'file-formats', 'editor-tools', 'structured-files', 'markup-files', 'tree-files', 'search-files', 'history-readme'].includes(
      entry.value?.example,
    ),
  );
  if (!field) return null;
  const fixture =
    field.value.example === 'editor-readme'
      ? 'editor-readme'
      : field.value.example === 'editor-tools'
        ? 'editor-tools'
        : field.value.example === 'structured-files'
          ? 'structured-files'
          : field.value.example === 'markup-files'
            ? 'markup-files'
            : field.value.example === 'tree-files'
              ? 'tree-files'
              : field.value.example === 'search-files'
                ? 'search-files'
                : field.value.example === 'history-readme'
                  ? 'history-readme'
                  : 'file-formats';
  const examples = {
    ...require('../src/tutorial/fixtures/' + fixture + '.json'),
    ...(fixture === 'editor-tools' ? require('../src/tutorial/fixtures/text-tools.json') : {}),
  };
  const text = examples[field.value.version][languageIndex];
  if (fixture === 'file-formats' && step.prepare?.after?.some((selector) => selector.includes('data-file-tab="table"'))) {
    return 'document.querySelector(".file-viewer[data-dirty=true] .working-csv-editor")';
  }
  if (fixture === 'file-formats' && step.prepare?.after?.some((selector) => selector.includes('data-file-tab="preview"'))) {
    return 'document.querySelector(".file-viewer[data-dirty=true][data-tab=preview]")';
  }
  const status = text.split('\n').find((line) => line.startsWith('Status:')) || text.split('\n')[0];
  return 'document.querySelector(".cm-content")?.innerText.includes(' + JSON.stringify(status) + ')';
}
function pressKey(keyCode) {
  tutorial.sendInputEvent({ type: 'keyDown', keyCode });
  tutorial.sendInputEvent({ type: 'keyUp', keyCode });
}
function chapterGroup(chapter) {
  if (chapter.id.startsWith('rebase-')) return chapter.id;
  if (chapter.id.startsWith('reset-')) return chapter.id;
  if (chapter.id === 'cherry-pick' || chapter.id.startsWith('cherry-pick-') || chapter.id === 'revert') return chapter.id;
  if (chapter.id.startsWith('amend-')) return chapter.id;
  if (chapter.id === 'reword' || chapter.id.startsWith('reword-')) return chapter.id;
  if (chapter.id === 'recovery' || chapter.id.startsWith('recovery-')) return chapter.id;
  if (chapter.id.startsWith('tags-')) return chapter.id;
  if (chapter.id.startsWith('submodules-')) return chapter.id;
  if (chapter.id === 'conflicts' || chapter.id.startsWith('conflicts-')) return chapter.id;
  if (chapter.id.startsWith('merge-')) return chapter.id;
  if (chapter.id.startsWith('stash-')) return chapter.id;
  if (chapter.id === 'branches' || chapter.id.startsWith('branches-')) return chapter.id;
  if (chapter.id === 'history' || chapter.id.startsWith('history-')) return chapter.id;
  if (chapter.id.startsWith('tree-')) return chapter.id;
  if (chapter.id.startsWith('search-')) return chapter.id;
  if (chapter.id === 'json-errors') return 'json-errors';
  if (chapter.section === 'localRepos') return 'repositories';
  for (const [prefix, group] of [
    ['staging-', 'staging'],
    ['diff-', 'diff'],
    ['files-', 'files'],
    ['formats-', 'formats'],
    ['editor-', 'editor'],
    ['text-', 'text'],
    ['codecs-', 'codecs'],
    ['hashes-', 'hashes'],
    ['json-', 'json'],
    ['yaml-', 'yaml'],
    ['markup-', 'markup'],
  ])
    if (chapter.id.startsWith(prefix)) return group;
  return 'curriculum';
}
async function launch(request) {
  console.log('Tutorial checkpoint:', request.chapterId, request.stepId);
  const result = await parent.webContents.executeJavaScript('window.electronAPI.app.startTutorial(' + JSON.stringify(request) + ')');
  assert.equal(result.success, true, result.error);
  for (let attempt = 0; attempt < 100; attempt++) {
    tutorial = webContents.getAllWebContents().find((contents) => contents.id !== parent.webContents.id && contents.getURL().includes('tutorial.html'));
    if (tutorial) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.ok(tutorial, 'A dedicated tutorial renderer was created.');
  await stepReady(request.stepId || TUTORIAL_CHAPTERS.find((chapter) => chapter.id === request.chapterId).steps[0].id);
  assert.deepEqual(await tutorial.executeJavaScript('({native:!!window.electronAPI,host:!!window.tutorialHost})'), { native: false, host: true });
  assert.equal(tutorial.session.isPersistent(), false);
  assert.notEqual(tutorial.session, parent.webContents.session);
}
async function close() {
  const current = tutorial;
  await tutorial.executeJavaScript('void window.tutorialHost.close()').catch((error) => {
    if (!current.isDestroyed()) throw error;
  });
  for (let attempt = 0; !current.isDestroyed() && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(current.isDestroyed());
  tutorial = null;
}
require(path.join(root, 'dist-electron/electron/main.js'));
app
  .whenReady()
  .then(async () => {
    while (!parent) await new Promise((resolve) => setTimeout(resolve, 30));
    await waitFor(parent.webContents, 'window.electronAPI?.app?.startTutorial && document.querySelector(".activity-bar")');
    if (fresh) {
      await waitFor(parent.webContents, 'document.querySelector(".tutorial-welcome")');
      await parent.webContents.executeJavaScript('document.querySelector(".tutorial-welcome .tutorial-entry-actions button:last-child").click()');
      await waitFor(parent.webContents, '!document.querySelector(".tutorial-welcome")');
      assert.equal((await parent.webContents.executeJavaScript('window.electronAPI.app.getTutorialProgress()')).welcomeSeen, true);
      verified = true;
      fs.writeFileSync(path.join(profile, 'tutorial-verified'), 'yes');
      clearTimeout(timeout);
      console.log('Native fresh-profile welcome and skip checks passed.');
      app.quit();
      return;
    }
    assert.equal(
      (await parent.webContents.executeJavaScript('window.electronAPI.app.getTutorialProgress()')).welcomeSeen,
      true,
      'Existing installations do not receive onboarding.',
    );
    await parent.webContents.executeJavaScript(
      'localStorage.setItem("tutorial-isolation-sentinel","private workspace"); window.unsavedTutorialTestDraft = "my unfinished draft"',
    );
    if (isolation) {
      await isolation.verify({ parent, getTutorial: () => tutorial, launch, close, stepReady, click, waitFor, workspace, profile, languageIndex });
      assert.equal(regularIpcFromTutorial, 0, 'Practice mutations cannot use native repository IPC.');
      assert.equal(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'), settings);
      assert.deepEqual(errors, []);
      await isolation.prepareShutdown(workspace, profile, fail);
      verified = true;
      fs.writeFileSync(path.join(profile, 'tutorial-verified'), 'yes');
      clearTimeout(timeout);
      app.quit();
      return;
    }
    if (group === 'checkpoint') {
      const [chapterId, stepId] = process.env.OGC_TUTORIAL_TEST_CHECKPOINT.split('/');
      parent.setSize(900, 640);
      await launch({ chapterId, stepId });
      await waitFor(tutorial, 'document.querySelector(".tutorial-highlight")');
      const step = TUTORIAL_CHAPTERS.find((chapter) => chapter.id === chapterId).steps.find((step) => step.id === stepId);
      const restored = restoredEditorText(step);
      if (restored) await waitFor(tutorial, restored, 'The restored editor uses the launch language.');
      if (chapterId === 'json-schema' && stepId === 'contract') await require('./tutorial-schema-layout.cjs')(parent, tutorial, waitFor);
      if (
        step.target.startsWith('[data-dialog-field=') ||
        step.target.startsWith('[data-tutorial="ignore-') ||
        (chapterId.startsWith('diff-') && (step.action || step.completion))
      )
        await waitFor(tutorial, visibleDialogField(step.target), 'The restored control is visible inside its compact dialog or menu');
      assert.equal(await tutorial.executeJavaScript('document.querySelectorAll(".action-toast.error").length'), 0);
      assert.equal(regularIpcFromTutorial, 0);
      await close();
      assert.equal(await parent.webContents.executeJavaScript('window.unsavedTutorialTestDraft'), 'my unfinished draft');
      assert.equal(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'), settings);
      clearTimeout(timeout);
      verified = true;
      fs.writeFileSync(path.join(profile, 'tutorial-verified'), 'yes');
      console.log('Native compact checkpoint passed:', chapterId, stepId);
      app.quit();
      return;
    }
    const completedChapters = [];
    if (['all', 'curriculum'].includes(group)) {
      await require('./tutorial-curriculum-smoke.cjs')({
        getTutorial: () => tutorial,
        launch,
        close,
        click,
        next,
        stepReady,
        waitFor,
        pressKey,
        parent,
        languageIndex,
      });
      completedChapters.push('basics', 'changes', 'commit');
    }
    if (['all', 'repositories'].includes(group)) {
      await require('./tutorial-repositories-smoke.cjs')({
        getTutorial: () => tutorial,
        launch,
        close,
        click,
        next,
        stepReady,
        waitFor,
        parent,
        languageIndex,
      });
      completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapter.section === 'localRepos').map((chapter) => chapter.id));
    }
    if (['all', 'staging'].includes(group)) {
      await require('./tutorial-staging-smoke.cjs')({
        getTutorial: () => tutorial,
        launch,
        close,
        click,
        next,
        stepReady,
        waitFor,
        pressKey,
        parent,
        languageIndex,
      });
      completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapter.id.startsWith('staging-')).map((chapter) => chapter.id));
    }
    if (['all', 'diff'].includes(group)) {
      await require('./tutorial-diff-smoke.cjs')({ getTutorial: () => tutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent });
      completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapter.id.startsWith('diff-')).map((chapter) => chapter.id));
    }
    if (['all', 'files'].includes(group)) {
      await require('./tutorial-files-smoke.cjs')({
        getTutorial: () => tutorial,
        launch,
        close,
        click,
        next,
        stepReady,
        waitFor,
        pressKey,
        parent,
        languageIndex,
      });
      completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapter.id.startsWith('files-')).map((chapter) => chapter.id));
    }
    if (['all', 'formats'].includes(group)) {
      await require('./tutorial-formats-smoke.cjs')({
        getTutorial: () => tutorial,
        launch,
        close,
        click,
        next,
        stepReady,
        waitFor,
        pressKey,
        parent,
        languageIndex,
      });
      completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapter.id.startsWith('formats-')).map((chapter) => chapter.id));
    }
    if (['all', 'editor'].includes(group)) {
      await require('./tutorial-editor-smoke.cjs')({ getTutorial: () => tutorial, launch, close, click, next, stepReady, waitFor, pressKey, parent });
      completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapter.id.startsWith('editor-')).map((chapter) => chapter.id));
    }
    for (const family of [
      'text',
      'codecs',
      'hashes',
      'json',
      'yaml',
      'markup',
      'json-errors',
      'tree-create',
      'tree-rename',
      'tree-copy',
      'tree-replace',
      'tree-move',
      'tree-delete',
      'search-names',
      'search-content',
      'search-one',
      'search-all',
      'history',
      'history-files',
      'history-blame',
      'history-sources',
      'history-search',
      'history-forensic-string',
      'history-forensic-lines',
      'history-forensic-regex',
      'branches',
      'branches-switch',
      'branches-manage',
      'branches-unmerged',
      'branches-cleanup',
      'branches-cleanup-protection',
      'branches-cleanup-unmerged',
      'branches-carry-review',
      'branches-carry',
      'branches-park',
      'branches-park-restore',
      'stash-file',
      'stash-all',
      'stash-files',
      'stash-branch',
      'merge-review',
      'merge-fast-forward',
      'merge-commit',
      'merge-squash',
      'merge-outward',
      'merge-diverged',
      'merge-ff-guard',
      'merge-squash-diverged',
      'merge-revert',
      'amend-message',
      'amend-files',
      'reword',
      'reword-protected',
      'reword-referenced',
      'rebase-review',
      'rebase-reword',
      'rebase-squash',
      'rebase-fixup',
      'rebase-drop',
      'rebase-reorder',
      'rebase-edit',
      'rebase-staged',
      'rebase-conflict',
      'rebase-abort',
      'rebase-root',
      'rebase-off-head',
      'rebase-merge-guard',
      'cherry-pick',
      'cherry-pick-conflict',
      'cherry-pick-abort',
      'revert',
      'reset-soft',
      'reset-mixed',
      'reset-hard',
      'recovery',
      'recovery-message',
      'recovery-inspect',
      'recovery-reset',
      'tags-navigation',
      'tags-lightweight',
      'tags-annotated',
      'tags-delete',
      'submodules-navigation',
      'submodules-initialize',
      'submodules-update',
      'submodules-sync',
      'conflicts',
      'conflicts-choices',
      'conflicts-manual',
      'conflicts-abort',
      'conflicts-multiple',
      'conflicts-deletion',
    ])
      if (['all', family].includes(group)) {
        await require('./tutorial-text-tools-smoke.cjs')({
          getTutorial: () => tutorial,
          launch,
          close,
          click,
          next,
          stepReady,
          waitFor,
          pressKey,
          parent,
          languageIndex,
          family,
          chapterIds: TUTORIAL_CHAPTERS.filter((chapter) => chapterGroup(chapter) === family).map((chapter) => chapter.id),
        });
        completedChapters.push(...TUTORIAL_CHAPTERS.filter((chapter) => chapterGroup(chapter) === family).map((chapter) => chapter.id));
      }
    tutorial = null;
    assert.equal(chapterCompletions, completedChapters.length, 'Each guided lesson is saved exactly once.');
    const chaptersToCheck = TUTORIAL_CHAPTERS.filter((chapter) => group === 'all' || chapterGroup(chapter) === group);
    assert.equal(await parent.webContents.executeJavaScript('window.unsavedTutorialTestDraft'), 'my unfinished draft');
    assert.equal(await parent.webContents.executeJavaScript('localStorage.getItem("tutorial-isolation-sentinel")'), 'private workspace');
    for (const chapter of chaptersToCheck) {
      await launch({ chapterId: chapter.id, stepId: chapter.steps.at(-1).id });
      await waitFor(tutorial, 'document.querySelector(".tutorial-highlight")');
      assert.equal(
        await tutorial.executeJavaScript('document.querySelectorAll(".action-toast.error").length'),
        0,
        chapter.id +
          ': ' +
          (await tutorial.executeJavaScript('Array.from(document.querySelectorAll(".action-toast.error .toast-msg"),node=>node.textContent).join("; ")')),
      );
      const body = await tutorial.executeJavaScript('document.body.innerText');
      assert.ok(body.includes(language === 'de' ? 'Übungsmodus' : 'Practice mode'), chapter.id);
      assert.ok(!body.includes('my unfinished draft'), chapter.id);
      await close();
    }
    // Independently reset every step in one renderer, including direct FAQ
    // entries that must not depend on earlier chapters or existing caches.
    await launch({ chapterId: 'basics' });
    for (const chapter of chaptersToCheck)
      for (const step of chapter.steps) {
        const request = { chapterId: chapter.id, stepId: step.id };
        await tutorial.executeJavaScript('window.dispatchEvent(new CustomEvent("tutorial:launch", {detail:' + JSON.stringify(request) + '}))');
        await stepReady(step.id);
        if (chapter.id === 'branches' || chapter.id.startsWith('branches-'))
          await require('./tutorial-branches-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('stash-'))
          await require('./tutorial-stash-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('amend-'))
          await require('./tutorial-amend-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('tags-'))
          await require('./tutorial-tags-assertions.cjs')({ chapter, step, run: (code) => tutorial.executeJavaScript(code), waitFor, tutorial, languageIndex });
        if (chapter.id.startsWith('submodules-'))
          await require('./tutorial-submodule-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('rebase-'))
          await require('./tutorial-rebase-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id === 'reword' || chapter.id.startsWith('reword-'))
          await require('./tutorial-reword-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id === 'cherry-pick' || chapter.id === 'revert')
          await require('./tutorial-replay-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('cherry-pick-'))
          await require('./tutorial-cherry-conflict-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('reset-'))
          await require('./tutorial-reset-mode-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id === 'recovery' || chapter.id.startsWith('recovery-'))
          await require('./tutorial-recovery-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id.startsWith('merge-'))
          await require('./tutorial-merge-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        if (chapter.id === 'conflicts' || chapter.id.startsWith('conflicts-'))
          await require('./tutorial-conflict-assertions.cjs')({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            waitFor,
            tutorial,
            languageIndex,
          });
        const restored = restoredEditorText(step);
        if (restored) await waitFor(tutorial, restored, 'The restored editor uses the launch language: ' + chapter.id + '/' + step.id);
        await waitFor(
          tutorial,
          'document.querySelector(".tutorial-coach-progress")?.innerText.startsWith(' + JSON.stringify(chapter.title[languageIndex]) + ')',
        );
        await waitFor(tutorial, 'document.querySelector(".tutorial-highlight")');
        if (
          step.target.startsWith('[data-dialog-field=') ||
          step.target.startsWith('[data-tutorial="ignore-') ||
          (chapter.id.startsWith('diff-') && (step.action || step.completion))
        )
          await waitFor(tutorial, visibleDialogField(step.target), 'The control is visible inside its dialog or menu: ' + chapter.id + '/' + step.id);
        const expectedErrors = chapter.id.startsWith('merge-') ? require('./tutorial-merge-assertions.cjs').expectedErrors(step) : 0;
        if (require('./tutorial-rebase-pause-assertions.cjs').isPause(chapter.id))
          await require('./tutorial-rebase-pause-assertions.cjs').verifyFeedback({ chapter, step, run: (code) => tutorial.executeJavaScript(code) });
        else if (require('./tutorial-rebase-guard-assertions.cjs').isGuard(chapter.id))
          await require('./tutorial-rebase-guard-assertions.cjs').verifyFeedback({
            chapter,
            step,
            run: (code) => tutorial.executeJavaScript(code),
            languageIndex,
          });
        else
          assert.equal(await tutorial.executeJavaScript('document.querySelectorAll(".action-toast.error").length'), expectedErrors, chapter.id + '/' + step.id);
      }
    await tutorial.executeJavaScript('window.dispatchEvent(new CustomEvent("tutorial:launch", {detail:{chapterId:"run",stepId:"start"}}))');
    await stepReady('start');
    await click('.topbar-more-toggle');
    await click('[data-topbar-more-run]:not(:disabled)');
    await waitFor(
      tutorial,
      'Array.from(document.querySelectorAll(".topbar-dropdown-item-label")).some(label => label.textContent.trim() === "Test" && !label.closest("button").disabled)',
    );
    await waitFor(
      tutorial,
      `(() => {
      const menu = document.querySelector('.topbar-dropdown');
      const highlight = document.querySelector('.tutorial-highlight');
      if (!menu || !highlight) return false;
      const bounds = menu.getBoundingClientRect();
      const focused = highlight.getBoundingClientRect();
      return focused.left <= bounds.left && focused.right >= bounds.right && focused.top <= bounds.top;
    })()`,
      'Opened menus stay clear inside the spotlight',
    );
    await tutorial.executeJavaScript(
      'Array.from(document.querySelectorAll(".topbar-dropdown-item-label")).find(label => label.textContent.trim() === "Test").closest("button").click()',
    );
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    parent.setSize(900, 640);
    await waitFor(tutorial, 'window.innerWidth <= 900 && document.querySelector(".tutorial-coach").getBoundingClientRect().bottom <= window.innerHeight');
    await waitFor(
      tutorial,
      `(() => {
      const area = document.querySelector('.tutorial-workspace').getBoundingClientRect();
      const bounds = document.querySelector('.tutorial-spotlight')?.getBoundingClientRect();
      return bounds && bounds.width === area.width && bounds.top === area.top && bounds.bottom === area.bottom;
    })()`,
      'The spotlight follows a smaller window',
    );
    await tutorial.executeJavaScript('document.querySelector(".tutorial-coach button").focus()');
    tutorial.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    tutorial.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await waitFor(tutorial, 'document.activeElement?.tagName === "BUTTON"');
    await close();
    await launch({ chapterId: 'basics' });
    const crashed = tutorial;
    crashed.forcefullyCrashRenderer();
    for (let attempt = 0; !crashed.isDestroyed() && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(crashed.isDestroyed(), 'A failed tutorial renderer is disposed.');
    tutorial = null;
    await waitFor(
      parent.webContents,
      'Array.from(document.querySelectorAll(".action-toast.error")).some(toast => toast.textContent.includes(' +
        JSON.stringify(language === 'de' ? 'Einführung' : 'introduction') +
        '))',
    );
    assert.equal(await parent.webContents.executeJavaScript('window.unsavedTutorialTestDraft'), 'my unfinished draft');
    const progress = await parent.webContents.executeJavaScript('window.electronAPI.app.getTutorialProgress()');
    for (const chapter of completedChapters) assert.ok(progress.completedChapters.includes(chapter));
    assert.equal(regularIpcFromTutorial, 0, 'Tutorial actions must never use the native application IPC.');
    assert.equal(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'), settings, 'Tutorial settings must not affect the real profile.');
    assert.deepEqual(errors, [], 'The tutorial must render without errors.');
    clearTimeout(timeout);
    console.log('Native tutorial automatic progression, isolation, staging, commit and chapter entry smoke tests passed.');
    verified = true;
    fs.writeFileSync(path.join(profile, 'tutorial-verified'), 'yes');
    app.quit();
  })
  .catch(fail);
app.on('will-quit', () => {
  if (!verified) console.error('Application quit before tutorial verification.');
});
