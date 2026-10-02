import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CommitEditGit } from './CommitEditGit';
import { inspectSnapshot, type EditSnapshot } from './commitMessageEditInspection';
import { backupReference, writeJournal, type EditJournal } from './commitMessageEditJournal';
import { editLockContents, releaseEditLocks } from './commitMessageEditLocks';

export async function publishRewrite(
  git: CommitEditGit,
  repo: string,
  worktree: string,
  snapshot: EditSnapshot,
  journal: EditJournal,
  ensureActive: () => void,
) {
  // Git's files backend uses these locks for checkout, index writes and HEAD
  // changes. Updating the branch from our detached worktree avoids Git's
  // implicit HEAD reflog update attempting to take the same HEAD lock.
  try {
    for (const name of ['HEAD.lock', 'index.lock']) {
      fs.writeFileSync(path.join(snapshot.gitDir, name), editLockContents(journal), { flag: 'wx', mode: 0o600 });
    }
    const current = await inspectSnapshot(git, repo, snapshot.commits[0].hash, worktree);
    if (
      current.head !== snapshot.head ||
      current.branch !== snapshot.branch ||
      current.refs !== snapshot.refs ||
      current.remoteConfig !== snapshot.remoteConfig
    ) {
      throw new Error('Repository state changed during preparation. No rewritten commits were published.');
    }
    writeJournal(journal);
    const verifyRefs = snapshot.refs
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.startsWith(`${snapshot.branch} `))
      .map((line) => {
        const [ref, hash, symbolicTarget] = line.split(' ');
        return symbolicTarget ? `symref-verify ${ref} ${symbolicTarget}` : `verify ${ref} ${hash}`;
      });
    const transaction = [
      'start',
      ...verifyRefs,
      `create ${backupReference(journal)} ${snapshot.head}`,
      `update ${snapshot.branch} ${journal.newHead} ${snapshot.head}`,
      'prepare',
      'commit',
      '',
    ].join('\n');
    ensureActive();
    // Publication is the commit point: await it even if cancellation arrives.
    await git.input(worktree, ['update-ref', '--no-deref', '--create-reflog', '-m', 'Open Git Control: edit commit message', '--stdin'], transaction, true);
    journal.state = 'published';
    try {
      writeJournal(journal);
    } catch {
      /* The atomic backup proves publication after a crash. */
    }
  } finally {
    try {
      releaseEditLocks(journal);
    } catch {
      // Recovery will retry owned locks; preserve the publication outcome.
    }
  }
}
