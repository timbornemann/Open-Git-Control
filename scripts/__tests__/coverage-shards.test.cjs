const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('coverage merging rejects missing or foreign blobs instead of silently lowering coverage', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-coverage-shards-'));
  const reports = path.join(directory, '.vitest-reports');
  fs.mkdirSync(reports);
  const verify = () =>
    spawnSync(process.execPath, [path.resolve(__dirname, '../verify-coverage-shards.cjs')], {
      cwd: directory,
      env: { ...process.env, OGC_COVERAGE_SHARDS: '[1,2]' },
      windowsHide: true,
      encoding: 'utf8',
    });
  try {
    fs.writeFileSync(path.join(reports, 'blob-1-2.json'), '{}');
    assert.notEqual(verify().status, 0);
    fs.writeFileSync(path.join(reports, 'blob-2-2.json'), '{}');
    const complete = verify();
    assert.equal(complete.status, 0, complete.stderr);
    fs.writeFileSync(path.join(reports, 'blob-1-4.json'), '{}');
    assert.notEqual(verify().status, 0);
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('ogc-coverage-shards-'));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
