const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const profile = process.env.OGC_STARTUP_TEST_PROFILE;
const applicationPath = process.env.OGC_STARTUP_TEST_APP;
assert.ok(profile && path.isAbsolute(profile), 'An isolated startup test profile is required.');
assert.ok(applicationPath && path.isAbsolute(applicationPath), 'Choose the built application or its packaged app.asar.');
app.setPath('userData', profile);
app.setPath('sessionData', profile);
process.env.OPEN_GIT_CONTROL_API_DISABLED = 'true';
process.env.NODE_ENV = 'production';
let ready = false;
let cleanupCompleted = false;
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
        console.log('Application started with CSS, preload and bootstrap available.');
        app.quit();
      } catch (error) {
        fail(error);
      }
    });
  });
  require(path.join(applicationPath, 'dist-electron/electron/main.js'));
}
app.on('quit', (_event, exitCode) => {
  const cleanup = process.env.OGC_STARTUP_TEST_LIFECYCLE === '1' ? `; cleanup=${cleanupCompleted}` : '';
  console.log(`Native app quit: ${exitCode}; startup=${ready}${cleanup}`);
});
