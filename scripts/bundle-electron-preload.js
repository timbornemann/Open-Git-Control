const fs = require('fs');
const path = require('path');

const distElectronDir = path.join(__dirname, '..', 'dist-electron', 'electron');
const factoryPath = path.join(distElectronDir, 'preload', 'createElectronApi.js');
const outputPath = path.join(distElectronDir, 'preload.js');

if (!fs.existsSync(factoryPath)) {
  throw new Error(`Missing compiled preload factory: ${factoryPath}`);
}

// Sandboxed preloads run through Electron's own loader and cannot resolve
// relative requires to sibling files on disk, and this bundler additionally
// moves the factory up one directory (preload/createElectronApi.js ->
// preload.js), which would break any relative path. To keep the preload a
// single self-contained script, every relative require is inlined as a small
// CommonJS module IIFE (recursively, so shared modules may depend on others).
const RELATIVE_REQUIRE = /require\((['"])(\.\.?\/[^'"]+)\1\)/g;

const resolveCompiledModule = (fromDir, relativeImport) => {
  const base = path.resolve(fromDir, relativeImport);
  const candidates = [`${base}.js`, path.join(base, 'index.js')];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) {
    throw new Error(`Preload bundler could not resolve "${relativeImport}" from ${fromDir}. Only pure, compiled modules may be required by the preload.`);
  }
  return resolved;
};

const inlineRelativeRequires = (source, sourceDir) =>
  source.replace(RELATIVE_REQUIRE, (_match, _quote, relativeImport) => {
    const resolved = resolveCompiledModule(sourceDir, relativeImport);
    return inlineCompiledModule(resolved);
  });

const inlineCompiledModule = (absoluteJsPath) => {
  const moduleSource = fs.readFileSync(absoluteJsPath, 'utf8').replace(/^"use strict";\r?\n/, '');
  const inlinedSource = inlineRelativeRequires(moduleSource, path.dirname(absoluteJsPath));
  return `(() => {\n  const module = { exports: {} };\n  const exports = module.exports;\n${inlinedSource}\n  return module.exports;\n})()`;
};

let factorySource = fs.readFileSync(factoryPath, 'utf8');
factorySource = inlineRelativeRequires(factorySource, path.dirname(factoryPath));
factorySource = factorySource
  .replace(/^"use strict";\r?\n/, '')
  .replace(/^Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\r?\n/, '')
  .replace(/^exports\.createElectronApi = void 0;\r?\n/, '')
  .replace(/\r?\nexports\.createElectronApi = createElectronApi;\r?\n?$/, '\n');

const bundledPreload = `"use strict";
const { contextBridge, ipcRenderer } = require('electron');

${factorySource}
const api = createElectronApi(ipcRenderer);

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('api', api);
`;

fs.writeFileSync(outputPath, bundledPreload, 'utf8');
console.log(`Bundled sandbox preload: ${path.relative(process.cwd(), outputPath)}`);
