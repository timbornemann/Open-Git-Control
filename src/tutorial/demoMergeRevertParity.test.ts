import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cherryPickParityFixture } from './__tests__/cherryPickParityFixture';
import { rewordParityFixture } from './__tests__/rewordParityFixture';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_TIME } from './demoRepository';
import { writeDemoFile } from './demoFiles';
const fixtures: ReturnType<typeof rewordParityFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
const cases = (['de', 'en'] as const).flatMap((language) => [1, 2].map((mainline) => ({ language, mainline })));
it.each(cases)(
  'matches native merge revert parent $mainline in $language',
  ({ language, mainline }) => {
    const f = cherryPickParityFixture(language, 'diverged-license');
    fixtures.push(f);
    const { repo, git, revisions, cwd } = f;
    expect(repo.command('merge', 'feature/begruessung').success).toBe(true);
    const source = structuredClone(repo.commits[0]),
      date = new Date(DEMO_TIME + 86_400_000).toISOString();
    git(['merge', '--no-ff', '-m', source.subject, 'feature/begruessung'], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    revisions.set(hash(6), git(['rev-parse', 'HEAD']).trim());
    expect(git(['show', '-s', '--format=%P', 'HEAD']).trim()).toBe(revisions.get(hash(4)) + ' ' + revisions.get(hash(5)));
    for (const [name, value] of [
      ['package.json', 'An independent package draft\n'],
      ['notes [ä].txt', 'An independent note\n'],
    ]) {
      fs.writeFileSync(path.join(cwd, name), value);
      writeDemoFile(repo, name, value);
    }
    const refs = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/']);
    git(['revert', '-m', String(mainline), '--no-edit', revisions.get(hash(6))!], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    expect(repo.command('revert', '-m', String(mainline), '--no-edit', hash(6)).success).toBe(true);
    const created = repo.commits[0],
      selected = mainline === 1 ? 4 : 5;
    expect(created.hash).toBe(hash(7));
    expect(created.parent).toBe(hash(6));
    expect(git(['show', '-s', '--format=%P', 'HEAD']).trim()).toBe(revisions.get(hash(6)));
    expect(git(['show', '-s', '--format=%s', 'HEAD']).trim()).toBe(created.subject);
    expect(
      git(['show', '-s', '--format=%b', 'HEAD'])
        .trimEnd()
        .replace(revisions.get(hash(6))!, hash(6))
        .replace(revisions.get(hash(selected))!, hash(selected)),
    ).toBe(created.body);
    expect(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/'])).toBe(refs);
    for (const name of Object.keys(repo.headFiles)) {
      expect(git(['show', 'HEAD:' + name])).toBe(repo.headFiles[name]);
      expect(git(['show', ':' + name])).toBe(repo.indexFiles[name]);
      expect(fs.readFileSync(path.join(cwd, name), 'utf8')).toBe(repo.files[name]);
    }
    const names = (args: string[]) => git(args).split('\0').filter(Boolean).sort();
    expect(names(['diff', '--cached', '--name-only', '-z'])).toEqual([...repo.staged].sort());
    expect(names(['diff', '--name-only', '-z'])).toEqual([...repo.modified].sort());
    expect(names(['ls-files', '--others', '--exclude-standard', '-z'])).toEqual([...repo.untracked].sort());
  },
  60_000,
);
it.each([1, 4])(
  'matches native mainline 1 for a non-merge commit %s',
  (number) => {
    const f = rewordParityFixture('en');
    fixtures.push(f);
    const { repo, git, revisions } = f,
      date = new Date(DEMO_TIME + 86_400_000).toISOString();
    if (number === 1) {
      git(['reset', '--hard', revisions.get(hash(1))!]);
      expect(repo.command('reset', '--hard', hash(1)).success).toBe(true);
    }
    git(['revert', '-m', '1', '--no-edit', revisions.get(hash(number))!], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    expect(repo.command('revert', '-m', '1', '--no-edit', hash(number)).success).toBe(true);
    expect(git(['ls-tree', '-r', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean).sort()).toEqual(Object.keys(repo.headFiles).sort());
    for (const name of Object.keys(repo.headFiles)) expect(git(['show', 'HEAD:' + name])).toBe(repo.headFiles[name]);
    expect(repo.status()).toBe('');
  },
  60_000,
);
