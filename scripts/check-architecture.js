/* eslint-env node */
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const maxLines = 500;
const ignoredDirs = new Set(['coverage', 'dist', 'dist-electron', 'node_modules', 'release']);
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css']);
const importExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);

// Documented, intentional exceptions to the 500-line limit. Each entry is a
// cohesive unit where splitting would fragment closely-coupled logic or shared
// test setup without a real architectural benefit. The number records the size
// at the time the exception was granted.
const maxLineExceptions = new Map([
  // Central composition hook: wires every domain/workflow hook together and
  // assembles the single app-state object. Splitting scatters that wiring.
  ['src/components/layout/useAppState.ts', 505],
  // Single-run AI auto-commit orchestrator whose private steps all operate on
  // one shared run state; extracting them would only add indirection.
  ['electron/ai/AiAutoCommitRunSession.ts', 515],
  // Cohesive test suite with substantial shared JSDOM/mocks setup; splitting it
  // would duplicate that setup and risk the two halves drifting apart.
  ['src/components/layout/workflows/__tests__/workflowHooks.test.ts', 567],
  // Cohesive GitHub handler test suite with shared harness setup.
  ['electron/main-process/ipc/__tests__/registerGithubHandlers.test.ts', 512],
  // Workspace domain hook: resolves the active repository plus its branches,
  // remotes, tags and submodules through one shared generation guard; the parts
  // share too much state to split without threading it back together.
  ['src/components/layout/hooks/useWorkspaceDomain.ts', 523],
  // Release workflow: create/generate/context callbacks share the same repo
  // generation guard, refs and setters; splitting would duplicate that binding.
  ['src/components/layout/workflows/useReleaseWorkflow.ts', 578],
  // Staging file operations hook: stage/unstage/discard/stash all operate on one
  // shared status-refresh and stale-response guard.
  ['src/components/staging-area/useFileOperations.ts', 579],
  // Pull-request hook: owner/repo resolution, fork upstream retargeting, CI
  // polling and creation share one set of scope refs and cache invalidation.
  ['src/hooks/usePullRequests.ts', 558],
  // Central Git service facade delegating to the specialised git/* services; the
  // surface is the aggregation point and intentionally broad.
  ['electron/GitService.ts', 538],
  // Cohesive Git handler test suite with shared IPC harness setup.
  ['electron/main-process/ipc/__tests__/registerGitHandlers.test.ts', 622],
  // Secret scanner: strictness/pattern config, allowlist parsing, quoted-path
  // decoding, the combined-diff line state machine and push-plan resolution form
  // one security-critical unit that is clearer read top to bottom.
  ['electron/SecretScanService.ts', 604],
  // Cohesive test suite for the AI index transaction with shared git fixtures.
  ['electron/__tests__/AiAutoCommitIndexTransaction.test.ts', 524],
  // Planner provider: refresh sequencing, selection and mutations share one
  // data snapshot and generation guard; splitting would duplicate that state.
  ['src/contexts/ProjectPlannerContext.tsx', 504],
]);

const sharedForbiddenPrefixes = ['src/components/', 'src/hooks/', 'src/contexts/', 'src/app/', 'src/services/'];
const allowedElectronSrcPrefixes = ['src/shared/', 'src/types/'];
const uiSourcePrefixes = ['src/components/', 'src/hooks/', 'src/contexts/', 'src/app/'];
const gitCommandArrayGateFiles = ['src/components/layout/useAppState.ts'];
const gitCommandArrayGatePrefixes = ['src/app/', 'src/components/commit-graph/', 'src/components/layout/hooks/', 'src/components/layout/workflows/'];
const gitCommandArrayAllowedFiles = new Set(['src/components/layout/workflows/gitWorkflowCommands.ts']);

const errors = [];

const toProjectPath = (absolutePath) => path.relative(rootDir, absolutePath).replace(/\\/g, '/');

const addError = (file, message) => {
  errors.push(`${file}: ${message}`);
};

const listFiles = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...listFiles(path.join(directory, entry.name)));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
};

const startsWithAny = (value, prefixes) => prefixes.some((prefix) => value.startsWith(prefix));

const resolveProjectImport = (specifier, importerAbsolutePath) => {
  if (specifier.startsWith('@/')) {
    return `src/${specifier.slice(2)}`.replace(/\\/g, '/');
  }

  if (specifier.startsWith('src/')) {
    return specifier.replace(/\\/g, '/');
  }

  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(importerAbsolutePath), specifier);
    const projectPath = toProjectPath(resolved);
    return projectPath.startsWith('..') ? null : projectPath;
  }

  return null;
};

const collectImports = (source) => {
  const imports = [];
  const patterns = [
    /\bimport\s+(?!\()(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
};

const checkLineCount = (file, source) => {
  const lineCount = source.length === 0 ? 0 : source.split(/\r\n|\r|\n/).length;
  if (lineCount <= maxLines || maxLineExceptions.has(file)) return;

  addError(file, `has ${lineCount} lines. Files over ${maxLines} lines need a documented exception in scripts/check-architecture.js or should be split.`);
};

const checkImportBoundaries = (file, absolutePath, source) => {
  if (!importExtensions.has(path.extname(absolutePath))) return;

  for (const specifier of collectImports(source)) {
    const resolved = resolveProjectImport(specifier, absolutePath);

    if (resolved === 'src/global' || resolved === 'src/global.d') {
      addError(file, `DTO/API types must be imported from explicit src/types/* or src/shared/ipc/contracts/* modules instead of ${specifier}.`);
    }

    if (file.startsWith('src/shared/') && resolved && startsWithAny(resolved, sharedForbiddenPrefixes)) {
      addError(file, `shared code must not import upward into app/UI layers (${specifier}). Move the contract into src/shared or src/types.`);
    }

    if (file.startsWith('electron/') && resolved && resolved.startsWith('src/') && !startsWithAny(resolved, allowedElectronSrcPrefixes)) {
      addError(file, `electron may only import renderer-neutral src/shared or src/types modules (${specifier}).`);
    }

    if (startsWithAny(file, uiSourcePrefixes) && specifier === 'electron') {
      addError(file, 'UI code must use preload-backed clients/services instead of importing Electron directly.');
    }
  }
};

const checkGitCommandArrays = (file, source) => {
  if (gitCommandArrayAllowedFiles.has(file)) return;

  const isGatedFile = gitCommandArrayGateFiles.includes(file) || startsWithAny(file, gitCommandArrayGatePrefixes);
  if (!isGatedFile || file.includes('/__tests__/')) return;

  if (/\b(?:runGitCommand(?:Ref\.current)?|runGitAction)(?:\?\.)?\s*\(\s*\[/.test(source)) {
    addError(file, 'UI/app workflow code must call named gitClient/gitWorkflowCommands use-cases instead of passing raw command arrays to git runners.');
  }
};

const files = [...listFiles(path.join(rootDir, 'src')), ...listFiles(path.join(rootDir, 'electron'))];

for (const absolutePath of files) {
  if (!sourceExtensions.has(path.extname(absolutePath))) continue;

  const file = toProjectPath(absolutePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  checkLineCount(file, source);
  checkImportBoundaries(file, absolutePath, source);
  checkGitCommandArrays(file, source);
}

if (errors.length > 0) {
  console.error(`Architecture check failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Architecture check passed.');
