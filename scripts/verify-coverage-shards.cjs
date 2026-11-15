const assert = require('node:assert/strict');
const fs = require('node:fs');

const shards = JSON.parse(process.env.OGC_COVERAGE_SHARDS || 'null');
assert.ok(Array.isArray(shards) && shards.length > 0, 'Declare the expected coverage shards.');
assert.deepEqual(
  shards,
  Array.from({ length: shards.length }, (_value, index) => index + 1),
  'Coverage shard indices must be consecutive.',
);
const expected = shards.map((index) => `blob-${index}-${shards.length}.json`).sort();
assert.deepEqual(fs.readdirSync('.vitest-reports').sort(), expected, 'Every coverage shard must be present exactly once before checking thresholds.');
console.log(`Verified all ${shards.length} coverage shard reports.`);
