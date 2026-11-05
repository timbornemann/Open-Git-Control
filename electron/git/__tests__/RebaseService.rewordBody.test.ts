import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { GitRunner } from '../GitRunner';
import { RebaseService } from '../RebaseService';
import { configureFixtureRepository } from './gitFixtureHistory';
const active: { root: string; runner: GitRunner }[] = [];
afterEach(async () => {
  for (const { root, runner } of active.splice(0)) {
    await runner.close();
    const target = path.resolve(root),
      base = fs.realpathSync.native(os.tmpdir());
    if (path.dirname(target) !== path.resolve(base) || !path.basename(target).startsWith('ogc-rebase-body-')) throw new Error('Unsafe rebase fixture cleanup');
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
  vi.unstubAllEnvs();
});
const cases = (['de', 'en'] as const).flatMap((language) =>
  [
    { pause: false, multiple: false },
    { pause: false, multiple: true },
    { pause: true, multiple: false },
  ].map((options) => ({ language, ...options })),
);
it.each(cases)(
  'preserves reword body and authors in $language with edit pause=$pause and multiple=$multiple',
  async ({ language, pause, multiple }) => {
    const root = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'ogc-rebase-body-'));
    const cwd = path.join(root, 'repo with spaces'),
      config = path.join(root, 'empty-config');
    fs.mkdirSync(cwd);
    fs.writeFileSync(config, '');
    const runner = new GitRunner();
    active.push({ root, runner });
    for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith('GIT_')) vi.stubEnv(key, undefined);
    vi.stubEnv('GIT_CONFIG_GLOBAL', config);
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
    const git = (args: string[], overrides: Record<string, string> = {}, input?: string) => {
      const child = spawnSync('git', args, { cwd, env: { ...process.env, ...overrides }, encoding: 'utf8', windowsHide: true, timeout: 30_000, input });
      expect(child.error).toBeUndefined();
      expect(child.status, child.stderr).toBe(0);
      return child.stdout;
    };
    git(['init', '-b', 'main']);
    configureFixtureRepository(cwd, 'Alex Beispiel', 'alex@example.invalid');
    const file = path.join(cwd, 'README.md');
    fs.writeFileSync(file, 'base\n');
    git(['add', 'README.md']);
    git(['commit', '-m', 'base']);
    const base = git(['rev-parse', 'HEAD']).trim();
    const body =
      language === 'de'
        ? 'Die vorhandene Beschreibung bleibt erhalten.\n\n# Dies ist ein Absatz.\n\nSigned-off-by: Sam Beispiel <sam@example.invalid>'
        : 'Keep the existing description.\n\n# This is a paragraph.\n\nSigned-off-by: Sam Beispiel <sam@example.invalid>';
    const dated = {
      GIT_AUTHOR_NAME: 'Sam Beispiel',
      GIT_AUTHOR_EMAIL: 'sam@example.invalid',
      GIT_AUTHOR_DATE: '2026-10-20T10:00:00Z',
      GIT_COMMITTER_DATE: '2026-10-20T10:00:00Z',
    };
    fs.appendFileSync(file, 'second\n');
    git(['commit', '--cleanup=verbatim', '-am', 'second title', '-m', body], dated);
    const second = git(['rev-parse', 'HEAD']).trim();
    const thirdBody = body + '\n\nFollow-up body.';
    fs.appendFileSync(file, 'third\n');
    git(['commit', '--cleanup=verbatim', '-am', 'third title', '-m', thirdBody], dated);
    const third = git(['rev-parse', 'HEAD']).trim(),
      source = pause ? third : second;
    const oldTree = git(['rev-parse', 'HEAD^{tree}']).trim();
    const previousBody = git(['show', '-s', '--format=%b', source]).trimEnd();
    const previousAuthor = git(['show', '-s', '--format=%an%n%ae%n%aI', source]);
    git(['tag', 'original-message', source]);
    git(['config', '--local', 'commit.cleanup', 'strip']);
    const title = language === 'de' ? 'docs: Oberfläche genauer erklären' : 'docs: clarify the interface';
    const todo = pause
      ? ['edit ' + second + ' second title', 'reword ' + third + ' ' + title]
      : multiple
        ? ['reword ' + second.slice(0, 7) + ' ' + title, 'reword ' + third.slice(0, 7) + ' feat: following title rewritten']
        : ['reword ' + second + ' ' + title, 'pick ' + third + ' third title'];
    const service = new RebaseService(() => cwd, runner);
    await service.startInteractiveRebase(base, todo);
    if (pause) {
      expect(git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('HEAD');
      expect(fs.existsSync(path.join(cwd, '.git', 'rebase-merge', 'ogc-reword-0.txt'))).toBe(true);
      await service.continueRebase();
    }
    const selected = pause ? 'HEAD' : 'HEAD~1';
    expect(git(['show', '-s', '--format=%s', selected]).trim()).toBe(title);
    expect(git(['show', '-s', '--format=%b', selected]).trimEnd()).toBe(previousBody);
    expect(git(['show', '-s', '--format=%an%n%ae%n%aI', selected])).toBe(previousAuthor);
    expect(git(['rev-parse', 'HEAD^{tree}']).trim()).toBe(oldTree);
    expect(git(['rev-parse', 'original-message']).trim()).toBe(source);
    expect(git(['show', '-s', '--format=%b', source]).trimEnd()).toBe(previousBody);
    // Ordinary pick follows Git's configured cleanup; explicit reword preserves its source body literally.
    const otherBody = pause ? body : multiple ? thirdBody : git(['stripspace', '--strip-comments'], {}, thirdBody).trimEnd();
    expect(git(['show', '-s', '--format=%b', pause ? 'HEAD~1' : 'HEAD']).trimEnd()).toBe(otherBody);
    if (multiple) expect(git(['show', '-s', '--format=%s', 'HEAD']).trim()).toBe('feat: following title rewritten');
    expect(git(['status', '--porcelain'])).toBe('');
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('main');
  },
  60_000,
);
