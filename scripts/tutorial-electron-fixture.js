const { app, webContents, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const profile = process.env.OGC_TUTORIAL_TEST_PROFILE;
app.disableHardwareAcceleration();
if (!profile) throw new Error('A temporary tutorial test profile is required.');
app.setPath('userData', profile);
app.setPath('sessionData', path.join(profile, 'session'));
const root = path.join(__dirname, '..');
const fresh = process.env.OGC_TUTORIAL_TEST_FRESH === '1';
if (fresh) {
  const { TutorialProgressStore } = require(path.join(root, 'dist-electron/electron/main-process/tutorialProgress.js'));
  assert.equal(new TutorialProgressStore(profile).snapshot().welcomeSeen, false, 'A genuinely fresh Electron profile is eligible for the welcome.');
}
const settings = JSON.stringify({
  language: 'de',
  autoUpdateEnabled: false,
  autoUpdateCheckEnabled: false,
  userNotesCheckEnabled: false,
  automaticMaintenanceEnabled: false,
});
fs.writeFileSync(path.join(profile, 'settings.json'), settings);
fs.writeFileSync(path.join(profile, 'repos.json'), JSON.stringify({ repos: [], activeRepo: null, sortBy: 'lastOpenedDesc' }));
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
    workspace: document.querySelector('.tutorial-workspace')?.getBoundingClientRect().toJSON(),
    spotlight: document.querySelector('.tutorial-spotlight')?.outerHTML,
    surfaces: [...document.querySelectorAll('.tutorial-workspace [role="dialog"], .tutorial-workspace [role="menu"], .tutorial-workspace .topbar-dropdown, .tutorial-workspace .commit-search-toolbar__more-menu')]
      .map(element => ({ classes: element.className, rect: element.getBoundingClientRect().toJSON(), display: getComputedStyle(element).display }))
  })`);
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
    'document.querySelector(".tutorial-coach")?.dataset.step === ' + JSON.stringify(id) + ' && document.querySelector("[data-tutorial=primary]")',
  );
}
async function next() {
  await click('.tutorial-coach .tutorial-button.primary:not(:disabled)');
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
    await launch({ chapterId: 'basics' });
    await tutorial.executeJavaScript('new Promise(resolve => setTimeout(resolve, 1200))');
    assert.equal(await tutorial.executeJavaScript('document.querySelector(".tutorial-coach").dataset.step'), 'orientation', 'Information steps wait for Next.');
    await next();
    await stepReady('repositories');
    await waitFor(tutorial, 'document.querySelector(".tutorial-target-arrow") && document.querySelector(".tutorial-focus-shade")');
    assert.deepEqual(
      await tutorial.executeJavaScript(`(() => {
        const target = document.querySelector('[data-tutorial="nav-localRepos"]');
        const rect = target.getBoundingClientRect();
        const spotlight = document.querySelector('.tutorial-spotlight');
        const shade = document.querySelector('.tutorial-focus-shade');
        const area = document.querySelector('.tutorial-workspace').getBoundingClientRect();
        const bounds = spotlight.getBoundingClientRect();
        return {
          clickable: target.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)),
          shaded: Number(getComputedStyle(shade).fillOpacity) > 0,
          pointer: document.querySelector('.tutorial-target-arrow').dataset.direction,
          withinWorkspace: bounds.top === area.top && bounds.bottom === area.bottom,
          controlsClear: bounds.bottom <= document.querySelector('.tutorial-coach').getBoundingClientRect().top,
        };
      })()`),
      { clickable: true, shaded: true, pointer: 'right', withinWorkspace: true, controlsClear: true },
      'The spotlight dims the workspace, points to the small navigation target and keeps it clickable.',
    );
    await tutorial.executeJavaScript(
      'Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 250))])',
    );
    fs.writeFileSync(path.join(root, 'build/tutorial-pointer-smoke.png'), (await tutorial.capturePage()).toPNG());
    await click('[data-tutorial="nav-localRepos"]');
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    await click('.tutorial-coach .tutorial-link:last-child');
    await waitFor(tutorial, 'document.querySelector(".tutorial-chapter-chooser")');
    await tutorial.executeJavaScript('new Promise(resolve => setTimeout(resolve, 1200))');
    assert.equal(
      await tutorial.executeJavaScript('document.querySelector(".tutorial-coach").dataset.step'),
      'repositories',
      'Chapter selection pauses progression.',
    );
    await click('[aria-label="Kapitelwahl schließen"]');
    await stepReady('workspace');
    await click('.local-repositories-view__row-main');
    await stepReady('changes');
    await click('.staging-file-row');
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    await stepReady('stage');
    assert.equal(await tutorial.executeJavaScript('localStorage.getItem("tutorial-isolation-sentinel")'), null);
    await click('.staging-stage-all:not(:disabled)');
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    await tutorial.executeJavaScript(
      'Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 250))])',
    );
    fs.writeFileSync(path.join(root, 'build/tutorial-smoke.png'), (await tutorial.capturePage()).toPNG());
    await stepReady('commit');
    await waitFor(tutorial, 'document.querySelector(".staging-commit-area input")');
    await tutorial.executeJavaScript(
      '(() => { const input=document.querySelector(".staging-commit-area input"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"docs: My practice commit"); input.dispatchEvent(new Event("input",{bubbles:true})); })()',
    );
    await click('.staging-commit-btn:not(:disabled)');
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    await stepReady('branch');
    await click('[data-tutorial="create-branch"]');
    await waitFor(tutorial, 'document.querySelector("input[placeholder=branch-name]")');
    await tutorial.executeJavaScript(
      '(() => { const input=document.querySelector("input[placeholder=branch-name]"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(input,"feature/practice"); input.dispatchEvent(new Event("input",{bubbles:true})); })()',
    );
    await tutorial.executeJavaScript(
      'document.querySelector("input[placeholder=branch-name]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))',
    );
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    await stepReady('sync');
    await click('[data-tutorial="fetch"]:not(:disabled)');
    await waitFor(tutorial, 'document.querySelector(".tutorial-status.completed")');
    await stepReady('help');
    await click('[data-tutorial="nav-settings"]');
    await waitFor(tutorial, 'document.querySelector(".tutorial-chapter-chooser")');
    assert.equal(chapterCompletions, 1, 'The basic tour advances and completes automatically exactly once.');
    await close();
    assert.equal(await parent.webContents.executeJavaScript('window.unsavedTutorialTestDraft'), 'my unfinished draft');
    assert.equal(await parent.webContents.executeJavaScript('localStorage.getItem("tutorial-isolation-sentinel")'), 'private workspace');
    for (const chapter of TUTORIAL_CHAPTERS) {
      await launch({ chapterId: chapter.id, stepId: chapter.steps.at(-1).id });
      await waitFor(tutorial, 'document.querySelector(".tutorial-highlight")');
      assert.equal(await tutorial.executeJavaScript('document.querySelectorAll(".action-toast.error").length'), 0, chapter.id);
      const body = await tutorial.executeJavaScript('document.body.innerText');
      assert.ok(body.includes('Übungsmodus'), chapter.id);
      assert.ok(!body.includes('my unfinished draft'), chapter.id);
      await close();
    }
    // Independently reset every step in one renderer, including direct FAQ
    // entries that must not depend on earlier chapters or existing caches.
    await launch({ chapterId: 'basics' });
    for (const chapter of TUTORIAL_CHAPTERS)
      for (const step of chapter.steps) {
        const request = { chapterId: chapter.id, stepId: step.id };
        await tutorial.executeJavaScript('window.dispatchEvent(new CustomEvent("tutorial:launch", {detail:' + JSON.stringify(request) + '}))');
        await stepReady(step.id);
        await waitFor(tutorial, 'document.querySelector(".tutorial-coach-progress")?.innerText.startsWith(' + JSON.stringify(chapter.title[0]) + ')');
        await waitFor(tutorial, 'document.querySelector(".tutorial-highlight")');
        assert.equal(await tutorial.executeJavaScript('document.querySelectorAll(".action-toast.error").length'), 0, chapter.id + '/' + step.id);
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
    await waitFor(parent.webContents, 'Array.from(document.querySelectorAll(".action-toast.error")).some(toast => toast.textContent.includes("Einführung"))');
    assert.equal(await parent.webContents.executeJavaScript('window.unsavedTutorialTestDraft'), 'my unfinished draft');
    const progress = await parent.webContents.executeJavaScript('window.electronAPI.app.getTutorialProgress()');
    assert.ok(progress.completedChapters.includes('basics'));
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
