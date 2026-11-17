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
  const git = (args: string[], expected = 0, input?: Buffer) => {
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
        input,
        timeout: 10_000,
        env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr || result.stdout).toBe(expected);
    return result.stdout;
  };
  const writeNative = (name: string, contents: string) => fs.writeFileSync(path.join(cwd, name), contents);
  const read = (name = 'README.md') => (fs.existsSync(path.join(cwd, name)) ? fs.readFileSync(path.join(cwd, name), 'utf8') : undefined);
  const source = 'feature/begruessung';
  // Seed the same divergent trees in one Git process. Merge operations below
  // still run normally; setup no longer checks out/adds/commits each snapshot.
  const history: Buffer[] = [];
  const command = (value: string) => history.push(Buffer.from(value));
  const data = (value: string | Uint8Array) => {
    const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    command(`data ${bytes.length}\n`);
    history.push(bytes);
    command('\n');
  };
  for (const [number, parent, branch] of [
    [3, undefined, 'main'],
    [4, 3, 'main'],
    [5, 3, source],
  ] as const) {
    const commit = resolveDemoCommit(demo.repo, practiceCommitHash(number))!;
    const date = `${Math.floor(Date.parse(commit.date) / 1000)} +0000`;
    command(
      `commit refs/heads/${branch}\nmark :${number}\nauthor Example <example@example.invalid> ${date}\ncommitter Example <example@example.invalid> ${date}\n`,
    );
    data('Saved practice tree ' + number + '\n');
    if (parent) command(`from :${parent}\n`);
    command('deleteall\n');
    for (const [name, blob] of Object.entries(commit.files!)) {
      command(`M 100644 inline ${JSON.stringify(name)}\n`);
      data(demoBlobBytes(blob));
    }
    command('\n');
  }
  command('done\n');
  git(['init', '-b', 'main']);
  git(['fast-import', '--quiet'], 0, Buffer.concat(history));
  git(['reset', '--hard', 'main']);
  git(['merge', ...(merge?.flags || []), source], merge?.exit ?? 1);
  return { ...demo, step, git, source, read, writeNative };
}
