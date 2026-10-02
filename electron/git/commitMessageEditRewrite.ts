import * as path from 'node:path';
import type { CommitEditGit } from './CommitEditGit';
import type { CommitRecord, EditSnapshot } from './commitMessageEditInspection';
import { readCommit } from './commitMessageEditInspection';
import { editTempRoot, editWorktree, type EditJournal } from './commitMessageEditJournal';
import { writePrivateTempFile } from './PrivateTempFiles';

const quoteShellPath = (value: string) => `'${value.replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`;

export async function prepareRewrite(git: CommitEditGit, repo: string, snapshot: EditSnapshot, journal: EditJournal, message: string) {
  const worktree = editWorktree(journal.id);
  const root = editTempRoot(journal.id);
  const messageFile = path.join(root, 'message.txt');
  const todoFile = path.join(root, 'todo.txt');
  const helperFile = path.join(root, 'editor.cjs');
  writePrivateTempFile(messageFile, message);
  writePrivateTempFile(todoFile, `${snapshot.commits.map((commit, index) => `${index === 0 ? 'reword' : 'pick'} ${commit.hash}`).join('\n')}\n`);
  // Both editors copy data files. No commit text is executable or becomes a
  // sequence instruction, even if it contains shell syntax or newlines.
  writePrivateTempFile(
    helperFile,
    [
      "const fs = require('node:fs');",
      'const [source, target] = process.argv.slice(2);',
      'if (!source || !target) process.exit(1);',
      'fs.copyFileSync(source, target);',
    ].join('\n'),
  );
  const config: string[] = ['-c', 'commit.cleanup=verbatim', '-c', 'core.logAllRefUpdates=true'];
  // A relative hooks path must resolve against the original repository.
  const hooksPath = await git.run(repo, ['config', '--path', '--get', 'core.hooksPath']).catch(() => '');
  if (hooksPath) config.push('-c', `core.hooksPath=${path.resolve(repo, hooksPath)}`);
  for (const key of ['commit.gpgsign', 'user.signingkey', 'user.name', 'user.email', 'gpg.format', 'gpg.program', 'gpg.ssh.program', 'gpg.x509.program']) {
    const value = await git.run(repo, ['config', '--get', key]).catch(() => '');
    if (value) config.push('-c', `${key}=${value}`);
  }
  await git.run(repo, [...config, 'worktree', 'add', '--detach', worktree, snapshot.head]);
  if (snapshot.commits.length === 1) {
    await git.run(worktree, [...config, 'commit', '--amend', '--only', '--allow-empty', '--cleanup=verbatim', '-F', messageFile]);
  } else {
    const editor = `${quoteShellPath(process.execPath)} ${quoteShellPath(helperFile)}`;
    const parent = snapshot.commits[0].parents[0];
    await git.run(
      worktree,
      [
        ...config,
        'rebase',
        '-i',
        '--no-autosquash',
        '--no-autostash',
        '--no-update-refs',
        '--no-rebase-merges',
        '--keep-empty',
        '--empty=keep',
        '--reapply-cherry-picks',
        '--no-fork-point',
        ...(parent ? [parent] : ['--root']),
      ],
      {
        envOverrides: {
          ELECTRON_RUN_AS_NODE: '1',
          GIT_EDITOR: `${editor} ${quoteShellPath(messageFile)}`,
          GIT_SEQUENCE_EDITOR: `${editor} ${quoteShellPath(todoFile)}`,
        },
      },
    );
  }
  return { worktree, newHead: await git.run(worktree, ['rev-parse', 'HEAD']) };
}

export async function verifyRewrite(git: CommitEditGit, worktree: string, original: CommitRecord[], newHead: string, message: string) {
  const parent = original[0].parents[0];
  const hashes = (await git.run(worktree, ['rev-list', '--reverse', '--topo-order', ...(parent ? [`${parent}..${newHead}`] : [newHead])]))
    .split('\n')
    .filter(Boolean);
  if (hashes.length !== original.length) throw new Error('Reword verification failed: commit count changed.');
  const mapping: Record<string, string> = {};
  for (let index = 0; index < hashes.length; index++) {
    const old = original[index];
    const next = await readCommit(git, worktree, hashes[index]);
    const expectedParents = index === 0 ? old.parents : [hashes[index - 1]];
    if (
      next.tree !== old.tree ||
      next.author !== old.author ||
      next.parents.join(' ') !== expectedParents.join(' ') ||
      next.message !== (index === 0 ? message : old.message)
    ) {
      throw new Error(
        'Reword verification failed: a hook or Git changed content, authorship, order, or an unexpected message. The original branch was not changed.',
      );
    }
    mapping[old.hash] = next.hash;
  }
  if (await git.run(worktree, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none'])) {
    throw new Error('The isolated worktree was changed by a hook. The original branch was not changed.');
  }
  return mapping;
}
