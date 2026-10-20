const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { promisify } = require('node:util');
const { app, BrowserWindow, nativeImage } = require('electron');
const { viewEntries } = require('./verify-view-chunks');

const profile = process.env.OGC_STARTUP_TEST_PROFILE;
const applicationPath = process.env.OGC_STARTUP_TEST_APP;
assert.ok(profile && path.isAbsolute(profile), 'An isolated startup test profile is required.');
assert.ok(applicationPath && path.isAbsolute(applicationPath), 'Choose the built application or its packaged app.asar.');
app.setPath('userData', profile);
fs.mkdirSync(path.join(profile, 'app-data'), { recursive: true });
app.setPath('appData', path.join(profile, 'app-data'));
app.setPath('sessionData', profile);
console.log(`Native startup test process: ${process.pid}`);
process.env.OPEN_GIT_CONTROL_API_DISABLED = 'true';
process.env.NODE_ENV = 'production';
// The real GUI parent has no terminal to inherit. Verify native process options
// here as well as in unit tests; an omitted flag can flash a console over the app.
const execFile = childProcess.execFile;
const hidden = (options) => assert.equal(options?.windowsHide, true, 'Background commands must hide their Windows console.');
childProcess.execFile = function (file, args, options, ...rest) {
  hidden(options);
  return execFile.call(this, file, args, options, ...rest);
};
childProcess.execFile[promisify.custom] = function (file, args, options) {
  hidden(options);
  return execFile[promisify.custom].call(this, file, args, options);
};
const spawn = childProcess.spawn;
childProcess.spawn = function (file, args, options) {
  hidden(options);
  return spawn.call(this, file, args, options);
};
let mainToolPathReads = 0;
if (process.env.OGC_STARTUP_TEST_TOOL_STALL === '1') {
  const blocked = path.join(profile, 'blocked-program-location');
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  process.env[pathKey] = `${blocked}${path.delimiter}${process.env[pathKey] || ''}`;
  const stat = fs.statSync;
  fs.statSync = function (file, ...args) {
    if (String(file).startsWith(blocked)) mainToolPathReads++;
    return stat.call(this, file, ...args);
  };
  const childProcess = require('node:child_process');
  const spawn = childProcess.spawn;
  childProcess.spawn = function (executable, args, options) {
    if (executable === process.execPath && args?.[0] === '-e' && args[1].includes('input.candidates')) {
      const stall = `const ogcFs=require('node:fs'),ogcStat=ogcFs.statSync;ogcFs.statSync=function(file,...args){
        if(String(file).startsWith(${JSON.stringify(blocked)}))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
        return ogcStat.call(this,file,...args);
      };`;
      args = ['-e', stall + args[1]];
    }
    return spawn.call(this, executable, args, options);
  };
}
let ready = false;
let cleanupCompleted = false;
let verified = false;
const timeout = setTimeout(() => {
  console.error(`Startup/lifecycle smoke test timed out: ready=${ready}, cleanupCompleted=${cleanupCompleted}`);
  app.exit(1);
}, 30_000);
timeout.unref();
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
function fail(error) {
  console.error(error);
  app.exit(1);
}

