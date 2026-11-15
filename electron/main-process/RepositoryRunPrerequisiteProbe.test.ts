import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRunPrerequisiteProbe } from './RepositoryRunPrerequisites';

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile }));
type Callback = (error: Error | null, stdout: string) => void;

beforeEach(() => {
  execFile.mockReset();
});

describe('prerequisite shell process deadlines', () => {
  it('bounds normal discovery and returns the actual shell output', async () => {
    const output = 'OGC_RUN_TOOL node available\n';
    execFile.mockImplementation((_file: string, _args: string[], _options: unknown, callback: Callback) => callback(null, output));
    expect(await createRunPrerequisiteProbe()('/fixture', 'powershell', 'fixed discovery')).toBe(output);
    const [, args, options] = execFile.mock.calls[0];
    expect(args).toContain('-NoProfile');
    expect(args.at(-1)).toContain('fixed discovery');
    expect(options.timeout).toBe(8_000);
    expect(options.cwd).toBe('/fixture');
    expect(options.windowsHide).toBe(true);
    expect(options.maxBuffer).toBe(64 * 1024);
  });

  it('keeps a larger integration budget separate from the interactive default', async () => {
    execFile.mockImplementation((_file: string, _args: string[], _options: unknown, callback: Callback) => callback(null, ''));
    await createRunPrerequisiteProbe(20_000)('/fixture', 'powershell', 'fixed discovery');
    await createRunPrerequisiteProbe()('/fixture', 'powershell', 'fixed discovery');
    expect(execFile.mock.calls.map((call) => call[2].timeout)).toEqual([20_000, 8_000]);
  });

  it('propagates a timed out process even if it already printed availability markers', async () => {
    const error = Object.assign(new Error('Shell timed out'), { killed: true, signal: 'SIGTERM' });
    execFile.mockImplementation((_file: string, _args: string[], _options: unknown, callback: Callback) => callback(error, 'OGC_RUN_TOOL node available\n'));
    await expect(createRunPrerequisiteProbe()('/fixture', 'powershell', 'fixed discovery')).rejects.toBe(error);
  });
});
