import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CommitEditGit } from './CommitEditGit';
import type { GitIdentityScope } from '../../src/shared/ipc/gitIdentity';
import { createPrivateTempDir, cleanupPrivateTempDirAsync } from './PrivateTempFiles';

export const identityKeys = '^(user|author|committer)[.](name|email|useconfigonly)$';
export function identityConfigValues(config: string): Map<string, string> {
  return new Map(
    config
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('\n');
        return [entry.slice(0, separator).toLowerCase(), entry.slice(separator + 1).trim()];
      }),
  );
}

/** Keep Git's normal file selection and locking. If a later include overrides
 * the edited keys, put those keys last in the same file, without editing the
 * included profiles or changing unrelated configuration. */
export async function writeIdentityConfig(git: CommitEditGit, cwd: string, scope: GitIdentityScope, entries: [string, string][], current: () => void) {
  const flag = scope === 'global' ? '--global' : '--worktree';
  for (const [key, value] of entries) {
    current();
    await git.run(cwd, ['config', flag, '--replace-all', key, value]);
  }
  const values = identityConfigValues(await git.run(cwd, ['config', flag, '--includes', '--null', '--get-regexp', identityKeys]));
  if (entries.every(([key, value]) => values.get(key) === value)) return;

  // Git reports the root file it just wrote, including custom global/XDG paths.
  const origins = (await git.run(cwd, ['config', flag, '--no-includes', '--show-origin', '--null', '--get-all', 'user.email'])).split('\0').filter(Boolean);
  const origin = origins[origins.length - 2];
  if (!origin?.startsWith('file:')) throw new Error('Git did not confirm a writable identity configuration file.');
  const target = await fs.realpath(path.resolve(cwd, origin.slice(5)));
  const lock = `${target}.lock`;
  const mode = (await fs.stat(target)).mode & 0o777;
  const handle = await fs.open(lock, 'wx', mode);
  let closed = false;
  let committed = false;
  let workspace: string | null = null;
  try {
    const original = await fs.readFile(target);
    // Git's own staging locks stay in an owned private directory, so cancelling
    // a Git subprocess cannot leave a nested config.lock.lock beside the profile.
    workspace = createPrivateTempDir('git-identity');
    const candidate = path.join(workspace, 'identity.gitconfig');
    await fs.writeFile(candidate, original, { flag: 'wx', mode: 0o600 });
    for (const section of ['user', 'author', 'committer']) {
      const changes = entries.filter(([key]) => key.startsWith(`${section}.`));
      if (!changes.length) continue;
      await fs.appendFile(candidate, `\n\n[${section}]\n`);
      for (const [key, value] of changes) {
        current();
        // Git escapes the values and inserts them in the final matching section.
        await git.run(cwd, ['config', '--file', candidate, '--add', key, value]);
      }
    }
    const prepared = identityConfigValues(await git.run(cwd, ['config', '--file', candidate, '--no-includes', '--null', '--get-regexp', identityKeys]));
    if (!entries.every(([key, value]) => prepared.get(key) === value)) throw new Error('Git identity configuration could not be verified.');
    current();
    await handle.writeFile(await fs.readFile(candidate));
    await handle.chmod(mode);
    await handle.sync();
    await handle.close();
    closed = true;
    current();
    if (!(await fs.readFile(target)).equals(original)) throw new Error('Git identity configuration changed while saving. Reload before trying again.');
    await fs.rename(lock, target);
    committed = true;
  } finally {
    if (!closed) await handle.close();
    if (!committed) await fs.unlink(lock).catch(() => {});
    await cleanupPrivateTempDirAsync(workspace);
  }
}
