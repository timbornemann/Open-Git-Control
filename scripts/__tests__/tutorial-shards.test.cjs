const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const runner = path.resolve(__dirname, '../test-tutorial-electron.js');
const list = (...args) => spawnSync(process.execPath, [runner, '--list', ...args], { encoding: 'utf8', windowsHide: true });

test('all six tutorial shards cover every native group exactly once', () => {
  const full = list();
  assert.equal(full.status, 0, full.stderr);
  const groups = JSON.parse(full.stdout);
  assert.ok(groups.length > 90);
  assert.equal(new Set(groups).size, groups.length);
  const assigned = Array.from({ length: 6 }, (_value, index) => {
    const result = list(`--shard=${index + 1}/6`);
    assert.equal(result.status, 0, result.stderr);
    const selected = JSON.parse(result.stdout);
    assert.ok(selected.length > 0);
    return selected;
  });
  assert.deepEqual(assigned.flat().sort(), [...groups].sort());
  assert.ok(Math.max(...assigned.map((group) => group.length)) - Math.min(...assigned.map((group) => group.length)) <= 1);
});

test('group and checkpoint selection remain usable without launching Electron', () => {
  assert.deepEqual(JSON.parse(list('--group=branches-switch').stdout), ['branches-switch']);
  assert.deepEqual(JSON.parse(list('--checkpoint=tree-create/write').stdout), ['checkpoint']);
});

test('invalid or conflicting selection cannot accidentally run the entire tutorial suite', () => {
  for (const args of [
    ['--shard=0/6'],
    ['--shard=7/6'],
    ['--shard=1/0'],
    ['--shard=1/999'],
    ['--shard=1.5/6'],
    ['--shard=abc'],
    ['--group=missing'],
    ['--language=fr'],
    ['--shards=1/6'],
    ['--group=welcome', '--shard=1/6'],
    ['--checkpoint=tree-create/write', '--shard=1/6'],
    ['--group=welcome', '--group=curriculum'],
  ])
    assert.notEqual(list(...args).status, 0, args.join(' '));
});
