import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { practiceCommitHash as hash } from '@/shared/tutorial/exampleGitIds';
import { DEMO_REPO } from './demoRepository';
import { resolveDemoCommit } from './demoHistory';
import { demoRepositoryFingerprint } from './demoRepositoryFingerprint';
import { writeDemoFile } from './demoFiles';
import { rewordParityFixture } from './__tests__/rewordParityFixture';
const fixtures: ReturnType<typeof rewordParityFixture>[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.dispose();
});
const create = (language: 'de' | 'en' = 'en') => {
  const fixture = rewordParityFixture(language);
  fixtures.push(fixture);
  return fixture;
};

it.each(['de', 'en'] as const)(
  'matches the real message-edit service, preserved trees and recovery backup in %s',
  async (language) => {
    const { repo, api, git, service, input, simulated, context, revisions, cwd } = create(language);
    const index = fs.readFileSync(path.join(cwd, '.git', 'index'));
    const nativeInspection = await service.inspect(cwd, input.commitHash);
    const inspection = await api.git.inspectCommitMessageEdit({ repoPath: DEMO_REPO, commitHash: hash(3) });
    expect(inspection).toMatchObject({
      success: true,
      data: {
        title: nativeInspection.title,
        description: nativeInspection.description,
        commitCount: nativeInspection.commitCount,
        signedCommitCount: nativeInspection.signedCommitCount,
        blockReason: nativeInspection.blockReason,
      },
    });
    const native = await service.reword(input, context),
      result = await api.git.rewordCommitMessage(simulated);
    expect(native.changed).toBe(true);
    expect(result).toMatchObject({ success: true, data: { changed: true, oldHead: hash(4), newHead: hash(6) } });
    if (!result.success) throw new Error(result.error);
    for (const [oldNumber, newNumber] of [
      [3, 5],
      [4, 6],
    ]) {
      const oldHash = revisions.get(hash(oldNumber))!,
        newHash = native.hashMapping[oldHash],
        model = resolveDemoCommit(repo, hash(newNumber))!;
      const [author, email, date, body] = git(['show', '-s', '--format=%an%x00%ae%x00%aI%x00%B', newHash]).split('\0');
      expect(model).toMatchObject({ author, email });
      expect(Date.parse(model.date)).toBe(Date.parse(date));
      expect(body.trimEnd()).toBe(model.subject + (model.body ? '\n\n' + model.body : ''));
      expect(git(['rev-parse', newHash + '^{tree}'])).toBe(git(['rev-parse', oldHash + '^{tree}']));
      expect(model.files).toEqual(resolveDemoCommit(repo, hash(oldNumber))!.files);
      expect(result.data.hashMapping[hash(oldNumber)]).toBe(hash(newNumber));
    }
    expect(git(['rev-parse', native.newHead + '^']).trim()).toBe(native.hashMapping[revisions.get(hash(3))!]);
    expect(repo.commits[0].parent).toBe(hash(5));
    expect(git(['rev-parse', native.backupRef!]).trim()).toBe(revisions.get(hash(4)));
    expect(resolveDemoCommit(repo, result.data.backupRef!)?.hash).toBe(hash(4));
    expect(await service.backups(cwd)).toMatchObject([{ hash: revisions.get(hash(4)), branch: 'refs/heads/main' }]);
    expect(await api.git.getCommitMessageEditBackups(DEMO_REPO)).toMatchObject({ success: true, data: [{ hash: hash(4), branch: 'refs/heads/main' }] });
    for (const ref of ['refs/tags/v1.0.0', 'refs/remotes/origin/main']) expect(git(['rev-parse', ref]).trim()).toBe(revisions.get(hash(2)));
    expect(repo.tagRefs.get('v1.0.0')?.target).toBe(hash(2));
    expect(repo.remoteHeads.get('origin/main')).toBe(hash(2));
    expect(fs.readFileSync(path.join(cwd, '.git', 'index'))).toEqual(index);
    expect(git(['status', '--porcelain'])).toBe(repo.status());
    expect(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')).toBe(repo.files['README.md']);
    git(['checkout', '-b', 'recovery/before-message', native.backupRef!]);
    expect(repo.command('checkout', '-b', 'recovery/before-message', result.data.backupRef!).success).toBe(true);
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(native.oldHead);
    expect(git(['rev-parse', 'main']).trim()).toBe(native.newHead);
    expect(repo.branchHeads.get('main')).toBe(hash(6));
    expect(repo.branchHeads.get('recovery/before-message')).toBe(hash(4));
    expect(git(['rev-parse', native.backupRef!]).trim()).toBe(native.oldHead);
    expect(fs.readFileSync(path.join(cwd, 'README.md'), 'utf8')).toBe(repo.files['README.md']);
    expect(repo.messageEditBackups).toHaveLength(1);
  },
  60_000,
);

it.each(['published', 'referenced', 'dirty', 'detached'] as const)(
  'matches native %s protection without modifying either history',
  async (reason) => {
    const { repo, api, git, service, input, simulated, context, revisions, cwd } = create();
    if (reason === 'published') {
      git(['update-ref', 'refs/remotes/origin/main', input.expectedHead]);
      repo.remoteHeads.set('origin/main', hash(4));
    }
    if (reason === 'referenced') {
      git(['tag', 'protected-target', input.commitHash]);
      repo.command('tag', 'protected-target', hash(3));
    }
    if (reason === 'dirty') {
      fs.writeFileSync(path.join(cwd, 'LICENSE'), 'An unfinished draft\n');
      writeDemoFile(repo, 'LICENSE', 'An unfinished draft\n');
    }
    if (reason === 'detached') {
      git(['checkout', '--detach', input.expectedHead]);
      repo.command('checkout', '--detach', hash(4));
    }
    const before = demoRepositoryFingerprint(repo),
      refs = git(['show-ref']),
      index = fs.readFileSync(path.join(cwd, '.git', 'index'));
    expect(await service.inspect(cwd, input.commitHash)).toMatchObject({ blockReason: reason, expectedHead: '', expectedBranch: '', commitCount: 0 });
    expect(await api.git.inspectCommitMessageEdit({ repoPath: DEMO_REPO, commitHash: hash(3) })).toMatchObject({
      success: true,
      data: { blockReason: reason },
    });
    await expect(service.reword(input, context)).rejects.toThrow();
    expect(await api.git.rewordCommitMessage(simulated)).toMatchObject({ success: false });
    expect(git(['rev-parse', 'HEAD']).trim()).toBe(revisions.get(hash(4)));
    expect(git(['show-ref'])).toBe(refs);
    expect(fs.readFileSync(path.join(cwd, '.git', 'index'))).toEqual(index);
    expect(demoRepositoryFingerprint(repo)).toBe(before);
    expect(await service.backups(cwd)).toEqual([]);
    expect(repo.messageEditBackups).toEqual([]);
  },
  30_000,
);
