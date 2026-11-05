import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { rewordParityFixture } from './__tests__/rewordParityFixture';
import { DEMO_TIME } from './demoRepository';
import { writeDemoFile } from './demoFiles';
import { resolveDemoCommit } from './demoHistory';

const fixtures: ReturnType<typeof rewordParityFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
const cases = (['de', 'en'] as const).flatMap((language) => (['cherry-pick', 'revert'] as const).map((operation) => ({ language, operation })));
it.each(cases)(
  'matches native $operation trees, authors, parents, messages, drafts and refs in $language',
  ({ language, operation }) => {
    const f = rewordParityFixture(language);
    fixtures.push(f);
    const { repo, git, revisions, cwd } = f;
    const picked = operation === 'cherry-pick',
      sourceNumber = picked ? 2 : 4,
      oldHead = picked ? 1 : 4;
    const source = structuredClone(resolveDemoCommit(repo, hash(sourceNumber))!);
    if (picked) {
      git(['reset', '--hard', revisions.get(hash(1))!]);
      expect(repo.command('reset', '--hard', hash(1)).success).toBe(true);
      git(['branch', '-f', 'feature/begruessung', revisions.get(hash(2))!]);
      repo.branchHeads.set('feature/begruessung', hash(2));
    }
    for (const [name, value] of [
      ['LICENSE', 'An independent license draft\n'],
      ['notes [ä].txt', 'Keep this untracked note\n'],
    ]) {
      fs.writeFileSync(path.join(cwd, name), value);
      writeDemoFile(repo, name, value);
    }
    const preserved = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/']);
    const date = new Date(DEMO_TIME + 86_400_000).toISOString();
    const args = picked ? ['cherry-pick', revisions.get(hash(sourceNumber))!] : ['revert', '--no-edit', revisions.get(hash(sourceNumber))!];
    git(args, picked ? { GIT_COMMITTER_DATE: date } : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
    expect(repo.command(operation, ...(!picked ? ['--no-edit'] : []), hash(sourceNumber)).success).toBe(true);
    const result = repo.commits[0];
    expect(result.hash).toBe(hash(5));
    expect(result.parent).toBe(hash(oldHead));
    expect(git(['show', '-s', '--format=%P', 'HEAD']).trim()).toBe(revisions.get(hash(oldHead)));
    expect(git(['show', '-s', '--format=%s', 'HEAD']).trim()).toBe(result.subject);
    const nativeBody = git(['show', '-s', '--format=%b', 'HEAD']).trimEnd();
    expect(nativeBody).toBe(picked ? result.body : result.body!.replace(hash(sourceNumber), revisions.get(hash(sourceNumber))!));
    expect(git(['show', '-s', '--format=%an%n%ae', 'HEAD']).trimEnd()).toBe(result.author + '\n' + result.email);
    expect(new Date(git(['show', '-s', '--format=%aI', 'HEAD']).trim()).toISOString()).toBe(result.date);
    expect(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/'])).toBe(preserved);
    expect(resolveDemoCommit(repo, hash(sourceNumber))).toEqual(source);
    const nativeNames = (args: string[]) => git(args).split('\0').filter(Boolean).sort();
    expect(nativeNames(['ls-tree', '-r', '--name-only', '-z', 'HEAD'])).toEqual(Object.keys(repo.headFiles).sort());
    expect(nativeNames(['ls-files', '-z'])).toEqual(Object.keys(repo.indexFiles).sort());
    for (const name of Object.keys(repo.headFiles)) {
      expect(git(['show', 'HEAD:' + name])).toBe(repo.headFiles[name]);
      expect(git(['show', ':' + name])).toBe(repo.indexFiles[name]);
      expect(fs.readFileSync(path.join(cwd, name), 'utf8')).toBe(repo.files[name]);
    }
    expect(nativeNames(['diff', '--cached', '--name-only', '-z'])).toEqual([...repo.staged].sort());
    expect(nativeNames(['diff', '--name-only', '-z'])).toEqual([...repo.modified].sort());
    expect(nativeNames(['ls-files', '--others', '--exclude-standard', '-z'])).toEqual([...repo.untracked].sort());
    expect(fs.readFileSync(path.join(cwd, 'notes [ä].txt'), 'utf8')).toBe(repo.files['notes [ä].txt']);
    expect(git(['reflog', '-1', '--format=%gs']).trim()).toBe(repo.reflog[0].subject);
  },
  60_000,
);