async function captureReadyPage(window) {
  await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))');
  for (let attempt = 0; ; attempt++) {
    try {
      return await window.webContents.capturePage();
    } catch (error) {
      if (attempt >= 2 || !String(error).includes('UnknownVizError')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

if (process.env.OGC_STARTUP_TEST_LIFECYCLE === '1') {
  // A mock App cannot reproduce Electron ignoring app.quit() from a Promise
  // callback while its cancelled native will-quit call is still unwinding.
  const { finishBeforeQuit } = require(path.join(applicationPath, 'dist-electron/electron/main-process/finishBeforeQuit.js'));
  finishBeforeQuit(app, async () => {
    await fs.promises.writeFile(path.join(profile, 'cleanup-finished'), 'preserved');
    cleanupCompleted = true;
    verified = true;
  });
  app
    .whenReady()
    .then(async () => {
      const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
      await window.loadURL('about:blank');
      ready = true;
      app.quit();
    })
    .catch(fail);
} else {
  // Exercise persisted notices through the real preload and renderer while all
  // background network checks are disabled in this isolated profile.
  const { createHash } = require('node:crypto');
  const { emptyUserNotesSnapshot, userNoteRevision } = require(path.join(applicationPath, 'dist-electron/electron/main-process/userNotesModel.js'));
  const notesFile = path.join(profile, 'user-notes-v1.json');
  if (!fs.existsSync(notesFile)) {
    const logo = nativeImage
      .createFromBuffer(fs.readFileSync(path.join(applicationPath, 'logo.png')))
      .resize({ width: 120 })
      .toPNG();
    const imageSha = createHash('sha1').update(`blob ${logo.length}\0`).update(logo).digest('hex');
    const makeNote = (id, title, markdown, images = {}) => {
      const bytes = Buffer.from(markdown);
      const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      return { id, title, markdown, blobSha, images, revision: userNoteRevision(blobSha, images) };
    };
    const snapshot = {
      ...emptyUserNotesSnapshot(),
      checkedAt: Date.now(),
      notes: [
        makeNote(
          '2026-10-20-information.md',
          'Information for app users',
          '# Information for app users\n\nThis notice is available **offline**, including its image.\n\n<img src="assets/logo.png" alt="Open-Git-Control" width="120">\n\n| Service | Status |\n| --- | --- |\n| Saved notices | Available offline |\n\n- [x] Markdown and local images\n- [x] Persistent acknowledgement',
          { 'assets/logo.png': { path: '.Open-Git-Control/notes-to-user/assets/logo.png', sha: imageSha } },
        ),
        makeNote(
          '2026-10-19-information.md',
          'Saved service information',
          '# Saved service information\n\nAcknowledged notices remain readable in the settings.',
        ),
      ],
      assets: { [imageSha]: `data:image/png;base64,${logo.toString('base64')}` },
    };
    fs.writeFileSync(notesFile, JSON.stringify(snapshot));
  }
  let githubRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (...args) => {
    if (/^https:\/\/(?:api\.)?github\.com\//.test(String(args[0]))) {
      githubRequests++;
      return Promise.reject(new Error('Unexpected automatic GitHub request in offline startup test.'));
    }
    return originalFetch(...args);
  };
  require('electron-updater').autoUpdater.checkForUpdates = async () => {
    githubRequests++;
    return null;
  };
  app.setAppPath(applicationPath);
  app.on('browser-window-created', (_event, window) => {
    window.hide();
    window.webContents.setBackgroundThrottling(false);
    window.on('unresponsive', () => fail(new Error('The application became unresponsive during startup.')));
    window.webContents.on('render-process-gone', (_event, details) => fail(new Error(`Renderer exited: ${details.reason}`)));
    window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame) fail(new Error(`Main window failed to load: ${code} ${description}`));
    });
    window.webContents.once('did-finish-load', async () => {
      try {
        assert.match(window.getBackgroundColor().toLowerCase(), /^#(?:ff)?0f1214(?:ff)?$/, 'The native window needs an opaque app background.');
        const deadline = Date.now() + 20_000;
        while (!ready && Date.now() < deadline) {
          ready = await window.webContents.executeJavaScript(`Boolean(
            document.getElementById('root')?.childElementCount &&
            window.electronAPI?.app && document.styleSheets.length &&
            (${process.env.OGC_STARTUP_TEST_REPOSITORY === '1'} ? Boolean(document.querySelector('[data-commit-hash]')) : true) &&
            [...document.styleSheets].every(sheet => sheet.cssRules.length > 0) &&
            getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'
          )`);
          if (!ready) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.ok(ready, 'The app must mount with its stylesheets and preload API.');
        const manifest = JSON.parse(fs.readFileSync(path.join(applicationPath, 'dist/build-manifest.json'), 'utf8'));
        const inactiveFiles = viewEntries.filter((key) => key !== 'src/components/commit-graph/index.ts').map((key) => manifest[key].file);
        const earlyImports = await window.webContents.executeJavaScript(`performance.getEntriesByType('resource')
          .filter(entry => ${JSON.stringify(inactiveFiles)}.some(file => new URL(entry.name).pathname.endsWith('/' + file)))
          .map(entry => entry.name)`);
        assert.deepEqual(earlyImports, [], 'Inactive views must not load before the active page is available.');
        const bootstrapped = await window.webContents.executeJavaScript(`window.electronAPI.app.getBootstrap().then(
          data => Boolean(data.settings && Array.isArray(data.repositories.repos)),
          () => false
        )`);
        assert.ok(bootstrapped, 'The main process must answer the renderer bootstrap.');
        const notices = await window.webContents.executeJavaScript('window.electronAPI.app.getUserNotesStatus()');
        assert.equal(notices.notes.length, 2, 'Restore both cached notice pages without a network check.');
        if (notices.notes.some((note) => !note.acknowledged)) {
          const waitForNotice = async (expression) => {
            const deadline = Date.now() + 5000;
            while (Date.now() < deadline) {
              if (await window.webContents.executeJavaScript(expression)) return;
              await new Promise((resolve) => setTimeout(resolve, 50));
            }
            const details = await window.webContents.executeJavaScript(`JSON.stringify({
              dialogs: [...document.querySelectorAll('[role="dialog"]')].map(item => item.getAttribute('aria-label')),
              reader: document.querySelector('.user-notes-reader')?.textContent,
              images: [...document.querySelectorAll('.user-notes-reader img')].map(item => ({ src: item.getAttribute('src')?.slice(0, 40), width: item.naturalWidth, loading: item.loading }))
            })`);
            throw new Error('The offline notice reader did not reach its expected state: ' + details);
          };
          await waitForNotice(`Boolean(document.querySelector('.user-notes-reader article table'))`);
          // Hidden windows can defer lazy images indefinitely. Decode the local
          // test image explicitly before verifying its pixels and capturing it.
          await window.webContents.executeJavaScript(
            `([...document.querySelectorAll('.user-notes-reader img')].forEach(image => { image.loading = 'eager'; }), true)`,
          );
          await waitForNotice(`Boolean(document.querySelector('.user-notes-reader img')?.naturalWidth > 0)`);
          const screenshotDirectory = process.env.OGC_STARTUP_TEST_SCREENSHOT_DIR;
          if (screenshotDirectory) {
            assert.ok(path.isAbsolute(screenshotDirectory));
            fs.mkdirSync(screenshotDirectory, { recursive: true });
            fs.writeFileSync(path.join(screenshotDirectory, 'user-notes.png'), (await captureReadyPage(window)).toPNG());
          }
          await window.webContents.executeJavaScript(
            `([...document.querySelectorAll('.user-notes-pagination button')].find(button => button.textContent === 'Next').click(), true)`,
          );
          await waitForNotice(`Boolean(document.querySelector('.user-notes-reader article')?.textContent.includes('Acknowledged notices remain readable'))`);
          await window.webContents.executeJavaScript(
            `([...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Acknowledge all').click(), true)`,
          );
          await waitForNotice(`!document.querySelector('.activity-user-notes-btn') && !document.querySelector('.user-notes-reader')`);
          console.log('Offline notice popup rendered its Markdown and image, paged, and acknowledged both revisions.');
        } else {
          assert.ok(
            await window.webContents.executeJavaScript('!document.querySelector(".activity-user-notes-btn")'),
            'Acknowledged notices must not reappear after restart.',
          );
          const saved = await window.webContents.executeJavaScript(
            `window.electronAPI.app.getUserNote(${JSON.stringify({ id: notices.notes[0].id, revision: notices.notes[0].revision })})`,
          );
          assert.ok(saved.success && saved.data.markdown.includes('available **offline**'), 'Acknowledged notice content remains readable locally.');
          console.log('Acknowledged notices stayed hidden and remained readable after restart.');
        }
        const clicked = await window.webContents.executeJavaScript(`(() => {
          const settings = document.querySelector('.activity-bar button[title="Settings"]');
          if (!settings) return false;
          settings.click();
          return true;
        })()`);
        assert.ok(clicked, 'The settings navigation must be available.');
        let interactive = false;
        const navigationDeadline = Date.now() + 5000;
        while (!interactive && Date.now() < navigationDeadline) {
          interactive = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.activity-bar button[title="Settings"].active'))`);
          if (!interactive) await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.ok(interactive, 'The app must remain interactive after clicking its navigation.');
        if (process.env.OGC_STARTUP_TEST_REPOSITORY === '1') {
          const { GitRunner } = require(path.join(applicationPath, 'dist-electron/electron/git/GitRunner.js'));
          const runner = new GitRunner();
          const repo = path.join(profile, 'repository');
          fs.writeFileSync(path.join(repo, 'visibility-smoke.txt'), 'Native background process smoke test\n');
          await window.webContents.executeJavaScript('window.__startupTestRoot = document.querySelector(".app-container"); true');
          for (let pass = 0; pass < 4; pass++) {
            const [, result, preview] = await Promise.all([
              runner.run(repo, ['status', '--porcelain'], { requestedKind: 'polling' }),
              runner.runResult(repo, ['rev-parse', 'HEAD'], { requestedKind: 'polling' }),
              runner.getDiffPreview(repo, ['diff', '--', 'visibility-smoke.txt']),
            ]);
            assert.equal(result.exitCode, 0);
            assert.ok(preview.text.includes('+Native background process smoke test'));
            assert.ok(
              await window.webContents.executeJavaScript('window.__startupTestRoot === document.querySelector(".app-container")'),
              'Background Git queries must leave the mounted application in place.',
            );
          }
          const image = await captureReadyPage(window);
          assert.ok(
            !image.isEmpty() && image.toBitmap().some((value, index) => index % 4 !== 3 && value > 64),
            'The app must paint content after background queries.',
          );
          console.log('Background polling and diff previews stayed hidden with the app mounted and painted.');
        }
        assert.equal(mainToolPathReads, 0, 'Program discovery must never stat candidate paths on the UI thread.');
        assert.equal(githubRequests, 0, 'Disabled notice and update checks must make no automatic GitHub requests.');
        console.log('Application started with CSS, preload and bootstrap available.');
        verified = true;
        app.quit();
      } catch (error) {
        fail(error);
      }
    });
  });
  require(path.join(applicationPath, 'dist-electron/electron/main.js'));
}
app.on('quit', (_event, exitCode) => {
  fs.writeFileSync(path.join(profile, 'native-smoke-outcome.json'), JSON.stringify({ ready, verified, cleanupCompleted, exitCode }));
  const cleanup = process.env.OGC_STARTUP_TEST_LIFECYCLE === '1' ? `; cleanup=${cleanupCompleted}` : '';
  console.log(`Native app quit: ${exitCode}; startup=${ready}${cleanup}`);
});
