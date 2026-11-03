const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const profile = process.env.OGC_STAGING_UI_PROFILE;
const repo = process.env.OGC_STAGING_UI_REPOSITORY;
if (!profile || !repo) throw new Error('An isolated staging fixture is required.');
app.disableHardwareAcceleration();
app.setPath('userData', profile);
app.setPath('sessionData', path.join(profile, 'session'));
let parent,
  waiting = 0,
  release;
const held = new Promise((resolve) => {
  release = resolve;
});
const { WorkingTreeService } = require('../dist-electron/electron/WorkingTreeService.js');
const original = WorkingTreeService.prototype.getSnapshot;
WorkingTreeService.prototype.getSnapshot = async function (...args) {
  const result = await original.apply(this, args);
  waiting++;
  await held;
  return result;
};
const errors = [];
const fail = (error) => {
  release();
  console.error(error);
  if (errors.length) console.error('Renderer errors:', errors);
  app.exit(1);
};
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
const timeout = setTimeout(() => fail(new Error('Native staging checks timed out.')), 60000);
timeout.unref();
app.on('web-contents-created', (_event, contents) => {
  contents.setBackgroundThrottling(false);
  contents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message);
  });
  contents.on('preload-error', (_event, _file, error) => fail(error));
});
app.on('browser-window-created', (_event, window) => {
  parent = window;
  window.showInactive();
});
async function until(check, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out: ' + label + '\n' + (await parent.webContents.executeJavaScript('document.body.innerText.slice(-3500)')));
}
async function measure(mode, selector, count) {
  const elapsed = await parent.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const root = document.querySelector('.staging-container');
    const button = document.querySelector(${JSON.stringify(selector)});
    if (!button || button.disabled) { reject(new Error('Missing enabled staging action')); return; }
    const started = performance.now();
    let finished = false;
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Staging did not finish independently of the held snapshot')); }, 10000);
    const check = () => {
      const displayed = root.querySelector('.staging-section .staging-count')?.textContent;
      if (!finished && root.getAttribute('aria-busy') === 'false' && Number(displayed) === ${count}) {
        finished = true;
        observer.disconnect();
        requestAnimationFrame(() => { clearTimeout(timeout); resolve(performance.now() - started); });
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    button.click();
  })`);
  console.log(JSON.stringify({ mode, clickToFrameMs: Math.round(elapsed), fullSnapshotStillHeld: true }));
  assert.ok(elapsed < 10000, 'The full snapshot must not block the file list.');
  return { mode, clickToFrameMs: elapsed };
}
require('../dist-electron/electron/main.js');
app
  .whenReady()
  .then(async () => {
    await until(
      () => parent && parent.webContents.executeJavaScript('Boolean(document.querySelector(".staging-stage-all:not(:disabled)"))'),
      'Initial working tree',
    );
    await until(() => waiting > 0, 'Full snapshot held in flight');
    const results = [];
    results.push(await measure('single', '.staging-file-row .staging-btn[title="Stage"]', 1));
    await parent.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('.staging-search-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'file-1'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await until(
      () =>
        parent.webContents.executeJavaScript(
          `Boolean(document.querySelector(${JSON.stringify('button[title="Stage all displayed changes in this section"]:not(:disabled)')}))`,
        ),
      'Filtered section',
    );
    const first = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: repo, windowsHide: true, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    const matched = Array.from({ length: 400 }, (_, i) => `file-${i}.txt`).filter((name) => name.includes('file-1'));
    const expected = new Set([...first, ...matched]);
    results.push(await measure('filtered', 'button[title="Stage all displayed changes in this section"]', matched.length));
    const actual = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: repo, windowsHide: true, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    assert.deepEqual(new Set(actual), expected, 'Filtered staging must not add hidden files.');
    await parent.webContents.executeJavaScript(
      `(() => { const input = document.querySelector('.staging-search-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,''); input.dispatchEvent(new Event('input',{bubbles:true})); })()`,
    );
    await until(() => parent.webContents.executeJavaScript('Boolean(document.querySelector(".staging-stage-all:not(:disabled)"))'), 'Whole repository action');
    results.push(await measure('repository', '.staging-stage-all', 400));
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: repo, windowsHide: true, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    assert.equal(staged.length, 400);
    release();
    assert.deepEqual(errors, [], 'No unhandled renderer failures.');
    fs.writeFileSync(path.resolve(__dirname, '../build/staging-ui.json'), JSON.stringify(results, null, 2) + '\n');
    fs.writeFileSync(path.join(profile, 'verified'), 'yes');
    clearTimeout(timeout);
    console.log('Native staging status-first and filter safety checks passed.');
    app.quit();
  })
  .catch(fail);
