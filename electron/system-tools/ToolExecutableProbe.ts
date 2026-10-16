import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { gitProcessTree } from '../git/GitProcessTree';

export type ToolExecutableProbeResult = { executable?: string; stdout?: string; detail?: string; timedOut: number };
export type ToolExecutableProbeOptions = {
  fileTimeoutMs?: number;
  commandTimeoutMs?: number;
  totalTimeoutMs?: number;
  appleGit?: boolean;
  signal?: AbortSignal;
};

// Both stat and CreateProcess can block on Windows, including local execution
// aliases, redirected directories and disconnected drives. Only this disposable
// process touches candidate paths; none of that work runs on the app's UI loop.
const PROBE = `const fs=require('node:fs'),cp=require('node:child_process'),os=require('node:os');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const report=value=>fs.writeSync(1,JSON.stringify(value)+'\\n');
let detail;
for(let index=0;index<input.candidates.length;index++) {
 const executable=input.candidates[index];
 report({index,phase:'file'});
 try {if(!fs.statSync(executable).isFile())continue;}
 catch(error) {if(!['EACCES','EPERM'].includes(error.code))continue;}
 report({index,phase:'command'});
 const options={cwd:os.homedir(),env:{...process.env,LC_ALL:'C',LANG:'C'},windowsHide:true,timeout:input.commandTimeoutMs,encoding:'utf8',maxBuffer:65536,shell:false};
 if(input.appleGit && executable==='/usr/bin/git') {
  const check=cp.spawnSync('/usr/bin/xcode-select',['-p'],options);
  if(check.error || check.status!==0)continue;
 }
 const result=cp.spawnSync(executable,['--version'],options);
 if(result.error || result.status!==0) {detail=String(result.error?.message || result.stderr || 'The executable could not be started.').slice(0,500);continue;}
 const stdout=String(result.stdout || '');
 if(input.pattern && !new RegExp(input.pattern).test(stdout)) {detail='The executable returned an unrecognized version.';continue;}
 report({result:true,index,stdout});process.exit(0);
}
report({result:true,detail});`;

/** A stalled candidate is skipped, so a working program later in PATH is still found. */
export function probeToolExecutables(candidates: string[], pattern?: string, options: ToolExecutableProbeOptions = {}): Promise<ToolExecutableProbeResult> {
  if (!candidates.length) return Promise.resolve({ timedOut: 0 });
  if (options.signal?.aborted) return Promise.resolve({ detail: 'Program check cancelled.', timedOut: 0 });
  const fileTimeoutMs = options.fileTimeoutMs ?? 1000;
  const commandTimeoutMs = options.commandTimeoutMs ?? 8000;
  const totalTimeoutMs = options.totalTimeoutMs ?? 15_000;
  return new Promise((resolve) => {
    let completed = false;
    let timedOut = 0;
    let stopCurrent: ((terminate: boolean) => Promise<void>) | undefined;
    let lastDetail: string | undefined;
    const finish = (result: Omit<ToolExecutableProbeResult, 'timedOut'>, terminate = true) => {
      if (completed) return;
      completed = true;
      clearTimeout(deadline);
      options.signal?.removeEventListener('abort', abort);
      void (stopCurrent?.(terminate) || Promise.resolve()).then(() => resolve({ ...result, timedOut }));
    };
    const deadline = setTimeout(() => {
      timedOut++;
      finish({ detail: 'Checking installed programs took too long. Try checking again.' });
    }, totalTimeoutMs);
    const abort = () => finish({ detail: 'Program check cancelled.' });
    options.signal?.addEventListener('abort', abort, { once: true });
    const start = (offset: number) => {
      if (completed) return;
      if (offset >= candidates.length) {
        finish({ ...(lastDetail ? { detail: lastDetail } : {}) });
        return;
      }
      const remaining = candidates.slice(offset);
      const child = spawn(process.execPath, ['-e', PROBE], {
        cwd: path.dirname(process.execPath),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const tree = gitProcessTree(child);
      let active = true;
      let index = 0;
      let buffer = '';
      let stderr = '';
      const stop = (terminate: boolean) => {
        active = false;
        clearTimeout(timer);
        if (terminate) tree.stop();
        return tree.waitForStop();
      };
      stopCurrent = stop;
      const skip = () => {
        if (!active || completed) return;
        timedOut++;
        lastDetail = 'An installed program or search path did not respond in time.';
        void stop(true).then(() => start(offset + index + 1));
      };
      let timer = setTimeout(skip, Math.min(5000, totalTimeoutMs));
      child.stdout.on('data', (data: Buffer) => {
        if (!active || completed) return;
        buffer += data.toString('utf8');
        if (buffer.length > 128 * 1024) {
          finish({ detail: 'The program check returned too much output.' });
          return;
        }
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0 && active && !completed) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const message = JSON.parse(line);
            if (message.result === true) {
              const executable = Number.isInteger(message.index) ? remaining[message.index] : undefined;
              finish(
                {
                  ...(executable && typeof message.stdout === 'string' ? { executable, stdout: message.stdout } : {}),
                  ...(typeof message.detail === 'string' ? { detail: message.detail.slice(0, 500) } : lastDetail ? { detail: lastDetail } : {}),
                },
                true,
              );
            } else if (Number.isInteger(message.index) && message.index >= 0 && message.index < remaining.length) {
              index = message.index;
              clearTimeout(timer);
              timer = setTimeout(skip, message.phase === 'file' ? fileTimeoutMs : commandTimeoutMs + 500);
            }
          } catch {
            finish({ detail: 'The program check returned an invalid result.' });
          }
        }
      });
      child.stderr.on('data', (data: Buffer) => {
        if (stderr.length < 4096) stderr += data.toString('utf8');
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ candidates: remaining, pattern, commandTimeoutMs, appleGit: options.appleGit }));
      child.once('error', (error) => finish({ detail: error.message.slice(0, 500) }, false));
      child.once('close', () => {
        if (active && !completed) finish({ detail: stderr.slice(0, 500) || 'The program check ended without a result.' }, false);
      });
    };
    start(0);
  });
}
