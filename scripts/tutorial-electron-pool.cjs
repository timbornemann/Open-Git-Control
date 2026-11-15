const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');

function verifyTutorialGroup(group, profile) {
  const marker = path.join(profile, 'tutorial-verified');
  assert.equal(fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : null, 'yes', 'Every tutorial check must complete before exit: ' + group);
  if (group === 'workspace-isolation')
    assert.match(fs.readFileSync(path.join(profile, 'shutdown-git-drained'), 'utf8'), /^[0-9a-f]{40}$/, 'Shutdown must drain the real Git read.');
}

/** Each worker owns its profile and renderer; native input targets that renderer. */
async function runTutorialPool({ groups, workers, root, environment, executable, fixture, logDirectory, report = console.log, timeout = 180_000 }) {
  assert.ok(Number.isSafeInteger(workers) && workers > 0, 'A positive worker count is required.');
  assert.ok(groups.length > 0 && new Set(groups).size === groups.length, 'Select unique tutorial groups.');
  fs.mkdirSync(logDirectory, { recursive: true });
  const active = new Set();
  let next = 0;
  let failure;
  function terminate(child) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  }
  const interrupted = (signal) => {
    failure ||= Object.assign(new Error('Tutorial tests interrupted: ' + signal), { exitCode: signal === 'SIGINT' ? 130 : 143 });
    for (const child of active) terminate(child);
  };
  const onInterrupt = () => interrupted('SIGINT');
  const onTerminate = () => interrupted('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  async function worker(index) {
    const profile = path.join(root, `worker-${index + 1}`);
    fs.mkdirSync(profile);
    while (!failure && next < groups.length) {
      const group = groups[next++];
      const started = Date.now();
      const logPath = path.join(logDirectory, group + '.log');
      report(`[worker ${index + 1}] Starting ${group}`);
      try {
        fs.rmSync(path.join(profile, 'tutorial-verified'), { force: true });
        await new Promise((resolve, reject) => {
          const log = fs.createWriteStream(logPath);
          const child = spawn(executable, [fixture], {
            env: {
              ...environment,
              OGC_TUTORIAL_TEST_PROFILE: profile,
              OGC_TUTORIAL_TEST_GROUP: group,
              OGC_TUTORIAL_TEST_CHECKPOINT: '',
              OGC_TUTORIAL_TEST_FRESH: group === 'welcome' ? '1' : '0',
              OGC_TUTORIAL_TEST_PARALLEL: '1',
            },
            windowsHide: true,
            detached: process.platform !== 'win32',
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          active.add(child);
          let spawnError;
          let expired = false;
          const timer = setTimeout(() => {
            expired = true;
            terminate(child);
          }, timeout);
          for (const stream of [child.stdout, child.stderr]) {
            stream.on('data', (chunk) => log.write(chunk));
            readline.createInterface({ input: stream }).on('line', (line) => report(`[${group}] ${line}`));
          }
          child.on('error', (error) => {
            spawnError = error;
          });
          log.on('error', (error) => {
            spawnError = error;
            terminate(child);
          });
          child.once('close', (code, signal) => {
            clearTimeout(timer);
            active.delete(child);
            log.end(() => {
              try {
                if (spawnError) throw spawnError;
                assert.ok(!expired, `Tutorial group timed out: ${group}`);
                assert.equal(code, 0, `Tutorial group failed: ${group}${signal ? ' (' + signal + ')' : ''}. Log: ${logPath}`);
                verifyTutorialGroup(group, profile);
                resolve();
              } catch (error) {
                reject(error);
              }
            });
          });
        });
        report(`[worker ${index + 1}] ${group} passed in ${((Date.now() - started) / 1000).toFixed(1)}s`);
      } catch (error) {
        failure ||= error;
      }
    }
  }
  try {
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(workers, groups.length) }, (_value, index) =>
        worker(index).catch((error) => {
          failure ||= error;
          throw error;
        }),
      ),
    );
    for (const result of results) if (result.status === 'rejected') failure ||= result.reason;
    if (failure) throw failure;
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    report('Tutorial logs: ' + logDirectory);
  }
}

module.exports = { runTutorialPool, verifyTutorialGroup };
