// Run after npm run build: node scripts/measure-prepared-navigation.cjs
// Measures the real production React UI, with slow/offline IPC fixtures.
const path = require('path');
const fs = require('fs/promises');
const os = require('os');

if (!process.versions.electron) {
  const { spawn } = require('child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require('electron'), [__filename], { env, stdio: 'inherit', windowsHide: true });
  child.on('exit', (code) => process.exit(code ?? 1));
} else {
  const { app, BrowserWindow } = require('electron');
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.on('window-all-closed', () => {});
  const root = path.resolve(__dirname, '..');
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let temporary;
  const cleanup = async () => {
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    if (temporary && path.dirname(path.resolve(temporary)) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('ogc-navigation-')) {
      await fs.rm(temporary, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }).catch(() => {});
    }
  };
  const results = [];

  const measure = async (win, tab, content, samples) => {
    const value = await win.webContents.executeJavaScript(`(async () => {
      const started = performance.now();
      const button = document.querySelector(${JSON.stringify(tab)});
      if (!button) throw new Error('Navigation button is missing');
      button.click();
      let placeholders = 0;
      for (let frame = 0; frame < 900; frame++) {
        await new Promise(requestAnimationFrame);
        if (document.querySelector('.data-placeholder')) placeholders++;
        if (document.querySelector(${JSON.stringify(content)})) return { ms: performance.now() - started, placeholders };
      }
      throw new Error('Timed out showing ' + ${JSON.stringify(content)} + ': ' + document.body.innerText.slice(-1000));
    })()`);
    samples.push(value);
  };

  const runScenario = async (scenario) => {
    console.log(`Measuring ${scenario} startup...`);
    process.env.OGC_NAV_SCENARIO = scenario;
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 1000,
      webPreferences: {
        preload: path.join(__dirname, 'fixtures/prepared-navigation-preload.cjs'),
        sandbox: false,
        contextIsolation: true,
        backgroundThrottling: false,
        offscreen: true,
      },
    });
    win.webContents.setFrameRate(60);
    const errors = [];
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message);
    });
    await win.loadFile(path.join(root, 'dist/index.html'));
    await win.webContents.executeJavaScript(
      "Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange'))",
    );
    await wait(700);
    const github = '.activity-bar button[title="GitHub"]';
    const planner = '.activity-bar button:has(svg.lucide-list-todo)';
    const local = '.activity-bar button[title="Local repositories"]';
    const isLocalScenario = scenario === 'local';
    const primaryTab = isLocalScenario ? local : github;
    const primaryContent = isLocalScenario ? '.local-repositories-view__row' : '.github-repo-card';
    const secondaryTab = isLocalScenario ? github : planner;
    const secondaryContent = isLocalScenario ? '.github-repo-card' : '.planner-card';
    const warmup = [];
    if (scenario === 'cold') {
      await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(github)}).click()`);
      await wait(50);
      const shell = await win.webContents.executeJavaScript(
        "Boolean(document.querySelector('.github-workspace .data-placeholder')) && !document.querySelector('.github-workspace__login')",
      );
      if (!shell) throw new Error('Cold startup must show a page shell while authentication is restoring.');
    }
    await measure(win, primaryTab, primaryContent, warmup);
    await measure(win, secondaryTab, secondaryContent, warmup);
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await measure(win, primaryTab, primaryContent, samples);
      await measure(win, secondaryTab, secondaryContent, samples);
    }
    await wait(3100);
    await measure(win, primaryTab, primaryContent, samples);
    let layout = null;
    if (isLocalScenario) {
      layout = await win.webContents.executeJavaScript(`(async () => {
        const hero = document.querySelector('.local-repositories-view__hero');
        const toolbar = document.querySelector('.local-repositories-view__toolbar');
        const scroll = document.querySelector('.local-repositories-view__scroll');
        const before = { hero: hero.getBoundingClientRect().top, toolbar: toolbar.getBoundingClientRect().top };
        scroll.scrollTop = scroll.scrollHeight;
        await new Promise(requestAnimationFrame);
        return {
          rows: document.querySelectorAll('.local-repositories-view__row').length,
          listScrolled: scroll.scrollTop > 0,
          headerStayed: Math.abs(hero.getBoundingClientRect().top - before.hero) < 1 && Math.abs(toolbar.getBoundingClientRect().top - before.toolbar) < 1,
        };
      })()`);
      if (process.env.OGC_NAV_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.OGC_NAV_SCREENSHOT_DIR, { recursive: true });
        for (const [label, width, height, theme] of [
          ['wide-dark', 1440, 900, 'midnight-teal'],
          ['narrow-dark', 640, 680, 'midnight-teal'],
          ['wide-light', 1440, 900, 'porcelain-light'],
          ['narrow-light', 640, 680, 'porcelain-light'],
        ]) {
          win.setSize(width, height);
          await win.webContents.executeJavaScript(
            `document.body.dataset.theme = ${JSON.stringify(theme)}; document.querySelector('.local-repositories-view__scroll').scrollTop = 0`,
          );
          await wait(120);
          await fs.writeFile(path.join(process.env.OGC_NAV_SCREENSHOT_DIR, `local-repositories-${label}.png`), (await win.webContents.capturePage()).toPNG());
        }
      }
    }
    const loginVisible = await win.webContents.executeJavaScript("Boolean(document.querySelector('.github-workspace__login'))");
    const timings = samples.map((sample) => sample.ms).sort((a, b) => a - b);
    const result = {
      scenario,
      samples: samples.length,
      medianMs: timings[Math.floor(timings.length / 2)],
      p95Ms: timings[Math.ceil(timings.length * 0.95) - 1],
      maxMs: timings.at(-1),
      placeholderFrames: samples.reduce((sum, sample) => sum + sample.placeholders, 0),
      loginVisible,
      warmup,
      errors,
      layout,
    };
    results.push(result);
    win.destroy();
    if (
      result.maxMs >= 100 ||
      result.placeholderFrames ||
      loginVisible ||
      errors.length ||
      (layout && (!layout.listScrolled || !layout.headerStayed || layout.rows !== 24))
    )
      throw new Error(`Navigation acceptance failed: ${JSON.stringify(result)}`);
  };

  (async () => {
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ogc-navigation-'));
    app.setPath('userData', temporary);
    await app.whenReady();
    for (const scenario of process.env.OGC_NAV_ONLY ? [process.env.OGC_NAV_ONLY] : ['cached', 'offline', 'cold', 'local']) await runScenario(scenario);
    console.log(JSON.stringify({ production: true, delayedIpcMs: 3000, results }, null, 2));
    await cleanup();
    app.exit(0);
  })().catch(async (error) => {
    console.error(error);
    await cleanup();
    app.exit(1);
  });
}
