import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { rewordParityFixture } from './__tests__/rewordParityFixture';
import { writeDemoFile, refreshDemoFiles } from './demoFiles';
import { resolveDemoCommit } from './demoHistory';
const fixtures: ReturnType<typeof rewordParityFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
const cases = (['de', 'en'] as const).flatMap((language) => (['--soft', '--mixed', '--hard'] as const).map((mode) => ({ language, mode })));
it.each(cases)(
  'matches native reset $mode and recovering the former HEAD in $language',
  async ({ language, mode }) => {
    const f = rewordParityFixture(language);
    fixtures.push(f);
    const { repo, git, revisions, cwd } = f;
    const write = (name: string, value: string) => {
      fs.writeFileSync(path.join(cwd, name), value);
      writeDemoFile(repo, name, value);
    };
    write('README.md', 'A staged correction\n');
    git(['add', '--', 'README.md']);
    repo.stage(['README.md']);
    write('README.md', 'A later working draft\n');
    write('untracked-note.txt', 'Keep this independent note\n');
    write('staged new [ä].txt', 'A staged new file\n');
    git(['add', '--', 'staged new [ä].txt']);
    repo.stage(['staged new [ä].txt']);
    fs.unlinkSync(path.join(cwd, 'LICENSE'));
    delete repo.files.LICENSE;
    refreshDemoFiles(repo);
    git(['add', '--', 'LICENSE']);
    repo.stage(['LICENSE']);
    git(['reset', mode, revisions.get(hash(2))!]);
    expect(repo.command('reset', mode, hash(2)).success).toBe(true);
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(revisions.get(hash(2)));
    expect(git(['show', 'HEAD:README.md'])).toBe(repo.headFiles['README.md']);
    expect(git(['show', ':README.md'])).toBe(repo.indexFiles['README.md']);
    expect(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')).toBe(repo.files['README.md']);
    const names = (args: string[]) => git(args).split('\0').filter(Boolean).sort();
    expect(names(['diff', '--cached', '--name-only', '-z'])).toEqual([...repo.staged].sort());
    expect(names(['diff', '--name-only', '-z'])).toEqual([...repo.modified].sort());
    expect(names(['ls-files', '--others', '--exclude-standard', '-z'])).toEqual([...repo.untracked].sort());
    expect(names(['ls-files', '-z'])).toEqual(Object.keys(repo.indexFiles).sort());
    expect(fs.existsSync(path.join(cwd, 'LICENSE'))).toBe(repo.files.LICENSE !== undefined);
    expect(fs.existsSync(path.join(cwd, 'staged new [ä].txt'))).toBe(repo.files['staged new [ä].txt'] !== undefined);
    expect(git(['rev-parse', 'HEAD@{1}']).trim()).toBe(revisions.get(hash(4)));
    expect(resolveDemoCommit(repo, 'HEAD@{1}')?.hash).toBe(hash(4));
    expect(git(['reflog', '-1', '--format=%gs']).trim()).toBe('reset: moving to ' + revisions.get(hash(2)));
    // A clean hard-reset result can safely recover the old saved tree, never the discarded draft.
    if (mode === '--hard') {
      git(['checkout', revisions.get(hash(4))!]);
      expect(repo.command('checkout', hash(4)).success).toBe(true);
      expect(git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('HEAD');
      expect(repo.branch).toBe('');
      expect(repo.commits[0].hash).toBe(hash(4));
      expect(git(['rev-parse', 'main']).trim()).toBe(revisions.get(hash(2)));
      expect(repo.branchHeads.get('main')).toBe(hash(2));
      expect(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')).toBe(repo.files['README.md']);
      git(['checkout', '-b', 'recovery/greeting', revisions.get(hash(4))!]);
      expect(repo.command('checkout', '-b', 'recovery/greeting', hash(4)).success).toBe(true);
      expect(git(['rev-parse', 'main']).trim()).toBe(revisions.get(hash(2)));
      expect(repo.branchHeads.get('main')).toBe(hash(2));
      expect(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')).toBe(repo.files['README.md']);
      expect(repo.files['README.md']).toBe(resolveDemoCommit(repo, hash(4))!.files!['README.md']);
      expect(repo.files['README.md']).not.toBe('A later working draft\n');
      expect(repo.files['untracked-note.txt']).toBe('Keep this independent note\n');
    }
  },
  60_000,
);
