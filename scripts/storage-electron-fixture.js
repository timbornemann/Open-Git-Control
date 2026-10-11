const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { configureBrowserCacheSwitches, configureCodeCache, clearBrowserCaches } = require('../dist-electron/electron/main-process/browserCacheMaintenance');

const root = path.resolve(process.env.OGC_STORAGE_TEST_PROFILE || '');
if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-electron-storage-test-'))
  throw new Error('An isolated test profile is required.');
app.setPath('userData', root);
app.setPath('sessionData', root);
app.disableHardwareAcceleration();
const seedOnly = process.env.OGC_STORAGE_TEST_SEED === '1';
const developmentCleanup = process.env.OGC_STORAGE_TEST_CLEAR_DEV === '1';
configureBrowserCacheSwitches(seedOnly || developmentCleanup);
const settings = path.join(root, 'settings.json');
const savedSettings = '{"language":"de","automaticMaintenanceEnabled":true}';
if (seedOnly) fs.writeFileSync(settings, savedSettings);
const source = Array.from({ length: 2500 }, (_, index) => `function cached${index}(x){return x+${index};}`).join('\n') + '\nglobalThis.cacheReady=true;';
const server = http.createServer((request, response) => {
  response.setHeader('Cache-Control', 'public, max-age=3600');
  response.setHeader('Content-Type', request.url.endsWith('.js') ? 'text/javascript' : 'text/html');
  response.end(request.url.endsWith('.js') ? source : '<script src="/cached.js"></script><p>Isolated storage integration test</p>');
});
const bytes = (directory) => {
  if (!fs.existsSync(directory)) return 0;
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return sum + (entry.isDirectory() ? bytes(file) : fs.statSync(file).size);
  }, 0);
};
const warm = async (window, url) => {
  for (let index = 0; index < 3; index++) {
    await window.loadURL(url);
    assert.equal(await window.webContents.executeJavaScript('globalThis.cacheReady'), true);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
};
app.whenReady().then(async () => {
  const windows = [];
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/`;
    const target = session.defaultSession;
    configureCodeCache(seedOnly || developmentCleanup, target);
    const active = new BrowserWindow({ show: false, webPreferences: { session: target, sandbox: true, contextIsolation: true } });
    windows.push(active);
    if (seedOnly)
      await target.cookies.set({ url: 'https://storage.test', name: 'ogc-test-login', value: 'retained-login', expirationDate: Date.now() / 1000 + 3600 });
    else assert.equal((await target.cookies.get({ url: 'https://storage.test', name: 'ogc-test-login' }))[0]?.value, 'retained-login');
    await warm(active, url);
    await active.webContents.executeJavaScript('localStorage.setItem("ogc-test-setting","retained-setting")');
    if (seedOnly) {
      assert.equal(await target.getCacheSize(), 0, 'Development HTTP disk cache must be disabled before startup.');
      assert.ok(bytes(path.join(root, 'development-code-cache')) > 1024);
      await target.cookies.flushStore();
      target.flushStorageData();
      console.log('Isolated development profile seeded; HTTP cache disabled.');
      app.exit(0);
      return;
    }
    const httpBefore = await target.getCacheSize();
    const inactiveBefore = bytes(path.join(root, 'development-code-cache'));
    const legacyHttpBefore = bytes(path.join(root, 'Cache'));
    if (developmentCleanup) assert.equal(httpBefore, 0);
    else assert.ok(httpBefore > 0, 'The isolated profile must contain HTTP cache data.');
    assert.ok(inactiveBefore > 1024, 'The inactive profile must contain generated code cache data.');
    await clearBrowserCaches(['http', 'code', 'auxiliary'], developmentCleanup, target);
    assert.equal(await target.getCacheSize(), 0);
    const inactiveAfter = bytes(path.join(root, 'development-code-cache'));
    assert.ok(inactiveAfter < inactiveBefore, `Code cache was not cleared: ${inactiveBefore} -> ${inactiveAfter}`);
    if (developmentCleanup)
      assert.ok(bytes(path.join(root, 'Cache')) < legacyHttpBefore, 'Development must clear existing installed HTTP cache through Electron.');
    assert.equal((await target.cookies.get({ url: 'https://storage.test', name: 'ogc-test-login' }))[0]?.value, 'retained-login');
    assert.equal(await active.webContents.executeJavaScript('localStorage.getItem("ogc-test-setting")'), 'retained-setting');
    assert.equal(fs.readFileSync(settings, 'utf8'), savedSettings);
    await clearBrowserCaches(['http', 'code'], developmentCleanup, target);
    console.log(JSON.stringify({ result: 'passed', httpBefore, httpAfter: 0, inactiveBefore, inactiveAfter, cookies: 'preserved', settings: 'preserved' }));
    if (!developmentCleanup) {
      await warm(active, url);
      assert.ok((await target.getCacheSize()) > 0);
    }
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  } finally {
    for (const window of windows) if (!window.isDestroyed()) window.destroy();
    server.close();
  }
});
