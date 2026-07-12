import { randomUUID } from 'crypto';
import * as path from 'path';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { BrowserWindow } from 'electron';
import { getRepositoryRunPlatform, getRunPlatformCommand, isRepositoryRunActionConfigured } from '../../src/types/repositoryRun';
import type {
  RepositoryRunActionId,
  RepositoryRunConfigDto,
  RepositoryRunEventDto,
  RepositoryRunOutputLineDto,
  RepositoryRunShell,
  RepositoryRunStateDto,
  RepositoryRunStepDto,
} from '../../src/types/repositoryRun';
import type { RepositoryRunConfigService } from './RepositoryRunConfigService';
import { IpcChannel } from '../../src/types/ipcContract';

const MAX_OUTPUT_LINES = 4_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_LINE_BYTES = 64 * 1024;
const DEFAULT_STOP_GRACE_MS = 2_000;
const DEFAULT_FORCE_STOP_WAIT_MS = 2_000;
const ignoreLateChildError = (): void => undefined;

type ActiveRun = RepositoryRunStateDto & {
  config: RepositoryRunConfigDto;
  child: ChildProcessWithoutNullStreams | null;
  cancelled: boolean;
  outputBytes: number;
  sequence: number;
  streamRemainders: Record<'stdout' | 'stderr', Buffer>;
  streamLineOpen: Record<'stdout' | 'stderr', boolean>;
  streamLastWasCarriageReturn: Record<'stdout' | 'stderr', boolean>;
  stopTimer: NodeJS.Timeout | null;
  forceStopTimer: NodeJS.Timeout | null;
  hardKillRequested: boolean;
  resolveActiveStep: (() => void) | null;
};

