import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect } from 'vitest';
import { configureFixtureRepository } from '../../../electron/git/__tests__/gitFixtureHistory';

/** Only owned local repositories; no network, personal config or file-protocol override outside this fixture. */
export function submoduleParityFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-submodule-parity-'));
  const parent = path.join(root, 'parent with spaces'),
    source = path.join(root, 'child source'),
    moved = path.join(root, 'moved child');
  const emptyConfig = path.join(root, 'empty-config');
  fs.writeFileSync(emptyConfig, '');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_GLOBAL: emptyConfig, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
  const run = (cwd: string, args: string[]) => {
    const result = spawnSync('git', ['-c', 'protocol.file.allow=always', ...args], { cwd, env, encoding: 'utf8', windowsHide: true });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  const init = (cwd: string) => {
    fs.mkdirSync(cwd);
    run(cwd, ['init', '-b', 'main']);
    configureFixtureRepository(cwd, 'Submodule Fixture', 'fixture@example.invalid');
  };
  init(source);
  fs.writeFileSync(path.join(source, 'design.txt'), 'first\n');
  run(source, ['add', '-A']);
  run(source, ['commit', '-m', 'first']);
  const first = run(source, ['rev-parse', 'HEAD']).trim();
  run(source, ['tag', 'v1.0.0']);
  fs.writeFileSync(path.join(source, 'design.txt'), 'second\n');
  run(source, ['commit', '-am', 'second']);
  const second = run(source, ['rev-parse', 'HEAD']).trim();
  run(source, ['tag', 'v1.1.0']);
  fs.mkdirSync(moved);
  run(moved, ['clone', '--bare', source, '.']);
  init(parent);
  fs.mkdirSync(path.join(parent, 'packages', 'design'), { recursive: true });
  run(parent, ['config', '-f', '.gitmodules', 'submodule.design.path', 'packages/design']);
  run(parent, ['config', '-f', '.gitmodules', 'submodule.design.url', source.replaceAll('\\', '/')]);
  run(parent, ['add', '.gitmodules']);
  run(parent, ['update-index', '--add', '--cacheinfo', '160000,' + first + ',packages/design']);
  run(parent, ['commit', '-m', 'parent records first child commit']);
  const child = path.join(parent, 'packages', 'design');
  const cleanup = () => {
    const resolved = fs.realpathSync(root),
      temporary = fs.realpathSync(os.tmpdir());
    if (path.dirname(resolved) !== temporary || !path.basename(resolved).startsWith('ogc-submodule-parity-')) throw new Error('Unsafe fixture cleanup.');
    fs.rmSync(resolved, { recursive: true, force: true });
  };
  return {
    parent,
    child,
    source: source.replaceAll('\\', '/'),
    moved: moved.replaceAll('\\', '/'),
    first,
    second,
    git: (args: string[]) => run(parent, args),
    childGit: (args: string[]) => run(child, args),
    cleanup,
  };
}
