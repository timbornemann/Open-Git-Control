/* eslint-env node */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const project = path.resolve(__dirname, '..');

async function electronProbe() {
  const { app, BrowserWindow, session } = require('electron');
  const root = process.env.OGC_SCHEMA_PROBE_ROOT;
  app.setPath('userData', path.join(root, 'profile'));
  try {
    await app.whenReady();
    const archive = path.join(root, 'app.asar');
    const compiled = path.join(archive, 'dist-electron');
    const { buildContentSecurityPolicy } = require(path.join(compiled, 'electron/main-process/security.js'));
    const { registerJsonSchemaValidationHandler } = require(path.join(compiled, 'electron/main-process/ipc/registerJsonSchemaValidationHandler.js'));
    registerJsonSchemaValidationHandler();
    const csp = buildContentSecurityPolicy(false);
    assert.ok(!csp.includes('unsafe-eval'));
    session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } }),
    );
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, preload: path.join(compiled, 'electron/preload.js') },
    });
    await window.loadFile(path.join(root, 'renderer/index.html'));
    const deadline = Date.now() + 20000;
    let outcome;
    while (Date.now() < deadline) {
      outcome = await window.webContents.executeJavaScript('globalThis.schemaProbeResult || null');
      if (outcome) break;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(outcome?.ok, JSON.stringify(outcome));
    assert.equal(outcome.evalBlocked, true, 'The renderer must retain its production CSP.');
    assert.equal(outcome.nodeUnavailable, true, 'The renderer must remain sandboxed.');
    fs.writeFileSync(path.join(root, 'outcome.json'), JSON.stringify(outcome));
    window.destroy();
    app.quit();
  } catch (error) {
    fs.writeFileSync(path.join(root, 'outcome.json'), JSON.stringify({ error: error.stack || String(error) }));
    app.exit(1);
  }
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-schema-csp-'));
  try {
    const renderer = path.join(root, 'renderer');
    fs.mkdirSync(renderer);
    const source = path.join(project, 'src/components/working-directory/structuredContentTransforms.ts').replace(/\\/g, '/');
    fs.writeFileSync(
      path.join(root, 'probe.js'),
      `
import { validateJsonWithSchema } from ${JSON.stringify(source)};
(async () => {
  try {
    let evalBlocked = false;
    try { new Function('return 1'); } catch (error) { evalBlocked = error instanceof EvalError; }
    if (!evalBlocked) throw new Error('Production CSP did not block dynamic code generation.');
    for (const dialect of ['http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema']) {
      const schema = JSON.stringify({ $schema: dialect, type: 'object', required: ['name'], properties: { name: { type: 'string' } } });
      const valid = await validateJsonWithSchema('{"name":"Ada"}', schema);
      const invalid = await validateJsonWithSchema('{"name":42}', schema);
      if (valid.length || !invalid.some(issue => issue.includes('/name: must be string'))) throw new Error('Schema dialect failed: ' + dialect);
    }
    if ((await validateJsonWithSchema('{/* JSONC */ "ok":true,}', '{"type":"object",}')).length) throw new Error('JSONC failed.');
    let invalidSchema = false;
    try { await validateJsonWithSchema('{}', '{"type":"unknown"}'); } catch (error) { invalidSchema = error.message.startsWith('Invalid JSON Schema:'); }
    if (!invalidSchema) throw new Error('Invalid schemas must be reported.');
    globalThis.schemaProbeResult = { ok: true, evalBlocked, nodeUnavailable: typeof globalThis.require === 'undefined' && typeof globalThis.process === 'undefined', dialects: 3, archived: true };
  } catch (error) { globalThis.schemaProbeResult = { ok: false, error: error.stack || String(error) }; }
})();
`,
    );
    const { build } = await import('vite');
    await build({
      configFile: false,
      logLevel: 'error',
      resolve: { alias: { '@': path.join(project, 'src') } },
      build: {
        outDir: renderer,
        emptyOutDir: false,
        minify: false,
        lib: { entry: path.join(root, 'probe.js'), formats: ['es'], fileName: () => 'probe.js' },
        rolldownOptions: { output: { codeSplitting: false } },
      },
    });
    fs.writeFileSync(path.join(renderer, 'index.html'), '<!doctype html><meta charset="utf-8"><script type="module" src="./probe.js"></script>');
    const archiveRoot = path.join(root, 'archive');
    fs.mkdirSync(archiveRoot);
    fs.cpSync(path.join(project, 'dist-electron'), path.join(archiveRoot, 'dist-electron'), { recursive: true });
    const copied = new Set();
    const copyPackage = (name, directory = project) => {
      if (copied.has(name)) return;
      copied.add(name);
      const manifest = require.resolve(`${name}/package.json`, { paths: [directory] });
      const sourceDirectory = path.dirname(manifest);
      const target = path.join(archiveRoot, 'node_modules', name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(sourceDirectory, target, { recursive: true });
      for (const dependency of Object.keys(JSON.parse(fs.readFileSync(manifest, 'utf8')).dependencies || {})) copyPackage(dependency, sourceDirectory);
    };
    copyPackage('ajv');
    await require('@electron/asar').createPackage(archiveRoot, path.join(root, 'app.asar'));
    const environment = { ...process.env, NODE_ENV: 'production', OGC_SCHEMA_PROBE_ROOT: root };
    delete environment.ELECTRON_RUN_AS_NODE;
    const log = path.join(root, 'electron.log');
    const output = fs.openSync(log, 'w');
    let result;
    try {
      result = spawnSync(require('electron'), [__filename], { env: environment, stdio: ['ignore', output, output], windowsHide: true, timeout: 30000 });
    } finally {
      fs.closeSync(output);
    }
    if (result.error || result.status !== 0) process.stdout.write(fs.readFileSync(log, 'utf8'));
    const outcome = fs.existsSync(path.join(root, 'outcome.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'outcome.json'), 'utf8')) : null;
    assert.equal(result.status, 0, result.error?.message || JSON.stringify(outcome));
    assert.equal(outcome?.ok, true);
    console.log('Verified archived Electron validation: production CSP blocks eval, sandbox retained, JSONC and all 3 schema dialects pass.');
  } finally {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-schema-csp-'))
      throw new Error('Unsafe schema test cleanup.');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

void (process.versions.electron ? electronProbe() : run()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
