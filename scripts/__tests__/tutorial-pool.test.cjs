const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { runTutorialPool } = require('../tutorial-electron-pool.cjs');

function setup(t, groups, workers, environment = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-tutorial-pool-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ogc-tutorial-pool-test-'));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  const fixture = path.join(root, 'fixture.cjs');
  fs.writeFileSync(
    fixture,
    `
    const fs=require('node:fs'),path=require('node:path');
    const group=process.env.OGC_TUTORIAL_TEST_GROUP,profile=process.env.OGC_TUTORIAL_TEST_PROFILE;
    const events=process.env.POOL_TEST_EVENTS;
    const record=event=>fs.appendFileSync(events,JSON.stringify({event,group,profile,pid:process.pid})+'\\n');
    record('start');console.log('Testing '+group);
    const timer=setInterval(()=>{
      if(group.startsWith('hang'))return;
      if(fs.readFileSync(events,'utf8').split('\\n').filter(line=>line.includes('"event":"start"')).length<Number(process.env.POOL_TEST_BARRIER||1))return;
      clearInterval(timer);
      if(group!=='unverified')fs.writeFileSync(path.join(profile,'tutorial-verified'),'yes');
      record('end');process.exit(group==='fail'?1:0);
    },10);
  `,
  );
  return {
    root,
    groups,
    workers,
    fixture,
    executable: process.execPath,
    environment: { ...process.env, POOL_TEST_EVENTS: path.join(root, 'events.ndjson'), ...environment },
    logDirectory: path.join(root, 'logs'),
    report: () => {},
    timeout: 10_000,
  };
}

test('the pool runs groups concurrently within its limit and isolates worker profiles', async (t) => {
  const options = setup(t, ['one', 'two', 'three', 'four', 'five'], 2, { POOL_TEST_BARRIER: '2' });
  await runTutorialPool(options);
  const events = fs
    .readFileSync(options.environment.POOL_TEST_EVENTS, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  let active = 0,
    peak = 0;
  for (const event of events) {
    active += event.event === 'start' ? 1 : -1;
    peak = Math.max(peak, active);
    assert.ok(active >= 0 && active <= 2);
  }
  assert.equal(peak, 2);
  assert.equal(active, 0);
  const starts = events.filter((event) => event.event === 'start');
  assert.deepEqual(starts.map((event) => event.group).sort(), [...options.groups].sort());
  assert.equal(new Set(starts.map((event) => event.profile)).size, 2);
  assert.deepEqual(fs.readdirSync(options.logDirectory).sort(), options.groups.map((group) => group + '.log').sort());
});

test('a failed group stops queueing further groups and produces a failure', async (t) => {
  const options = setup(t, ['fail', 'not-started'], 1);
  await assert.rejects(runTutorialPool(options), /Tutorial group failed: fail/);
  assert.ok(!fs.readFileSync(options.environment.POOL_TEST_EVENTS, 'utf8').includes('not-started'));
});

test('exit code zero without completing the checks cannot pass the pool', async (t) => {
  const options = setup(t, ['unverified'], 1);
  await assert.rejects(runTutorialPool(options), /Every tutorial check must complete before exit: unverified/);
});

test('a stalled group is terminated at its deadline', async (t) => {
  const options = setup(t, ['hang'], 1);
  await assert.rejects(runTutorialPool({ ...options, timeout: 100 }), /Tutorial group timed out: hang/);
});

test('Ctrl+C terminates active worker process trees and retains exit code 130', (t) => {
  const options = setup(t, ['hang-one', 'hang-two'], 2);
  const { environment, report: _report, ...controllerOptions } = options;
  const controller = path.join(options.root, 'controller.cjs');
  fs.writeFileSync(
    controller,
    `
    const fs=require('node:fs');
    const {runTutorialPool}=require(${JSON.stringify(path.resolve(__dirname, '../tutorial-electron-pool.cjs'))});
    runTutorialPool({...${JSON.stringify(controllerOptions)},environment:{...process.env,POOL_TEST_EVENTS:${JSON.stringify(environment.POOL_TEST_EVENTS)}},report:()=>{}}).catch(error=>{process.exitCode=error.exitCode||1;});
    const wait=setInterval(()=>{
      if(fs.existsSync(${JSON.stringify(options.environment.POOL_TEST_EVENTS)}) && fs.readFileSync(${JSON.stringify(options.environment.POOL_TEST_EVENTS)},'utf8').trim().split('\\n').length===2){
        clearInterval(wait);process.emit('SIGINT');
      }
    },10);
  `,
  );
  const result = spawnSync(process.execPath, [controller], { windowsHide: true, encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 130, result.stderr + result.stdout);
  for (const event of fs
    .readFileSync(options.environment.POOL_TEST_EVENTS, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line)))
    assert.throws(() => process.kill(event.pid, 0), { code: 'ESRCH' });
});
