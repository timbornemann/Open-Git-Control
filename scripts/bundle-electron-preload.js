const fs = require('fs');
const path = require('path');

const distElectronDir = path.join(__dirname, '..', 'dist-electron', 'electron');
const factoryPath = path.join(distElectronDir, 'preload', 'createElectronApi.js');
const outputPath = path.join(distElectronDir, 'preload.js');

if (!fs.existsSync(factoryPath)) {
  throw new Error(`Missing compiled preload factory: ${factoryPath}`);
}

let factorySource = fs.readFileSync(factoryPath, 'utf8');
factorySource = factorySource
  .replace(/^"use strict";\r?\n/, '')
  .replace(/^Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\r?\n/, '')
  .replace(/^exports\.createElectronApi = void 0;\r?\n/, '')
  .replace(/\r?\nexports\.createElectronApi = createElectronApi;\r?\n?$/, '\n');

const bundledPreload = `"use strict";
const { contextBridge, ipcRenderer } = require('electron');

${factorySource}
contextBridge.exposeInMainWorld('electronAPI', createElectronApi(ipcRenderer));
`;

fs.writeFileSync(outputPath, bundledPreload, 'utf8');
console.log(`Bundled sandbox preload: ${path.relative(process.cwd(), outputPath)}`);
