const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const viewEntries = [
  'src/components/commit-graph/index.ts',
  'src/components/project-planner/index.ts',
  'src/components/hosting/HostingWorkspace.tsx',
  'src/components/repository-analytics/RepositoryAnalyticsView.tsx',
  'src/components/layout/SettingsMainContent.tsx',
  'src/components/release-creator/RepositoryReleaseCreator.tsx',
  'src/components/file-viewer/FileViewer.tsx',
  'src/components/working-directory/WorkingDirectoryCodeEditor.tsx',
  'src/components/FileTimelineView.tsx',
];

/** Verify the actual output, including transitive static dependencies. A lazy
 * wrapper alone cannot prevent shared manual chunks from loading its page. */
function verifyViewChunks(manifest) {
  const visited = new Set();
  const eagerFiles = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    assert.ok(chunk, `Missing build manifest entry: ${key}`);
    eagerFiles.add(chunk.file);
    for (const dependency of chunk.imports || []) visit(dependency);
  }
  const entrypoints = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  assert.ok(entrypoints.length, 'The build must contain an application entry point.');
  for (const key of entrypoints) visit(key);
  for (const key of viewEntries) {
    const chunk = manifest[key];
    assert.ok(chunk?.isDynamicEntry, `The view must have a separate dynamic entry: ${key}`);
    assert.ok(!eagerFiles.has(chunk.file), `The startup bundle eagerly loads an inactive view: ${key}`);
  }
}

if (require.main === module) {
  const directory = path.resolve(process.argv[2] || path.join(__dirname, '../dist'));
  verifyViewChunks(JSON.parse(fs.readFileSync(path.join(directory, 'build-manifest.json'), 'utf8')));
  console.log(`Verified ${viewEntries.length} independently loaded view modules.`);
}

module.exports = { verifyViewChunks, viewEntries };
