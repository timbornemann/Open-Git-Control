import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { GitScheduler } from '../../GitScheduler';
import { editFixture } from './commitMessageEditFixture';
import { backupReference, createEditWorkspace, editTempRoot, editWorktree, readJournals, writeJournal, type EditJournal } from '../commitMessageEditJournal';
import { editLockContents } from '../commitMessageEditLocks';

describe('commit edit journal recovery and linked worktrees', () => {
  let fixture: ReturnType<typeof editFixture>;
  afterEach(() => fixture?.dispose());

  it.each([false, true])(
    'recovers a crash with published=%s, without replaying a branch update',
    async (published) => {
      fixture = editFixture();
      const { repo, git, hashes, service } = fixture;
      const journal: EditJournal = {
        version: 1,
        id: randomUUID(),
        repoPath: repo,
        commonDir: path.join(repo, '.git'),
        gitDir: path.join(repo, '.git'),
        oldHead: hashes[2],
        branch: 'refs/heads/main',
        createdAt: Date.now(),
        state: 'preparing',
      };
      createEditWorkspace(journal);
      const worktree = editWorktree(journal.id);
      git(['worktree', 'add', '--detach', worktree, hashes[2]]);
      git(['commit', '--amend', '--allow-empty', '-m', 'Recovered title'], worktree);
      journal.newHead = git(['rev-parse', 'HEAD'], worktree);
      writeJournal(journal);
      if (published) {
        // Simulate a crash after the atomic transaction but before the journal
        // could be marked published. Its backup proves that the commit happened.
        git(['update-ref', backupReference(journal), hashes[2]]);
        git(['update-ref', 'refs/heads/main', journal.newHead, hashes[2]]);
      }
      for (const name of ['HEAD.lock', 'index.lock']) fs.writeFileSync(path.join(repo, '.git', name), editLockContents(journal));
      await service.recover(repo);
      expect(git(['rev-parse', 'HEAD'])).toBe(published ? journal.newHead : hashes[2]);
      expect(fs.existsSync(editTempRoot(journal.id))).toBe(false);
      expect(fs.existsSync(path.join(repo, '.git', 'HEAD.lock'))).toBe(false);
      expect(fs.existsSync(path.join(repo, '.git', 'index.lock'))).toBe(false);
      expect(readJournals(path.join(repo, '.git'))[0].state).toBe('cleaned');
      expect(await service.backups(repo)).toHaveLength(published ? 1 : 0);
      await service.recover(repo);
      expect(git(['rev-parse', 'HEAD'])).toBe(published ? journal.newHead : hashes[2]);
    },
    20_000,
  );

  it('edits the branch in a linked worktree while leaving the main worktree at its original commit', async () => {
    fixture = editFixture();
    const { repo, root, git, hashes, service, request, context } = fixture;
    const input = request();
    git(['checkout', '--detach', hashes[0]]);
    const linked = path.join(root, 'linked');
    git(['worktree', 'add', linked, 'main']);
    const result = await service.reword({ ...input, repoPath: linked }, context);
    expect(git(['rev-parse', 'HEAD'], linked)).toBe(result.newHead);
    expect(git(['rev-parse', 'HEAD'], repo)).toBe(hashes[0]);
    expect(git(['status', '--porcelain'], linked)).toBe('');
  }, 25_000);

  it('serializes writes across linked worktrees without coalescing their different status reads', async () => {
    fixture = editFixture();
    const { repo, root, git, hashes } = fixture;
    const linked = path.join(root, 'linked');
    git(['worktree', 'add', '--detach', linked, hashes[0]]);
    const scheduler = new GitScheduler();
    let finish!: () => void;
    const blocker = new Promise<void>((done) => {
      finish = done;
    });
    const events: string[] = [];
    const first = scheduler.schedule(repo, 'write', 'reword', async () => {
      events.push('reword');
      await blocker;
    });
    const second = scheduler.schedule(linked, 'write', 'commit', async () => {
      events.push('commit');
    });
    const a = scheduler.schedule(repo, 'polling', 'status', async () => 'main status');
    const b = scheduler.schedule(linked, 'polling', 'status', async () => 'linked status');
    expect(events).toEqual(['reword']);
    finish();
    await Promise.all([first, second]);
    expect(events).toEqual(['reword', 'commit']);
    expect(await a).toBe('main status');
    expect(await b).toBe('linked status');
  });
});
