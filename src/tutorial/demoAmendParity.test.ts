import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';
import { TUTORIAL_CHAPTERS } from '@/shared/tutorial/catalog';
import { branchRecipe } from '@/shared/tutorial/branchLessonHelpers';
import { AMEND_MESSAGE_ONLY, AMEND_DESCRIPTION_ONLY, AMEND_FILE_MESSAGE, AMEND_FILE_DESCRIPTION } from '@/shared/tutorial/amendLessonExamples';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { demoBlobBytes } from './demoBlob';
import { resolveDemoCommit } from './demoHistory';
import { writeDemoFile } from './demoFiles';
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(path.resolve(root)) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('ogc-amend-parity-'))
      throw new Error('Unsafe fixture');
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
function fixture(language: 'de' | 'en', at: number) {
  const prepare = branchRecipe();
  prepare.branches = {
    heads: [
      { name: 'main', commit: at },
      { name: 'feature/begruessung', commit: 1 },
    ],
    remotes: [{ name: 'origin/main', commit: 1 }],
    current: 'main',
  };
  const { repo } = createDemoApi(
    { request: { chapterId: 'history' }, language, theme: 'copper-night', progress: { version: 1, welcomeSeen: true, completedChapters: [] } },
    { ...TUTORIAL_CHAPTERS.find((chapter) => chapter.id === 'history')!.steps[0], prepare },
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-amend-parity-'));
  roots.push(root);
  const cwd = path.join(root, 'repo'),
    config = path.join(root, 'empty-config'),
    hooks = path.join(root, 'empty-hooks');
  fs.mkdirSync(cwd);
  fs.mkdirSync(hooks);
  fs.writeFileSync(config, '');
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const git = (args: string[], overrides: Record<string, string> = {}) => {
    const result = spawnSync(
      'git',
      [
        '-c',
        'user.name=Alex Beispiel',
        '-c',
        'user.email=alex@example.invalid',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.autocrlf=false',
        '-c',
        'core.hooksPath=' + hooks,
        ...args,
      ],
      { cwd, encoding: 'utf8', windowsHide: true, env: { ...environment, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', ...overrides } },
    );
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return result.stdout;
  };
  git(['init', '-b', 'main']);
  const revisions = new Map<string, string>();
  for (const number of [1, 2, 3, 4]) {
    const commit = resolveDemoCommit(repo, hash(number))!;
    const missing = git(['ls-files', '-z'])
      .split('\0')
      .filter((name) => name && !Object.hasOwn(commit.files!, name));
    if (missing.length) git(['rm', '-f', '--', ...missing]);
    for (const [name, blob] of Object.entries(commit.files!)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
      fs.writeFileSync(path.join(cwd, name), demoBlobBytes(blob));
    }
    git(['add', '-A']);
    git(['commit', '-m', commit.subject, '-m', commit.body || ''], {
      GIT_AUTHOR_NAME: commit.author!,
      GIT_AUTHOR_EMAIL: commit.email!,
      GIT_AUTHOR_DATE: commit.date,
      GIT_COMMITTER_DATE: commit.date,
    });
    revisions.set(commit.hash, git(['rev-parse', 'HEAD']).trim());
  }
  git(['reset', '--hard', revisions.get(hash(at))!]);
  git(['tag', 'saved-before-amend']);
  repo.command('tag', 'saved-before-amend');
  return { repo, git, revisions, cwd };
}
const ordered = (status: string) => (status ? status.trimEnd().split(/\r?\n/).sort() : []);
const cases = (['de', 'en'] as const).flatMap((language) => [false, true].map((files) => ({ language, files })));
it.each(cases)(
  'matches native amend metadata and staged-only contents for files=$files in $language',
  ({ language, files }) => {
    const at = files ? 4 : 2,
      { repo, git, revisions, cwd } = fixture(language, at),
      previous = structuredClone(repo.commits[0]);
    if (files) {
      fs.writeFileSync(path.join(cwd, 'README.md'), 'The staged correction\n');
      git(['add', '--', 'README.md']);
      writeDemoFile(repo, 'README.md', 'The staged correction\n');
      repo.stage(['README.md']);
      fs.writeFileSync(path.join(cwd, 'README.md'), 'A later unstaged draft\n');
      writeDemoFile(repo, 'README.md', 'A later unstaged draft\n');
      fs.writeFileSync(path.join(cwd, 'LICENSE'), 'An independent working draft\n');
      writeDemoFile(repo, 'LICENSE', 'An independent working draft\n');
    }
    const index = language === 'de' ? 0 : 1,
      title = (files ? 'fix' : 'feat') + '(lernen): ' + (files ? AMEND_FILE_MESSAGE : AMEND_MESSAGE_ONLY)[index],
      description = (files ? AMEND_FILE_DESCRIPTION : AMEND_DESCRIPTION_ONLY)[index];
    git(['commit', '--amend', '-m', title, '-m', description]);
    expect(repo.commit(title, { description, amend: true }).success).toBe(true);
    const [author, email, date, body] = git(['show', '-s', '--format=%an%x00%ae%x00%aI%x00%B', 'HEAD']).split('\0');
    expect(repo.commits[0]).toMatchObject({ hash: hash(5), parent: hash(at - 1), subject: title, body: description, author, email });
    expect(Date.parse(repo.commits[0].date)).toBe(Date.parse(date));
    expect(repo.commits[0].date).toBe(previous.date);
    expect(git(['show', '-s', '--format=%P', 'HEAD']).trim()).toBe(revisions.get(hash(at - 1)));
    expect(body.trimEnd()).toBe(title + '\n\n' + description);
    expect(git(['show', 'HEAD:README.md'])).toBe(repo.commits[0].files?.['README.md']);
    expect(git(['show', ':README.md'])).toBe(repo.indexFiles['README.md']);
    expect(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')).toBe(repo.files['README.md']);
    expect(fs.readFileSync(path.join(cwd, 'LICENSE'), 'utf8')).toBe(repo.files.LICENSE);
    expect(ordered(git(['status', '--porcelain']))).toEqual(ordered(repo.status()));
    expect(git(['rev-parse', 'saved-before-amend^{commit}']).trim()).toBe(revisions.get(previous.hash));
    expect(repo.tagRefs.get('saved-before-amend')?.target).toBe(previous.hash);
    expect(repo.commits.find((commit) => commit.hash === previous.hash)).toEqual(previous);
  },
  30_000,
);
