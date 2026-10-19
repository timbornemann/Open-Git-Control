import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import * as assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const script = path.resolve(__dirname, '../../../scripts/test-recovery-installation.js');
const nativeRequire = createRequire(script);
const runner = (platform: string, environment: NodeJS.ProcessEnv) => {
  const executable = platform === 'win32' ? 'C:/ci/installation.exe' : '/ci/installation';
  const execFileSync = vi.fn().mockReturnValue(JSON.stringify({ reason: 'compiler-artifact', target: { name: 'installation' }, executable }));
  const run = () =>
    vm.runInNewContext(
      fs.readFileSync(script, 'utf8'),
      {
        require: (name: string) => (name === 'node:child_process' ? { execFileSync } : nativeRequire(name)),
        process: { platform, env: environment },
      },
      { filename: script },
    );
  return { run, execFileSync, executable };
};

describe('isolated recovery installation runner', () => {
  it.each(['win32', 'darwin', 'linux'])('passes API authentication through the %s runner without exposing it in command arguments', (platform) => {
    const token = 'isolated-test-token';
    const { run, execFileSync, executable } = runner(platform, { CI: 'true', GITHUB_ACTIONS: 'true', OGC_RECOVERY_GITHUB_TOKEN: token });
    run();
    expect(execFileSync).toHaveBeenCalledTimes(2);
    const [command, args, options] = execFileSync.mock.calls[1];
    expect(options.env).toMatchObject({ CI: 'true', GITHUB_ACTIONS: 'true', OGC_RECOVERY_E2E: '1', OGC_RECOVERY_GITHUB_TOKEN: token });
    expect(args.join(' ')).not.toContain(token);
    if (platform === 'linux') {
      expect(command).toBe('sudo');
      const preserved = args.find((argument: string) => argument.startsWith('--preserve-env='));
      expect(preserved.split('=')[1].split(',')).toEqual(expect.arrayContaining(['OGC_RECOVERY_E2E', 'OGC_RECOVERY_GITHUB_TOKEN', 'CI', 'GITHUB_ACTIONS']));
      expect(args).toContain(executable);
    } else expect(command).toBe(executable);
  });

  it.each([{ CI: 'true' }, { GITHUB_ACTIONS: 'true' }, {}])('refuses installer execution outside disposable CI (%j)', (environment) => {
    const { run, execFileSync } = runner('win32', environment);
    assert.throws(run);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
