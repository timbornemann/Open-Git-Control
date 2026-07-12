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

type ActiveRun = RepositoryRunStateDto & {
  config: RepositoryRunConfigDto;
  child: ChildProcessWithoutNullStreams | null;
  cancelled: boolean;
  outputBytes: number;
  sequence: number;
  streamRemainders: Record<'stdout' | 'stderr', string>;
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

  constructor(private readonly configService: RepositoryRunConfigService) {}

  getState(): RepositoryRunStateDto | null {
    return this.activeRun ? this.snapshot(this.activeRun) : null;
  }

  async start(repoPath: string, action: RepositoryRunActionId): Promise<RepositoryRunStateDto> {
    if (this.activeRun?.status === 'running') throw new Error('Another repository command is already running.');
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
      streamRemainders: { stdout: '', stderr: '' },
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
      if (process.platform === 'win32') {
        spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${child.pid} /t /f`], { windowsHide: true });
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      }
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
      run.child = null;
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
      child.stdout.on('data', (chunk: Buffer) => this.appendOutput(run, 'stdout', chunk.toString('utf8')));
      child.stderr.on('data', (chunk: Buffer) => this.appendOutput(run, 'stderr', chunk.toString('utf8')));
      child.once('error', reject);
      child.once('close', (code) => resolve(code ?? (run.cancelled ? 0 : 1)));
    });
  }

  private appendSystemLine(run: ActiveRun, text: string): void {
    this.appendLine(run, 'system', text, run.activeStepIndex);
  }

  private appendOutput(run: ActiveRun, stream: 'stdout' | 'stderr', chunk: string): void {
    const combined = `${run.streamRemainders[stream]}${chunk}`.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = combined.split('\n');
    run.streamRemainders[stream] = parts.pop() || '';
    for (const line of parts) this.appendLine(run, stream, line, run.activeStepIndex);
  }

  private flushRemainders(run: ActiveRun): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const remainder = run.streamRemainders[stream];
      if (remainder) this.appendLine(run, stream, remainder, run.activeStepIndex);
      run.streamRemainders[stream] = '';
    }
  }

  private appendLine(run: ActiveRun, stream: RepositoryRunOutputLineDto['stream'], text: string, stepIndex: number): void {
    const line: RepositoryRunOutputLineDto = { sequence: ++run.sequence, stream, text, timestamp: Date.now(), stepIndex };
    run.output.push(line);
    run.outputBytes += Buffer.byteLength(text, 'utf8');
    while (run.output.length > MAX_OUTPUT_LINES || run.outputBytes > MAX_OUTPUT_BYTES) {
      const removed = run.output.shift();
      if (removed) run.outputBytes -= Buffer.byteLength(removed.text, 'utf8');
    }
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
