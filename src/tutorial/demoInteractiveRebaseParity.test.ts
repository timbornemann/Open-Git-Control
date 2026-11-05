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
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
const cases = (['de', 'en'] as const).flatMap((language) =>
  (['pick', 'reword', 'squash', 'fixup', 'drop', 'reorder'] as const).map((action) => ({ language, action })),
);
it.each(cases)(
  'matches native interactive $action trees, messages, topology and authors in $language',
  async ({ language, action }) => {
    const f = rewordParityFixture(language, action === 'reorder');
    fixtures.push(f);
    const { repo, api, git, revisions, cwd, runner } = f;
    const originals = structuredClone(repo.commits);
    const refs = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/']);
    const oldObjects = git(['show', '-s', '--format=%H%x00%P%x00%B', ...[1, 2, 3, 4].map((n) => revisions.get(hash(n))!)]);
    fs.writeFileSync(path.join(cwd, 'notes [ä].txt'), 'Independent note\n');
    writeDemoFile(repo, 'notes [ä].txt', 'Independent note\n');
    let lines = ['pick ' + hash(3), 'pick ' + hash(4)];
    if (action === 'reword') lines[0] = 'reword ' + hash(3) + (language === 'de' ? ' docs: Zweck  genauer erklären' : ' docs: explain  the purpose');
    if (action === 'squash' || action === 'fixup' || action === 'drop') lines[1] = action + ' ' + hash(4);
    if (action === 'reorder') lines.reverse();
    const nativeTodo = lines.map((line) => line.replace(/[a-f0-9]{40}/g, (value) => revisions.get(value)!.slice(0, 7)));
    await new RebaseService(() => cwd, runner).startInteractiveRebase(revisions.get(hash(2))!, nativeTodo);
    expect(
      await api.git.startInteractiveRebase(
        hash(2).slice(0, 7),
        lines.map((line) => line.replace(/[a-f0-9]{40}/g, (value) => value.slice(0, 7))),
        DEMO_REPO,
      ),
    ).toMatchObject({ success: true });
    const native = git(['rev-list', '--reverse', revisions.get(hash(2)) + '..HEAD'])
      .trim()
      .split('\n')
      .filter(Boolean);
    const simulated = demoAncestors(repo)
      .filter((commit) => ![hash(2), hash(1)].includes(commit.hash))
      .reverse();
    expect(simulated).toHaveLength(native.length);
    const expectedHead = action === 'pick' ? 4 : action === 'drop' ? 3 : action === 'squash' || action === 'fixup' ? 5 : 6;
    expect(repo.commits[0].hash).toBe(hash(expectedHead));
    expect(repo.branchHeads.get('main')).toBe(hash(expectedHead));
    for (let index = 0; index < native.length; index++) {
      const model = simulated[index],
        revision = native[index];
      const [author, email, date, message] = git(['show', '-s', '--format=%an%x00%ae%x00%aI%x00%B', revision]).split('\0');
      expect(model).toMatchObject({ author, email });
      expect(Date.parse(model.date)).toBe(Date.parse(date));
      expect(model.subject + (model.body ? '\n\n' + model.body : '')).toBe(message.trimEnd());
      expect(git(['show', '-s', '--format=%P', revision]).trim()).toBe(index ? native[index - 1] : revisions.get(hash(2)));
      expect(model.parent).toBe(index ? simulated[index - 1].hash : hash(2));
      const paths = git(['ls-tree', '-r', '--name-only', '-z', revision]).split('\0').filter(Boolean).sort();
      expect(Object.keys(model.files!).sort()).toEqual(paths);
      for (const name of paths) expect(git(['show', revision + ':' + name])).toBe(model.files![name]);
    }
    for (const old of originals) expect(repo.commits.find((commit) => commit.hash === old.hash)).toEqual(old);
    expect(git(['show', '-s', '--format=%H%x00%P%x00%B', ...[1, 2, 3, 4].map((n) => revisions.get(hash(n))!)])).toBe(oldObjects);
    expect(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/feature/', 'refs/remotes/', 'refs/tags/'])).toBe(refs);
    expect(repo.remoteHeads.get('origin/main')).toBe(hash(2));
    expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
    expect(repo.branchHeads.get('feature/begruessung')).toBe(hash(1));
    for (const name of Object.keys(repo.headFiles)) {
      expect(git(['show', 'HEAD:' + name])).toBe(repo.headFiles[name]);
      expect(git(['show', ':' + name])).toBe(repo.indexFiles[name]);
      expect(fs.readFileSync(path.join(cwd, name), 'utf8')).toBe(repo.files[name]);
    }
    expect(repo.files['notes [ä].txt']).toBe(fs.readFileSync(path.join(cwd, 'notes [ä].txt'), 'utf8'));
    expect(repo.staged.size + repo.modified.size).toBe(0);
    expect(repo.untracked).toEqual(new Set(git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)));
    expect(git(['symbolic-ref', '--short', 'HEAD']).trim()).toBe(repo.branch);
  },
  60_000,
);
