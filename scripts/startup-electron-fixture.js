const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { promisify } = require('node:util');
const { app, BrowserWindow } = require('electron');
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
  app.setAppPath(applicationPath);
  app.on('browser-window-created', (_event, window) => {
    window.hide();
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
          const image = await window.webContents.capturePage();
          assert.ok(
            !image.isEmpty() && image.toBitmap().some((value, index) => index % 4 !== 3 && value > 64),
            'The app must paint content after background queries.',
          );
          console.log('Background polling and diff previews stayed hidden with the app mounted and painted.');
        }
        assert.equal(mainToolPathReads, 0, 'Program discovery must never stat candidate paths on the UI thread.');
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
