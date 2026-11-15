const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runTutorialPool, verifyTutorialGroup } = require('./tutorial-electron-pool.cjs');
const groups = [
  'welcome',
  'workspace-isolation',
  'curriculum',
  'amend-message',
  'amend-files',
  'reword',
  'reword-protected',
  'reword-referenced',
  'rebase-review',
  'rebase-reword',
  'rebase-squash',
  'rebase-fixup',
  'rebase-drop',
  'rebase-reorder',
  'rebase-edit',
  'rebase-staged',
  'rebase-conflict',
  'rebase-abort',
  'rebase-root',
  'rebase-off-head',
  'rebase-merge-guard',
  'cherry-pick',
  'cherry-pick-conflict',
  'cherry-pick-abort',
  'revert',
  'reset-soft',
  'reset-mixed',
  'reset-hard',
  'recovery',
  'recovery-message',
  'recovery-inspect',
  'recovery-reset',
  'repositories',
  'staging',
  'diff',
  'files',
  'formats',
  'editor',
  'text',
  'codecs',
  'hashes',
  'json',
  'yaml',
  'markup',
  'json-errors',
  'tree-create',
  'tree-rename',
  'tree-copy',
  'tree-replace',
  'tree-move',
  'tree-delete',
  'search-names',
  'search-content',
  'search-one',
  'search-all',
  'history',
  'history-files',
  'history-blame',
  'history-sources',
  'history-search',
  'history-forensic-string',
  'history-forensic-lines',
  'history-forensic-regex',
  'branches',
  'branches-switch',
  'branches-manage',
  'branches-unmerged',
  'branches-cleanup',
  'branches-cleanup-protection',
  'branches-cleanup-unmerged',
  'branches-carry-review',
  'branches-carry',
  'branches-park',
  'branches-park-restore',
  'stash-file',
  'stash-all',
  'stash-files',
  'stash-branch',
  'merge-review',
  'merge-fast-forward',
  'merge-commit',
  'merge-squash',
  'merge-outward',
  'merge-diverged',
  'merge-ff-guard',
  'merge-squash-diverged',
  'merge-revert',
  'tags-navigation',
  'tags-lightweight',
  'tags-annotated',
  'tags-delete',
  'submodules-navigation',
  'submodules-initialize',
  'submodules-update',
  'submodules-sync',
  'conflicts',
  'conflicts-choices',
  'conflicts-manual',
  'conflicts-abort',
  'conflicts-multiple',
  'conflicts-deletion',
];
const options = new Map();
for (const argument of process.argv.slice(2)) {
  const match = /^--(group|groups|checkpoint|language|shard|workers)=(.+)$/.exec(argument);
  const name = match?.[1] || (argument === '--list' ? 'list' : null);
  if (!name || options.has(name)) throw new Error('Unknown or duplicate tutorial smoke argument: ' + argument);
  options.set(name, match?.[2] || true);
}
const requestedGroup = options.get('group');
const requestedGroups = options.get('groups')?.split(',');
const checkpoint = options.get('checkpoint');
const language = options.get('language') || 'de';
const shard = options.get('shard');
if (!['de', 'en'].includes(language)) throw new Error('Unknown tutorial smoke language: ' + language);
if (requestedGroup && !groups.includes(requestedGroup)) throw new Error('Unknown tutorial smoke group: ' + requestedGroup);
if (requestedGroups && (new Set(requestedGroups).size !== requestedGroups.length || requestedGroups.some((group) => !groups.includes(group))))
  throw new Error('Use --groups=name,name with unique known tutorial groups.');
if ([requestedGroup, requestedGroups, checkpoint, shard].filter(Boolean).length > 1)
  throw new Error('Use only one of --group, --groups, --checkpoint or --shard.');
if (checkpoint && !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(checkpoint)) throw new Error('Use --checkpoint=chapter-id/step-id.');
let selectedGroups = checkpoint ? ['checkpoint'] : requestedGroup ? [requestedGroup] : requestedGroups || groups;
if (shard) {
  const match = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  const index = Number(match?.[1]);
  const count = Number(match?.[2]);
  if (!match || index > count || count > groups.length) throw new Error('Use --shard=index/count with 1 <= index <= count <= ' + groups.length + '.');
  selectedGroups = groups.filter((_group, groupIndex) => groupIndex % count === index - 1);
}
const workerOption = options.get('workers') || '1';
const requestedWorkers =
  workerOption === 'auto'
    ? Math.max(1, Math.min(4, Math.floor(os.availableParallelism() / 2), Math.floor(os.freemem() / (2 * 1024 ** 3))))
    : /^[1-9]\d*$/.test(workerOption)
      ? Number(workerOption)
      : NaN;
if (!Number.isSafeInteger(requestedWorkers) || requestedWorkers < 1 || requestedWorkers > groups.length)
  throw new Error('Use --workers=auto or a positive integer no greater than ' + groups.length + '.');
const workers = Math.min(requestedWorkers, selectedGroups.length);
if (options.has('list')) {
  console.log(JSON.stringify(selectedGroups));
  process.exit(0);
}
console.log(`Native tutorial suite${shard ? ' shard ' + shard : ''}: ${selectedGroups.length} groups, ${workers} worker${workers === 1 ? '' : 's'}.`);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-tutorial-electron-test-'));
const environment = {
  ...process.env,
  OGC_TUTORIAL_TEST_PROFILE: root,
  OGC_TUTORIAL_TEST_LANGUAGE: language,
  OPEN_GIT_CONTROL_API_DISABLED: 'true',
  NODE_ENV: 'production',
};
delete environment.ELECTRON_RUN_AS_NODE;
async function run() {
  try {
    if (workers > 1) {
      await runTutorialPool({
        groups: selectedGroups,
        workers,
        root,
        environment,
        executable: require('electron'),
        fixture: path.join(__dirname, 'tutorial-electron-fixture.js'),
        logDirectory: path.join(__dirname, '../node_modules/.cache/ogc-tutorial-electron', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid),
      });
      return;
    }
    for (const group of selectedGroups) {
      const started = Date.now();
      console.log('Native tutorial group:', group);
      fs.rmSync(path.join(root, 'tutorial-verified'), { force: true });
      const result = spawnSync(require('electron'), [path.join(__dirname, 'tutorial-electron-fixture.js')], {
        env: {
          ...environment,
          OGC_TUTORIAL_TEST_FRESH: group === 'welcome' ? '1' : '0',
          OGC_TUTORIAL_TEST_GROUP: group,
          OGC_TUTORIAL_TEST_CHECKPOINT: checkpoint || '',
        },
        windowsHide: true,
        stdio: 'inherit',
        timeout: 180_000,
      });
      if (result.error) throw result.error;
      assert.equal(result.status, 0, 'The native tutorial smoke test must finish successfully: ' + group);
      verifyTutorialGroup(group, root);
      console.log(`Native tutorial group ${group} passed in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
    }
  } finally {
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('ogc-tutorial-electron-test-'))
      throw new Error('Unsafe tutorial test profile.');
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = error.exitCode || 1;
});
