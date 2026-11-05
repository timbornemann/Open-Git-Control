import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_TAGS_NAVIGATION } from '@/shared/tutorial/catalogTagsNavigation';
import { tagMessage } from '@/shared/tutorial/tagLessonHelpers';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { demoBlobBytes } from './demoBlob';
import { resolveDemoCommit } from './demoHistory';
import { writeDemoFile } from './demoFiles';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-tags-parity-'))
      throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
function fixture(language: 'de' | 'en') {
  const { repo } = createDemoApi(
    { request: { chapterId: 'tags-navigation' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    TUTORIAL_TAGS_NAVIGATION.steps[0],
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-tags-parity-'));
  roots.push(root);
  const cwd = path.join(root, 'repo'),
    config = path.join(root, 'empty-config'),
    hooks = path.join(root, 'empty-hooks');
  fs.mkdirSync(cwd);
  fs.mkdirSync(hooks);
  fs.writeFileSync(config, '');
  const git = (args: string[], success = true) => {
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
        'core.hooksPath=' + hooks,
        ...args,
      ],
      { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' } },
    );
    expect(result.error).toBeUndefined();
    if (success) expect(result.status, result.stderr).toBe(0);
    else expect(result.status).not.toBe(0);
    return result.stdout;
  };
  git(['init', '-b', 'main']);
  const revisions = new Map<string, string>();
  for (const commit of [...repo.commits].reverse()) {
    for (const [name, blob] of Object.entries(commit.files!)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      fs.writeFileSync(path.join(cwd, name), demoBlobBytes(blob));
    }
    git(['add', '-A']);
    git(['commit', '-m', commit.subject, ...(commit.body ? ['-m', commit.body] : [])]);
    revisions.set(commit.hash, git(['rev-parse', 'HEAD']).trim());
  }
  git(['tag', 'v1.0.0', revisions.get(hash(2))!]);
  return { repo, git, revisions, cwd };
}

it.each(['de', 'en'] as const)(
  'matches Git tag targets, annotation, version order and deletion in %s',
  (language) => {
    const { repo, git, revisions, cwd } = fixture(language);
    const message = tagMessage[language === 'de' ? 0 : 1] + ' Keep %00 literally.';
    for (const name of ['v1.1.0', 'v1.2.0-rc1', 'v1.10.0', 'v1.02.0']) {
      git(['tag', name]);
      expect(repo.command('tag', name).success).toBe(true);
    }
    git(['tag', '-a', 'v1.2.0', '-m', message, revisions.get(hash(3))!]);
    expect(repo.command('tag', '-a', 'v1.2.0', '-m', message, hash(3)).success).toBe(true);
    expect(git(['tag', '-l', '--sort=-v:refname']).trimEnd()).toBe(repo.command('tag', '-l', '--sort=-v:refname').data);
    expect(git(['rev-parse', 'v1.2.0^{commit}']).trim()).toBe(revisions.get(hash(3)));
    expect(resolveDemoCommit(repo, 'refs/tags/v1.2.0^{commit}')?.hash).toBe(hash(3));
    const format = '--format=%(refname)%00%(objecttype)%00%(*objectname)%00%(contents)';
    let native = git(['for-each-ref', format, 'refs/tags/v1.2.0']);
    for (const [fake, actual] of revisions) native = native.replaceAll(actual, fake);
    expect(repo.command('forEachRef', format, 'refs/tags/v1.2.0').data).toBe(native);
    fs.writeFileSync(path.join(cwd, 'LICENSE'), 'A later saved license\n');
    git(['add', 'LICENSE']);
    git(['commit', '-m', 'docs: later license']);
    writeDemoFile(repo, 'LICENSE', 'A later saved license\n');
    repo.stage(['LICENSE']);
    repo.commit('docs: later license');
    expect(git(['rev-parse', 'v1.1.0^{commit}']).trim()).toBe(revisions.get(hash(4)));
    expect(resolveDemoCommit(repo, 'v1.1.0')?.hash).toBe(hash(4));
    git(['tag', '-d', 'v1.2.0']);
    expect(repo.command('tag', '-d', 'v1.2.0').success).toBe(true);
    expect(git(['tag', '-l']).trimEnd()).toBe(repo.command('tag', '-l').data);
    expect(git(['status', '--porcelain'])).toBe(repo.status());
  },
  30_000,
);

it('matches native refusal and keeps references unchanged for invalid names, duplicate paths and missing targets', () => {
  const { repo, git } = fixture('en');
  for (const name of ['@', 'a]', 'releases/v1']) {
    git(['tag', name]);
    expect(repo.command('tag', name).success).toBe(true);
  }
  for (const args of [
    ...['bad name', 'a..b', '.hidden', 'a.lock/b', 'a//b', '-option', 'HEAD', 'a[', 'releases/v1', 'releases', 'releases/v1/other'].map((name) => [name]),
    ['missing-target', 'unknown-revision'],
    ['-d', 'missing'],
  ]) {
    const native = git(['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/tags']),
      before = demoRepositoryFingerprint(repo);
    git(['tag', ...args], false);
    expect(repo.command('tag', ...args).success).toBe(false);
    expect(demoRepositoryFingerprint(repo)).toBe(before);
    expect(git(['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/tags'])).toBe(native);
  }
}, 30_000);
