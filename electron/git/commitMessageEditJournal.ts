import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CommitEditGit } from './CommitEditGit';
import { BACKUP_PREFIX, CHECK_PREFIX, OBJECT_ID } from './commitMessageEditInspection';
import { removeCheckRefs } from './commitMessageEditRemotes';
import { physicalPathKey } from './RepositoryCommonDirectory';
import { releaseEditLocks } from './commitMessageEditLocks';

export type EditJournal = {
  version: 1;
  id: string;
  repoPath: string;
  commonDir: string;
  gitDir: string;
  branch: string;
  oldHead: string;
  newHead?: string;
  createdAt: number;
  state: 'preparing' | 'published' | 'cleaned';
};
export const EDIT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const journalDirectory = (commonDir: string) => path.join(commonDir, 'ogc-commit-message-edits');
export const editTempRoot = (id: string) => path.join(os.tmpdir(), `ogc-commit-edit-${id}`);
export const editWorktree = (id: string) => path.join(editTempRoot(id), 'worktree');
export const backupReference = (journal: EditJournal) => `${BACKUP_PREFIX}${journal.createdAt}-${journal.id}`;

export function writeJournal(journal: EditJournal) {
  const directory = journalDirectory(journal.commonDir);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${journal.id}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(journal), { mode: 0o600 });
  fs.renameSync(`${file}.tmp`, file);
}

export function createEditWorkspace(journal: EditJournal) {
  const root = editTempRoot(journal.id);
  fs.mkdirSync(root, { mode: 0o700 });
  fs.writeFileSync(path.join(root, 'owner.json'), JSON.stringify({ id: journal.id, commonDir: journal.commonDir }), { mode: 0o600, flag: 'wx' });
  writeJournal(journal);
}

export function readJournals(commonDir: string): EditJournal[] {
  const directory = journalDirectory(commonDir);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        const value = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')) as EditJournal;
        if (
          value.version !== 1 ||
          !EDIT_ID.test(value.id) ||
          name !== `${value.id}.json` ||
          !OBJECT_ID.test(value.oldHead) ||
          !value.branch.startsWith('refs/heads/') ||
          !Number.isSafeInteger(value.createdAt) ||
          physicalPathKey(value.commonDir) !== physicalPathKey(commonDir)
        )
          return [];
        const relativeGitDir = path.relative(physicalPathKey(commonDir), physicalPathKey(value.gitDir));
        if (relativeGitDir && (path.isAbsolute(relativeGitDir) || !/^worktrees[/\\][^/\\]+$/.test(relativeGitDir))) return [];
        if (!['preparing', 'published', 'cleaned'].includes(value.state)) return [];
        return [value];
      } catch {
        return [];
      }
    });
}

export async function cleanupEditWorkspace(git: CommitEditGit, repo: string, journal: EditJournal) {
  releaseEditLocks(journal);
  const root = editTempRoot(journal.id);
  if (fs.existsSync(root)) {
    if (fs.lstatSync(root).isSymbolicLink()) throw new Error('Refusing to clean a redirected commit-edit directory.');
    const owner = JSON.parse(fs.readFileSync(path.join(root, 'owner.json'), 'utf8')) as { id: string; commonDir: string };
    if (owner.id !== journal.id || physicalPathKey(owner.commonDir) !== physicalPathKey(journal.commonDir))
      throw new Error('Commit-edit directory ownership does not match.');
    const worktree = editWorktree(journal.id);
    if (fs.existsSync(worktree) && fs.lstatSync(worktree).isSymbolicLink()) throw new Error('Refusing to clean a redirected commit-edit worktree.');
    const list = await git.run(repo, ['worktree', 'list', '--porcelain', '-z'], { ignoreAbort: true });
    const registered = list.split('\0').some((field) => field.startsWith('worktree ') && physicalPathKey(field.slice(9)) === physicalPathKey(worktree));
    if (registered) {
      if (fs.existsSync(worktree)) {
        const gitDir = path.resolve(worktree, await git.run(worktree, ['rev-parse', '--git-dir'], { ignoreAbort: true }));
        const commonDir = path.resolve(worktree, await git.run(worktree, ['rev-parse', '--git-common-dir'], { ignoreAbort: true }));
        if (physicalPathKey(commonDir) !== physicalPathKey(journal.commonDir)) throw new Error('Commit-edit worktree belongs to a different repository.');
        if (['rebase-merge', 'rebase-apply'].some((dir) => fs.existsSync(path.join(gitDir, dir)))) {
          await git.run(worktree, ['rebase', '--abort'], { ignoreAbort: true });
        }
      }
      await git.run(repo, ['worktree', 'remove', '--force', worktree], { ignoreAbort: true });
    }
    // The exact private root and its ownership marker were checked above.
    fs.rmSync(root, { recursive: true });
  } else {
    // Removing precisely our recorded, already missing worktree also removes
    // its registration. Never use prune, which would affect other worktrees.
    const worktree = editWorktree(journal.id);
    const list = await git.run(repo, ['worktree', 'list', '--porcelain', '-z'], { ignoreAbort: true });
    if (list.split('\0').some((field) => field.startsWith('worktree ') && physicalPathKey(field.slice(9)) === physicalPathKey(worktree))) {
      await git.run(repo, ['worktree', 'remove', '--force', worktree], { ignoreAbort: true });
    }
  }
  await removeCheckRefs(git, repo, `${CHECK_PREFIX}${journal.id}/`);
  journal.state = 'cleaned';
  writeJournal(journal);
}
