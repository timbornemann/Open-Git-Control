import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cherryPickParityFixture } from './__tests__/cherryPickParityFixture';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { writeDemoFile } from './demoFiles';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { DEMO_REPO } from './demoRepository';
const fixtures: ReturnType<typeof cherryPickParityFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
const cases = (['de', 'en'] as const).flatMap((language) => (['continue', 'abort', 'later-draft'] as const).map((action) => ({ language, action })));
it.each(cases)(
  'matches native cherry-pick conflict $action in $language',
  async ({ language, action }) => {
    const f = cherryPickParityFixture(language);
    fixtures.push(f);
    const { repo, git, revisions, cwd, source, sourceHash, api } = f;
    git(['cherry-pick', sourceHash], {}, 1);
    expect(repo.command('cherry-pick', hash(5)).success).toBe(false);
    expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: 'cherry-pick' } });
    expect(repo.status()).toBe(git(['status', '--porcelain']));
    const conflict = repo.mergeState!.conflicts.get('README.md')!;
    expect(git(['show', ':1:README.md'])).toBe(conflict.base);
    expect(git(['show', ':2:README.md'])).toBe(conflict.ours);
    expect(git(['show', ':3:README.md'])).toBe(conflict.theirs);
    const canonical = (text: string) => text.replace(/^>>>>>>> .*$/m, '>>>>>>> source');
    expect(canonical(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8'))).toBe(canonical(String(repo.files['README.md'])));
    const write = (name: string, value: string) => {
      fs.writeFileSync(path.join(cwd, name), value);
      writeDemoFile(repo, name, value);
    };
    write('LICENSE', 'An independent license draft\n');
    write('notes [ä].txt', 'Keep this note\n');
    git(['cherry-pick', '--continue'], { GIT_EDITOR: 'true' }, 128);
    expect(repo.command('cherryPickContinue').success).toBe(false);
    write('README.md', String(source.files!['README.md']));
    git(['add', '--', 'README.md']);
    expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
    expect(repo.indexFiles['README.md']).toBe(git(['show', ':README.md']));
    if (action === 'later-draft') {
      write('README.md', 'Keep a later draft after resolution\n');
      const before = demoRepositoryFingerprint(repo);
      git(['cherry-pick', '--abort'], {}, 128);
      expect(repo.command('cherryPickAbort').success).toBe(false);
      expect(demoRepositoryFingerprint(repo)).toBe(before);
      expect(git(['rev-parse', 'CHERRY_PICK_HEAD']).trim()).toBe(sourceHash);
    } else {
      git(['cherry-pick', '--' + action], { GIT_EDITOR: 'true' });
      expect(repo.command(action === 'continue' ? 'cherryPickContinue' : 'cherryPickAbort').success).toBe(true);
      expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: null } });
      if (action === 'continue') {
        expect(repo.commits[0]).toMatchObject({
          hash: hash(6),
          parent: hash(4),
          subject: source.subject,
          body: source.body,
          author: source.author,
          email: source.email,
          date: source.date,
        });
        expect(git(['show', '-s', '--format=%P', 'HEAD']).trim()).toBe(revisions.get(hash(4)));
        expect(git(['show', '-s', '--format=%an%n%ae', 'HEAD']).trimEnd()).toBe(source.author + '\n' + source.email);
        expect(new Date(git(['show', '-s', '--format=%aI', 'HEAD']).trim()).toISOString()).toBe(source.date);
        expect(git(['show', '-s', '--format=%b', 'HEAD']).trimEnd()).toBe(source.body);
      } else {
        expect(git(['rev-parse', 'HEAD']).trim()).toBe(revisions.get(hash(4)));
        expect(repo.commits[0].hash).toBe(hash(4));
      }
      for (const name of Object.keys(repo.headFiles)) {
        expect(git(['show', 'HEAD:' + name])).toBe(repo.headFiles[name]);
        expect(git(['show', ':' + name])).toBe(repo.indexFiles[name]);
      }
      const subject = git(['reflog', '-1', '--format=%gs'])
        .trim()
        .replace(revisions.get(hash(4))!, hash(4));
      expect(repo.reflog[0].subject).toBe(subject);
    }
    for (const name of Object.keys(repo.files)) expect(fs.readFileSync(path.join(cwd, name), 'utf8')).toBe(repo.files[name]);
    const names = (args: string[]) => git(args).split('\0').filter(Boolean).sort();
    expect(names(['diff', '--cached', '--name-only', '-z'])).toEqual([...repo.staged].sort());
    expect(names(['diff', '--name-only', '-z'])).toEqual([...repo.modified].sort());
    expect(names(['ls-files', '--others', '--exclude-standard', '-z'])).toEqual([...repo.untracked].sort());
    expect(git(['rev-parse', 'feature/begruessung']).trim()).toBe(sourceHash);
    expect(repo.branchHeads.get('feature/begruessung')).toBe(hash(5));
  },
  60_000,
);
