import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { RebaseService } from '../../electron/git/RebaseService';
import { rewordParityFixture } from './__tests__/rewordParityFixture';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO } from './demoRepository';
import { demoAncestors } from './demoHistory';
import { writeDemoFile } from './demoFiles';
const fixtures: ReturnType<typeof rewordParityFixture>[] = [];
afterEach(async () => {
  for (const f of fixtures.splice(0)) await f.dispose();
});
const cases = (['de', 'en'] as const).flatMap((language) =>
  (['edit-unchanged', 'edit-staged', 'edit-amend', 'edit-abort', 'conflict-continue', 'conflict-abort', 'resolved-abort'] as const).map((action) => ({
    language,
    action,
  })),
);
it.each(cases)(
  'matches native paused $action, authors, staged contents and return in $language',
  async ({ language, action }) => {
    const conflict = !action.startsWith('edit-'),
      f = rewordParityFixture(language, !conflict);
    fixtures.push(f);
    const { repo, api, git, revisions, cwd, runner } = f,
      service = new RebaseService(() => cwd, runner);
    const originals = structuredClone(repo.commits);
    const refs = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/']);
    const lines = [(conflict ? 'drop' : 'edit') + ' ' + hash(3), 'pick ' + hash(4)];
    const nativeLines = lines.map((line) => line.replace(/[a-f0-9]{40}/g, (value) => revisions.get(value)!));
    if (conflict) await expect(service.startInteractiveRebase(revisions.get(hash(2))!, nativeLines)).rejects.toThrow();
    else await service.startInteractiveRebase(revisions.get(hash(2))!, nativeLines);
    expect(await api.git.startInteractiveRebase(hash(2), lines, DEMO_REPO)).toMatchObject({ success: !conflict });
    expect(repo.branch).toBe('');
    expect(git(['symbolic-ref', '-q', 'HEAD'], {}, 1)).toBe('');
    expect(repo.commits[0].hash).toBe(hash(conflict ? 2 : 3));
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(revisions.get(hash(conflict ? 2 : 3)));
    expect(git(['rev-parse', 'main']).trim()).toBe(revisions.get(hash(4)));
    expect(repo.branchHeads.get('main')).toBe(hash(4));
    expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: 'rebase' } });
    expect(fs.existsSync(path.join(cwd, '.git', 'rebase-merge'))).toBe(true);
    if (conflict) {
      const sides = repo.mergeState!.conflicts.get('README.md')!;
      for (const [stage, key] of [
        [1, 'base'],
        [2, 'ours'],
        [3, 'theirs'],
      ] as const)
        expect(git(['show', ':' + stage + ':README.md'])).toBe(sides[key]);
      expect(repo.command('rebaseContinue').success).toBe(false);
    }
    const write = (name: string, value: string) => {
      fs.writeFileSync(path.join(cwd, name), value);
      writeDemoFile(repo, name, value);
    };
    if (action === 'edit-staged' || action === 'edit-amend') {
      write('LICENSE', 'A staged correction\n');
      write('new [ä].txt', 'A staged new file\n');
      // Native continue refuses this tracked draft before it is staged.
      if (action === 'edit-staged') {
        await expect(service.continueRebase()).rejects.toThrow();
        expect(repo.command('rebaseContinue').success).toBe(false);
      }
      git(['add', '--', 'LICENSE', 'new [ä].txt']);
      expect(repo.stage(['LICENSE', 'new [ä].txt']).success).toBe(true);
      if (action === 'edit-amend') {
        git(['commit', '--amend', '--no-gpg-sign', '--no-verify', '-m', 'docs: deliberate correction', '-m', 'A retained edited description.']);
        expect(repo.commit('docs: deliberate correction', { description: 'A retained edited description.', amend: true }).success).toBe(true);
        expect(repo.branchHeads.get('main')).toBe(hash(4));
      }
    }
    if (action === 'conflict-continue' || action === 'resolved-abort') {
      git(['checkout', '--theirs', '--', 'README.md']);
      git(['add', '--', 'README.md']);
      expect(repo.command('conflictTakeTheirs', 'README.md').success).toBe(true);
      expect(repo.command('conflictMarkResolved', 'README.md').success).toBe(true);
    }
    write('notes [ö].txt', 'An independent untracked note\n');
    const aborting = action.endsWith('abort');
    if (aborting) {
      write('LICENSE', 'A later tracked draft that abort discards\n');
      await service.abortRebase();
      expect(repo.command('rebaseAbort').success).toBe(true);
      expect(repo.commits[0].hash).toBe(hash(4));
      expect(repo.reflog[0].subject).toBe(git(['reflog', '-1', '--format=%gs']).trim());
    } else {
      await service.continueRebase();
      expect(repo.command('rebaseContinue').success).toBe(true);
      expect(repo.commits[0].hash).toBe(hash(action === 'edit-unchanged' ? 4 : conflict ? 5 : 6));
      const native = git(['rev-list', '--reverse', revisions.get(hash(2)) + '..HEAD'])
        .trim()
        .split('\n');
      const simulated = demoAncestors(repo)
        .filter((commit) => ![hash(1), hash(2)].includes(commit.hash))
        .reverse();
      expect(simulated).toHaveLength(native.length);
      for (const [index, model] of simulated.entries()) {
        const [author, email, date, message] = git(['show', '-s', '--format=%an%x00%ae%x00%aI%x00%B', native[index]]).split('\0');
        expect(model).toMatchObject({ author, email });
        expect(Date.parse(model.date)).toBe(Date.parse(date));
        expect(model.subject + (model.body ? '\n\n' + model.body : '')).toBe(message.trimEnd());
        expect(model.parent).toBe(index ? simulated[index - 1].hash : hash(2));
        expect(git(['show', '-s', '--format=%P', native[index]]).trim()).toBe(index ? native[index - 1] : revisions.get(hash(2)));
        for (const name of Object.keys(model.files!)) expect(git(['show', native[index] + ':' + name])).toBe(model.files![name]);
      }
    }
    expect(repo.branch).toBe('main');
    expect(git(['symbolic-ref', '--short', 'HEAD']).trim()).toBe('main');
    expect(repo.rebaseState).toBeNull();
    expect(repo.mergeState).toBeNull();
    expect(fs.existsSync(path.join(cwd, '.git', 'rebase-merge'))).toBe(false);
    expect(await api.git.getSequencerState(DEMO_REPO)).toMatchObject({ success: true, data: { operation: null } });
    for (const original of originals) expect(repo.commits.find((commit) => commit.hash === original.hash)).toEqual(original);
    expect(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/'])).toBe(refs);
    for (const name of Object.keys(repo.headFiles)) {
      expect(git(['show', 'HEAD:' + name])).toBe(repo.headFiles[name]);
      expect(git(['show', ':' + name])).toBe(repo.indexFiles[name]);
      expect(fs.readFileSync(path.join(cwd, name), 'utf8')).toBe(repo.files[name]);
    }
    expect(repo.files['notes [ö].txt']).toBe(fs.readFileSync(path.join(cwd, 'notes [ö].txt'), 'utf8'));
    expect(repo.staged.size + repo.modified.size).toBe(0);
    expect(repo.untracked).toEqual(new Set(git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)));
  },
  60_000,
);
