import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect } from 'vitest';
import { createDemoApi } from '../demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { practiceCommitHash } from '@/shared/tutorial/exampleGitIds';
import { demoBlobBytes } from '../demoBlob';
import { resolveDemoCommit } from '../demoHistory';
import type { TutorialStep } from '@/shared/tutorial/types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-demo-merge-parity-'))
      throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
/** Only tests import this fixture; Git never enters the tutorial renderer. */
export function nativeMergeFixture(language: 'de' | 'en' = 'en', prepared?: TutorialStep, merge?: { flags: string[]; exit: number }) {
  const step = prepared || TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'conflicts')!.steps[0];
  const demo = createDemoApi(
    { request: { chapterId: 'conflicts' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    step,
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-demo-merge-parity-'));
  roots.push(root);
  const cwd = path.join(root, 'repo'),
    config = path.join(root, 'empty-config'),
    hooks = path.join(root, 'empty-hooks');
  fs.mkdirSync(cwd);
  fs.mkdirSync(hooks);
  fs.writeFileSync(config, '');
  const git = (args: string[], expected = 0, overrides: Record<string, string> = {}) => {
    const result = spawnSync(
      'git',
      [
        '-c',
        'user.name=Example',
        '-c',
        'user.email=example@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.autocrlf=false',
        '-c',
        'merge.conflictStyle=merge',
        '-c',
        'rerere.enabled=false',
        '-c',
        'core.hooksPath=' + hooks,
        ...args,
      ],
      {
        cwd,
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no', ...overrides },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(expected);
    return result.stdout;
  };
  const writeNative = (name: string, contents: string) => fs.writeFileSync(path.join(cwd, name), contents);
  const read = (name = 'README.md') => (fs.existsSync(path.join(cwd, name)) ? fs.readFileSync(path.join(cwd, name), 'utf8') : undefined);
  const writeTree = (number: number) => {
    const commit = resolveDemoCommit(demo.repo, practiceCommitHash(number))!;
    const files = commit.files!;
    const removed = git(['ls-files', '-z'])
      .split('\0')
      .filter((name) => name && !Object.prototype.hasOwnProperty.call(files, name));
    if (removed.length) git(['rm', '-f', '--', ...removed]);
    for (const [name, blob] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      fs.writeFileSync(path.join(cwd, name), demoBlobBytes(blob));
    }
    git(['add', '-A']);
    git(['commit', '-m', 'Saved practice tree ' + number], 0, { GIT_AUTHOR_DATE: commit.date, GIT_COMMITTER_DATE: commit.date });
  };
  const source = 'feature/begruessung';
  git(['init', '-b', 'main']);
  writeTree(3);
  git(['branch', source]);
  writeTree(4);
  git(['checkout', source]);
  writeTree(5);
  git(['checkout', 'main']);
  git(['merge', ...(merge?.flags || []), source], merge?.exit ?? 1);
  return { ...demo, step, git, source, read, writeNative };
}
