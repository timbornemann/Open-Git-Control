import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { buildDiscardCommands } from '../stagingDiscardCommands';
import { normalizeCommandArgs } from '../../../../electron/main-process/gitCommandPolicy';

const prefix = path.join(tmpdir(), 'ogc-filtered-discard-');
const environment = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};
let repo: string;
let fixtureRoot: string;
const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.fsmonitor=false', '-C', repo, ...args], {
    encoding: 'utf8',
    env: { ...environment, GIT_CONFIG_GLOBAL: path.join(fixtureRoot, 'global.gitconfig') },
    windowsHide: true,
  });
const write = (file: string, content: string) => {
  const absolute = path.join(repo, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
};
beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(prefix);
  repo = path.join(fixtureRoot, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(fixtureRoot, 'global.gitconfig'), '');
  // An unborn repository is sufficient: checkout restores from the index.
  // No commits, feature branches, global config or template hooks are needed.
  git('init', '--quiet', '--template=');
});
afterEach(() => {
  if (path.dirname(fixtureRoot) !== path.dirname(prefix) || !path.basename(fixtureRoot).startsWith(path.basename(prefix)))
    throw new Error('Unexpected fixture cleanup path.');
  fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 3 });
});

it('restores only filtered files, including a deletion and literal glob names, while preserving hidden changes, new files and the index', () => {
  const selected = [...Array.from({ length: 7 }, (_, i) => `feature/file-[${i}].txt`), 'feature/über [v1].txt'];
  const hidden = ['feature/file-0.txt', 'hidden/keep.txt'];
  for (const file of [...selected, ...hidden]) write(file, `Staged content: ${file}\n`);
  git('add', '--all');
  const index = git('ls-files', '--stage', '-z');
  for (const file of [...selected, ...hidden]) write(file, `Unstaged content: ${file}\n`);
  fs.unlinkSync(path.join(repo, selected.at(-1)!));
  write('feature/new [7].txt', 'Untracked content\n');

  const commands = buildDiscardCommands(selected);
  expect(commands.length).toBeGreaterThan(1);
  for (const [command, ...args] of commands) git(command, ...normalizeCommandArgs('checkout', args));

  for (const file of selected) expect(fs.readFileSync(path.join(repo, file), 'utf8')).toBe(`Staged content: ${file}\n`);
  for (const file of hidden) expect(fs.readFileSync(path.join(repo, file), 'utf8')).toBe(`Unstaged content: ${file}\n`);
  expect(fs.readFileSync(path.join(repo, 'feature/new [7].txt'), 'utf8')).toBe('Untracked content\n');
  expect(git('ls-files', '--stage', '-z')).toBe(index);
});
