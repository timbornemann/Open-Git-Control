import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { BranchCleanupCandidate } from '../../src/shared/ipc/branchCleanup';
import type { GitRunner } from './GitRunner';
import { gitConfigurationEntries } from './GitConfigurationEntries';
import { readCleanupLocal } from './branchCleanupLocal';
import { CLEANUP_OID, type CleanupContext, type CleanupEndpoint, type CleanupInternalTarget, type CleanupLocalState } from './branchCleanupModel';
import { physicalPathKey } from './RepositoryCommonDirectory';

/** Hold the HEAD locks understood by checkout/switch while publishing a checked ref deletion. */
function lockCleanupHeads(commonDir: string, gitDir: string) {
  const worktreesDir = path.join(commonDir, 'worktrees');
  const registered = fs.existsSync(worktreesDir) ? fs.readdirSync(worktreesDir).map((name) => path.join(worktreesDir, name)) : [];
  if (registered.some((directory) => fs.lstatSync(directory).isSymbolicLink())) throw new Error('Refusing to lock a redirected worktree registration.');
  const directories = [...new Set([commonDir, gitDir, ...registered])];
  const owned: string[] = [];
  const token = `Open-Git-Control branch cleanup ${randomUUID()}\n`;
  const release = () => {
    for (const file of owned.reverse()) {
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === token) fs.unlinkSync(file);
    }
  };
  try {
    for (const directory of directories) {
      if (!fs.existsSync(path.join(directory, 'HEAD'))) continue;
      const lock = path.join(directory, 'HEAD.lock');
      fs.writeFileSync(lock, token, { flag: 'wx', mode: 0o600 });
      owned.push(lock);
    }
  } catch (error) {
    release();
    throw error;
  }
  return release;
}

export async function deleteCleanupLocal(
  runner: GitRunner,
  repo: string,
  snapshot: CleanupLocalState,
  candidate: BranchCleanupCandidate,
  target: CleanupInternalTarget,
  context: CleanupContext,
  validatePreferences: () => void,
): Promise<void> {
  await runner.withExclusiveWrite(
    repo,
    'branch-cleanup',
    async (git) => {
      context.ensureActive();
      validatePreferences();
      const release = lockCleanupHeads(snapshot.commonDir, snapshot.gitDir);
      try {
        const current = await readCleanupLocal(git, repo);
        const branch = current.branches.find((entry) => entry.ref === candidate.ref);
        if (
          physicalPathKey(current.commonDir) !== physicalPathKey(snapshot.commonDir) ||
          current.config !== snapshot.config ||
          current.worktreeVersion !== snapshot.worktreeVersion ||
          current.operation ||
          branch?.oid !== candidate.oid ||
          current.current === candidate.name ||
          current.worktrees.some((worktree) => worktree.branch === candidate.name)
        )
          throw new Error('changed');
        const transaction = ['start'];
        if (target.localRef) transaction.push(`verify ${target.localRef} ${target.oid}`);
        transaction.push(`delete ${candidate.ref} ${candidate.oid}`, 'prepare', 'commit', '');
        context.ensureActive();
        // Await the commit point even if the window/repository changes during publication.
        // A detached, private Git directory prevents update-ref from implicitly locking the real HEAD again when verifying its branch.
        const privateGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogc-branch-cleanup-ref-'));
        try {
          fs.writeFileSync(path.join(privateGitDir, 'HEAD'), `${candidate.oid}\n`);
          fs.writeFileSync(path.join(privateGitDir, 'commondir'), `${current.commonDir.replace(/\\/g, '/')}\n`);
          await git.input(repo, [`--git-dir=${privateGitDir}`, 'update-ref', '--no-deref', '--stdin'], transaction.join('\n'), true, {
            GIT_COMMON_DIR: current.commonDir,
            GIT_NO_REPLACE_OBJECTS: '1',
          });
        } finally {
          try {
            for (const file of ['HEAD', 'commondir']) if (fs.existsSync(path.join(privateGitDir, file))) fs.unlinkSync(path.join(privateGitDir, file));
            fs.rmdirSync(privateGitDir);
          } catch {
            /* Temporary metadata cleanup must not hide a confirmed ref transaction. */
          }
        }
      } finally {
        release();
      }
    },
    context.signal,
  );
}

/** Delay config cleanup until all refs are processed so the batch's configuration guard remains valid. */
export async function cleanupDeletedBranchConfiguration(runner: GitRunner, repo: string, names: string[]) {
  if (!names.length) return;
  await runner.withExclusiveWrite(repo, 'branch-cleanup-config', async (git) => {
    for (const name of names) {
      const recreated = await git.run(repo, ['for-each-ref', '--format=%(objectname)', `refs/heads/${name}`]);
      if (!recreated.trim()) {
        try {
          await git.run(repo, ['config', '--local', '--remove-section', `branch.${name}`]);
        } catch {
          /* A missing section or concurrent config edit does not undo a successful deletion. */
        }
      }
    }
  });
}

function mappedRef(source: string, destination: string, branchRef: string) {
  if (!source.includes('*')) return source === branchRef ? destination : null;
  const [prefix, suffix] = source.split('*');
  if (!branchRef.startsWith(prefix) || !branchRef.endsWith(suffix)) return null;
  return destination.replace('*', branchRef.slice(prefix.length, suffix ? -suffix.length : undefined));
}

/** Only the fetch endpoint can authorize pruning its matching tracking refs. */
export async function pruneCleanupTracking(runner: GitRunner, repo: string, endpoint: CleanupEndpoint, name: string, oid: string, config: string) {
  if (!endpoint.fetchUrl) return;
  const branchRef = `refs/heads/${name}`;
  const mappings = gitConfigurationEntries(config)
    .filter(([key]) => key === `remote.${endpoint.remoteName}.fetch`)
    .map(([, value]) => value);
  if (mappings.some((mapping) => mapping.startsWith('^') && mappedRef(mapping.slice(1), '', branchRef) !== null)) return;
  const refs = mappings
    .filter((mapping) => !mapping.startsWith('^'))
    .flatMap((mapping) => {
      const [source, destination] = mapping.replace(/^\+/, '').split(':');
      const ref = destination ? mappedRef(source, destination, branchRef) : null;
      return ref?.startsWith('refs/remotes/') ? [ref] : [];
    });
  for (const ref of new Set(refs)) {
    try {
      await runner.withExclusiveWrite(repo, 'branch-cleanup-tracking', async (git) => {
        if ((await git.run(repo, ['config', '--null', '--list'])) !== config) return;
        const current = (await git.run(repo, ['for-each-ref', '--format=%(objectname)', ref])).trim();
        if (CLEANUP_OID.test(current) && current === oid) await git.run(repo, ['update-ref', '--no-deref', '-d', ref, oid]);
      });
    } catch {
      /* A changed tracking ref is preserved for the next ordinary fetch. */
    }
  }
}