const getShellInvocation = (shell: RepositoryRunShell, command: string): { executable: string; args: string[] } => {
  if (shell === 'powershell')
    return {
      executable: process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe',
      args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    };
  if (shell === 'cmd') return { executable: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', command] };
  if (shell === 'zsh') return { executable: '/bin/zsh', args: ['-lc', command] };
  return { executable: '/usr/bin/env', args: ['bash', '-lc', command] };
};

export class RepositoryRunService {
  private activeRun: ActiveRun | null = null;
  private terminationUnconfirmedChild: ChildProcessWithoutNullStreams | null = null;

  constructor(
    private readonly configService: RepositoryRunConfigService,
    private readonly stopGraceMs = DEFAULT_STOP_GRACE_MS,
    private readonly forceStopWaitMs = DEFAULT_FORCE_STOP_WAIT_MS,
  ) {}

  getState(): RepositoryRunStateDto | null {
    return this.activeRun ? this.snapshot(this.activeRun) : null;
  }

  async start(repoPath: string, action: RepositoryRunActionId): Promise<RepositoryRunStateDto> {
    if (this.activeRun?.status === 'running') throw new Error('Another repository command is already running.');
    if (this.terminationUnconfirmedChild) {
      throw new Error('The previous repository command may still be running. Wait until its process exit is confirmed before starting another command.');
    }
    const configState = this.configService.read(repoPath);
    if (!configState.config) throw new Error(configState.error || 'Run configuration is invalid.');
    if (!isRepositoryRunActionConfigured(configState.config, action, getRepositoryRunPlatform(process.platform))) {
      throw new Error(`The ${action} action is not configured for this platform.`);
    }

    const run: ActiveRun = {
      runId: randomUUID(),
      repoPath,
      action,
      status: 'running',
      startedAt: Date.now(),
      activeStepIndex: 0,
      stepCount: configState.config.actions[action].steps.length,
      steps: configState.config.actions[action].steps.map((step) => ({ label: step.label, parser: step.parser })),
      output: [],
      config: configState.config,
      child: null,
      cancelled: false,
      outputBytes: 0,
      sequence: 0,
      streamRemainders: { stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) },
      streamLineOpen: { stdout: false, stderr: false },
      streamLastWasCarriageReturn: { stdout: false, stderr: false },
      stopTimer: null,
      forceStopTimer: null,
      hardKillRequested: false,
      resolveActiveStep: null,
    };
    this.activeRun = run;
    this.emitState();
    void this.execute(run);
    return this.snapshot(run);
  }

  stop(runId?: string): boolean {
    const run = this.activeRun;
    if (!run || run.status !== 'running' || (runId && run.runId !== runId)) return false;
    run.cancelled = true;
    this.appendSystemLine(run, 'Stopping command…');
    const child = run.child;
    if (child?.pid) {
      this.signalProcessTree(run, false);
      if (!run.hardKillRequested) {
        run.stopTimer = setTimeout(() => this.escalateStop(run), this.stopGraceMs);
        run.stopTimer.unref?.();
      }
    } else {
      run.resolveActiveStep?.();
    }
    return true;
  }

  dispose(): void {
    this.stop();
  }

  private async execute(run: ActiveRun): Promise<void> {
    try {
      const steps = run.config.actions[run.action].steps;
      for (let index = 0; index < steps.length; index += 1) {
        if (run.cancelled) break;
        run.activeStepIndex = index;
        this.appendSystemLine(run, `Starting step ${index + 1}/${steps.length}: ${steps[index].label}`);
        this.emitState();
        const exitCode = await this.executeStep(run, steps[index]);
        // A process is a step boundary even when it did not finish its last
        // line. Flush now so output cannot be prepended to the next step and
        // parsed with that step's parser.
        this.flushRemainders(run, index);
        if (run.cancelled) break;
        if (exitCode !== 0) {
          run.status = 'failed';
          run.exitCode = exitCode;
          run.message = `Step ${index + 1} failed with exit code ${exitCode}.`;
          this.appendSystemLine(run, run.message);
          return;
        }
      }
      if (run.cancelled) {
        run.status = 'cancelled';
        run.message = 'Command stopped by user.';
      } else {
        run.status = 'succeeded';
        run.exitCode = 0;
        run.message = 'Command completed successfully.';
        this.appendSystemLine(run, run.message);
      }
    } catch (error) {
      run.status = run.cancelled ? 'cancelled' : 'failed';
      run.message = error instanceof Error ? error.message : 'Command could not be started.';
      this.appendSystemLine(run, run.message);
    } finally {
      this.clearStopTimers(run);
      run.child = null;
      run.resolveActiveStep = null;
      run.finishedAt = Date.now();
      this.flushRemainders(run);
      this.emitState();
    }
  }

  private executeStep(run: ActiveRun, step: RepositoryRunStepDto): Promise<number> {
    const platformCommand = getRunPlatformCommand(step, getRepositoryRunPlatform(process.platform));
    if (!platformCommand) return Promise.reject(new Error(`Step "${step.label}" is not configured for this platform.`));
    const invocation = getShellInvocation(platformCommand.shell, platformCommand.command);
    return new Promise((resolve, reject) => {
      const child = spawn(invocation.executable, invocation.args, {
        cwd: run.repoPath,
        detached: process.platform !== 'win32',
        env: process.env,
        windowsHide: true,
      });
      run.child = child;
      let settled = false;
      const onStdout = (chunk: Buffer | string): void => {
        if (!settled) this.appendOutput(run, 'stdout', chunk);
      };
      const onStderr = (chunk: Buffer | string): void => {
        if (!settled) this.appendOutput(run, 'stderr', chunk);
      };
      const onError = (error: Error): void => settle(() => reject(error));
      const onClose = (code: number | null): void => settle(() => resolve(code ?? (run.cancelled ? 0 : 1)));
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        this.clearStopTimers(run);
        run.resolveActiveStep = null;
        child.stdout.off('data', onStdout);
        child.stderr.off('data', onStderr);
        child.off('error', onError);
        child.off('close', onClose);
        child.once('error', ignoreLateChildError);
        callback();
      };
      run.resolveActiveStep = () => settle(() => resolve(0));
      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.once('error', onError);
      child.once('close', onClose);
    });
  }

  private signalProcessTree(run: ActiveRun, force: boolean): void {
    const child = run.child;
    if (!child?.pid) return;

    if (process.platform === 'win32') {
      const args = ['/pid', String(child.pid), '/t', ...(force ? ['/f'] : [])];
      let killer: ReturnType<typeof spawn>;
      try {
        killer = spawn('taskkill.exe', args, { windowsHide: true });
      } catch (error) {
        this.appendSystemLine(run, `Could not ${force ? 'force-stop' : 'stop'} process tree: ${error instanceof Error ? error.message : String(error)}`);
        if (!force) this.escalateStop(run);
        return;
      }
      let handled = false;
      const handleFailure = (message: string): void => {
        if (handled) return;
        handled = true;
        this.appendSystemLine(run, message);
        if (!force) this.escalateStop(run);
      };
      killer.once('error', (error) => handleFailure(`Could not ${force ? 'force-stop' : 'stop'} process tree: ${error.message}`));
      killer.once('close', (code) => {
        if (code !== 0) handleFailure(`taskkill exited with code ${code ?? 'unknown'}.`);
      });
      return;
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch (error) {
        this.appendSystemLine(run, `Could not send ${signal}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private escalateStop(run: ActiveRun): void {
    if (run.status !== 'running' || !run.cancelled || run.hardKillRequested) return;
    run.hardKillRequested = true;
    if (run.stopTimer) {
      clearTimeout(run.stopTimer);
      run.stopTimer = null;
    }
    this.appendSystemLine(run, 'Command did not stop in time; force-stopping it.');
    this.signalProcessTree(run, true);
    run.forceStopTimer = setTimeout(() => {
      if (run.status === 'running' && run.cancelled) {
        this.appendSystemLine(run, 'Process termination could not be confirmed; marking the command as cancelled.');
        if (run.child) this.blockNewRunsUntilExit(run.child);
        run.resolveActiveStep?.();
      }
    }, this.forceStopWaitMs);
    run.forceStopTimer.unref?.();
  }

  private blockNewRunsUntilExit(child: ChildProcessWithoutNullStreams): void {
    this.terminationUnconfirmedChild = child;
    const release = (): void => {
      child.off('exit', release);
      child.off('close', release);
      if (this.terminationUnconfirmedChild === child) this.terminationUnconfirmedChild = null;
    };
    child.once('exit', release);
    child.once('close', release);
  }

  private clearStopTimers(run: ActiveRun): void {
    if (run.stopTimer) clearTimeout(run.stopTimer);
    if (run.forceStopTimer) clearTimeout(run.forceStopTimer);
    run.stopTimer = null;
    run.forceStopTimer = null;
  }

  private appendSystemLine(run: ActiveRun, text: string): void {
    this.appendLine(run, 'system', text, run.activeStepIndex);
  }

  private appendOutput(run: ActiveRun, stream: 'stdout' | 'stderr', chunk: Buffer | string): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
    let segmentStart = 0;
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      if (byte !== 10 && byte !== 13) {
        run.streamLastWasCarriageReturn[stream] = false;
        continue;
      }

      this.appendOutputSegment(run, stream, bytes.subarray(segmentStart, index));
      if (byte === 10 && run.streamLastWasCarriageReturn[stream]) {
        run.streamLastWasCarriageReturn[stream] = false;
      } else {
        this.finishOutputLine(run, stream);
        run.streamLastWasCarriageReturn[stream] = byte === 13;
      }
      segmentStart = index + 1;
    }
    this.appendOutputSegment(run, stream, bytes.subarray(segmentStart));
  }

  private appendOutputSegment(run: ActiveRun, stream: 'stdout' | 'stderr', segment: Buffer): void {
    if (segment.length === 0) return;
    run.streamLineOpen[stream] = true;
    let offset = 0;
    while (offset < segment.length) {
      const remainder = run.streamRemainders[stream];
      const take = Math.min(segment.length - offset, MAX_OUTPUT_LINE_BYTES - remainder.length + 4);
      const nextSlice = segment.subarray(offset, offset + take);
      const combined = remainder.length > 0 ? Buffer.concat([remainder, nextSlice]) : nextSlice;
      offset += take;

      if (combined.length < MAX_OUTPUT_LINE_BYTES) {
        run.streamRemainders[stream] = Buffer.from(combined);
        continue;
      }

      let safeEnd = Math.min(MAX_OUTPUT_LINE_BYTES, combined.length);
      while (safeEnd > 0 && safeEnd < combined.length && (combined[safeEnd] & 0xc0) === 0x80) safeEnd -= 1;
      if (safeEnd === 0) safeEnd = Math.min(MAX_OUTPUT_LINE_BYTES, combined.length);
      this.appendLine(run, stream, combined.subarray(0, safeEnd).toString('utf8'), run.activeStepIndex);
      run.streamRemainders[stream] = Buffer.from(combined.subarray(safeEnd));
    }
  }

  private finishOutputLine(run: ActiveRun, stream: 'stdout' | 'stderr', stepIndex = run.activeStepIndex): void {
    const remainder = run.streamRemainders[stream];
    if (remainder.length > 0) {
      this.appendLine(run, stream, remainder.toString('utf8'), stepIndex);
    } else if (!run.streamLineOpen[stream]) {
      this.appendLine(run, stream, '', stepIndex);
    }
    run.streamRemainders[stream] = Buffer.alloc(0);
    run.streamLineOpen[stream] = false;
  }

  private flushRemainders(run: ActiveRun, stepIndex = run.activeStepIndex): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const remainder = run.streamRemainders[stream];
      if (remainder.length > 0) this.appendLine(run, stream, remainder.toString('utf8'), stepIndex);
      run.streamRemainders[stream] = Buffer.alloc(0);
      run.streamLineOpen[stream] = false;
      run.streamLastWasCarriageReturn[stream] = false;
    }
  }

  private appendLine(run: ActiveRun, stream: RepositoryRunOutputLineDto['stream'], text: string, stepIndex: number): void {
    const line: RepositoryRunOutputLineDto = { sequence: ++run.sequence, stream, text, timestamp: Date.now(), stepIndex };
    const lineBytes = Buffer.byteLength(text, 'utf8');
    while (run.output.length >= MAX_OUTPUT_LINES || run.outputBytes + lineBytes > MAX_OUTPUT_BYTES) {
      const removed = run.output.shift();
      if (removed) run.outputBytes -= Buffer.byteLength(removed.text, 'utf8');
      else break;
    }
    run.output.push(line);
    run.outputBytes += lineBytes;
    this.broadcast({ type: 'output', runId: run.runId, line });
  }

  private snapshot(run: ActiveRun): RepositoryRunStateDto {
    const {
      config: _config,
      child: _child,
      cancelled: _cancelled,
      outputBytes: _outputBytes,
      sequence: _sequence,
      streamRemainders: _streamRemainders,
      streamLineOpen: _streamLineOpen,
      streamLastWasCarriageReturn: _streamLastWasCarriageReturn,
      stopTimer: _stopTimer,
      forceStopTimer: _forceStopTimer,
      hardKillRequested: _hardKillRequested,
      resolveActiveStep: _resolveActiveStep,
      ...state
    } = run;
    return { ...state, output: [...state.output] };
  }

  private emitState(): void {
    this.broadcast({ type: 'state', state: this.getState() });
  }

  private broadcast(event: RepositoryRunEventDto): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(IpcChannel.RepositoryRunEvent, event);
      }
    }
  }
}
