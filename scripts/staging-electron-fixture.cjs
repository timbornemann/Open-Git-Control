const { app, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const profile = process.env.OGC_STAGING_UI_PROFILE;
const repo = process.env.OGC_STAGING_UI_REPOSITORY;
if (!profile || !repo) throw new Error('An isolated staging fixture is required.');
const showMessageBox = dialog.showMessageBox.bind(dialog);
let backupDeletionPrompts = 0;
dialog.showMessageBox = (...args) => {
  switch (args.at(-1)?.message) {
    case 'Restore branch reference?':
      return Promise.resolve({ response: 1, checkboxChecked: false });
    case 'Permanently delete backup?':
      return Promise.resolve({ response: backupDeletionPrompts++ === 0 ? 0 : 1, checkboxChecked: false });
    default:
      return showMessageBox(...args);
  }
};
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
      const displayed = root.querySelector('[data-tutorial="staged-files"] .staging-count')?.textContent;
      if (!finished && root.getAttribute('aria-busy') === 'false' && Number(displayed?.split('/')[0]) === ${count}) {
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
async function clickButton(scope, text) {
  await parent.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find(item => item.textContent.trim() === ${JSON.stringify(text)});
    if (!button || button.disabled) throw new Error('Missing enabled button: ' + ${JSON.stringify(text)});
    button.click();
  })()`);
}

async function fill(selector, value) {
  await parent.webContents.executeJavaScript(`(() => {
    const field = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

async function verifyStagingLayout() {
  const partial = 'src/settings/index.ts';
  const namesake = 'tests/settings/index.ts';
  const previous = 'src/settings/legacy.ts';
  const renamed = 'src/settings/current.ts';
  const deep = 'src/settings/internationalization/component-rendering/highlighted-messages/dialogs/config.ts';
  const git = (...args) => execFileSync('git', args, { cwd: repo, windowsHide: true });
  const read = (source) => parent.webContents.executeJavaScript(source);
  const row = (section, file) => `[data-tutorial="${section}-files"] .staging-file-row[aria-label="${file}"]`;

  fs.appendFileSync(path.join(repo, partial), 'export const staged = true;\n');
  git('add', '--', partial);
  fs.appendFileSync(path.join(repo, partial), 'export const working = true;\n');
  fs.appendFileSync(path.join(repo, namesake), 'export const test = true;\n');
  git('mv', '--', previous, renamed);
  fs.mkdirSync(path.dirname(path.join(repo, deep)), { recursive: true });
  fs.writeFileSync(path.join(repo, deep), 'export const config = {};\n');

  await fill('.staging-search-input', 'settings/');
  await until(() => read(`Boolean(document.querySelector(${JSON.stringify(row('untracked', deep))}))`), 'Mixed staging groups');

  for (const width of [280, 560]) {
    const geometry = await read(`(() => {
      const pane = document.querySelector('.inspector-pane');
      pane.style.width = '${width}px';
      pane.style.flex = '0 0 ${width}px';
      const viewport = pane.querySelector('.staging-change-list');
      const rows = [...viewport.querySelectorAll('.staging-file-row')];
      const deepRow = viewport.querySelector(${JSON.stringify(row('untracked', deep))});
      const prefix = deepRow.querySelector('.staging-directory-prefix');
      const last = deepRow.querySelector('.staging-directory-name');
      const lastBounds = last.getBoundingClientRect();
      return {
        width: pane.getBoundingClientRect().width,
        heights: rows.map(row => row.getBoundingClientRect().height),
        directories: rows.filter(row => row.querySelector('.staging-file-name').textContent === 'index.ts').map(row => row.querySelector('.staging-directory').textContent),
        partial: viewport.querySelectorAll('.staging-partial').length,
        pathFits: lastBounds.right <= deepRow.querySelector('.staging-actions').getBoundingClientRect().left,
        prefixClips: prefix.scrollWidth > prefix.clientWidth,
        suffixVisible: last.textContent === 'dialogs/' && last.scrollWidth <= last.clientWidth,
        actionsFit: rows.every(row => row.querySelector('.staging-actions').getBoundingClientRect().right <= viewport.getBoundingClientRect().left + viewport.clientWidth),
        renamedTitle: viewport.querySelector(${JSON.stringify(row('staged', renamed))}).querySelector('.staging-path').title
      };
    })()`);
    assert.ok(Math.abs(geometry.width - width) < 1, `Verify actual inspector width ${width}.`);
    assert.deepEqual(geometry.heights, [40, 40, 40, 40, 40]);
    assert.deepEqual(geometry.directories, ['src/settings/', 'src/settings/', 'tests/settings/']);
    assert.equal(geometry.partial, 2);
    assert.ok(geometry.pathFits && geometry.suffixVisible && geometry.actionsFit, 'The path and buttons fit in the pane.');
    assert.ok(geometry.prefixClips, `A deep path clips its prefix at ${width}px.`);
    assert.equal(geometry.renamedTitle, `${renamed}\nPreviously ${previous}`);
  }

  await fill('[data-tutorial="commit-message"]', 'Keep the staging draft');
  for (const section of ['staged', 'unstaged']) {
    await read(`document.querySelector(${JSON.stringify(row(section, partial))}).click()`);
    await until(
      () => read(`document.querySelector('.commit-file-details__revision')?.textContent.trim().toLowerCase() === '${section} changes'`),
      `${section} file inspector`,
    );
    assert.equal(await read("document.querySelector('.staging-search-input').value"), 'settings/');
    assert.equal(await read("document.querySelector('[data-tutorial=commit-message]').value"), 'Keep the staging draft');
  }

  await fill('.staging-search-input', 'never-matches-this-fixture');
  await until(() => read("document.querySelector('.staging-empty-search')?.textContent === 'No matching files'"), 'No search results');
  await fill('.staging-search-input', '');
  await read(`(() => {
    document.querySelector('[aria-label="Close file details"]').click();
    const pane = document.querySelector('.inspector-pane');
    pane.style.removeProperty('width');
    pane.style.removeProperty('flex');
    pane.querySelector('.staging-change-list').scrollTop = 320;
  })()`);
  assert.ok(
    await read(`(() => {
    const viewport = document.querySelector('.staging-change-list');
    const header = viewport.querySelector('[data-tutorial="staged-files"] .staging-change-header');
    return viewport.scrollTop === 320 && Math.abs(header.getBoundingClientRect().top - viewport.getBoundingClientRect().top) < 1;
  })()`),
    'The active group header stays visible while its file rows scroll.',
  );

  git('restore', '--source=HEAD', '--staged', '--worktree', '--', partial, namesake, previous, renamed);
  fs.unlinkSync(path.join(repo, deep));
  // Start the recovery scenario with the restored repository and an empty file viewer.
  const reloaded = new Promise((resolve) => parent.webContents.once('did-finish-load', resolve));
  parent.webContents.reload();
  await reloaded;
  await until(
    () =>
      read(`(() => {
      const list = document.querySelector('.staging-change-list');
      return list?.querySelector('[data-tutorial="staged-files"] .staging-count')?.textContent === '400'
        && !list.querySelector('[data-tutorial="unstaged-files"], [data-tutorial="untracked-files"]');
    })()`),
    'Original staging fixture restored in the commit graph',
  );
}

async function verifyBackupSettings() {
  const view = '#settings-branch-backups';
  await clickButton('.recovery-center', 'Repository backups');
  const read = (source) => parent.webContents.executeJavaScript(source);
  await until(() => read('Boolean(document.querySelector(".backup-repository input"))'), 'Backup settings page');
  await clickButton(view, 'Select all');
  await until(() => read('Boolean(document.querySelector(".backup-repository input:checked"))'), 'Select repository for automatic backup');
  await clickButton(view, 'Deselect all');
  await until(() => read('Boolean(document.querySelector(".backup-repository input:not(:checked)"))'), 'Clear automatic backup selection');
  await clickButton(view, 'Back up now');
  await until(
    () => read('document.querySelector(".backup-total")?.textContent.includes("1 version at this destination")'),
    'Manual backup at default location',
  );
  await read('document.querySelector(".backup-repository details").open = true');
  await clickButton('.backup-versions', 'Delete …');
  await until(
    async () => backupDeletionPrompts === 1 && (await read('Boolean(document.querySelector(".backup-versions button:not(:disabled)"))')),
    'Cancelled backup deletion',
  );
  await clickButton('.backup-versions', 'Delete …');
  await until(() => read('document.querySelector(".backup-total")?.textContent.includes("0 versions at this destination")'), 'Confirmed backup deletion');
  assert.equal(backupDeletionPrompts, 2);
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
    await fill('.staging-search-input', 'file-1');
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
    await fill('.staging-search-input', '');
    await until(() => parent.webContents.executeJavaScript('Boolean(document.querySelector(".staging-stage-all:not(:disabled)"))'), 'Whole repository action');
    results.push(await measure('repository', '.staging-stage-all', 400));
    const staged = execFileSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: repo, windowsHide: true, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
    assert.equal(staged.length, 400);
    release();
    await verifyStagingLayout();
    const sameSecond = { ...process.env, GIT_COMMITTER_DATE: '2026-10-18T19:09:26+02:00' };
    for (let repeat = 0; repeat < 2; repeat++) execFileSync('git', ['reset', '--soft', 'HEAD'], { cwd: repo, windowsHide: true, env: sameSecond });
    const ref = path.join(repo, '.git', 'refs', 'heads', 'main');
    const originalRef = fs.readFileSync(ref);
    fs.writeFileSync(ref, Buffer.alloc(41));
    await until(
      () =>
        parent.webContents.executeJavaScript('document.querySelectorAll(".branch-head-notice").length >= 2 && !document.querySelector(".staging-stage-all")'),
      'Branch damage in history and staging',
    );
    await parent.webContents.executeJavaScript('document.querySelector(".branch-head-notice button").click()');
    await until(
      () => parent.webContents.executeJavaScript('Boolean(document.querySelector(".branch-repair-panel input:checked"))'),
      'Verified reflog candidate',
    );
    await parent.webContents.executeJavaScript('document.querySelector(".branch-repair-panel > button").click()');
    await until(
      () =>
        parent.webContents.executeJavaScript('document.querySelector(".branch-repair-panel [role=status]")?.textContent.includes("Branch reference restored")'),
      'Confirmed repair',
    );
    await until(
      () => parent.webContents.executeJavaScript('document.querySelectorAll("[data-recovery-kind=reset]").length === 2'),
      'Both same-second reflog entries are visible',
    );
    assert.deepEqual(fs.readFileSync(ref), originalRef);
    await verifyBackupSettings();
    assert.equal(execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: repo, encoding: 'utf8', windowsHide: true }).trim().split('\n').length, 400);
    assert.deepEqual(errors, [], 'No unhandled renderer failures.');
    fs.writeFileSync(path.resolve(__dirname, '../build/staging-ui.json'), JSON.stringify(results, null, 2) + '\n');
    fs.writeFileSync(path.join(profile, 'verified'), 'yes');
    clearTimeout(timeout);
    console.log('Native staging, branch recovery and backup settings checks passed.');
    app.quit();
  })
  .catch(fail);
