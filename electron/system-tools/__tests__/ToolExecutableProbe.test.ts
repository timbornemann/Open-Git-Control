import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeToolExecutables } from '../ToolExecutableProbe';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-tool-probe-test-'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-tool-probe-test-'))
    throw new Error('Unsafe fixture.');
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

function instrumentChild(source: string) {
  const preload = path.join(root, 'preload.cjs');
  fs.writeFileSync(preload, source);
  vi.stubEnv('NODE_OPTIONS', `--require="${preload.replace(/\\/g, '/')}"`);
}

describe('isolated program discovery', () => {
  it('skips missing paths, validates version output and preserves PATH precedence', async () => {
    const result = await probeToolExecutables([path.join(root, 'missing'), process.execPath], '^v\\d+');
    expect(result).toMatchObject({ executable: process.execPath, stdout: expect.stringMatching(/^v\d+/), timedOut: 0 });
    expect(await probeToolExecutables([process.execPath], '^git version ')).toMatchObject({ detail: expect.stringContaining('unrecognized') });
    expect(await probeToolExecutables([path.join(root, 'missing')])).toEqual({ timedOut: 0 });
  });

  it('keeps the main loop responsive through a genuinely blocked stat and finds a later working executable', async () => {
    const blocked = path.join(root, 'blocked');
    instrumentChild(`const fs=require('node:fs'),stat=fs.statSync;fs.statSync=function(file,...args){
      if(file===${JSON.stringify(blocked)})Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
      return stat.call(this,file,...args);
    };`);
    let ticks = 0;
    const timer = setInterval(() => ticks++, 10);
    try {
      expect(await probeToolExecutables([blocked, process.execPath], '^v\\d+', { fileTimeoutMs: 100, totalTimeoutMs: 8000 })).toMatchObject({
        executable: process.execPath,
        timedOut: 1,
      });
      expect(ticks).toBeGreaterThan(2);
    } finally {
      clearInterval(timer);
    }
  }, 12000);

  it('verifies Windows execution aliases even if stat reports access denied', async () => {
    const alias = path.join(root, 'winget.exe');
    instrumentChild(`const fs=require('node:fs'),cp=require('node:child_process'),stat=fs.statSync,run=cp.spawnSync;
      fs.statSync=function(file,...args){if(file===${JSON.stringify(alias)})throw Object.assign(new Error('alias'),{code:'EACCES'});return stat.call(this,file,...args);};
      cp.spawnSync=function(file,args,options){return file===${JSON.stringify(alias)}?{status:0,stdout:'v1.29.0',stderr:''}:run(file,args,options);};`);
    expect(await probeToolExecutables([alias])).toMatchObject({ executable: alias, stdout: 'v1.29.0', timedOut: 0 });
  });

  it('bounds stalled executable creation and continues to the next candidate', async () => {
    const blocked = path.join(root, 'blocked.exe');
    fs.writeFileSync(blocked, 'fixture');
    instrumentChild(`const cp=require('node:child_process'),run=cp.spawnSync;cp.spawnSync=function(file,...args){
      if(file===${JSON.stringify(blocked)})Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);
      return run.call(this,file,...args);
    };`);
    expect(await probeToolExecutables([blocked, process.execPath], '^v\\d+', { commandTimeoutMs: 100, totalTimeoutMs: 8000 })).toMatchObject({
      executable: process.execPath,
      timedOut: 1,
    });
  }, 12000);

  it('stops a complete check at its deadline even if every local search path is blocked', async () => {
    instrumentChild(`require('node:fs').statSync=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);`);
    expect(await probeToolExecutables([path.join(root, 'one'), path.join(root, 'two')], undefined, { totalTimeoutMs: 150 })).toMatchObject({
      detail: expect.stringContaining('took too long'),
    });
  });
  it('cancels a blocked helper and never starts a new process for an already cancelled request', async () => {
    instrumentChild(`require('node:fs').statSync=()=>Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);`);
    const controller = new AbortController();
    const pending = probeToolExecutables([path.join(root, 'blocked')], undefined, { signal: controller.signal });
    controller.abort();
    expect(await pending).toEqual({ detail: 'Program check cancelled.', timedOut: 0 });
    expect(await probeToolExecutables([path.join(root, 'blocked')], undefined, { signal: controller.signal })).toEqual({
      detail: 'Program check cancelled.',
      timedOut: 0,
    });
  });
});
